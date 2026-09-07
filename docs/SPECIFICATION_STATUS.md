# Typed core implementation review

Initial implementation verified on 5 September 2026. Fresh-agent evidence was added on 6 September 2026. The current architecture and reproduction commands are in [TYPED_SPECIFICATIONS.md](TYPED_SPECIFICATIONS.md).

## Latest verification: 7 September 2026

Review findings received fixes across both PR branches, including the later documentation and scenario-validation findings. The sequence checker is integrated from a fresh Luna submission without changes. That submission passed 17 frozen test groups and 81 regression/own tests before integration. The final combined code passes typecheck and all 109 library tests. See [the experiment report](../benchmarks/agent-runs/luna-sequence-001/REPORT.md).

The context specification now rejects unrelated operations through bounded reachability. Enum equality rejects out-of-domain literals and disjoint domains. Operation guarantees run without a supplied outcome, and selected inspection supports the full 2 MiB limit. Report destinations retain their canonical IDs.

The rebuilt bootstrap has nine actual Clearings cases, nine authored Hono cases, and eight rejected output faults. The shared report checks 11 exact source excerpts and 1,938 fragment links. Main reading text and semantic JSON are unchanged; canonical destination links were corrected. Both archives pass exact-content checks. Fumadocs builds and checks 27 pages, 2,398 links, and three search queries, with no external HTML asset references. Package inspection finds 159 files and excludes site and experiment assets. Browser interaction was not rerun.

Local references now require quantifier scope. Reports retain complete cross-component references without the agent transport limit. Collection predicates validate enum literals on both sides, and context scenario reports require the original specification and recompute results. Documentation checks reject external asset authorities, require Python 3.9+ as `python3`, and use that command in generated reproduction instructions. The complete 109-test library run passes; the final documentation build and archive checks also pass.

The earlier verification below describes the initial implementation. The frozen experiments preserve their original inputs and results. A further coding cycle using the improved version has not started.

## Implemented

- A portable v0.3 schema with separate intended and observed perspectives.
- Operation records with local meaning: types, guards, postconditions, state updates, frame rules, effects, transitions, dependency roles, implementation responsibilities, and decisions.
- A closed expression interpreter and typed scenario checker with pass, fail, and unknown results.
- Required-context assembly with finite cycle handling, exact byte accounting, retained evidence/provenance, explicit omissions, and package revalidation against the original specification.
- CLI inspection, context export, checking, validation, and HTML/Markdown explanation.
- Shared graph selection and byte accounting for historical queries, plus an explicitly unformalized readable adapter.
- A Clearings context-assembly specification and self-use experiment, plus a separate Hono response-decision interpretation.
- A new internal view with cases, state definitions, rules, individual function roles, and exact source. The accepted audience articles retain their historical model binding.

## Review artifacts

Open [the bootstrap review](../benchmarks/results/clearings-bootstrap/index.html). The adjacent `clearings.context.json` and `hono.context.json` are the actual agent packages. HTML is a human projection of those records.

The [shared Hono package](../benchmarks/results/hono-shared/index.html) opens the typed slice at `internal.html` and retains the historical inspection at `internal-legacy.html`. It also includes the accepted engineer and overview guides.

The bootstrap package includes exact working-source spans and hashes in `implementation-bindings.json`. These are explicit author mappings. The author development record describes how the requirements guided the current implementation and identifies the experiment's limits.

## Verification actually run

| Check | Result |
| --- | --- |
| Library build and typecheck | Pass |
| Full test suite after final code edits | 73/73 pass |
| Actual Clearings bootstrap cases | 9/9 pass |
| Authored Hono model scenarios | 9/9 pass |
| Injected incorrect output observations | 7/7 rejected |
| Context reproduction, file hashes, exact working-source bindings | Pass |
| Hono contract replay | Deterministic; 11 excerpts verified; target bytes unchanged |
| Accepted reports and original source model | All eight reports and model remain byte-identical |
| Shared bundle static checks | Seven HTML pages; 1,836 fragment links; hashes and source/scenario bindings valid |
| Bootstrap static checks | Three HTML pages; 78 fragment links; hashes and bindings valid |
| Fumadocs export and check | 27 HTML pages; 2,292 links; three local search queries; zero external HTML asset references |
| Package inspection | 156 files; typed runtime/schema included; demos and site excluded |

The static documentation check used `/clearings-semantic`. The first export omitted the new guide; a clean rebuild produced it and the final check passed. Browser interaction and the root-path export were not rerun in this pass.

The pre-PR check on 6 September 2026 passed library typecheck and all 73 tests in one full run. Both committed report bundles passed their source, scenario, and link checks. Fumadocs rebuilt successfully; its typecheck and static check passed for 27 pages, 2,292 links, and three search queries. The eight accepted reports and their model matched the previous branch commit byte for byte. Package inspection retained 156 files and excluded the website and experiment assets. All 16 frozen experiment files and 56 archived package files retained their recorded hashes. Browser interaction was not rerun.

## Limits and next review

The intended specification was authored in the active development session. The implementation is handwritten TypeScript guided by that specification. The runner makes no model call. This is a continuing-session author bootstrap, not a fresh-agent trial or a self-hosted code compiler.

Scenario checks operate on supplied observations. The conformance adapter is trusted test code. It independently measures serialization and input digests; a separate reference checks minimal dependency membership. Full-record comparisons check projection fidelity. Effects are not monitored through general I/O instrumentation. Injected faults alter observations, not separately compiled implementations.

Hono scenarios model a bounded abstract input domain. They do not execute Hono or prove source equivalence. Source hashes do not authenticate the author, approve requirements, or establish claim support. Independent content review remains pending.

## Fresh-agent coding experiment

The [Luna experiment](../benchmarks/agent-runs/luna-impact-001/REPORT.md) used a frozen intended specification, generated context, API mapping, and source snapshot. The requested model was `gpt-5.6-luna`, with no inherited conversation. The orchestrator authored and froze the tests before coding and withheld them from the coding agent. This separation does not constitute independent human review.

The first candidate passed all 19 feature tests and the separate oracle self-check, including 160 generated graph queries and a 350-operation chain. Build and typecheck passed. Of the existing tests, 71 passed initially; two passed after restoring an unchanged helper omitted from the evaluation snapshot. The initial failed setup result and correction are both retained. The candidate received no test feedback or repairs before scoring.

Eight of the 16 rule records remain opaque. The supplementary typed check returns unknown. The agent also used ordinary prose and library source; there is no prose-only control or coding-benefit claim. Its own `npm test` ran zero tests, and two manual graph fixtures failed during setup. Native token counts and a verified backend model revision are unavailable. Workspace separation was by protocol, not OS enforcement.

The full input, patch, trace, tests, and results are archived under `benchmarks/agent-runs/luna-impact-001`. The generated `analyzeImpact` feature remains outside the production source and public API. Capture-time statements about local work describe the experiment at submission; publishing its records does not integrate the candidate.

Review the operation boundaries, exact conditions, and the distinction between checked predicates and prose requirements before extending self-use. A later task should test state changes and failures, with a matched prose-only comparison.
