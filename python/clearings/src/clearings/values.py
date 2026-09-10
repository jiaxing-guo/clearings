from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, TypeAlias, TypeVar, cast

from ._control import ErrorCode

Value: TypeAlias = None | bool | int | float | str | list["Value"] | dict[str, "Value"]
T = TypeVar("T")
T_co = TypeVar("T_co", covariant=True)
ACTIONS: dict[ErrorCode, str] = {
    "INVALID_PLAN": "Check flow references, dependency limits and policy settings.",
    "INVALID_VALUE": "Use supported portable values and the declared operation schema.",
    "UNSUPPORTED": "Use an implemented capability and matching SDK/native versions.",
    "CAPACITY": "Reduce admitted work or explicitly adjust the runtime capacity.",
    "OPERATION_FAILED": "Inspect the operation in the application; retry only under its declared semantics.",
    "TRANSFORM_FAILED": "Inspect the pure transformation at the indicated source.",
    "CANCELLED": "Start another invocation if the result is still needed.",
    "TIMEOUT": "Inspect queue and service time before changing the deadline.",
    "CLOSED": "Create a new Runtime for subsequent invocations.",
}


class ClearingsError(Exception):
    def __init__(self, code: ErrorCode, source: str | None = None) -> None:
        self.code = code
        self.source = source
        self.next_action = ACTIONS[code]
        super().__init__(f"{code}{' at ' + source if source else ''}. {self.next_action}")


def copy_value(input: T) -> T:
    """Snapshot portable data in the host; reject implicit codecs and coercion."""
    entries = 0
    byte_count = 0
    path: set[int] = set()

    def string(value: str) -> str:
        nonlocal byte_count
        try:
            byte_count += len(value.encode("utf-8"))
        except UnicodeEncodeError:
            raise ClearingsError("INVALID_VALUE") from None
        if byte_count > 1_048_576:
            raise ClearingsError("CAPACITY")
        return value

    def visit(value: object, depth: int) -> Value:
        nonlocal entries
        entries += 1
        if entries > 100_000 or depth > 64:
            raise ClearingsError("CAPACITY")
        if value is None or type(value) is bool:
            return cast(Value, value)
        if type(value) is str:
            return string(value)
        if type(value) is int:
            if abs(value) > 9_007_199_254_740_991:
                raise ClearingsError("INVALID_VALUE")
            return value
        if type(value) is float:
            number = value
            if not math.isfinite(number) or (
                number.is_integer() and abs(number) > 9_007_199_254_740_991
            ):
                raise ClearingsError("INVALID_VALUE")
            return 0 if number == 0 else number
        if type(value) not in (list, dict) or id(value) in path:
            raise ClearingsError("INVALID_VALUE")
        path.add(id(value))
        if type(value) is list:
            result: Value = [visit(item, depth + 1) for item in cast(list[object], value)]
        else:
            record: dict[str, Value] = {}
            for key, item in cast(dict[object, object], value).items():
                if type(key) is not str:
                    raise ClearingsError("INVALID_VALUE")
                record[string(key)] = visit(item, depth + 1)
            result = record
        path.remove(id(value))
        return result

    return cast(T, visit(input, 0))


@dataclass(frozen=True)
class Codec(Generic[T_co]):
    schema: Value
    accepts: Callable[[Value], bool]


def codec(schema: Value, accepts: Callable[[Value], bool]) -> Codec[T]:
    return Codec(copy_value(schema), accepts)


class Schemas:
    any: Codec[Value] = Codec({}, lambda value: True)
    string: Codec[str] = Codec({"type": "string"}, lambda value: type(value) is str)
    number: Codec[int | float] = Codec(
        {"type": "number"}, lambda value: type(value) in (int, float)
    )
    boolean: Codec[bool] = Codec({"type": "boolean"}, lambda value: type(value) is bool)

    @staticmethod
    def array(item: Codec[T]) -> Codec[list[T]]:
        return Codec(
            {"type": "array", "items": item.schema},
            lambda value: type(value) is list and all(item.accepts(v) for v in value),
        )

    @staticmethod
    def nullable(item: Codec[T]) -> Codec[T | None]:
        return Codec(
            {"anyOf": [item.schema, {"type": "null"}]},
            lambda value: value is None or item.accepts(value),
        )

    @staticmethod
    def object(fields: dict[str, Codec[Value]]) -> Codec[dict[str, Value]]:
        return Codec(
            {
                "type": "object",
                "properties": {k: c.schema for k, c in fields.items()},
                "required": list(fields),
                "additionalProperties": False,
            },
            lambda value: (
                type(value) is dict
                and set(value) == set(fields)
                and all(c.accepts(value[k]) for k, c in fields.items())
            ),
        )


s = Schemas()
