import asyncio
import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar, cast, overload

from ._control import Kind
from .values import ClearingsError, Codec, Value, copy_value

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


@dataclass(frozen=True)
class OperationContext:
    cancelled: asyncio.Event
    deadline: int


@dataclass(frozen=True)
class Operation(Generic[InputT, OutputT]):
    id: str
    version: str
    input: Codec[InputT]
    output: Codec[OutputT]
    execute: Callable[[InputT, OperationContext], Awaitable[OutputT]]
    effect: str = "read"


def operation(
    *,
    id: str,
    version: str,
    input: Codec[InputT],
    output: Codec[OutputT],
    execute: Callable[[InputT, OperationContext], Awaitable[OutputT]],
    effect: str = "read",
) -> Operation[InputT, OutputT]:
    if not id or not version or len(f"{id}@{version}".encode()) > 256 or effect != "read":
        raise ClearingsError("UNSUPPORTED")
    return Operation(id, version, input, output, execute)


@dataclass(frozen=True)
class Ref(Generic[OutputT]):
    owner: "Context"
    id: int


@dataclass
class Spec:
    kind: Kind
    deps: list[int]
    binding: str
    source: str
    value: Value = None
    execute: Callable[[list[Value], OperationContext], Value | Awaitable[Value]] | None = None
    operation: dict[str, str] | None = None


class Context:
    def __init__(self, name: str, reserve: Callable[[], None]) -> None:
        self.name = name
        self.nodes: list[Spec] = []
        self._reserve = reserve

    def _ref(self, spec: Spec) -> Ref[Any]:
        if not spec.source or len(spec.source.encode()) > 1024:
            raise ClearingsError("INVALID_PLAN")
        self._reserve()
        result: Ref[Any] = Ref(self, len(self.nodes))
        self.nodes.append(spec)
        return result

    def reference(self, ref: Ref[Any]) -> int:
        if not isinstance(ref, Ref) or ref.owner is not self or not 0 <= ref.id < len(self.nodes):
            raise ClearingsError("INVALID_PLAN")
        return ref.id

    def value(self, value: OutputT) -> Ref[OutputT]:
        return self._ref(
            Spec(
                "value",
                [],
                "",
                f"{self.name}:input:{len(self.nodes)}",
                copy_value(cast(Value, value)),
            )
        )

    def call(
        self, op: Operation[InputT, OutputT], input: InputT | Ref[InputT], source: str | None = None
    ) -> Ref[OutputT]:
        if op.effect != "read":
            raise ClearingsError("UNSUPPORTED")
        dep = input if isinstance(input, Ref) else self.value(input)
        label = source or f"{self.name}:{op.id}:{len(self.nodes)}"

        async def execute(args: list[Value], context: OperationContext) -> Value:
            argument = copy_value(args[0])
            if not op.input.accepts(argument):
                raise ClearingsError("INVALID_VALUE", label)
            result = copy_value(cast(Value, await op.execute(cast(InputT, argument), context)))
            if not op.output.accepts(result):
                raise ClearingsError("INVALID_VALUE", label)
            return result

        return self._ref(
            Spec(
                "call",
                [self.reference(dep)],
                f"{op.id}@{op.version}",
                label,
                execute=execute,
                operation={"id": op.id, "version": op.version},
            )
        )

    def transform(
        self, input: Ref[InputT], transform: Callable[[InputT], OutputT], source: str | None = None
    ) -> Ref[OutputT]:
        label = source or f"{self.name}:transform:{len(self.nodes)}"

        def execute(args: list[Value], context: OperationContext) -> Value:
            result = transform(cast(InputT, copy_value(args[0])))
            if inspect.isawaitable(result):
                if inspect.iscoroutine(result):
                    result.close()
                raise ClearingsError("UNSUPPORTED", label)
            return copy_value(cast(Value, result))

        return self._ref(
            Spec(
                "transform",
                [self.reference(input)],
                f"transform:{len(self.nodes)}",
                label,
                execute=execute,
            )
        )

    @overload
    def join(self, items: list[Ref[OutputT]]) -> Ref[list[OutputT]]: ...
    @overload
    def join(self, items: dict[str, Ref[Any]]) -> Ref[dict[str, Value]]: ...
    def join(self, items: list[Ref[Any]] | dict[str, Ref[Any]]) -> Ref[Any]:
        array = isinstance(items, list)
        refs = (
            cast(list[Ref[Any]], items)
            if array
            else list(cast(dict[str, Ref[Any]], items).values())
        )
        if len(refs) > 128:
            raise ClearingsError("CAPACITY")
        keys = [] if array else list(items)

        def execute(args: list[Value], context: OperationContext) -> Value:
            return args if array else dict(zip(cast(list[str], keys), args, strict=True))

        return self._ref(
            Spec(
                "join",
                [self.reference(r) for r in refs],
                "array" if array else "object",
                f"{self.name}:join:{len(self.nodes)}",
                execute=execute,
            )
        )

    def map(
        self, items: list[InputT], build: Callable[[InputT], Ref[OutputT]], max_items: int = 128
    ) -> Ref[list[OutputT]]:
        if (
            type(items) is not list
            or type(max_items) is not int
            or not 0 <= max_items <= 128
            or len(items) > max_items
        ):
            raise ClearingsError("CAPACITY")
        return self.join([build(item) for item in items])


@dataclass(frozen=True)
class Flow(Generic[InputT, OutputT]):
    name: str
    build: Callable[[Context, InputT], Ref[OutputT]]


def flow(name: str, build: Callable[[Context, InputT], Ref[OutputT]]) -> Flow[InputT, OutputT]:
    if not name or len(name.encode()) > 256:
        raise ClearingsError("INVALID_PLAN")
    return Flow(name, build)
