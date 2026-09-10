# Product requirements

**Version:** 0.1

**Status:** Draft for product review

**Date:** 10 September 2026

This document records the approved product direction and proposes a first release. The repository cleanup is recorded in [project history](history.md); the runtime requirements and interface examples remain proposals. Requirements below describe intended behavior, not existing product capabilities. API examples illustrate the interface and remain open to revision.

## 1. Product purpose

**Make straightforward backend code run efficiently as workloads grow.**

An engineer or coding agent describes application operations and their dependencies. Clearings organizes their execution using reusable adapters and explicit policies. It takes responsibility for batching, eligible deduplication, concurrency, resource limits and execution strategy, reducing the custom machinery that each application must maintain.

The primary value is a useful operational result: fewer remote calls, less waiting, controlled resource use, and less integration and scheduling code. Behavior preservation is a requirement of delivering that result. It is not the lead product promise.

The initial product hypothesis is that teams will adopt a small execution boundary inside an existing backend when its setup and adapter costs are lower than the recurring work it removes.

## 2. Decision record

| Item                                                          | Status           | Basis or remaining decision                                                |
| ------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| TypeScript SDK and Python SDK                                 | Approved         | Both are part of the product. This document does not defer Python.         |
| Adapter system                                                | Approved         | Reusable knowledge about supported databases and services.                 |
| Runtime                                                       | Approved         | Clearings owns execution mechanics within its supported boundary.          |
| CLI and MCP                                                   | Approved         | Development tools expose the same underlying capabilities and records.     |
| Application logic, capabilities and policies as the interface | Agreed direction | Accepted in the discussion replacing mandatory execution templates.        |
| Templates as optional, inspectable presets                    | Agreed direction | Presets expand to normal settings and introduce no exclusive behavior.     |
| Read aggregation as the first release boundary                | Proposed         | Provides a concrete execution problem and a small adoption boundary.       |
| Embedded execution with shared quota coordination             | Proposed         | Exact process boundary and coordinator architecture remain open.           |
| PostgreSQL read adapter and a typed HTTP adapter              | Proposed         | Specific integration packages and supported operations remain open.        |
| Initial public invocation method: `run`                       | Proposed         | Persistent `submit` and incremental `stream` are separate scope decisions. |
| Exact flow syntax, policy schema and package names            | Open             | Examples here are not final APIs.                                          |
| Runtime implementation language and reuse of current IR       | Open             | Decide after mapping requirements to existing code.                        |
| Numeric performance and adoption thresholds                   | Open             | Agree before implementation results influence acceptance criteria.         |

## 3. Users and jobs

| User                         | Job to accomplish                                                                       | Successful experience                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Backend engineer             | Add a feature that reads several sources without hand-building another execution layer. | A short flow uses adapters and produces a useful execution plan.                                                       |
| Coding agent                 | Compose working application logic from discoverable operations.                         | Typed schemas, source-linked diagnostics and structured run results are available through ordinary tools.              |
| Product owner using an agent | Build or change a feature while choosing meaningful product tradeoffs.                  | The agent asks about freshness, partial results or ordering when needed. The user does not need to select batch sizes. |
| Integration author           | Support a database or service once for many application flows.                          | An adapter declares real capabilities through a small, documented extension interface.                                 |

The application may use an LLM as an explicit business operation, but Clearings itself must not require a model call to schedule an ordinary invocation.

## 4. The first useful workflow

An existing endpoint receives product IDs. For each ID, it obtains catalog details and inventory, then constructs a product card. The application cares about result shape, authorization, freshness and failure behavior. Clearings handles compatible batching, repeated reads, independent execution and provider capacity.

An illustrative input is `A, B, A`. With two sources, straightforward per-position fetching requests six reads. If reuse is permitted within the invocation, there are four distinct reads. If both sources support a bulk request for both IDs, two external calls can produce the three ordered cards. These are explanatory call counts, not measured performance results.

The endpoint must preserve the intended sequence, including duplicate output positions. A bulk response can arrive out of order or contain item errors. The adapter and runtime must expose the specified result semantics without silently dropping or reordering cards.

