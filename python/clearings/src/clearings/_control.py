# Generated from contracts/protocol.schema.json. Do not edit.
from typing import Literal, NotRequired, TypedDict

Kind = Literal['value', 'call', 'transform', 'join']

class Record(TypedDict):
    build: str
    completed_calls: int
    core_version: str
    dispatched_calls: int
    effective_max_in_flight: int
    finished_ms: int
    flow: str
    limit_origin: str
    logical_calls: int
    protocol: int
    queue_ms: int
    started_ms: int
    strategy: str
    uncertain_actions: int

ErrorCode = Literal['INVALID_PLAN', 'INVALID_VALUE', 'UNSUPPORTED', 'CAPACITY', 'OPERATION_FAILED', 'TRANSFORM_FAILED', 'CANCELLED', 'TIMEOUT', 'CLOSED']

class Limits(TypedDict):
    max_in_flight: int
    max_nodes: int
    max_runs: int

class Snapshot(TypedDict):
    closed: bool
    ignored_completions: int
    in_flight: int
    nodes: int
    runs: int

class Node(TypedDict):
    binding: str
    deps: list[int]
    kind: Kind
    source: str
    value: NotRequired[int | None]

class Failure(TypedDict):
    code: ErrorCode
    source: NotRequired[str | None]

class Plan(TypedDict):
    build: str
    flow: str
    max_in_flight: int
    nodes: list[Node]
    protocol: int
    root: int
    timeout_ms: int

class Command0(TypedDict):
    binding: str
    command: int
    inputs: list[int]
    kind: Kind
    node: int
    run: int
    source: str
    type: Literal['dispatch']

class Command1(TypedDict):
    run: int
    type: Literal['release']
    value: int

class Command2(TypedDict):
    command: int
    run: int
    type: Literal['cancel']

class Command3(TypedDict):
    error: NotRequired[Failure | None]
    record: Record
    run: int
    type: Literal['finished']
    value: NotRequired[int | None]

class Command4(TypedDict):
    run: int
    type: Literal['dropped']

Command = Command0 | Command1 | Command2 | Command3 | Command4

class Event0(TypedDict):
    command: int
    error: NotRequired[Failure | None]
    run: int
    type: Literal['complete']
    value: NotRequired[int | None]

class Event1(TypedDict):
    run: int
    type: Literal['cancel']

Event = Event0 | Event1

class Turn(TypedDict):
    commands: list[Command]
    has_work: bool
    next_wakeup_ms: NotRequired[int | None]
    steps: int

class Protocol(TypedDict):
    command: Command
    event: Event
    failure: Failure
    limits: Limits
    plan: Plan
    snapshot: Snapshot
    turn: Turn
