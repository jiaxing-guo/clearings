# Embedded execution contract

**Status:** implementation contract, protocol version 1. The embedded runtime and both SDKs are the current implementation scope. Batching, reuse, real service adapters, shared admission and CLI/MCP remain subsequent capabilities.

## Architecture

One Rust core makes scheduling and lifecycle decisions. Node uses napi-rs; Python uses PyO3 and Maturin. Each reusable Runtime owns one core instance. Async I/O, credentials, callbacks and payload objects remain in the host. The core has no networking, filesystem, wall-clock access or async executor. It receives explicit monotonic time and bounded control messages. Supported host versions are Node 24 and CPython 3.11–3.14; native build checks establish platform support progressively.

Use Cargo with pinned stable Rust 1.88.0 and edition 2024, npm workspaces for Node packages, and uv for Python. Keep the website's independent dependency lock. Core control types generate JSON Schema; application value validators follow the rules below. Matching artifacts are versioned together initially.

## Authoring and values

A flow builder receives a composition context and application input. `value`, `call`, `join`, `transform` and `map` create a finite dependency graph. A reference can only belong to its current builder. Calls and transformations accept dependencies; joins preserve array positions or named fields. A map takes a finite input array, applies a synchronous graph-building function per item and returns ordered results. Its item cap is explicit. Mapping a future service result is not supported in this first slice. Callback bodies and arbitrary async code are not serialized or inferred.

Graph construction is bounded by node, edge, map-item and dependency limits. Large supported graph serialization and execution yield between host turns. Oversized plans fail before any service dispatch. The core validates and activates a submitted plan incrementally. All dependencies precede their consumer in the submitted plan, which excludes cycles. A plan uses one root; unrelated work is rejected or excluded by SDK compilation.

Operation arguments and results use the portable value domain: null, booleans, finite numbers, Unicode scalar strings, arrays and string-keyed records. Integers must be within ±9,007,199,254,740,991. Negative zero normalizes to zero. An absent object field differs from an explicit null; undefined values, missing array positions, non-string keys, cycles, lone surrogates and non-finite numbers are rejected. Dates and large integers are passed through explicit application codecs as strings; implicit Date/datetime, decimal and bigint conversion is rejected. SDK values do not cross native FFI merely to schedule a call. Validation has explicit depth and size limits.

Host transformations are synchronous and pure by contract. Clearings cannot detect arbitrary hidden effects or preempt blocking user code. Service operations are explicit async handlers, with stable identity/version, input/output validation and declared read effect. This slice dispatches individual calls and performs no retries or reuse. Claims of batching, caching, shared quotas or writes are rejected until supported.

## Execution and policy

The invocation method is `Runtime.run(flow, input, options)`. It returns an awaitable application result. A reusable Runtime shares its configured capacity across runs. Creating one Runtime per request gives each request a separate limit and is not the recommended endpoint integration.

The initial fixed strategy is `individual-v1`. Runtime configuration sets run/node capacity, in-flight action capacity and per-turn work. A run may restrict its active-action limit and timeout; it cannot enlarge Runtime limits. Timeout includes planning, queue and dispatch wait. Settings identify their origin. Unsupported settings fail explicitly. Latency objectives and shared resource policies arrive with their implementations rather than being accepted as ignored configuration.

The core accepts a plan and events, then advances through a bounded number of transitions. Commands identify a run, action and node. Dispatch commands carry host-value handles and stable callback/operation identities. A host copies references needed by an action before processing later release commands. Completions report either a new result handle or a structured failure. Handle release is explicit; the host owns the actual object heap.

Run states are preparing, active, succeeded, failed, cancelled or timed out. Failure is fail-fast: it stops new dispatch and requests cancellation of outstanding actions. Individual successful values remain ordered through joins and maps. Applications that want partial results must encode those as ordinary successful domain values. The runtime never silently changes error policy.

Cancellation or an expired deadline is considered before dispatch in the same advance turn. Late and duplicate completions cannot resurrect a terminal run. Dispatch failures settle their issued command just like other failures. The core does not release an in-flight capacity reservation merely because a caller timed out: the host must report that the action settled. A non-cooperative handler may therefore retain capacity. This limits host-tracked work and does not establish exact external concurrency or rollback.

On termination, stop admitting work, request supported cancellation, release references no longer needed, and settle the caller once. Cleanup itself is incremental. Runtime close cancels its runs and prevents new submissions. A timed-out HTTP request may continue remotely. Records distinguish requested cancellation and externally uncertain outcomes. Joining all outstanding work is an explicit host lifecycle operation, not an implied rollback guarantee.

## Control records and diagnostics

The core records protocol/core/strategy versions, run and flow identities, policy origins, action counts, outcome, queue timing and ignored late events. Host records add SDK and adapter versions, host timing and live-value counts. Records and error text are bounded and contain no raw values or credentials by default. Source labels refer to authored operations; they do not prove callback implementation equivalence. Detailed full tracing and CLI/MCP inspection are later surfaces.

Errors use stable codes: INVALID_PLAN, INVALID_VALUE, UNSUPPORTED, CAPACITY, OPERATION_FAILED, TRANSFORM_FAILED, CANCELLED, TIMEOUT and CLOSED. A diagnostic identifies its source when available and a next action. Original host exceptions may remain attached locally; default records must not copy their potentially sensitive message or payload.

## Independent acceptance

[Shared cases](../contracts/execution-cases.json) fix public results separately from scheduler code. [Acceptance budgets](../contracts/acceptance.json) fix workloads and thresholds before implementation timing. Core tests additionally exercise dependency order, completion permutations, malformed plans, cancellation, time advancement, exhausted capacities, host dispatch failures, ownership and bounded work turns. Installed-package tests must execute both SDKs through native bindings with no interpreter fallback.

The initial package gate is Linux glibc x64 installation without Rust tooling. CI also starts macOS and Windows native builds. The full release matrix remains Linux glibc and macOS x64/arm64, Windows x64, Node 24 and CPython 3.11–3.14. Artifacts for untested targets are not described as supported releases.

The real-service acceptance workload is product cards with catalog and inventory. Compare straightforward individual calls, an ordinary hand-written bulk helper and Clearings using identical datasets, pool limits and providers. Report physical calls, ordered output agreement, p50/p95 latency, throughput, queue wait and runtime overhead. Future batching gains must meet the frozen budgets or require an explicit reviewed contract change. No timing or token-saving result is claimed by this contract.