The next feature change might add a third field or data source. The expected product benefit is that the agent changes application logic and reuses existing execution machinery. It should not need to create a new bespoke queue, request cache or batching loop.

## 5. Product model

| Concept    | Responsibility                                                                          | Examples                                                                               |
| ---------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Flow       | Describes logical work and dependencies.                                                | Map IDs, call operations, join results, construct a response.                          |
| Operation  | A typed unit of work with a stable identity.                                            | Read product, read inventory, transform a result.                                      |
| Adapter    | Implements operations and describes supported execution capabilities.                   | Individual/bulk fetch, result mapping, reuse scope, quota identity.                    |
| Policy     | Expresses execution objectives, resource restrictions and explicit product permissions. | Prefer latency, limit concurrent connections, allow a maximum result age.              |
| Executor   | Supplies the execution environment and its capabilities.                                | Embedded execution, or a future persistent worker service.                             |
| Plan       | Records chosen execution mechanics and their reasons.                                   | Batch compatible reads, run independent batches concurrently, wait for a quota permit. |
| Run record | Captures what happened and the scope of the observations.                               | Actual calls, queue wait, duration, result status and policy identity.                 |

Flow construction must expose supported work before dispatch. A library cannot generally recover scheduling freedom after arbitrary host code has already issued I/O. Flow primitives are the proposed initial mechanism; source transformation is a later authoring option.

Data-dependent branches and mappings may reveal work during execution. Plan inspection must distinguish a static plan from a plan specialized for a particular input and from the observed execution. It must not claim to enumerate every future branch.

## 6. Proposed first release scope

### Included

1. Idiomatic TypeScript and Python SDKs with equivalent operation and policy meanings.
2. Typed flow composition for bounded read aggregation and pure transformations.
3. A custom-adapter interface and two useful reference adapters: one database read adapter and one external-service adapter.
4. A runtime that combines batching, scoped reuse, dependency scheduling, bounded work queues and resource admission.
5. Shared quota support for a documented deployment topology. The first release must state the scope of enforcement precisely.
6. Explicit timeout, cancellation, per-item error and supported retry behavior.
7. Structured plan explanations and execution records.
8. CLI and MCP discovery, explanation, execution and comparison capabilities.
9. Integration instructions for adding a flow to an existing backend in each language.
10. Optional policy presets that expand into the same inspectable policy model.

### Separate extensions

Persistent jobs, streaming results, general write workflows, cross-request caching, adaptive strategy selection and broader adapter coverage remain distinct scope decisions. The model should accommodate them without implying that the first release implements them.

A new VM instruction set, native compilation of arbitrary application code, automatic repository-wide rewrites, hosted deployment, and recurring optimization PRs are not requirements of this first product. They can be evaluated later if they produce additional user value.

## 7. Functional requirements

All entries in this section are proposed requirements for review. “Must” describes the intended acceptance condition if the first release scope is adopted.

### 7.1 SDKs and application logic

| ID     | Requirement                                                                                                                                              | Acceptance evidence                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SDK-01 | Both SDKs must express typed operations, dependency joins, bounded mappings and pure result transformations.                                             | Equivalent example flows produce equivalent public results in TypeScript and Python.                                                 |
| SDK-02 | Each SDK must integrate with its host language's asynchronous calling model and existing HTTP framework.                                                 | A flow is invoked from one ordinary endpoint in each language. No application-wide migration is required.                            |
| SDK-03 | Pure host-language callbacks and external I/O must have explicit boundaries. Opaque callbacks must not be assumed serializable, portable or reorderable. | Unsupported uses produce actionable diagnostics. Supported callbacks run in the documented host environment.                         |
| SDK-04 | Flow definitions and operation calls must retain source locations or stable mappings for diagnostics.                                                    | An agent can trace a runtime decision back to the authored operation.                                                                |
| SDK-05 | Public value types and errors must have a documented cross-language representation where they cross the runtime boundary.                                | Shared fixtures cover null/absence, supported numeric ranges, timestamps, ordering and failures. Unsupported values fail explicitly. |

