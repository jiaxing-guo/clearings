"""Generate TypedDict projections of the core's JSON Schema; no behavior is generated."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
schema = json.loads((ROOT / "contracts/protocol.schema.json").read_text(encoding="utf-8"))
lines = ["# Generated from contracts/protocol.schema.json. Do not edit.", "from __future__ import annotations", "from typing import Literal, NotRequired, TypedDict", ""]


def expression(spec: dict) -> str:
    if "$ref" in spec:
        return spec["$ref"].rsplit("/", 1)[1]
    if "enum" in spec:
        return "Literal[" + ", ".join(repr(v) for v in spec["enum"]) + "]"
    if "const" in spec:
        return f"Literal[{spec['const']!r}]"
    if "anyOf" in spec:
        return " | ".join(expression(v) for v in spec["anyOf"])
    kind = spec.get("type")
    if isinstance(kind, list):
        return " | ".join(expression({"type": v}) for v in kind)
    if kind == "array":
        return f"list[{expression(spec['items'])}]"
    mapping = {"integer": "int", "number": "float", "string": "str", "boolean": "bool", "null": "None"}
    if kind in mapping:
        return mapping[kind]
    raise ValueError(f"Unsupported control schema node: {spec}")


def emit(name: str, spec: dict) -> None:
    if spec.get("type") == "object":
        lines.append(f"class {name}(TypedDict):")
        for key, value in spec["properties"].items():
            annotation = expression(value)
            if key not in spec.get("required", []):
                annotation = f"NotRequired[{annotation}]"
            lines.append(f"    {key}: {annotation}")
        lines.append("")
    elif "oneOf" in spec and all(v.get("type") == "object" for v in spec["oneOf"]):
        for i, variant in enumerate(spec["oneOf"]):
            emit(f"{name}{i}", variant)
        lines.append(f"{name} = " + " | ".join(f"{name}{i}" for i in range(len(spec["oneOf"]))))
        lines.append("")
    else:
        lines.append(f"{name} = {expression(spec)}")
        lines.append("")


for name, spec in schema["$defs"].items():
    emit(name, spec)
emit("Protocol", schema)
source = "\n".join(lines)
target = ROOT / "python/clearings/src/clearings/_control.py"
if "--check" in sys.argv:
    if target.read_text(encoding="utf-8") != source:
        raise SystemExit("Python control projection differs; regenerate it.")
else:
    target.write_text(source, encoding="utf-8")
