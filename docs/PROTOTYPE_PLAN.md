# Clearings: repository comprehension prototype

Prepared 4 September 2026. This is the original implementation plan. M0-M1 are now implemented; see [M1_STATUS.md](M1_STATUS.md) for verified results and remaining limits.

## Decision and first outcome

Build a TypeScript library with a CLI that reads an existing local Git repository and produces a compact, evidence-backed semantic representation. The first outcome is repository comprehension: an engineer can identify capabilities, follow their implementation across files, understand important state and failure behavior, and inspect supporting source.

Start with **Hono**, then test a second TypeScript repository before adding Python support. Use a bounded LiteLLM routing slice as the subsequent multilingual stress test. Reserve SQLite for a later systems-language extractor.

The first demonstrable vertical slice is: analyze Hono's request dispatch and middleware composition, produce validated semantic records, and render a useful explanation with exact evidence. Full repository coverage, a browser application, and semantic change enforcement are not prerequisites for this slice.

Product name: Clearings. Proposed new private repository: **jiaxing-guo/clearings-semantic**. The existing clearings and clearings-cloud repositories remain independent. The starter package does not imply that the new remote repository has been created.

## 1. Repository selection

| Candidate | What makes it useful | Initial obstacle | Decision |
|---|---|---|---|
| Hono | TypeScript, public library interfaces, several router implementations, middleware composition, request/context state, runtime adapters, colocated tests | Higher-order callbacks, dynamic method assignment, type-level API machinery | First target; inspect all source structurally, explain a bounded core deeply |
| LiteLLM | Familiar infrastructure domain; routing, retries, fallbacks, provider transformations, proxy behavior | A much larger, heterogeneous codebase; the Python SDK/router and gateway concerns would expand extractor and scope requirements together | Second-stage stress test after Python extraction; start with a routing/retry/fallback slice |
| SQLite | Strong module boundaries, documented architecture, compiler/VM/storage interactions, demanding correctness requirements | C analysis, preprocessing, build variants, generated artifacts, difficult semantic properties | Later C/compiler-backed target; use canonical source rather than the amalgamation |

Hono's checked snapshot is version **4.13.7**, commit **eebdf7be39abf0a872671835ccce0c4f03ea497a**, tree **7fd627b257e5b744bf23d4957a93a0d0413c8c19**. The GitHub tree response was not truncated. It contained 486 tracked file entries; 311 files under src ending in .ts or .tsx; 123 of those matched the .test/.spec filename convention, leaving 188 non-test-named source files. These are file counts, not measured LOC or a guarantee that every remaining file is production code.

This is sufficiently complex to expose cross-file behavior without requiring multiple language frontends at once. Its well-known status also creates a memorization risk: success must require source-specific evidence and changed-code tests, not a plausible explanation learned from public documentation.

