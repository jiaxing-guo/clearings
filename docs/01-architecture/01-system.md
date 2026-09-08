# System architecture

Clearings is developing a compiler and execution runtime for agentic coding. The intended workflow lets an agent construct or revise a typed implementation against explicit operation contracts, then uses deterministic tooling to validate, compile, execute, and independently evaluate that implementation. Bootstrapping progressively brings Clearings algorithms into this workflow.

The current implementation is one TypeScript library and CLI. Its semantic artifacts are portable JSON; compiler API objects and provider SDK types remain outside the interchange model. Program IR represents algorithms as typed data, with a static validator and reference interpreter. The [Rust backend](../03-reference/10-rust-code-generation.md) compiles validated programs into native-executable target modules.

## Compiler architecture and current boundaries

| Responsibility          | Current implementation                                                                                      | Next boundary                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Requirements            | v0.3 operation contracts and bounded predicate evaluation                                                   | Link a candidate Program IR implementation to a contract through an explicit observation adapter and evaluation domain |
| Implementation language | Program IR v0.1, static typing, structured control flow, closed calls, failures, and Rust source generation | Extend compilation evidence over the full declared evaluation domain                                                   |
| Execution               | Reference and native library/CLI execution with finite limits and diagnostics                               | Evaluate changes to the compiled algorithm under explicit caller and execution contracts                               |
| Evaluation              | Independent context/closure evaluation and bounded differential compiler conformance                        | Evaluate an agent-authored change through the production caller                                                        |
| Agent development       | External authoring and recorded specification-guided source changes                                         | An evaluated agent change expressed in Program IR and used by Clearings                                                |

The requirements-to-implementation relation is a synthesis and conformance problem: a contract can admit multiple algorithms. It is not an existing deterministic lowering pass. Program IR-to-Rust compilation is a separate transformation with a defined semantic-preservation obligation. Test agreement supplies bounded evidence for that obligation; it is not a proof for every valid program.

The reference interpreter supplies the current execution semantics. A bytecode VM, optimization IR, and self-hosting compiler are not implemented. Add another implementation IR only when a concrete analysis, optimization, or target needs a distinct representation and a specified transformation.

The [backend artifact contract and primitive Rust runtime](../03-reference/09-rust-backend.md) are implemented in `src/compiler/` and `runtime/rust/`. The runtime operates on values and explicit calls from generated code; it does not interpret an AST or implement dependency closure. The emitter generates structured Rust functions, branches, and loops, evaluated through a native test harness. The packaged runner prepares validated IR, optionally reuses a verified native executable, transports each invocation as data in a fresh process, and checks native responses. Context assembly adopts this prepared execution path; the program CLI also supports one-shot execution.

## Codebase priorities

| Role                                 | Existing modules and artifacts                                                                                     | Development priority                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Language and execution core          | `src/specification/`, `src/program/`, `src/compiler/`, `runtime/rust/`, `schemas/`, `specifications/`, `programs/` | Explicit requirements, program semantics, validation, and the next compiler backend       |
| Evaluation infrastructure            | `src/conformance/`, independent tests, and frozen benchmark evidence                                               | Reproducible execution evidence and independently checked behavior                        |
| Source and context adapters          | `src/repository/`, `src/adapters/`, `src/analysis/`, `src/semantics/`, `src/contracts/`, and context assembly      | Connect repository evidence and selected requirements to the development workflow         |
| Developer interfaces and projections | `src/cli/`, `src/renderers/`, `src/presentation/`, `docs/`, `website/`                                             | Make artifacts, executions, and diagnostics usable without defining alternative semantics |

These are responsibility boundaries within the existing package, not a directory migration. Context assembly currently lives with specification processing; legacy report and source-analysis APIs remain supported. Production context assembly converts operation records to portable graph values and invokes the compiled Program IR closure. Whole-specification validation and context projection remain in TypeScript. The [adoption contract](../05-development/08-production-adoption.md) defines the explicit compatibility migration, native setup, and finite execution limits.

## Follow one specification through the system

For the Hono response-selection example, an author has already produced a typed specification. Clearings validates that artifact, selects the operation and its required dependencies, and can evaluate a supplied observation. A report presents the same records to a reader.

| Input                                           | Processing step                          | Output                                     |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Authored specification                          | Validate types, references, and identity | Validated artifact or an error             |
| Validated specification and operation selection | Assemble required context                | Bounded operation context                  |
| Specification and supplied observation          | Evaluate guards and rules                | Check result with verdicts and limitations |
| Specification or validated context              | Render a human projection                | Markdown or HTML                           |

