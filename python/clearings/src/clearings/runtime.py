from __future__ import annotations

import asyncio
import inspect
import json
import time
from dataclasses import dataclass, replace
from typing import Any, TypeVar, cast

from . import _control as c
from ._native import NativeEngine
from .flow import Context, Flow, OperationContext, Spec
from .values import ACTIONS, ClearingsError, Value, copy_value

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


def now() -> int:
    return int(time.monotonic() * 1000)


def integer(value: int, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ClearingsError("CAPACITY")
    return value


def native_error(error: Exception) -> ClearingsError:
    if isinstance(error, ClearingsError):
        return error
    try:
        parsed = json.loads(str(error))
        if parsed["code"] in ACTIONS:
            return ClearingsError(parsed["code"], parsed.get("source"))
    except (ValueError, TypeError, KeyError):
        pass
    return ClearingsError("INVALID_PLAN")


@dataclass
class Run:
    specs: list[Spec]
    values: dict[int, Value]
    next_value: int
    result: asyncio.Future[Value]
    deadline: int
    started: float
    record: dict[str, Any] | None = None
    released_values: int = 0


class Runtime:
    def __init__(
        self,
        *,
        max_runs: int = 64,
        max_nodes: int = 4096,
        max_in_flight: int = 32,
        work_budget: int = 64,
        record_limit: int = 64,
        build: str = "unversioned",
    ) -> None:
        self._limits: c.Limits = {
            "max_runs": integer(max_runs, 1, 1024),
            "max_nodes": integer(max_nodes, 1, 65536),
            "max_in_flight": integer(max_in_flight, 1, 4096),
        }
        self._budget = integer(work_budget, 1, 4096)
        self._record_limit = integer(record_limit, 0, 1024)
        if len(build.encode()) > 256:
            raise ClearingsError("INVALID_PLAN")
        self._build = build
        self._core = NativeEngine(json.dumps(self._limits))
        self._loop: asyncio.AbstractEventLoop | None = None
        self._runs: dict[int, Run] = {}
        self._actions: dict[int, tuple[asyncio.Task[c.Event0], asyncio.Event]] = {}
        self._events: list[c.Event] = []
        self._pumping = False
        self._scheduled = False
        self._timer: asyncio.TimerHandle | None = None
        self._closed = False
        self._fault: ClearingsError | None = None
        self._planning = 0
        self._owned_nodes = 0
        self._history: list[dict[str, Any]] = []
        self._idle = asyncio.Event()
        self._idle.set()

    def _event_loop(self) -> asyncio.AbstractEventLoop:
        loop = asyncio.get_running_loop()
        if self._loop is not None and loop is not self._loop:
            raise ClearingsError("UNSUPPORTED")
        self._loop = loop
        return loop

    @property
    def records(self) -> list[dict[str, Any]]:
        # Records are metadata only; callers cannot mutate the runtime's stored copy.
        return cast(list[dict[str, Any]], json.loads(json.dumps(self._history)))

    def snapshot(self) -> dict[str, Any]:
        snapshot: dict[str, Any] = json.loads(self._core.snapshot())
        return {
            **snapshot,
            "planning": self._planning,
            "live_values": sum(len(r.values) for r in self._runs.values()),
            "owned_nodes": self._owned_nodes,
        }

    async def run(
        self,
        flow: Flow[InputT, OutputT],
        input: InputT,
        *,
        timeout_ms: int = 30000,
        max_in_flight: int | None = None,
    ) -> OutputT:
        loop = self._event_loop()
        if self._closed:
            raise ClearingsError("CLOSED")
        if self._planning + len(self._runs) >= self._limits["max_runs"]:
            raise ClearingsError("CAPACITY")
        started = time.monotonic()
        deadline = now() + integer(timeout_ms, 1, 2147483647)
        capacity = integer(
            self._limits["max_in_flight"] if max_in_flight is None else max_in_flight,
            1,
            self._limits["max_in_flight"],
        )

        def check() -> None:
            if self._closed:
                raise ClearingsError("CLOSED")
            if now() >= deadline:
                raise ClearingsError("TIMEOUT")

        def reserve() -> None:
            if self._owned_nodes >= self._limits["max_nodes"]:
                raise ClearingsError("CAPACITY")
            self._owned_nodes += 1

        self._planning += 1
        self._idle.clear()
        context = Context(flow.name, reserve)
        submitted = False
        try:
            await asyncio.sleep(0)
            check()
            root = flow.build(context, copy_value(input))
            root_id = context.reference(root)
            reachable: set[int] = set()
            pending = [root_id]
            work = 0
            while pending:
                node = pending.pop()
                if node not in reachable:
                    reachable.add(node)
                    pending.extend(context.nodes[node].deps)
                work += 1
                if work % 64 == 0:
                    await asyncio.sleep(0)
                    check()
            selected = sorted(reachable)
            mapping = {old: new for new, old in enumerate(selected)}
            values: dict[int, Value] = {}
            next_value = 1
            specs: list[Spec] = []
            nodes: list[c.Node] = []
            for old in selected:
                original = context.nodes[old]
                spec = replace(original, deps=[mapping[d] for d in original.deps], value=None)
                handle = None
                if spec.kind == "value":
                    handle = next_value
                    next_value += 1
                    values[handle] = original.value
                specs.append(spec)
                nodes.append(
                    {
                        "kind": spec.kind,
                        "deps": spec.deps,
                        "binding": spec.binding,
                        "source": spec.source,
                        "value": handle,
                    }
                )
                if len(nodes) % 64 == 0:
                    await asyncio.sleep(0)
                    check()
            check()
            submitted_at = now()
            plan: c.Plan = {
                "protocol": 1,
                "flow": flow.name,
                "build": self._build,
                "nodes": nodes,
                "root": mapping[root_id],
                "timeout_ms": max(1, deadline - submitted_at),
                "max_in_flight": capacity,
            }
            encoded = json.dumps(plan, ensure_ascii=False)
            if len(encoded.encode()) > 2097152:
                raise ClearingsError("CAPACITY")
            run_id = self._core.submit(encoded, submitted_at)
            result: asyncio.Future[Value] = loop.create_future()
            self._runs[run_id] = Run(specs, values, next_value, result, deadline, started)
            self._owned_nodes -= len(context.nodes) - len(selected)
            context.nodes.clear()
            submitted = True
            self._planning -= 1
            self._wake()
            try:
                return cast(OutputT, await asyncio.shield(result))
            except asyncio.CancelledError:
                self._events.append({"type": "cancel", "run": run_id})
                self._wake()
                # The public task keeps asyncio cancellation while the core settles its run.
                result.add_done_callback(
                    lambda future: None if future.cancelled() else future.exception()
                )
                raise
        except Exception as error:
            raise native_error(error) from None
        finally:
            if not submitted:
                self._owned_nodes -= len(context.nodes)
                self._planning -= 1
                self._notify_idle()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._core.close()
        self._wake()

    async def drain(self) -> None:
        self._event_loop()
        if self._fault:
            raise self._fault
        await self._idle.wait()
        if self._fault:
            raise self._fault

    def _notify_idle(self) -> None:
        if not self._runs and not self._planning:
            self._idle.set()

    def _wake(self) -> None:
        if self._fault or self._loop is None or self._loop.is_closed():
            return
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        if self._pumping or self._scheduled:
            return
        self._scheduled = True
        self._loop.call_soon(self._start_pump)

    def _start_pump(self) -> None:
        self._scheduled = False
        assert self._loop is not None
        self._loop.create_task(self._pump())

    async def _pump(self) -> None:
        if self._pumping:
            return
        self._pumping = True
        try:
            count = min(self._budget, 128)
            events, self._events = self._events[:count], self._events[count:]
            turn = cast(
                c.Turn, json.loads(self._core.advance(json.dumps(events), now(), self._budget))
            )
            for index, command in enumerate(turn["commands"]):
                self._command(command)
                if (index + 1) % 64 == 0:
                    await asyncio.sleep(0)
            self._pumping = False
            if turn["has_work"] or self._events:
                self._wake()
            elif turn.get("next_wakeup_ms") is not None:
                assert self._loop is not None
                self._timer = self._loop.call_later(
                    max(0.001, (cast(int, turn["next_wakeup_ms"]) - now()) / 1000), self._wake
                )
            self._notify_idle()
        except Exception as error:
            self._pumping = False
            self._closed = True
            self._fault = native_error(error)
            self._core.close()
            for task, cancelled in self._actions.values():
                cancelled.set()
                task.cancel()
            for run in self._runs.values():
                if not run.result.done():
                    run.result.set_exception(self._fault)
            self._idle.set()

    async def _execute(
        self,
        command: c.Command0,
        run: Run,
        spec: Spec,
        inputs: list[Value],
        cancelled: asyncio.Event,
    ) -> c.Event0:
        event: c.Event0 = {
            "type": "complete",
            "run": command["run"],
            "command": command["command"],
            "value": None,
            "error": None,
        }
        try:
            assert spec.execute is not None
            outcome = spec.execute(inputs, OperationContext(cancelled, run.deadline))
            result = await outcome if inspect.isawaitable(outcome) else outcome
            value = copy_value(result)
            handle = run.next_value
            run.next_value += 1
            run.values[handle] = value
            event["value"] = handle
        except asyncio.CancelledError:
            event["error"] = {"code": "CANCELLED", "source": command["source"]}
        except Exception as error:
            event["error"] = {
                "code": error.code
                if isinstance(error, ClearingsError)
                else "OPERATION_FAILED"
                if command["kind"] == "call"
                else "TRANSFORM_FAILED",
                "source": command["source"],
            }
        return event

    def _command(self, command: c.Command) -> None:
        run = self._runs[command["run"]]
        if command["type"] == "dispatch":
            spec = run.specs[command["node"]]
            if spec.execute is None or spec.binding != command["binding"]:
                raise ClearingsError("INVALID_PLAN")
            inputs = [run.values[handle] for handle in command["inputs"]]
            cancelled = asyncio.Event()
            assert self._loop is not None
            task = self._loop.create_task(self._execute(command, run, spec, inputs, cancelled))
            self._actions[command["command"]] = (task, cancelled)

            def settled(task: asyncio.Task[c.Event0]) -> None:
                self._actions.pop(command["command"], None)
                event: c.Event0 = (
                    {
                        "type": "complete",
                        "run": command["run"],
                        "command": command["command"],
                        "value": None,
                        "error": {"code": "CANCELLED", "source": command["source"]},
                    }
                    if task.cancelled()
                    else task.result()
                )
                self._events.append(event)
                self._wake()

            task.add_done_callback(settled)
        elif command["type"] == "release":
            run.values.pop(command["value"], None)
            run.released_values += 1
            if run.record is not None:
                run.record["released_values"] = run.released_values
                run.record["live_values"] = len(run.values)
        elif command["type"] == "cancel":
            action = self._actions.get(command["command"])
            if action is not None:
                task, cancelled = action
                cancelled.set()
                task.cancel()
        elif command["type"] == "finished":
            adapters = {
                f"{s.operation['id']}@{s.operation['version']}": s.operation
                for s in run.specs
                if s.operation is not None
            }
            failure = command.get("error")
            record: dict[str, Any] = {
                **command["record"],
                "sdk_version": "0.1.0",
                "adapter_versions": list(adapters.values())[:128],
                "adapter_versions_dropped": max(0, len(adapters) - 128),
                "elapsed_ms": (time.monotonic() - run.started) * 1000,
                "live_values": len(run.values),
                "released_values": run.released_values,
                "outcome": failure["code"] if failure else "SUCCEEDED",
            }
            run.record = record
            self._history.append(record)
            if len(self._history) > self._record_limit:
                self._history.pop(0)
            if failure:
                run.result.set_exception(ClearingsError(failure["code"], failure.get("source")))
            else:
                handle = command.get("value")
                if handle is None or handle not in run.values:
                    raise ClearingsError("INVALID_PLAN")
                run.result.set_result(run.values[handle])
        elif command["type"] == "dropped":
            self._owned_nodes -= len(run.specs)
            run.values.clear()
            if run.record is not None:
                run.record["live_values"] = 0
            del self._runs[command["run"]]