### 7.2 Adapters

| ID     | Requirement                                                                                                                                                  | Acceptance evidence                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ADP-01 | An adapter must declare operation identity, input/output schema, side-effect class and supported capabilities.                                               | Discovery and execution use the same versioned declaration.                                                                                     |
| ADP-02 | Batching must be opt-in through a supported bulk implementation. It must document batch limits, ordering and item-error mapping.                             | Out-of-order, duplicate and partially failed responses preserve the declared application semantics.                                             |
| ADP-03 | Reuse must use declared keys and scopes, including authorization and consistency where relevant. Read-only classification alone must not imply cacheability. | Matching eligible reads coalesce. Different tenants, credentials, relevant versions or freshness requirements do not share results incorrectly. |
| ADP-04 | Limits must identify their resource, units, window, burst behavior and scope.                                                                                | A provider-account quota remains shared across the workers in the supported topology. Per-process limits are labeled as such.                   |
| ADP-05 | Retry, cancellation and idempotency capabilities must correspond to real adapter behavior.                                                                   | A timeout distinguishes queued cancellation, attempted in-flight cancellation and unknown external completion. Only permitted failures retry.   |
| ADP-06 | Teams must be able to add an adapter without changing the runtime's core scheduling code.                                                                    | A custom integration uses the public extension interface and conformance fixtures.                                                              |

### 7.3 Policies

| ID     | Requirement                                                                                                   | Acceptance evidence                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POL-01 | Policies must distinguish optimization objectives from constraints and explicit product permissions.          | Changing a latency/throughput preference does not relax freshness, authorization, ordering or retry permissions.                                           |
| POL-02 | Policies must inherit from resources and application configuration, with local restriction where appropriate. | Explain reports the effective value and its origin. A local setting cannot silently broaden a higher-level restriction.                                    |
| POL-03 | Conflicting or unsupported requirements must receive structured diagnostics.                                  | A requested capability missing from the executor or adapter fails before relevant dispatch where knowable. Runtime-discovered limitations remain explicit. |
| POL-04 | Presets must expand into ordinary policy settings with stable version identity.                               | Preset-based and explicitly configured equivalent policies have equivalent execution meaning.                                                              |
| POL-05 | Goals and time budgets must have precise measurement semantics.                                               | A caller timeout includes queue wait under the proposed model. A latency preference is not represented as a guaranteed response time.                      |

Policy composition should be restrictive for hard limits. For example, an application resource allowance and a narrower flow allowance both apply. Product permissions such as freshness require explicit scope and compatibility rules; a generic “last setting wins” merge is insufficient.

### 7.4 Runtime and plans

| ID     | Requirement                                                                                                            | Acceptance evidence                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUN-01 | The runtime must schedule independent supported work concurrently while respecting dependencies and declared ordering. | Independent reads overlap; dependent calls wait; observable result order follows the flow contract.                                                           |
| RUN-02 | It must combine eligible reuse and batching, rather than requiring application authors to orchestrate each separately. | The product-card example reduces supported external calls while preserving duplicate output positions.                                                        |
| RUN-03 | It must bound active work and runtime-owned queue state and define admission or backpressure behavior.                 | Increasing input size does not create unbounded pending tasks. Refusal or waiting is observable.                                                              |
| RUN-04 | Shared limits must remain coherent across the supported deployment topology.                                           | Multiple workers use the same resource accounting. Coordinator interruption has a documented behavior rather than silently creating independent quotas.       |
| RUN-05 | Timeout and cancellation must stop admitting new work and attempt supported cancellation of active operations.         | Run status and records distinguish completed, failed, cancelled and externally uncertain outcomes. A caller timeout does not imply external rollback.         |
| RUN-06 | Execution must not require an LLM call unless the application explicitly includes one.                                 | Example flows run with model access absent.                                                                                                                   |
| RUN-07 | Plans must identify the effective policy, adapter/executor versions and strategy used.                                 | A record can explain why a batch formed, why work waited, or why an optimization was unavailable.                                                             |
| RUN-08 | Supported fallbacks must preserve the operation and policy meaning.                                                    | Missing bulk support can use individual calls under the same limits. Unsupported semantics produce a diagnostic instead of a silent behavior change.          |
| RUN-09 | The first runtime must expose fixed, reproducible strategy settings for comparison.                                    | A chosen strategy and workload can be rerun without unexplained policy changes. Adaptive strategies remain explicitly selected and identified if later added. |