Sources: [Hono repository](https://github.com/honojs/hono), [pinned commit](https://github.com/honojs/hono/commit/eebdf7be39abf0a872671835ccce0c4f03ea497a), [LiteLLM product surfaces](https://docs.litellm.ai/docs/), [SQLite architecture](https://www.sqlite.org/arch.html).

## 2. What the prototype must produce

The generated output has three levels, all tied to the same repository snapshot.

1. **Repository overview:** major conceptual areas, public surfaces, dependencies, and what was or was not analyzed. The overview may cover the full src inventory while marking most areas as inventory-only.
2. **Capability representations:** purpose, entry points, participating components, state, effects, execution steps, branches, failure behavior, and unresolved questions.
3. **Implementation evidence:** source file, blob hash, source span, symbol reference when available, extraction method, and the snapshot in which the evidence was read.

Provide JSON as the stable machine interface and Markdown as the first human interface. Markdown can include compact Mermaid diagrams generated from validated relations. A separate human renderer and agent context packer consume shared records; neither owns another semantic model.

The prototype does not need to recover all software intent. It must clearly distinguish source observations, inferred interpretations, explicit declarations, and check results. Inferences remain labeled inferences even after a person accepts their wording.

### Six initial capability explanations

| Capability | Main implementation evidence | Important questions |
|---|---|---|
| Register and group routes | hono-base.ts; router.ts; utils/url.ts | How do method helpers, base paths, grouped applications, and shared route state interact? |
| Dispatch an incoming request | hono-base.ts; context.ts; router interface | How are method/path, matching, context, handler selection, and response production connected? |
| Compose middleware | compose.ts; hono-base.ts; context.ts | How does next advance? How do responses and errors flow back? What prevents repeated next calls? |
| Select and reuse a router | hono.ts; router/smart-router/router.ts; router implementations | When is a router selected? Which errors trigger trying another router? What changes after selection? |
| Handle exceptions and missing responses | hono-base.ts; compose.ts; http-exception.ts as bounded evidence expansion | Where do missing matches, thrown errors, and an unfinalized context take different paths? |
| Manage request and response context | request.ts; context.ts; selected utility dependencies | Which state belongs to a request? How are parameters, body access, response construction, and finalization represented? |

The 25-file initial deep source set is in benchmarks/targets/hono.json. When a capability needs another file, retrieve and record it as **evidence expansion**. The report must not quietly claim full analysis of the expanded file's entire subsystem. Tests and selected configuration files provide supporting context separately.

Some real properties worth preserving were already visible during source inspection: HonoBase installs method handlers dynamically; HEAD dispatch delegates to GET and constructs a response without a body; dispatch has a single-handler path; middleware composition tracks dispatch progression; SmartRouter binds its match implementation after choosing a candidate. These are starting research observations, not hard-coded answers for the analyzer.

Pinned source: [HonoBase](https://github.com/honojs/hono/blob/eebdf7be39abf0a872671835ccce0c4f03ea497a/src/hono-base.ts), [composition](https://github.com/honojs/hono/blob/eebdf7be39abf0a872671835ccce0c4f03ea497a/src/compose.ts), [router selection](https://github.com/honojs/hono/blob/eebdf7be39abf0a872671835ccce0c4f03ea497a/src/router/smart-router/router.ts), [default router construction](https://github.com/honojs/hono/blob/eebdf7be39abf0a872671835ccce0c4f03ea497a/src/hono.ts).

## 3. Scope boundaries

### Included in v0.1

- Local repositories, immutable commit snapshots, and an explicitly requested working-tree mode.
- TypeScript/JavaScript inventory, syntax parsing, module resolution, and bounded symbol/reference analysis.
- Evidence-backed conceptual grouping and capability explanations.
- Import/export of structured semantic proposals from an existing coding agent.
- Schema validation, evidence resolution, and detection of stale or missing references.
- Machine JSON, human Markdown, and small Mermaid diagrams.
- A deterministic replay path for development and CI.
- A small benchmark and one same-language holdout repository.

### Deferred until the comprehension loop works

- A browser viewer, MCP server, editor extension, hosted service, accounts, and collaboration backend.
- General code generation, autonomous remediation, and app implementation.
- Universal program verification or complete call graphs.
- Runtime instrumentation, whole-program dataflow, and a constraint DSL.
- Broad provider integrations, vector databases, graph databases, plugin marketplaces, or a large multi-package distribution.
- Python/C extractors and whole-LiteLLM/whole-SQLite analysis.
- Full incremental semantic diffs. A limited invalidation and mutation smoke test appears at the end of this plan; a production change engine is a later milestone.

This narrows the previous architecture proposal deliberately. SQLite storage is optional for the prototype; sorted JSON/JSONL artifacts behind a storage interface are adequate until measured query behavior justifies a database.

## 4. Data model: small and explicit

Use one semantic identity space and separate record collections. Graphs are derived from these records.

| Record | Required information | Responsibility |
|---|---|---|
| Snapshot | repository identity, commit/tree or working-tree digest, selected roots, file manifest, config hash, extractor/schema versions | Defines exactly what was analyzed |
| Evidence | snapshot ID, path, blob/content hash, byte or line span, optional symbol ID, method | Makes a statement inspectable |
| Fact | kind, subject/object or value, evidence IDs, resolution status | Stores a bounded source observation |
| Concept | immutable ID, kind, alias, title, purpose, evidence and mappings | Represents a component, capability, state/resource, or external system |
| Relation | typed endpoints, relation kind, evidence IDs, origin | Connects concepts without duplicating them |
| Claim | text or structured proposition, subject IDs, evidence IDs, origin, verification state, interpretation acceptance | Represents meaning and its evidential status |
| Capability flow | entry points, ordered or branching steps, effects, failures, unresolved edges | Gives humans a useful cross-file behavioral explanation |
| Coverage | analysis unit, attempted methods, parsed/resolved/interpreted status, exclusions and errors | Prevents a partial analysis from appearing complete |

Initial concept kinds: component, capability, state, external. Initial relations: contains, exposes, implements, depends_on, reads, writes, invokes, produces, constrained_by. Runtime ordering belongs in capability-flow steps; an import edge is never automatically converted into an execution-order edge.

Every claim records both **origin** (source observation, model inference, human declaration) and **verification** (supported within stated scope, contradicted, unknown). Interpretation acceptance is a separate status. Avoid uncalibrated confidence percentages.

Flow steps may be sequential, conditional, repeated, or unresolved. Do not force a library's behavior into a DAG: callbacks and retries can create cycles. A diagram may omit implementation detail, but must retain consequential branches and failures.

Semantic IDs must not be hashes of their current title or file path. Assign IDs when concepts first enter a run/model; preserve them during replay and accepted-model revisions. Aliases can change. If matching a prior concept is ambiguous, propose a replacement relationship rather than silently reusing an identity.

For the first bootstrap, fixed fact ordering plus a recorded proposal response yields reproducible outputs. Regenerating a model response is a new run and need not reproduce the same wording. Cross-run identity preservation is evaluated after initial comprehension is useful.

### Evidence checks are necessary but not sufficient

The validator can establish that a cited source span exists and matches its hash. It cannot infer merely from that fact that the citation entails an English claim. Content support must be evaluated separately by reviewed benchmark answers and sampled claim review. A test associated with a function is supporting evidence; it is not a universal proof of that function's behavior.

## 5. Analysis pipeline

### Stage A: snapshot and inventory

Accept a local path and optional Git revision. Read Git objects for commit mode without changing the user's branch. Working-tree mode records a digest of included files and reports dirty/untracked inclusion explicitly. Default to tracked source, configuration, and tests. Respect explicit exclusions, skip build outputs/vendor code, and never follow a symlink outside the selected root.

Do not execute target repository scripts or install its dependencies during scanning. Source is data. Read tsconfig files as configuration; resolve project references and path aliases as data. Optional dependency installation for richer resolution is a separate, explicit setup operation in a disposable benchmark checkout.

Hono's root tsconfig has an empty files list and project references. Following only root files would falsely produce an empty program. The extractor must understand the project graph or create a documented source-only analysis program for the selected roots.

### Stage B: deterministic extraction

Wrap the supported TypeScript compiler API in an adapter. Extract declarations, exports and re-exports, imports, resolved module links, and direct call/reference information where justified. Distinguish type-only and runtime dependencies. Record unresolved dynamic dispatch and missing external types; do not invent target symbols.

Use syntax parsing even when complete type resolution fails. Store parse diagnostics and a declared resolution level. For a scoped benchmark, absence of unrelated runtime dependency types need not prevent useful analysis of the core.

Cache per-file syntax facts by content hash and adapter version. Resolution caches also depend on compiler options, project references, dependency state, and resolver inputs. The prototype may recompute the entire selected program after a resolution-affecting change; correct invalidation is more important than premature incrementality.

### Stage C: bounded evidence retrieval

Build an evidence bundle from public exports, neighboring symbols, imports, test references, and selected source bodies. Use deterministic ranking and explicit budgets first; do not add embeddings initially.

The proposer can ask for another symbol or source span by ID. Log these retrievals. An edge discovered during retrieval does not prove that every neighboring concept was analyzed. Include a list of omitted or unresolved material.

### Stage D: semantic proposal

Provide an open, versioned proposal-request schema to the user's existing coding agent. Ask it to propose conceptual groups, names, capability flow, claims, failures, and unknowns using evidence IDs from the bundle. Allow repository docs as labeled supporting context in one evaluation track; keep a code-only track to test whether code is actually being examined.

Do not seed Hono component names or benchmark answers in production code. General instructions can ask for public capabilities and their participating state; a Hono-specific gold map belongs only in evaluator assets.

The transport has two initial implementations:

- **File exchange:** export a request, run it through the user's current agent, and import the resulting JSON. This supplies a concrete model-assisted path without a provider SDK or new paid service.
- **Recorded replay:** use saved proposal responses to exercise validation/rendering deterministically in CI. Replay is a test mode and must never be presented as a fresh inferred analysis.

A one-command model adapter is optional after the first useful output. Its public interface accepts an inference function supplied by the host application. No subprocess or model endpoint runs unless the user has configured it. Any adapter failure produces an explicit partial run.

### Stage E: validate and reconcile

Validate JSON Schema, known IDs, evidence resolution, evidence/snapshot consistency, relation endpoint types, and the declared bounds of the proposal. Reject dangling references and unsupported schema fields. A single bounded repair request may correct malformed output. After the repair limit, keep the failed proposal for inspection and report an incomplete run.

Model output is proposed data, not executable instructions. The engine only accepts defined record operations. It does not execute commands found in source comments or generated narratives.

### Stage F: render and query

Produce a concise repository overview, one Markdown capability page per accepted or unaccepted-labeled capability, and a JSON representation. Each capability page shows purpose, entry points, flow, state/effects, failures, evidence, and unknowns. Generated diagrams reference the same concept IDs as the text.

The context command selects a concept and related evidence for an agent. Mandatory declared constraints and unresolved critical claims must not be silently dropped to meet a budget. Report truncation with continuation references or reject an insufficient budget.

### Stage G: preserve and inspect

Keep manifests, facts, proposals, validated model, coverage, and run metrics in a chosen output directory outside the target repository by default. A separate accept operation can write chosen interpretations to a Clearings model directory. The analysis command must not write to the target's source or commit any changes.

## 6. Proposed CLI contract

These commands are a specification for implementation, not commands available in this starter package.

~~~bash
clearings scan ./hono --ref eebdf7be39abf0a872671835ccce0c4f03ea497a --out ./runs/hono
clearings propose ./runs/hono --scope request-dispatch --export ./request.json
# The configured external agent produces response.json from request.json.
clearings import ./runs/hono --proposal ./response.json
clearings overview ./runs/hono --format markdown
clearings explain ./runs/hono --capability request-dispatch --format markdown
clearings context ./runs/hono --capability request-dispatch --max-tokens 8000 --format json
clearings validate ./runs/hono
~~~

No arguments may implicitly opt into sending source to a model. File exchange makes that step explicit; a later configured adapter can streamline it.

CLI JSON uses a versioned envelope with schema_version, command, status, snapshot_id, data, diagnostics, and coverage. Status is complete, partial, or failed; complete means the requested analysis steps completed, not that every program property is known. stdout contains the requested output only; progress goes to stderr. Deterministic commands have stable ordering. Proposed exit codes: 0 successful command, 1 operational failure, 2 invalid input/schema, 3 requested strict completeness or validation gate not met. Unsupported semantic properties remain unknown and are not automatically command failures.

User-facing JSON and Markdown default to redacting absolute local roots in portable exports while retaining repo-relative paths. Evidence can be resolved locally from the manifest. No account, cloud service, or GitHub write permission is required to analyze a checkout.

## 7. Implementation structure and stack

Start with one npm package and clear internal modules. Extract publishable packages only when a second consumer creates a concrete need.

| Path | Responsibility |
|---|---|
| src/model/ | Records, identity, JSON Schema validation, migrations |
| src/repository/ | Git snapshots, manifests, safe file access, project discovery |
| src/extractors/typescript/ | Compiler-backed and syntax-only extraction |
| src/evidence/ | Source anchors, resolution, bounded retrieval |
| src/semantics/ | Proposal requests/import, reconciliation, capability grouping |
| src/query/ | Overview, explain, context selection |
| src/renderers/ | JSON, Markdown, Mermaid projections |
| src/storage/ | File-based artifacts behind a storage interface |
| src/cli/ | Thin command parsing and output/exit handling |
| schemas/ | Versioned interchange schemas; generate TS types or verify correspondence |
| tests/fixtures/ | Small original programs for extraction and interpretation edge cases |
| benchmarks/ | Pinned targets, evaluator-only questions, run scripts and results |

Use TypeScript strict mode, Node.js 24 LTS, native Git through argument-array subprocess calls, JSON Schema validation, and a small CLI parser. Vitest or Node's test runner is sufficient; choose one in M0. Pin dependency versions and commit the lockfile when actual scaffolding is created. Use the TypeScript compiler version supported by the extractor rather than automatically inheriting an arbitrary target dependency version.

The current TypeScript Compiler API documentation covers TypeScript 6.0 and earlier and warns of a different 7.1 API. Keep compiler API objects out of all public record types. This is an adapter compatibility concern, not a reason to abandon TypeScript.

Sources: [Node.js release/download status](https://nodejs.org/en/download), [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).

## 8. Milestones and acceptance gates

Planning estimate: **15 engineering days for one engineer**, with a useful vertical slice around day 6-8. Model-assisted implementation may shorten coding time; evaluation, schema correction, and source review still require attention. These are estimates, not measured delivery commitments.

| Milestone | Estimate | Deliverables | Exit gate |
|---|---:|---|---|
| M0: benchmark and foundations | 1 day | Actual TS/CLI scaffold; pinned target fetch; manifest reader; initial JSON envelopes; eight reviewed questions for two capabilities | One fixture and the pinned Hono checkout can be enumerated reproducibly; no target source is modified |
| M1: structural extraction | 3 days | Snapshot builder, project-reference discovery, imports/exports/symbols, evidence IDs, diagnostics, scan command | Positive/negative fixtures pass; all selected Hono units are accounted for as parsed or explicitly failed; direct references are measured against a small manual sample |
| M2: first semantic slice | 3 days | Proposal request/import, recorded replay, schema and evidence validation; dispatch and composition records | Both capability explanations include entry points, branches/failures, and inspectable evidence; reviewed support precision reaches the provisional gate below |
| M3: six capabilities and human output | 3 days | Overview, six capability explanations, JSON/Markdown/Mermaid renderers, context selection | At least 16/20 benchmark questions are answerable correctly; remaining gaps are visible; semantic model does not merely list files |
| M4: robustness and limited change tests | 2 days | Stale-evidence detection, replay stability, rename and behavior-mutation cases, resource metrics | Identical replay is stable; changed evidence is never silently reused; tested semantic mutations affect the relevant explanation or produce an explicit uncertainty |
| M5: generalization and handoff | 3 days | A pinned non-Hono TypeScript holdout, small comprehension study, README walkthrough, packaged CLI | General extraction works without Hono-specific logic; measured human benefit is plausible without accuracy loss; limitations and costs are reported |

### Concrete tasks within each milestone

**M0:** create the minimal package; select exact versions; implement Git revision normalization and input inventory; add two original fixtures (simple cross-file calls and callbacks/dynamic dispatch); pin Hono; review the first eight questions using source. The question file in this starter contains candidates and source hints, not an independently adjudicated gold answer set.

**M1:** implement schema validation, file/symbol IDs, tsconfig graph discovery, type/runtime import distinction, alias/re-export resolution, directly justified references, and coverage reports. Store unresolved relationships explicitly. Implement scan stdout/stderr and exit-code behavior. Do not implement a full call graph.

**M2:** define proposal requests and responses; export/import through files; implement evidence ID lookup and a source-span retrieval primitive; add exact replay; render two capability pages; manually review a sample of claims; fix a model or schema failure before adding more capability types.

**M3:** extend the same pipeline to the six target capabilities; add repository overview and focused flow diagrams; support explicit evidence expansion; implement budgeted context selection; review the full 20-question set. If more than two new ontology types appear necessary, document the missing question they enable before adding them.

**M4:** test source changes in disposable worktrees: helper extraction or rename; modification of the repeated-next guard; a change to the router fallback condition; documentation-only edits. Validate the mutation's actual effect with an appropriately scoped source review or test before using it as a semantic benchmark. Compare behavior fields separately from evidence/mapping changes. Re-scan the whole bounded program if necessary.

**M5:** choose and pin a different TypeScript library, such as Zod, after inspecting its then-current structure. Define five new capability questions before generating its semantic model. Exercise unchanged production extraction code. Recruit two or three engineers for an exploratory task study, or report explicitly if only a self-study was possible. Package reproducible runs and known failure examples.

## 9. Evaluation design

### Keep the evaluator separate

The analyzer sees source, selected docs, and ordinary task instructions. It must never read evaluator answers or a prewritten expected semantic map. Scope files may select paths and query areas, but cannot supply the desired grouping or answers. The benchmark harness runs outside the target's scanned roots.

Questions in benchmarks/questions/hono.json have candidate evidence paths and are marked unreviewed. M0/M3 add source-backed answer rubrics and independent review where possible. A model-generated rubric alone is not ground truth.

### Baselines

1. File tree, rg searches, public API/docs, and ordinary source browsing.
2. A coding assistant with the same repository access, model, tool budget, and documentation allowance but no persistent Clearings model.
3. Clearings output with expandable evidence; optionally the same coding assistant using that output.

Report the cold cost of building the semantic model separately from the cost of using it on repeated questions. A model trained on Hono can answer broad questions from memory; require exact pinned-code evidence and include validated local mutations or name-perturbed fixtures. Do not claim that these controls completely eliminate training-data familiarity.

### Provisional gates

These thresholds are targets for the prototype, not achieved results.

| Measure | Gate or reporting rule |
|---|---|
| Evidence integrity | 100% of retained citations resolve to the declared snapshot/hash/span |
| Claim support | At least 90% precision on at least 50 manually reviewed substantive claims; report sample and severity, not only a percentage |
| Question utility | At least 16 of 20 reviewed Hono questions answered correctly from the output and its linked evidence |
| Failure-path omissions | No unflagged omission among the benchmark's explicitly designated critical error/control-flow cases |
| Inventory completeness | Every selected file has an explicit parsed, excluded, or failed status; never hide parse failures in a smaller denominator |
| Unsupported resolution | Dynamic/ambiguous examples produce unresolved records rather than fabricated exact targets |
| Human comprehension | Exploratory target: at least 30% lower median task time with no reduction in scored accuracy versus the matched baseline |
| Model maintenance | Record correction time, rejected claims, and stale interpretations; no claim of near-zero maintenance without measurement |
| Determinism | Byte-stable normalized JSON for identical snapshot/config and recorded proposal replay; run timestamps/metrics excluded from the semantic digest |
| Cold scan | Initial budget: under 60 seconds and 2 GiB peak RSS for the bounded Hono scan on a declared 4-vCPU/8-GiB machine; record hardware and adjust only with an explanation |
| Model use | Default initial cap: 200k input tokens, 20k output tokens, 12 proposal/repair calls per full six-capability run; disclose partial results when exhausted |
| Cost reporting | Record actual token usage and model identity; report currency only when a known rate or provider receipt is available |

Question-utility scoring must distinguish a correct answer, a properly flagged unknown, and an incorrect assertion. Unknown is preferable to invented behavior but does not count as a correct substantive answer. Support precision must be paired with coverage so a tool cannot pass by making almost no claims.

With two or three participants, the human study is exploratory. Counterbalance task order or use equivalent mutation variants to reduce learning effects. Do not present a small internal result as established general superiority.

### Stop and revise conditions

- If the output is essentially a folder summary, redesign capability selection before adding UI.
- If citations resolve but do not support claims, tighten evidence packets and claim granularity before scaling targets.
- If major control-flow differences disappear in compression, enrich capability-flow representation.
- If reviewer correction time exceeds the browsing time saved across repeated tasks, investigate maintenance and selection costs.
- If a second TypeScript repository needs hard-coded concepts in the extractor, revise the extraction/proposal boundary.
- If source indexing is fast enough, do not introduce Rust or a graph database merely to appear scalable.

## 10. Artifacts expected from a completed run

| Artifact | Purpose |
|---|---|
| manifest.json | Reproducible repository/config/tool identity |
| facts.jsonl | Deterministically extracted facts |
| evidence.jsonl | Source anchors and extraction methods |
| proposal-request.json | Recorded model input and retrieval references |
| proposal-response.json | Recorded model output and model metadata |
| semantic.json | Validated concepts, claims, relations, and flows |
| coverage.json | Scope, unsupported constructs, exclusions, failures |
| overview.md | Human overview with explicit coverage |
| capabilities/*.md | Focused explanations with evidence |
| metrics.json | Timing, memory, token usage, cache behavior |
| evaluation.json | Separately generated question and claim scores |

No source checkout is bundled in the library's npm package. Fetch benchmark sources by pinned commit in a dedicated directory. If small upstream excerpts become checked-in fixtures, preserve their applicable notices. New Clearings fixtures should preferably be original and minimal.

## 11. Working agreements for the local implementation agent

- Deliver milestones in sequence. First implement M0-M1, then stop for the structural extraction review.
- Do not describe a replayed or hand-authored model as a newly inferred result.
- Do not import benchmark gold answers into extraction or prompting.
- Preserve the target checkout. Scanner code does not run target scripts or write target source.
- Keep model-provider SDKs and compiler internals outside core record/query interfaces.
- Every capability explanation must expose unknowns and inspectable evidence.
- New abstractions require a concrete use in the current milestone.
- Report what ran, what failed, and what is still proposed. Do not turn planned performance gates into measured claims.

## 12. Original repository bootstrap instructions

Implementation update: the private repository now exists and M0-M1 are implemented. See [M1_STATUS.md](M1_STATUS.md) for verified structural extraction results and the proposed M2 scope. The text below records the original planning-package bootstrap state; it is not the current implementation status.

This package contains planning documents, candidate benchmark questions, a pinned target manifest, and a private-repository creation helper. It does not contain an implemented analyzer or an existing remote repository.

The GitHub connection available while preparing this package was authenticated as jiaxing-guo and could inspect/edit repositories. It did not expose repository creation. Therefore no remote creation or privacy verification is claimed.

After extracting the starter archive on a machine with Git and GitHub CLI authenticated as jiaxing-guo, run:

~~~bash
bash clearings-semantic/scripts/create-private-repo.sh
~~~

The helper checks the account, refuses an existing repository or an already-initialized local checkout, initializes a new main branch, commits only the starter files, creates jiaxing-guo/clearings-semantic with private visibility, verifies visibility before pushing, and reads it back afterward. It never changes the old repositories or broadens access. If remote creation succeeds but pushing fails, it stops and leaves the local commit intact for recovery.

[GitHub CLI repository creation reference](https://cli.github.com/manual/gh_repo_create).