The specification owns the operation semantics. Context selection preserves the selected records; rendering changes their presentation. Observation checking evaluates supplied data. These responsibilities remain separate even when one command combines several steps.

For a concrete walkthrough, read [Your first operation contract](../00-learn/01-first-contract.md).

## Processing paths

The implemented source-analysis path is:

1. Inventory an immutable Git commit.
2. Extract bounded TypeScript structural observations and exact source evidence.
3. Export a source-bound authoring request.
4. Receive an externally authored semantic proposal.
5. Validate and import the proposal, retaining provenance and unknowns.
6. Inspect the model, export context, or render a report.

The library does not invoke a model endpoint. A person or external agent supplies the interpretation. Recorded replay imports a recorded response; it does not perform fresh inference.

The typed-specification path starts with an authored `SemanticSpecification`. Validation checks the structure and expression types. Context assembly produces a selected dependency closure. Observation checking evaluates the declared rules against supplied data. Both paths preserve a distinction between source observations and semantic interpretation.

## Component responsibilities

| Component              | Responsibility                                                                                                                                        | Implementation                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Repository access      | Immutable Git objects, inventory, content hashing, protected output paths                                                                             | [repository modules](../../src/repository)                                     |
| Structural analysis    | TypeScript syntax/symbol observations and unresolved boundaries                                                                                       | [analysis modules](../../src/analysis)                                         |
| Semantic exchange      | Source-bound authoring requests, proposal import, recorded replay                                                                                     | [semantic exchange](../../src/semantics/exchange.ts)                           |
| Legacy contracts       | Function/behavior contracts, inspection, context selection                                                                                            | [contract modules](../../src/contracts)                                        |
| Typed kernel           | Specification validation, expression evaluation, observation checks                                                                                   | [specification modules](../../src/specification)                               |
| Program IR             | Implementation-language types, static validation, reference interpretation, finite resources, diagnostic completions, and Markdown inspection/results | [program modules](../../src/program)                                           |
| IR algorithms          | Ordered required dependency closure with independent bounded evaluation                                                                               | [authored programs](../../programs/clearings)                                  |
| Executable conformance | Bounded recording, observation mapping, independent reference evaluation, scoped acceptance, and replay reports                                       | [conformance modules](../../src/conformance)                                   |
| Presentation           | Audience plans and deterministic projections                                                                                                          | [renderers](../../src/renderers), [presentation plans](../../src/presentation) |
| CLI                    | File input/output, option validation, command routing, exit status                                                                                    | [CLI entry](../../src/cli/main.ts)                                             |

## Trust and evidence boundaries

| Boundary                                         | Established by current checks                                                                                         | Not established                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Source bytes → structural facts                  | Snapshot binding, exact spans, bounded syntax/symbol observations                                                     | Complete runtime call targets or whole-program behavior                                  |
| Evidence → semantic interpretation               | Known citations, consistent references and provenance                                                                 | That English assertions follow from the cited source                                     |
| Authored specification → validated specification | Schema, identity, references, expression typing, declared boundaries                                                  | Requirement acceptance or global satisfiability                                          |
| Concrete execution → observation                 | Captured context-assembly arguments/completions and checked measurement projections; external adapters for other APIs | General adapter fidelity, complete dependency authentication, or complete effect capture |
| Observation → verdict                            | Evaluation of modeled predicates over supplied values                                                                 | Source conformance for all executions                                                    |
| Specification → agent implementation             | Recorded development evidence when an experiment is performed                                                         | A built-in compiler or general code-generation guarantee                                 |

Scans do not execute target scripts, install target dependencies, or mutate the target repository. Semantic strings and source excerpts remain data. The closed predicate interpreter does not execute JavaScript from records.

## Architectural constraints

The v0.3 operation contract is the primary requirements representation. [Program IR](../02-semantics/05-program-ir.md) separately represents implementation algorithms; static validity does not establish contract agreement. Historical source models remain readable and independently bound. Graphs, human reports, and agent packages are views over records; they do not own an alternative definition of operation behavior.

The system supports cycles in declared dependency graphs. It does not require a DAG, infer unconditional execution order from dependency edges, or model general concurrent execution.

See [representation inventory](02-representations.md) for exact model identities and [abstraction and refinement](03-abstraction-and-refinement.md) for the proposed contract-to-execution connection.