An application resource allowance must state what Clearings can enforce. Bounds on runtime-owned queues, in-flight work and pool permits do not automatically bound all host-process memory or external resource consumption. Whole-process memory is a measured quantity unless an executor supplies enforcement.

### 7.5 CLI, MCP and explanations

| ID      | Requirement                                                                                                                      | Acceptance evidence                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TOOL-01 | CLI and MCP must expose the same operation schemas, policy resolution and result model.                                          | Both surfaces return equivalent structured answers for the same request.                                                         |
| TOOL-02 | Discovery must describe installed adapters, available operations, examples and executor capabilities.                            | A fresh agent can find the needed operation without an earlier conversation.                                                     |
| TOOL-03 | Explain must expose dependencies, effective policy, source locations and strategy decisions without triggering external effects. | Inspecting a flow performs no business operation. Data-dependent details are identified as unresolved or input-specific.         |
| TOOL-04 | Run must require an explicit execution target and use that target's configured access.                                           | Local examples run with local fixtures. A missing target does not default to production.                                         |
| TOOL-05 | Compare must bind measurements to workload, strategy and environment, and account for runtime overhead.                          | Reports distinguish measured values, estimates and missing evidence. Comparisons use a matched workload.                         |
| TOOL-06 | Errors must offer concrete next actions.                                                                                         | A quota bottleneck explains why more concurrency will not help; unavailable batching identifies the relevant adapter capability. |

### 7.6 Records and operational usability

| ID     | Requirement                                                                                                                               | Acceptance evidence                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OBS-01 | Records must separate queue/admission time, adapter time and runtime work where instrumentation supports that distinction.                | A user can identify whether quota waiting, a dependency or local scheduling limits a run.              |
| OBS-02 | Counts must distinguish logical calls, distinct operations and external requests.                                                         | Batching and reuse gains remain understandable without conflating them with elapsed-time improvements. |
| OBS-03 | Recording must offer useful metadata without requiring raw customer payloads or credentials. Payload capture must be explicit and scoped. | Default reports contain identifiers, timing and status sufficient for basic diagnosis.                 |
| OBS-04 | SDKs must provide ordinary debugging and testing entrypoints with fake adapters.                                                          | Application logic can be exercised locally without provider credentials.                               |

## 8. Proposed interaction

### Engineer or agent

1. Add the SDK to an existing backend.
2. Connect installed adapters or define a custom one. Configure shared resources once.
3. Express a flow using supported operations and dependencies.
4. Invoke it with inherited policies and any necessary local settings.
5. Inspect the plan and run a supplied workload.
6. Change the application logic while reusing its execution machinery.

Illustrative TypeScript:

```typescript
const cards = await productCards.run(productIds, {
  objective: "latency",
  timeout: "800ms",
});
```

Illustrative Python:

```python
cards = await product_cards.run(
    product_ids,
    objective="latency",
    timeout="800ms",
)
```

An illustrative flow definition makes the application logic visible:

```typescript
const productCards = flow((q, ids) =>
  q.map(ids, id =>
    q.join({
      product: q.call(catalog.product, id),
      stock: q.call(inventory.stock, id),
    }).map(({ product, stock }) => ({
      name: product.name,
      available: stock.quantity > 0,
    }))
  )
);
```

Here `q.call` describes a schedulable operation before dispatch, `q.join` records a dependency join, and the final mapping describes a pure result transformation. Python needs equivalent semantics with idiomatic syntax. This example is a candidate authoring surface, not a final API decision.

