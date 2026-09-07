# Status and development roadmap

This status describes the implementation inspected at `bb4c90a` and the subsequent documentation-only reorganization. Dated experiment reports are evidence for their recorded baseline; their test counts are not automatically current validation results.

## Read the evidence at the correct scope

The strongest demonstrated development result is one fresh-agent feature integrated after frozen tests and source review. The system also checks supplied observations and assembles its own intended specification into agent context.

These results support specification-guided development. They do not establish a self-hosting compiler, an automatic specification-to-source pipeline, or a measured advantage over equivalent prose. Use the capability and experiment tables below to distinguish production behavior from recorded research evidence.

## Implemented capabilities

| Area | Current capability | Remaining boundary |
| --- | --- | --- |
| Source analysis | Immutable inventory, bounded TypeScript structure, exact evidence | Dynamic calls and unmodeled source remain unresolved |
| Semantic exchange | Externally authored v0.1/v0.2 proposals, validation, replay | No built-in model endpoint or automatic claim acceptance |
| Typed contracts | v0.3 types, predicates, state/effects, outcomes, decisions | Partial and opaque obligations remain explicit |
| Context | Deterministic required closure, byte accounting, revalidation | No token-efficiency result or unrestricted retrieval planner |
| Observation checks | Single-operation predicates and adjacent selected-state continuity | No source execution, transition legality, concurrency model, or universal proof |
| Human views | Markdown/HTML projections and historical audience reports | Independent semantic-content review remains open |
| Technical reference | Ordered Markdown semantics, architecture, interfaces, and examples | Fumadocs renders the same Markdown with ordered navigation and static search |

## Bootstrapping evidence

| Experiment | Established result | Limit |
| --- | --- | --- |
| [Context assembly](../../benchmarks/results/clearings-bootstrap/README.md) | Clearings assembles its own intended specification; recorded actual results and injected output faults are checked | Continuing-session author development, trusted adapters |
| [Fresh impact implementation](../../benchmarks/agent-runs/luna-impact-001/REPORT.md) | First candidate passed 19 withheld feature tests | Candidate remains outside production; eight rules opaque |
| [Fresh sequence implementation](../../benchmarks/agent-runs/luna-sequence-001/REPORT.md) | First candidate passed 17 evaluation groups, including the fixture self-check; integrated unchanged after source review | Five rules opaque; no further development cycle with the improved version |

The sequence experiment's baseline regression run passed 78 existing tests plus three agent-authored tests. The later combined implementation status reports 112 library tests. These are recorded results, not measurements produced by reorganizing this documentation.

The coding agents received prose and source as well as generated context. There is no matched prose-only comparison, repeated-trial performance result, independently authenticated reviewer, or formal source-refinement proof. Frozen tests were authored separately from the coding agent, but shared-filesystem isolation was by protocol.

The appropriate current description is **specification-guided self-development with one integrated feature**. A self-hosting compiler would require a substantially more complete specification-to-implementation pipeline and evidence that the resulting system can reconstruct its own implementation. Neither is established.

## Current documentation scope

Standardize the implemented semantics, identify abstraction boundaries, organize current reference material, preserve historical evidence, and verify executable examples and links. The documentation and site integration introduce no implementation IR, schema migration, compiler backend, or runtime semantics change.

The Fumadocs build now renders the numbered reference from ordinary Markdown. Generated pages preserve its reading order and link to the source revision. The documentation build checks source digests, links, and static search alongside the existing recorded demonstrations.

## Subsequent development candidates

| Priority | Candidate | Evidence needed before broader claims |
| --- | --- | --- |
| 1 | Close one concrete contract-to-execution mapping | Defined adapter, actual executions, independent checks of the abstraction mapping |
| 2 | Improve formal/prose obligation accounting | Each requirement mapped to a predicate, residual obligation, or explicit opaque record |
| 3 | Repeat a bounded self-development task | Frozen specification and evaluation; improved Clearings version used as an input |
| 4 | Run a matched prose-only comparison | Same task, equivalent available requirements/source, frozen scoring, recorded access |
| 5 | Evaluate a proposed implementation IR | Distinct consumer, operation semantics, refinement obligations, and checked transformation |

Known runtime work includes the legacy validation size regression described in [compatibility](../03-reference/04-compatibility.md). Broader repositories/languages, provider transport, general inference, solvers, concurrency verification, package publication, CI, and public hosting remain separate scope decisions. Historical task instructions do not override the current user request.
