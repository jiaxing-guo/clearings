# System architecture

Clearings is a TypeScript library and CLI for source-backed repository comprehension and specification-guided development. Its semantic artifacts are portable JSON. Compiler objects, provider SDK types, and executable source are excluded from the interchange language.

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

| Component | Responsibility | Implementation |
| --- | --- | --- |
| Repository access | Immutable Git objects, inventory, content hashing, protected output paths | [repository modules](../../src/repository) |
| Structural analysis | TypeScript syntax/symbol observations and unresolved boundaries | [analysis modules](../../src/analysis) |
| Semantic exchange | Source-bound authoring requests, proposal import, recorded replay | [semantic exchange](../../src/semantics/exchange.ts) |
| Legacy contracts | Function/behavior contracts, inspection, context selection | [contract modules](../../src/contracts) |
| Typed kernel | Specification validation, expression evaluation, observation checks | [specification modules](../../src/specification) |
| Presentation | Audience plans and deterministic projections | [renderers](../../src/renderers), [presentation plans](../../src/presentation) |
| CLI | File input/output, option validation, command routing, exit status | [CLI entry](../../src/cli/main.ts) |

## Trust and evidence boundaries

| Boundary | Established by current checks | Not established |
| --- | --- | --- |
| Source bytes → structural facts | Snapshot binding, exact spans, bounded syntax/symbol observations | Complete runtime call targets or whole-program behavior |
| Evidence → semantic interpretation | Known citations, consistent references and provenance | That English assertions follow from the cited source |
| Authored specification → validated specification | Schema, identity, references, expression typing, declared boundaries | Requirement acceptance or global satisfiability |
| Concrete execution → observation | Whatever the external observation adapter actually measures | Automatic adapter fidelity, storage identity, or complete effect capture |
| Observation → verdict | Evaluation of modeled predicates over supplied values | Source conformance for all executions |
| Specification → agent implementation | Recorded development evidence when an experiment is performed | A built-in compiler or general code-generation guarantee |

Scans do not execute target scripts, install target dependencies, or mutate the target repository. Semantic strings and source excerpts remain data. The closed predicate interpreter does not execute JavaScript from records.

## Architectural constraints

The v0.3 operation contract is the primary representation for new semantic work. Historical source models remain readable and independently bound. Graphs, human reports, and agent packages are views over records; they do not own an alternative definition of operation behavior.

The system supports cycles in declared dependency graphs. It does not require a DAG, infer unconditional execution order from dependency edges, or model general concurrent execution.

See [representation inventory](02-representations.md) for exact model identities and [abstraction and refinement](03-abstraction-and-refinement.md) for the proposed contract-to-execution connection.
