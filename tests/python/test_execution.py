import asyncio
import copy
import datetime
import importlib.util
import json
import time
from pathlib import Path

import pytest
from clearings import ClearingsError, Runtime, flow, operation, s
from fixtures import case_flow

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "contracts/execution-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
async def test_shared_case(case):
    runtime = Runtime(build="fixture-v1")
    calls = []
    original = copy.deepcopy(case["input"])
    invocation = runtime.run(
        case_flow(case["kind"], lambda *args: calls.append(args)), case["input"]
    )
    if "error" in case:
        with pytest.raises(ClearingsError) as error:
            await invocation
        assert error.value.code == case["error"]
    else:
        assert await invocation == case["expected"]
        assert len(calls) == case["calls"]
    await runtime.drain()
    assert case["input"] == original
    assert runtime.snapshot()["live_values"] == runtime.snapshot()["owned_nodes"] == 0
    assert runtime.records[0]["live_values"] == 0
    assert "private provider" not in json.dumps(runtime.records)
    assert "private transform" not in json.dumps(runtime.records)
    runtime.close()
    await runtime.drain()


def declared(id, execute):
    return operation(id=id, version="1", input=s.number, output=s.number, execute=execute)


def single(op):
    return flow("single", lambda q, x: q.call(op, x))


async def test_shared_capacity():
    active = peak = 0

    async def execute(x, context):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.003)
        active -= 1
        return x

    runtime = Runtime(max_in_flight=2)
    assert await asyncio.gather(
        *(runtime.run(single(declared("wait", execute)), i) for i in range(12))
    ) == list(range(12))
    await runtime.drain()
    assert peak == 2
    assert runtime.snapshot()["in_flight"] == 0


async def test_timeout_retains_noncooperative_action():
    started, release = asyncio.Event(), asyncio.Event()

    async def execute(x, context):
        started.set()
        while not release.is_set():
            try:
                await release.wait()
            except asyncio.CancelledError:
                continue
        return x

    runtime = Runtime(max_in_flight=1)
    result = asyncio.create_task(
        runtime.run(single(declared("blocked", execute)), 1, timeout_ms=30)
    )
    await started.wait()
    with pytest.raises(ClearingsError) as error:
        await result
    assert error.value.code == "TIMEOUT"
    await asyncio.sleep(0)
    assert runtime.snapshot()["in_flight"] == 1
    assert runtime.records[0]["uncertain_actions"] == 1
    release.set()
    await runtime.drain()
    assert runtime.snapshot()["in_flight"] == runtime.snapshot()["live_values"] == 0


async def test_task_cancellation_stops_dependents():
    started = asyncio.Event()
    calls = 0

    async def execute(x, context):
        nonlocal calls
        calls += 1
        started.set()
        await context.cancelled.wait()
        return x

    op = declared("abort", execute)
    runtime = Runtime()
    result = asyncio.create_task(
        runtime.run(flow("chain", lambda q, x: q.call(op, q.call(op, x))), 0)
    )
    await started.wait()
    result.cancel()
    with pytest.raises(asyncio.CancelledError):
        await result
    await runtime.drain()
    assert calls == 1
    assert runtime.records[0]["outcome"] == "CANCELLED"
    assert runtime.snapshot()["live_values"] == 0


async def test_cancel_before_task_start_releases_issued_capacity():
    runtime = Runtime(work_budget=1)

    async def execute(x, context):
        return x

    invocation = asyncio.create_task(runtime.run(single(declared("never-started", execute)), 1))
    # The done callback must account for cancellation even if the coroutine body never ran.
    original = runtime._execute

    async def cancel_before_start(command, run, spec, inputs, cancelled):
        return await original(command, run, spec, inputs, cancelled)

    runtime._execute = cancel_before_start
    original_command = runtime._command

    def command(value):
        original_command(value)
        if value["type"] == "dispatch":
            runtime._actions[value["command"]][0].cancel()

    runtime._command = command
    with pytest.raises(ClearingsError) as error:
        await invocation
    assert error.value.code == "CANCELLED"
    await runtime.drain()
    assert runtime.snapshot()["in_flight"] == runtime.snapshot()["live_values"] == 0


