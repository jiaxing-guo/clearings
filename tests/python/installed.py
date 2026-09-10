import asyncio
import importlib.util
import json
from pathlib import Path

from clearings import ClearingsError, Runtime
from fixtures import case_flow


async def main():
    cases = json.loads((Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))["cases"]
    assert importlib.util.find_spec("clearings._native").origin.endswith((".so", ".pyd"))
    records = []
    for case in cases:
        runtime = Runtime()
        calls = []
        output = {"id": case["id"]}
        try:
            result = await runtime.run(
                case_flow(case["kind"], lambda *args: calls.append(args)), case["input"]
            )
            assert "error" not in case
            assert result == case["expected"] and len(calls) == case["calls"]
            output["result"] = result
        except ClearingsError as error:
            assert error.code == case["error"]
            output["error"] = error.code
        await runtime.drain()
        assert runtime.snapshot()["live_values"] == 0
        record = runtime.records[0]
        output["record"] = {
            key: record[key]
            for key in [
                "protocol",
                "core_version",
                "strategy",
                "logical_calls",
                "dispatched_calls",
                "completed_calls",
                "uncertain_actions",
            ]
        }
        records.append(output)
        runtime.close()
        await runtime.drain()
    print(json.dumps(records))


asyncio.run(main())
