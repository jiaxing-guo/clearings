> Historical document. See the [current documentation](../../README.md). Navigation links were rebased when this file was archived; dated results and implementation instructions describe their original context.

# Next implementation task: semantic contracts and inspection

This completed task is retained as implementation history. The active task is NEXT_IMPLEMENTATION_TASK.md. This was the implementation task under the [prototype roadmap](PROTOTYPE_PLAN.md). It replaces the completed structural task in [FIRST_IMPLEMENTATION_TASK.md](FIRST_IMPLEMENTATION_TASK.md). Planning label: M3.

## Outcome

An engineer or coding agent can inspect Hono request dispatch and middleware composition through source-linked function and behavior contracts. The CLI can select the records needed for a bounded task and export them as JSON.

The current PM and engineer reports remain available. This task supplies the canonical records they will use in the next demo integration step. Keep the existing reading design.

## Starting point

Reuse the current immutable scan, evidence reader, file exchange, semantic validator, and recorded replay. The existing semantic model has concepts, claims, relations, and flows. Function summaries currently live in `benchmarks/presentations/hono/*.json`.

Those summaries are candidates for source review. Do not move them into a canonical model and describe that move as automatic semantic extraction. Record which fields came from structural observations and which came from a new agent or human proposal.

## Required work

### 1. Define the contract extension

Start with one response-selection behavior and the functions/state it needs. Confirm that the following information fits before extending both capabilities.

| Record | Required information |
| --- | --- |
| Function contract | Stable semantic ID, callable role, structural symbol and implementation evidence, input/output descriptions, referenced state/effects, failures, dependencies, assumptions/unknowns, supporting assertion IDs |
| Behavior contract | Stable semantic ID, owning capability, trigger/input conditions, participating function and state IDs, existing flow-step links, conditional outcomes, failure boundaries, supporting assertion IDs and unknowns |
| Context pack | Semantic artifact and snapshot IDs, requested selection, selected canonical records, required constraints and critical unknowns, evidence references, retrieval instructions, omissions, and byte-budget accounting |

Use existing claim/evidence/provenance records to support contract assertions. Avoid independent copies of the same behavior in function records, behavior records, flow steps, and presentation prose. Structured links plus plain-language conditions are sufficient for this task. No executable predicate language or general theorem prover is required.

Retain functions, methods, getters/setters, and relevant nested callables. An accessor's role and source span must distinguish it from another accessor that shares its structural property symbol. A dynamic or user-supplied callback may have a described role while its runtime implementation remains unknown.

Do not interpret a declared type as a runtime guarantee. Do not infer purity or absence of failures from missing observations. Global state, configuration, and external effects may need records even when they are not functions.

### 2. Version, import, and validate

Choose a new version for the extended semantic contract. Keep the existing v0.1 reader and recorded replay working. Preserve old artifacts as historical inputs; do not edit their version or artifact binding in place.

Extend the proposal request/schema and import path so an external coding agent can produce the new records. Allocate semantic IDs once for a proposal and preserve them on explicit revisions when identity is unchanged. General cross-snapshot identity matching remains deferred.

Validate schema, IDs, endpoint kinds, snapshot/source binding, function implementation anchors, flow membership, and relevant unknown references. Import must not accept author-supplied verification or acceptance as proof. Evidence integrity and English support remain separate checks.

Re-author the Hono contract proposal against a verified source request. Retain input/output, producer details, and available usage measurements. Preserve relevant existing claim IDs only when the assertion and identity are retained; do not silently transplant unsupported claims into a new model.

### 3. Add a small inspection API and CLI

Inspection must support:

- Listing available capabilities and contract IDs.
- Showing one capability, behavior, or function.
- Returning its direct dependencies, supporting assertions, state links, and relevant unknowns.
- Following evidence references through the existing evidence reader.

The API returns portable objects; the CLI owns formatting and file output. Inspection validates model integrity. Source revalidation is explicit and must be reported when performed. Do not imply that a JSON-only inspection re-read the repository.

These are proposed command shapes, not implemented commands:

```bash
clearings inspect semantic.json --format json
clearings inspect semantic.json --capability request-dispatch --format json
clearings inspect semantic.json --id <behavior-or-function-id> --format json
clearings context semantic.json --capability request-dispatch --behavior <behavior-id> --max-bytes 16000 --out context.json
```

Proposed library entry points are `inspectSemantic` and `createContextPack`. Final option names can follow the existing package conventions. Keep one query implementation shared by the CLI, demo, and future consumers.

### 4. Export bounded context

Start with explicit capability/behavior selection and deterministic relation traversal. Use byte budgets rather than an undocumented token estimate. Measure the actual UTF-8 serialization size.

Include all required outcome conditions, relevant state/failure rules, and applicable critical unknowns for the selection. Preserve references to external or unresolved dependencies. Add optional neighboring records only while the budget permits.

Return explicit omitted-record IDs and retrieval paths where possible. Reject a budget that cannot contain the minimum required contract. Do not return an apparently complete pack after silently removing a branch or failure boundary. Additional source lookup is allowed; the agent demo will record it.

### 5. Produce the contract review bundle

Generate the new semantic JSON, an inspection transcript, and a small context pack for each selected capability. Keep the producer run and a deterministic replay path. Show one complete link path from capability to behavior, function/state, assertion, and exact source.

Do not create a second hand-maintained data source for the internal demo. Existing presentation plans must remain tied to their original model until they are explicitly regenerated or adapted for the new model. Report integration belongs to the next roadmap step.

## Verification

Use meaningful checks for the distinctions at risk:

- A small original fixture with behavior shared across functions and mutable state.
- Getter/setter identity and an unresolved callback boundary.
- Stale evidence, invalid contract endpoints, dangling assertions, and forbidden self-certification.
- Required branch/unknown preservation under context budgets; explicit failure when the minimum does not fit.
- Deterministic record selection and replay.
- Continued v0.1 replay and source/output protection.

Review the Hono contracts against source for direct versus Promise results, HEAD behavior, finalization, response replacement, repeated next calls, and local versus parent failure handling. Keep source-reviewed answers outside analyzer inputs. Tests of record structure do not prove these English assertions.

Run the relevant existing tests, a pinned replay, and the new contract/query checks. Avoid expanding to all Hono capabilities to compensate for a missing contract field. Solve the bounded example first.

## Handoff

Provide:

1. The chosen schema and versioning approach, with one concise example.
2. Actual CLI/library calls and generated contract/inspection/context artifacts.
3. Source, assertion, and unknown links for both capabilities.
4. Checks run, failures corrected, resource/context sizes, and remaining limits.
5. The precise remaining work to connect the records to all three required demos.

Keep changes local for review. Do not start the optional refactor, add a provider SDK, build a hosted UI, publish a package, or broaden repository access as part of this task.
