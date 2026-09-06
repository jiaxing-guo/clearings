"""Generate the closed interchange schema for the typed specification core."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def obj(fields):
    return {"type": "object", "additionalProperties": False, "required": list(fields), "properties": fields}


def arr(item, **extra):
    return {"type": "array", "items": item, **extra}


def enum(*values):
    return {"enum": list(values)}


def ref(name):
    return {"$ref": f"#/definitions/{name}"}


text = {"type": "string", "minLength": 1}
identifier = {"type": "string", "pattern": "^[a-zA-Z][a-zA-Z0-9_.:/-]*$", "maxLength": 256}
ids = arr(identifier, uniqueItems=True)
expression = ref("Expression")
value_type = ref("ValueType")
binding = obj({"artifact_id": text, "snapshot_id": {"type": ["string", "null"]}})
definitions = {
    "ValueType": {"oneOf": [
        obj({"kind": enum("boolean", "string", "integer", "number", "null")}),
        obj({"kind": enum("enum"), "values": arr(text, minItems=1, uniqueItems=True)}),
        obj({"kind": enum("list"), "element": value_type}),
        obj({"kind": enum("record"), "fields": {"type": "object", "propertyNames": identifier, "additionalProperties": value_type}}),
    ]},
    "Expression": {"oneOf": [
        obj({"kind": enum("literal"), "value": ref("JsonValue")}),
        obj({"kind": enum("ref"), "root": enum("input", "before", "after", "output", "local"), "path": arr(identifier, maxItems=16)}),
        obj({"kind": enum("not", "length", "unique"), "value": expression}),
        obj({"kind": enum("all", "any"), "terms": arr(expression)}),
        obj({"kind": enum("compare"), "op": enum("eq", "ne", "lt", "lte", "gt", "gte"), "left": expression, "right": expression}),
        obj({"kind": enum("contains", "subset"), "collection": expression, "value": expression}),
        obj({"kind": enum("every"), "collection": expression, "variable": identifier, "predicate": expression}),
        obj({"kind": enum("opaque"), "text": text, "reason": text}),
    ]},
    "JsonValue": {"anyOf": [
        {"type": ["null", "boolean", "number", "string"]}, arr(ref("JsonValue")),
        {"type": "object", "additionalProperties": ref("JsonValue")},
    ]},
    "Rule": obj({"id": identifier, "description": text, "predicate": expression, "evidence_ids": ids}),
    "Source": obj({"id": identifier, "origin": enum("source", "requirement", "design"), "locator": text, "text": {"type": "string"}, "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "binding": {"anyOf": [binding, {"type": "null"}]}}),
    "State": obj({"id": identifier, "name": text, "description": text, "scope": enum("invocation", "request", "repository", "process", "external"), "type": value_type, "evidence_ids": ids}),
    "Decision": obj({"id": identifier, "question": text, "consequence": text, "disposition": enum("unresolved-requirement", "analysis-limit", "implementation-choice"), "blocking": {"type": "boolean"}, "evidence_ids": ids}),
    "Dependency": obj({"operation_id": identifier, "kind": enum("uses-contract", "invokes", "awaits", "continuation"), "requirement": enum("required", "optional"), "role": text}),
    "Implementation": obj({"name": text, "responsibility": text, "symbol_id": {"type": ["string", "null"]}, "evidence_ids": ids}),
    "Outcome": obj({
        "id": identifier, "description": text, "when": expression, "ensures": arr(ref("Rule")),
        "updates": arr(obj({"state_id": identifier, "value": expression})),
        "effects": arr(obj({"effect_id": identifier, "occurrence": enum("required", "permitted")})),
        "transitions": arr(obj({"operation_id": identifier, "handoff": enum("invoke", "await", "continue", "propagate"), "description": text})),
        "evidence_ids": ids,
    }),
    "Operation": obj({
        "id": identifier, "alias": identifier, "name": text, "purpose": text,
        "inputs": {"type": "object", "propertyNames": identifier, "additionalProperties": value_type}, "output": value_type,
        "reads": ids, "writes": ids, "frame": enum("complete", "partial"),
        "effects": obj({"completeness": enum("complete", "partial"), "allowed": arr(obj({"id": identifier, "description": text}))}),
        "outcome_policy": enum("exclusive", "allowed"), "coverage": enum("complete", "partial"), "outcomes": arr(ref("Outcome"), minItems=1),
        "guarantees": arr(ref("Rule")), "dependencies": arr(ref("Dependency")), "implementations": arr(ref("Implementation")),
        "decisions": arr(ref("Decision")), "evidence_ids": ids,
    }),
}
schema = {
    "$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://clearings.dev/schemas/specification.v0.3.json",
    **obj({"schema_version": enum("0.3.0"), "kind": enum("specification"), "artifact_id": {"type": "string", "pattern": "^specification:[a-f0-9]{64}$"},
           "name": text, "perspective": enum("intended", "observed"),
           "provenance": obj({"author": text, "origin": enum("user-directed-design", "source-interpretation"), "review": enum("proposed"), "notes": arr(text)}),
           "states": arr(ref("State")), "operations": arr(ref("Operation"), minItems=1), "sources": arr(ref("Source"))}),
    "definitions": definitions,
}
(ROOT / "schemas/specification.v0.3.json").write_text(json.dumps(schema, indent=2) + "\n")
