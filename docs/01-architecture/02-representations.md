# Representation inventory

An intermediate representation records information for a defined consumer or transformation. Clearings has multiple representations, but does not yet define a sequence of semantics-preserving compiler lowering passes between them.

## Locate the representation you need

| Question                                                       | Relevant representation                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Which source files and declarations were analyzed?             | Repository manifest and structural evidence model                 |
| Which behavior did an author infer from that source?           | Capability/claim model or function/behavior contracts             |
| Which outcomes and constraints does a typed operation declare? | Operation specification and predicate expressions                 |
| Which records should an agent receive for this task?           | Derived operation context                                         |
| Does a supplied case satisfy the modeled rules?                | Observation and check result                                      |
| Which algorithm does an implementation express?                | Program IR; static validation and reference execution implemented |

The operation specification is the primary contract representation for new semantic work. The inventory below records each family's producer, consumer, and meaning. Schema versions identify serialization contracts; they do not rank abstraction levels.

## Existing models

| Representation                  | Type and schema                                                                      | Semantics                                                                                                  | Producer and consumers                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Repository manifest             | `InventoryResult`; [inventory.v0.1](../../schemas/inventory.v0.1.json)               | Files, scope, exclusions, immutable commit/tree identity                                                   | Inventory; consumed by scanning and validation                                           |
| Structural evidence model       | `ScanResult`; [scan.v0.1](../../schemas/scan.v0.1.json)                              | Declarations, imports, references, calls, dynamic writes, exact spans, resolution status                   | TypeScript scanner; consumed by authoring requests and evidence retrieval                |
| Capability and claim model      | `SemanticModel`; [semantic.v0.1](../../schemas/semantic.v0.1.json)                   | Concepts, English assertions, typed relationships, conditional capability flows, unknowns                  | External author plus importer; consumed by inspection and reports                        |
| Function and behavior contracts | `ContractModel`; [semantic.v0.2](../../schemas/semantic.v0.2.json)                   | Callable bindings, assertion references, state access, dependencies, failure boundaries, behavior outcomes | External author plus contract importer; consumed by reports and context export           |
| Typed operation specification   | `SemanticSpecification`; [specification.v0.3](../../schemas/specification.v0.3.json) | Typed guards, postconditions, state updates, frames, effects, dependencies, decisions                      | Specification author; consumed by validation, checking, context assembly, and rendering  |
| Predicate expressions           | `Expression`, inside v0.3                                                            | A typed expression AST with bounded evaluation and explicit unknown results                                | Specification author; consumed by the expression interpreter                             |
| Program IR                      | `Program`; [program.v0.1](../../schemas/program.v0.1.json)                           | Typed values, local bindings, structured control flow, IR-defined calls, and application failures          | Program author; consumed by static validation, inspection, and the reference interpreter |

The [structural types](../../src/model/structural.ts), [semantic types](../../src/model/semantic.ts), [contract types](../../src/model/contracts.ts), and [specification types](../../src/specification/model.ts) define the corresponding TypeScript interfaces.

The structural model is a partial source analysis. It is not a complete AST, CFG, SSA form, or executable implementation IR. The v0.3 specification is a declarative contract IR. Its expression AST evaluates predicates and values; it does not provide general program bodies. The separate [Program IR](../02-semantics/05-program-ir.md) supplies implementation bodies with defined execution semantics. Its validator checks well-formedness; its reference interpreter executes the declared entry function under finite resource limits. [Execution results](../03-reference/07-program-execution.md) are library output, with no implicit conversion to contract observations or conformance records.

## Orthogonal dimensions

| Dimension       | Values or examples                                          | Interpretation                                              |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Schema version  | `0.1.0`, `0.2.0`, `0.3.0`                                   | Serialization and interface version, not abstraction level  |
| Perspective     | `intended`, `observed`                                      | Requirements proposal versus source interpretation          |
| Granularity     | Capability, behavior, operation, callable, expression       | Scope of the represented entity                             |
| Evidence status | Integrity, source authentication, claim support, acceptance | Independent questions about the artifact and its assertions |
| Completeness    | Operation coverage, state frame, effect boundary            | Three separate declarations, each with different semantics  |

An observed specification can be abstract. An intended specification can be detailed. Neither perspective determines the abstraction level or establishes acceptance. Current v0.3 provenance permits only `review: proposed`.

## Derived and evaluation artifacts

`ProposalRequest` and `ContractRequest` are authoring protocols bound to evidence. `OperationContext` and legacy context packs are dependency-closed selections with provenance, omissions, and byte accounting. Presentation plans own audience prose and reading order. HTML and Markdown are projections.

`OperationObservation` records supplied inputs, state, an optional outcome, output, and effects. `OperationCheck` and `OperationSequenceCheck` record evaluation results. They are not an implementation IR or proof objects. No separate JSON Schema is exported for sequence results; their public TypeScript type is defined in [sequence.ts](../../src/specification/sequence.ts).

`ConformanceProfile` declares a bounded evaluation domain, measurement procedures, and an obligation ledger against an exact intended specification. `ExecutionRecord` identifies the claimed implementation and evaluation components, invocation arguments, completion class, and observed or unobserved measurements. Their separate v0.1 schemas describe evaluation metadata. Validators check structure and bindings. A dedicated context-assembly recorder captures actual executions; its adapter produces an `OperationObservation` or an explicit mapping failure. `ContextAssemblyEvaluation` binds the original record and current independent evaluator, retaining scoped acceptance separately from the broader contract verdict. `ContextConformanceReport` aggregates case coverage and supports replay of saved evidence. The evaluation and report have public TypeScript interfaces and content identities; they do not introduce a new compiler IR or revise the execution-record schema. See [conformance artifacts](../03-reference/05-conformance-artifacts.md).

## Current transformations

| Transformation                                    | Relationship                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Git source → structural model                     | Deterministic bounded extraction                                                   |
| Evidence request → semantic proposal              | External interpretation, potentially incomplete or incorrect                       |
| Proposal → imported model                         | Validation and provenance recording, without automatic acceptance                  |
| Specification → operation context                 | Deterministic selection and projection                                             |
| Model/context → report                            | Presentation, without new formal meaning                                           |
| Specification + observation → check               | Predicate evaluation                                                               |
| Program artifact → static validation              | Syntax, identity, scope, types, completion paths, and call/failure declarations    |
| Program + positional arguments → execution result | Reference interpretation under declared finite resource limits                     |
| Program or execution result → Markdown report     | Deterministic presentation without execution, evidence authentication, or a new IR |
| Contract + external agent → source implementation | Specification-guided synthesis, demonstrated only by bounded experiments           |

There is no automatic v0.2-to-v0.3 formalization and no implicit observed-to-intended conversion. See [compatibility](../03-reference/04-compatibility.md).

## Proposed compilation boundary

The [JavaScript backend plan](../05-development/06-javascript-backend-plan.md) introduces the first deterministic source-generation path: validated Program IR to JavaScript and a versioned runtime interface. The generated module is a target artifact; its manifest identifies the source program, compiler, runtime, and generated bytes. Neither artifact is implemented yet.

Operation contracts and Program IR express different concerns: required behavior and a chosen algorithm. Their relationship needs candidate construction, observation mapping, and independent evaluation. A generated JavaScript backend can preserve a Program IR algorithm's semantics without establishing that the algorithm satisfies an arbitrary operation contract. Adding the backend does not create a contract-to-program compiler.

CFG, SSA, bytecode, or another lower-level IR should be introduced for a concrete transformation or execution requirement. The next backend can compile the current structured Program IR directly; no additional public IR schema is required for this step.