The first authoring API should make supported work visible before dispatch. Exact syntax remains open. These examples do not imply that arbitrary asynchronous code can be optimized without adopting that boundary.

### Product owner working through an agent

The user requests a product listing and specifies acceptable inventory age. The agent discovers the inventory adapter, writes the flow and records the freshness permission in application configuration. Clearings returns an execution explanation and measurements. The agent presents the working feature and asks about unresolved product behavior, rather than exposing scheduler internals.

The same run information supports a detailed engineer view. A separate Clearings chat product is not a first-release requirement.

### Invocation lifecycle

`run` represents a caller awaiting a result. A future `submit` would return a persistent job handle, and `stream` would expose incremental consumption. These have different observable lifecycles and must remain explicit. A policy preference must not silently migrate a request to durable execution or new infrastructure.

## 9. Acceptance scenarios

These scenarios define required behavior if the proposed scope is adopted. They are specifications for later work; no experiments have been run for this PRD.

| Scenario                             | Required observation                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Repeated product IDs                 | Eligible reads reuse results; output order and duplicate positions remain intact.                 |
| Two bulk-capable independent sources | Each source batches compatible reads, and their calls can overlap.                                |
| Input exceeds a batch limit          | The runtime splits batches within adapter limits without creating unbounded pending work.         |
| Different authorization scopes       | Calls do not share results across incompatible scopes.                                            |
| Partial bulk response                | Missing or failed items follow the declared result/error semantics.                               |
| Shared quota with multiple workers   | The combined dispatch follows the documented account-level quota and burst model.                 |
| Deadline during admission wait       | The queued work stops before dispatch and the record identifies the timeout.                      |
| Timeout after external dispatch      | The record distinguishes requested cancellation from confirmed cancellation or completion.        |
| Conflicting policy                   | Clearings identifies the setting and origin that make execution unsupported.                      |
| No supported optimization            | Correct execution remains available where compatible; overhead is measured rather than hidden.    |
| A second feature adds a data source  | The application change reuses the scheduling machinery and requires no new bespoke batching loop. |
| Fresh agent takes over               | Discovery, code and saved policies provide enough information to modify and explain the flow.     |

## 10. Product success and measurement

Performance and adoption are hypotheses until measured. Acceptance must include the actual application path, not only isolated scheduler or IR execution.

| Dimension       | Measure                                                          | Baseline and interpretation                                                                             |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Remote work     | External requests per equivalent application result              | Compare straightforward code and an established helper-based implementation.                            |
| User waiting    | Median and tail request latency at stated load                   | Fix dataset, warm/cold state, provider behavior and concurrency conditions.                             |
| Capacity        | Throughput, pool occupancy and quota waiting                     | Improvements must respect the same resource allowances.                                                 |
| Runtime cost    | CPU, memory, queue growth and added latency                      | Include adapter, scheduling and recording overhead; include cases with little optimization opportunity. |
| Adoption        | Setup steps, time to first useful flow and adapter effort        | Separate built-in-adapter and custom-adapter cases.                                                     |
| Maintenance     | Changes needed for a second feature or policy adjustment         | Track custom execution machinery retained in the application, not line count alone.                     |
| Agent usability | Successful integration and modification using discoverable tools | Preserve task and environment context; token use is secondary to completed work.                        |

Before implementation benchmarks, agree representative workloads and numeric gates for meaningful improvement, acceptable overhead and adoption effort. This draft deliberately leaves those figures open. The explanatory six-to-two call example is not a performance target.

A release should show a complete useful flow in each language, interacting mechanisms under load, and a second application change that avoids rebuilding execution machinery. Passing internal conformance alone does not establish product value.

## 11. Repository foundation

The earlier analyzer, specification engine, closed Program IR, Rust compiler, context assembly and evaluation corpus have been retired from the active tree. Their original code and evidence are preserved at the [historical revision](history.md).

The active repository contains these requirements and documentation tooling. The SDKs, service adapters, managed runtime and CLI/MCP are not implemented. Recover earlier mechanisms only when a concrete requirement needs them; the existing compiler does not determine the new execution model.

