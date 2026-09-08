# Clearings technical documentation

Clearings is developing a compiler and execution runtime for agentic coding. Typed operation contracts express requirements; Program IR expresses implementations; execution and independent evaluation connect programs to observed behavior. This directory is the canonical Markdown reference for the implemented semantics and abstraction boundaries. The [Rust backend plan](05-development/06-rust-backend-plan.md) defines the next proposed compilation step.

## Choose a reading path

| Path            | Start here                                                                                                                                                    | Use it to                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Learn Clearings | [Your first operation contract](00-learn/01-first-contract.md)                                                                                                | Follow one behavior question through a guard, postcondition, and observation check  |
| Guides          | [Check a Hono case](04-guides/01-check-a-case.md), [author a specification](04-guides/02-author-and-review.md), [run a program](04-guides/05-run-programs.md) | Complete a task with prerequisites, commands, expected results, and troubleshooting |
| Reference       | [Operation contracts](02-semantics/02-operations.md), [API and CLI](03-reference/03-api-and-cli.md)                                                           | Look up exact definitions, constraints, and interface behavior                      |
| Architecture    | [System architecture](01-architecture/01-system.md), [abstraction and refinement](01-architecture/03-abstraction-and-refinement.md)                           | Understand responsibilities, representation choices, and enforcement boundaries     |

