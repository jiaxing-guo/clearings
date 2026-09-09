# Compiled context selection plan

Milestone 6 prepares a second substantive Clearings algorithm for Program IR: selecting state fields and supporting source records after required dependency closure. The intended result is ordinary context assembly using two independently evaluated compiled programs. This document defines the work and review gates; selection remains implemented in TypeScript until the adoption change passes those gates.

The public baseline is main at `b6a9f15260f51964c8d9691e7f749c1cf76f8e3a`, after the [publication preparation](https://github.com/jiaxing-guo/clearings/pull/31). See [publication readiness](10-publication-readiness.md) for the exposure review and post-publication validation. The previous [IR improvement](09-agent-ir-improvement.md) establishes one accepted closure implementation and a reusable evaluation path. It does not establish selection correctness, language adequacy for this workload, or a performance gain from adding another native invocation.

## Scope and existing behavior

The semantic authority remains [context and projections](../03-reference/02-context-and-projections.md). The current [context assembler](../../src/specification/context.ts) validates the entire specification and byte budget, resolves the root, runs compiled required closure, selects state and source records, constructs the context, and accounts for its serialized size. This plan moves the selection decisions into IR while keeping specification validation and final object construction in TypeScript.

Let `C` be the operation IDs returned by required closure and `O` the corresponding operation records. Define selected state IDs `S` as follows:

- If any operation in `O` has a complete state frame, `S` contains every modeled state ID.
- Otherwise, `S` is the union of explicit `reads` and `writes` in `O`.

Selected source IDs `E` are the union of evidence IDs on selected states and on the following declared metadata of operations in `O`: the operation itself, guarantees, implementations, decisions, outcomes, and outcome ensures. No recursive search through expression or literal data contributes evidence. Return unique state and source IDs in the existing JavaScript string order, which compares UTF-16 code units.

| Case                                                                | Required selection                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A selected complete frame with an otherwise unrelated modeled state | Include that state and its declared evidence                                    |
| Partial frames with repeated reads and writes                       | Include exactly the explicitly accessed state IDs, once each                    |
| An unselected operation with a complete frame or evidence           | Its metadata alone contributes no selected state or source                      |
| A selected operation with nested outcome ensures                    | Include evidence declared on both the outcome and its ensures                   |
| Literal data containing a key named `evidence_ids`                  | Treat it as literal data; it contributes no evidence                            |
| An optional dependency also reached by a required path              | Use membership in `C`; optional-edge metadata does not override that membership |
| Shuffled catalogs, duplicate references, or non-ASCII IDs           | Preserve the selected sets and the specified output order                       |

Selecting an evidence record does not authenticate its source or establish claim support. The existing `checks`, provenance, full operation records, links, omissions, and retrieval text retain their meanings.

## Program and adapter boundary

The new program takes the closure's selected IDs and portable metadata for all operations, states, and sources. A candidate boundary uses operation records containing an ID, complete-frame flag, reads, writes, and lists of evidence groups; state records containing an ID and declared evidence IDs; and source IDs. The first PR must freeze the exact types, field order, entry signature, and validation domain before candidate authoring.

The TypeScript adapter may copy schema fields and enumerate the fixed metadata positions above into uniform records. It must not select operations or states, expand complete frames, compute unions, deduplicate IDs, sort selected IDs, or choose sources. Those decisions belong to the IR program. The final host projection may resolve the returned IDs to the original records and preserve the existing deep-copy and serialization behavior.

Test adapter correspondence directly against original specification fixtures and independently enumerated metadata expectations. Running both backends on the same incorrectly normalized input would not establish that correspondence. Do not use the production selector, its helpers, or its normalization output to compute the independent expected result.

Use existing Program IR and the Rust backend. Add a language or runtime facility only after a concrete selection case demonstrates a gap and a separate semantic review defines the facility. No state-selection primitive belongs in the Rust runtime. Additional targets, optimization IRs, persistent workers, asynchronous APIs, and contract-to-program synthesis are outside this plan.

## Four dependent pull requests

### 1. Define selection requirements and independent evaluation

Publish the precise input/output contract, typed boundary, observation mapping, obligation ledger, and independently authored expectations. Preserve whole-specification validation in the outer caller; separately specify whether malformed low-level selection arguments are rejected by admission or by the program, and with which completion and diagnostic.

Freeze a finite exhaustive incidence domain covering selected-operation membership, complete versus partial frames, state accesses, and source membership at each declared evidence position. Record exact generation bounds, case counts, identities, and reproduction commands. Add larger sparse and dense cases, complete-frame saturation, repeated references, catalog permutations, and Unicode ordering boundaries. Keep requirement coverage distinct from arbitrary combinations excluded by the finite domain.

Predefine negative controls for missing complete-frame expansion, unwanted states or sources from unselected operations, missed state or nested evidence, literal-key evidence injection, duplicate results, incorrect ordering, and input mutation. Check the evaluator with both independent positive expectations and these faults before authoring the candidate. Freeze candidate-independent rules for execution failures, missing instrumentation, resource exhaustion, and acceptance.

**Exit gate:** the contract and evaluator are reviewable without a candidate; all controls behave as specified; the authoring packet and evaluator have fixed content identities. Numerical domain bounds and resource policy remain decisions for this PR, not unspecified choices during adoption.

### 2. Author and evaluate the selection program

Author the algorithm in Program IR against the frozen packet. If this is recorded as an independent agent trial, use a fresh authoring context, disclose its permitted inputs and access, preserve the initial submission and all revisions, and keep evaluator material out of candidate inputs. Shared-filesystem procedural separation must not be described as a security boundary. This preparation session is not itself a fresh authoring trial.

Execute the same candidate through the reference interpreter and compiled Rust. Compare each result to independent expectations, as well as comparing the backends to each other. Retain IR, generated-source and build identities, arguments, completions, diagnostics, and logical usage. Report cold preparation and warm invocation separately; include the host adapter and transport costs in end-to-end measurements. Do not require a speedup or infer one from fewer logical work units.

**Exit gate:** every frozen required case passes, controls still reject their intended faults, accounting agrees within the defined compiler contract, and source review confirms the selection decisions occur in IR. Preserve a reproducible candidate report. Production continues using its existing selector at this point.

### 3. Record both native execution stages

The current [recorder](../../src/conformance/context-recorder.ts) stores a singular `native_execution` capture. A second native observation would overwrite that capture. Introduce an explicitly versioned recording representation before using both programs in ordinary context assembly.

Record an ordered sequence with stable closure and selection stage identities. Bind each stage to its program, compiled artifact, build/runtime identities, argument and result bindings, limits, usage, and completion. Preserve the completed closure evidence when selection fails or cannot be observed. Distinguish a stage that was not run from a stage whose execution evidence is unavailable. Preserve historical v0.1 and v0.2 record validation and replay; do not reinterpret their singular metadata as two-stage evidence.

Update worker transport, record validators, observation mapping, evaluator obligations, reports, CLI output, and replay together. Missing instrumentation must remain inconclusive for the affected obligation; a demonstrated behavioral violation must still reject even when other evidence is unavailable. Add controls for missing, duplicated, reordered, overwritten, and incorrectly bound stage records, plus selection failure after successful closure.

**Exit gate:** new records retain both stages without changing semantic context bytes; historical fixtures still replay with their original meanings; evidence faults are classified correctly. This PR can exercise the two-stage recorder through controlled fixtures before production adoption.

### 4. Adopt selection in ordinary context assembly

Integrate the accepted program through reusable native preparation with a separate program/cache identity. Prepare both programs before bounded recording; ordinary cold use may prepare them on demand. Each invocation must use fresh arguments and accounting. Preserve the synchronous API and provide no silent TypeScript or interpreter fallback.

Retain whole-specification validation and error precedence, root resolution, closure ordering, complete operation records, state/source ordering, ownership, omissions, and exact successful serialized bytes. Revalidation through `validateOperationContext` must exercise the same two-stage assembly path. Byte-budget accounting still occurs after complete projection and retains `CONTEXT_BUDGET`; no required record is dropped to fit a budget.

The existing `context-native-v1` policy covers one closure execution. Specify and version the two-stage resource policy before adoption. State whether limits are per stage or aggregate, how admission and process deadlines apply, and how partial execution evidence is retained. A new finite selection bound may reject a previously successful input; document that compatibility addition and return an explicit resource failure, not a partial context or a byte-budget error. Preserve operational error distinctions.

**Exit gate:** independent selection and complete context-conformance gates pass; installed-package execution works with interpreter fallback disabled; native preparation, failure, cache, and resource controls pass; historical evidence remains unchanged; documentation and all applicable hosted CI checks pass on the reviewed commit. Record a subsequent Clearings task using the resulting version, with the actual inputs, outputs, version, and limits. Do not count ordinary tests as an independent coding-agent trial.

## Completion and claims

Completion requires two substantive production algorithms expressed in Program IR, compiled by the existing Rust backend, independently evaluated over their declared domains, and observed separately in ordinary context assembly. Each dependent PR must pass its own review and validation gates before the next integration boundary is accepted.

Report language adequacy, bounded behavioral agreement, resource compatibility, and measured cost as separate findings. This work does not establish universal refinement, a self-hosting compiler, automatic synthesis, or an agent-efficiency advantage. A demonstrated language gap or an unacceptable second-process cost should produce an explicit follow-up decision rather than an unreviewed expansion of scope.