async def test_early_timeout_and_planning_cancellation():
    runtime = Runtime()
    calls = []

    async def execute(x, context):
        calls.append(x)
        return x

    op = declared("unused", execute)

    def build(q, x):
        time.sleep(0.005)
        return q.call(op, x)

    with pytest.raises(ClearingsError) as error:
        await runtime.run(flow("slow-build", build), 1, timeout_ms=1)
    assert error.value.code == "TIMEOUT"
    task = asyncio.create_task(runtime.run(single(op), 1))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await runtime.drain()
    assert not calls
    assert runtime.snapshot()["owned_nodes"] == 0


async def test_invalid_plans_and_values():
    runtime = Runtime(max_nodes=32)
    cycle = {}
    cycle["self"] = cycle
    for value in [
        float("nan"),
        float("inf"),
        9007199254740992,
        datetime.datetime.now(),
        (1,),
        {1: "value"},
        "\ud800",
        cycle,
    ]:
        with pytest.raises(ClearingsError):
            await runtime.run(case_flow("value"), value)
    with pytest.raises(ClearingsError) as error:
        await runtime.run(flow("large", lambda q, x: q.map(x, q.value)), [0] * 129)
    assert error.value.code == "CAPACITY"
    saved = []
    await runtime.run(flow("first", lambda q, x: saved.append(q.value(x)) or saved[-1]), 1)
    await runtime.drain()
    with pytest.raises(ClearingsError) as error:
        await runtime.run(flow("foreign", lambda q, x: q.transform(saved[0], lambda v: v)), None)
    assert error.value.code == "INVALID_PLAN"
    assert runtime.snapshot()["owned_nodes"] == 0


async def test_failed_dispatch_and_invalid_output():
    runtime = Runtime()

    async def invalid(x, context):
        return "wrong"

    def failure(x, context):
        raise RuntimeError("secret")

    for op, expected in [
        (declared("bad", invalid), "INVALID_VALUE"),
        (declared("failure", failure), "OPERATION_FAILED"),
    ]:
        with pytest.raises(ClearingsError) as error:
            await runtime.run(single(op), 1)
        assert error.value.code == expected
    await runtime.drain()
    assert runtime.snapshot()["in_flight"] == runtime.snapshot()["live_values"] == 0


async def test_large_graph_yields_and_unused_work_is_excluded():
    runtime = Runtime(work_budget=1)
    ticks, calls = 0, 0
    stop = False

    async def ticker():
        nonlocal ticks
        while not stop:
            ticks += 1
            await asyncio.sleep(0)

    async def execute(x, context):
        nonlocal calls
        calls += 1
        return x

    op = declared("unused", execute)

    def build(q, x):
        q.call(op, x)
        result = q.value(x)
        for _ in range(400):
            result = q.transform(result, lambda v: v + 1)
        return result

    timer = asyncio.create_task(ticker())
    assert await runtime.run(flow("large", build), 0) == 400
    await runtime.drain()
    stop = True
    await timer
    assert ticks > 0 and calls == 0
    assert runtime.snapshot()["owned_nodes"] == 0


async def test_records_and_close():
    runtime = Runtime(record_limit=2)
    for value in range(20):
        await runtime.run(case_flow("value"), value)
        await runtime.drain()
    assert len(runtime.records) == 2
    runtime.close()
    await runtime.drain()
    with pytest.raises(ClearingsError) as error:
        await runtime.run(case_flow("value"), 1)
    assert error.value.code == "CLOSED"


async def test_asgi_endpoint_uses_public_sdk():
    spec = importlib.util.spec_from_file_location(
        "product_cards_example", ROOT / "examples/product-cards/python.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    runtime = Runtime()
    application = module.create_app(runtime)
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    await application({"type": "http", "query_string": b"id=A&id=B&id=A"}, receive, send)
    await runtime.drain()
    assert messages[0]["status"] == 200
    assert json.loads(messages[1]["body"]) == next(
        c["expected"] for c in CASES if c["id"] == "ordered-duplicates"
    )
    assert runtime.records[0]["dispatched_calls"] == 6
    runtime.close()
    await runtime.drain()