To read in a local browser, follow [Run the documentation locally](05-development/02-documentation.md#run-the-documentation-locally). The operation-contract page includes a selectable comparison of passing, failing, and incomplete observations.

## Complete technical reference

The original reference order remains available for a systematic review. For a language or architecture change, read documents 1–8 before changing semantics.

| Order | Document                                                                                    | Question answered                                                                                           |
| ----- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1     | [System architecture](01-architecture/01-system.md)                                         | What does Clearings implement, and where are the trust boundaries?                                          |
| 2     | [Representation inventory](01-architecture/02-representations.md)                           | Which models exist, and which artifacts are derived views?                                                  |
| 3     | [Abstraction and refinement](01-architecture/03-abstraction-and-refinement.md)              | How does a contract relate to concrete program behavior?                                                    |
| 4     | [Values and expressions](02-semantics/01-values-and-expressions.md)                         | What do types, predicates, and unknown values mean?                                                         |
| 5     | [Operation contracts](02-semantics/02-operations.md)                                        | What do outcomes, state frames, effects, and dependencies require?                                          |
| 6     | [Observations and sequences](02-semantics/03-observations-and-sequences.md)                 | How are verdicts computed, and what do they establish?                                                      |
| 7     | [Identity and validation](03-reference/01-identity-and-validation.md)                       | What is validated, bound by a digest, or still unverified?                                                  |
| 8     | [Context and projections](03-reference/02-context-and-projections.md)                       | What does selection preserve, and how are budgets enforced?                                                 |
| 9     | [API and CLI](03-reference/03-api-and-cli.md)                                               | Which interfaces implement each operation?                                                                  |
| 10    | [Compatibility](03-reference/04-compatibility.md)                                           | How do versions and historical artifacts coexist?                                                           |
| 11    | [Check a Hono case](04-guides/01-check-a-case.md)                                           | How do I inspect and evaluate an existing model?                                                            |
| 12    | [Author and review a specification](04-guides/02-author-and-review.md)                      | How do I construct a contract and test its meaning?                                                         |
| 13    | [Status and development roadmap](05-development/01-status-and-roadmap.md)                   | Which capabilities and bootstrap milestones are established?                                                |
| 14    | [Documentation maintenance](05-development/02-documentation.md)                             | How do I change this reference and verify it?                                                               |
| 15    | [Executable conformance](02-semantics/04-executable-conformance.md)                         | How are concrete executions related to scoped requirements?                                                 |
| 16    | [Conformance artifacts](03-reference/05-conformance-artifacts.md)                           | Which identities, measurements, and obligations must an evaluation record retain?                           |
| 17    | [Conformance implementation plan](05-development/03-conformance-plan.md)                    | How do the four implementation PRs establish the first executable evaluation boundary?                      |
| 18    | [Record a context-assembly invocation](04-guides/03-record-context-assembly.md)             | How do I capture actual execution evidence and inspect its observation mapping?                             |
| 19    | [Evaluate and replay context conformance](04-guides/04-evaluate-context-conformance.md)     | How do I reproduce scoped acceptance, inspect failures, and replay saved evidence?                          |
| 20    | [Program IR semantics](02-semantics/05-program-ir.md)                                       | How do typed implementations express computation, control flow, calls, and failure?                         |
| 21    | [Program artifacts and validation](03-reference/06-program-artifacts.md)                    | How do I validate a program and interpret its static diagnostics?                                           |
| 22    | [Program IR implementation plan](05-development/04-program-ir-plan.md)                      | How will the language and interpreter execute one real Clearings algorithm?                                 |
| 23    | [Program execution](03-reference/07-program-execution.md)                                   | How do I execute a program and interpret completions, resource limits, and diagnostics?                     |
| 24    | [Required dependency closure in Program IR](02-semantics/06-required-dependency-closure.md) | How does Clearings execute and independently evaluate one of its own algorithms in IR?                      |
| 25    | [Program CLI and reports](03-reference/08-program-cli.md)                                   | How do I validate, inspect, and execute programs from the command line?                                     |
| 26    | [Run and inspect a Program IR algorithm](04-guides/05-run-programs.md)                      | How do I execute the closure example, supply arguments, and read its results?                               |
| 27    | [Repository maintenance](05-development/05-repository-maintenance.md)                       | How do I format, clean, and organize maintained files while preserving evidence?                            |
| 28    | [Rust backend plan](05-development/06-rust-backend-plan.md)                                 | How will deterministic compilation be implemented and checked against reference execution?                  |
| 29    | [Rust backend artifacts and runtime](03-reference/09-rust-backend.md)                       | How are compiled artifacts bound, and which value and execution primitives does the Rust runtime implement? |

## Status and authority

The [Rust backend artifacts and runtime](03-reference/09-rust-backend.md) define the implemented compiler preparation boundary, compiled-artifact validators, and primitive Rust runtime. Code generation and native runner integration remain subsequent changes.

This reference describes the implemented v0.3.0 contract language, its relationship to the v0.1/v0.2 models, and Program IR v0.1 with its static validator and reference interpreter. Program execution implements the defined language semantics under documented resource limits. Ordered required dependency closure is implemented in IR and evaluated against independent bounded graph-domain expectations. The program CLI exposes validation, complete function inspection, fresh execution, and JSON/Markdown reports. Refinement proof procedures remain subsequent work.

Sections on semantics and interfaces specify the current contract. Architecture explanations, examples, and roadmap proposals have different roles. If source, schema, tests, and reference disagree, record a defect and resolve the discrepancy explicitly. Passing schema validation does not override semantic requirements; a prose sentence does not become an executable predicate by appearing beside one.

The terms **must**, **must not**, and **may** express requirements or permitted behavior within the stated interface and scope. They do not imply that the checker establishes every requirement. Each relevant page identifies enforcement limits.

## Organization and publishing

Numbered directories and filenames define a stable reading order. Documents use ordinary Markdown, relative repository links, tables, and fenced examples. Fumadocs renders this reference at `/docs/technical`. The build derives page metadata from these files and groups navigation by reading path, converts links between current reference pages to site routes, and links other repository targets to the source revision. The authored reference remains ordinary Markdown and can be read independently of the site. Existing website guides and demonstration routes remain available.

[Historical plans and implementation reports](archive/README.md) are retained for provenance. Two root files remain for compatibility: [the original bootstrap design](SPECIFICATION_ARCHITECTURE.md), whose exact text is embedded in the context-assembly specification, and [the sequence guide entry](SEQUENCE_CHECKS.md), which preserves a link from that design. Use the numbered reference for current semantics.