## 12. Constraints and design risks

| Constraint                                     | Product implication                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Opaque host I/O hides dependencies and effects | The SDK must provide a small, useful managed-operation boundary.                     |
| Bulk APIs differ in semantics                  | Adapters need explicit mappings and conformance expectations.                        |
| Provider quotas can span processes             | Enforcement scope and coordinator behavior are part of the runtime contract.         |
| Cross-language values and callbacks differ     | Shared schemas need explicit limits; arbitrary closures cannot be assumed portable.  |
| Workloads and remote latency change            | Strategy benefits need representative measurements and visible limits.               |
| Adapter setup can exceed saved effort          | Custom-adapter ergonomics and the second application change are acceptance concerns. |
| Policies can become configuration sprawl       | Inherited resource policies and useful defaults must keep normal flow code short.    |

These constraints describe where the system needs information and ownership. They are not arguments based on engineering headcount or implementation time.

## 13. Decisions for the next review

| ID   | Decision                   | Current recommendation                                                          | Why it matters                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D-01 | First application boundary | Read aggregation plus bounded pure transformations                              | Defines a useful, coherent first execution model.                                    |
| D-02 | Initial integrations       | PostgreSQL reads and typed HTTP operations                                      | Makes the first flow realistic and exercises heterogeneous sources.                  |
| D-03 | Runtime topology           | Embedded host integration with an explicit shared-limit coordinator             | Balances incremental adoption with honest account-level quota enforcement.           |
| D-04 | Language boundary          | Common operation/policy/record model with idiomatic SDKs                        | Prevents divergent products without assuming callback portability.                   |
| D-05 | Flow authoring             | Small typed composition API, evaluated against ordinary application readability | Determines whether simple application logic actually remains simple.                 |
| D-06 | First invocation lifecycle | `run`; evaluate persistent jobs and streaming separately                        | Avoids hiding lifecycle changes inside performance settings.                         |
| D-07 | Reuse and caching          | Scoped reuse first; additional caching only with explicit semantics             | Keeps the initial behavior model tractable.                                          |
| D-08 | Optimization strategy      | Deterministic baseline strategies with measured comparison first                | Supports useful execution without claiming an adaptive optimizer already exists.     |
| D-09 | Acceptance gates           | Agree workloads and numeric thresholds before implementation evaluation         | Gives “efficient” and “easy to adopt” reviewable meanings.                           |
| D-10 | Repository cleanup         | Completed in the active tree; historical revision preserved                     | See [project history](history.md) for removed interfaces and retrieval instructions. |

The PRD can become the runtime implementation baseline after the open decisions and acceptance gates are resolved. Technical design should then specify schemas, state transitions, process boundaries and repository changes. PR sequencing follows that design.

## 14. Technical precedents

These sources support specific mechanisms and comparisons. They do not establish Clearings' performance or differentiation.

- [Haxl](https://github.com/facebook/Haxl) demonstrates data-access abstractions with automatic batching, concurrent fetching and caching.
- [DataLoader](https://github.com/graphql/dataloader) demonstrates individual lookup APIs backed by batching and scoped memoization, including ordering and result-mapping requirements.
- [PostgreSQL planner/optimizer](https://www.postgresql.org/docs/current/planner-optimizer.html) illustrates selection among execution strategies for a declared computation.
- [Temporal retry policies](https://docs.temporal.io/encyclopedia/retry-policies) illustrate declarative execution behavior with a distinction between workflow and activity roles.
- [Codeflash tracing and replay](https://docs.codeflash.ai/optimizing-with-codeflash/trace-and-optimize) is an adjacent approach that generates and evaluates source optimizations. Clearings' proposed product maintains execution machinery underneath application logic.

## 15. Proposed introduction

Clearings lets engineers and coding agents write straightforward backend logic while its runtime handles batching, deduplication, concurrency and service limits. We are building TypeScript and Python SDKs around reusable adapters and execution policies, so applications can run efficiently as workloads grow without accumulating custom scheduling code.
