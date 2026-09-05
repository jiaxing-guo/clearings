# M1 structural extraction handoff

M1 implements immutable source access, compiler-backed structural facts, inspectable evidence, and a source-only CLI. Semantic interpretation and human/LLM rendering remain M2 work.

## What changed

`scan` builds on the existing inventory and reads source/configuration from pinned Git blobs. The TypeScript 5.9.3 adapter uses a virtual compiler host with no host filesystem fallback, no standard/ambient libraries, no target dependency installation, and no emit. The compiler package is now a runtime dependency. Inventory remains a separate command and format.

Config discovery follows ancestor tsconfig files, references, and extends; an empty root files array is a project container. TypeScript's pinned internal matchFiles helper supplies the compiler's own glob semantics inside the adapter. No compiler AST objects or enum values escape into structural records. Multiple matching projects are ordered by config directory depth, then matched source count, then path; an overlap warning is emitted. Use `--project` to select a specific project/reference graph. Selected files with no usable project get an explicit default source-only program, retaining config errors in diagnostics.

Selected source bodies produce declarations, explicit import/export links, references, calls, and property-write observations. Imported source outside scope supplies declarations and syntax status as `support`; it does not silently receive full body extraction. Explicit exclusions, symlinks, submodules, and node_modules are never used as dependency source. Configuration reads are recorded separately.

`schemas/scan.v0.1.json` defines strict versioned SourceUnit, Project, Evidence, Declaration, Fact, and Coverage records. The nested manifest preserves M0's schema/snapshot identity. Structural IDs include source/project identity and the relevant record content; they are snapshot identities, not rename-stable semantic concept IDs. `artifact_id` covers the adapter configuration, budgets, all records, diagnostics, and coverage with canonical ordering.

`validate <artifact>` checks schema, IDs, cross-record references, bounds, ordering, and coverage. Adding `--repository` re-reads the declared commit, validates Git/blob/content hashes, and checks every evidence byte span, hash, line, and UTF-16 column. `readEvidence(result, repository, id)` exposes verified source text to library clients. A resolving citation does not prove semantic entailment.

## Verification

A clean npm install from the lockfile, typecheck, build, and all **22 tests** passed. Tests cover M0 behavior and the new project/alias/re-export graph, explicit type-only imports, namespace imports, anonymous/default/star exports, JavaScript, missing dependencies/configs, parse errors, callback/indexed/overloaded/reassigned calls, failed support reads, UTF-8/BOM/CRLF evidence, forged citations, dirty/staged/untracked trees, copied/bare repositories, strict exits, and output protection. Package inspection confirms TypeScript is a runtime dependency and the compiled modules and both JSON schemas are included; evaluator files are excluded.

The pinned Hono deep scan used `--project tsconfig.build.json` so production config membership was explicit rather than mixed with the test project. Commit `eebdf7be39abf0a872671835ccce0c4f03ea497a` and tree `7fd627b257e5b744bf23d4957a93a0d0413c8c19` matched the target manifest. The source-only warning about unavailable node ambient types remains visible.

| Result | Observed value |
| --- | ---: |
| Tracked inventory entries | 486 |
| Selected source files parsed / failed | 25 / 0 |
| Supporting source files / failures | 10 / 0 |
| Declarations | 2398 |
| Evidence records | 14205 |
| Structural facts | 14289 |
| Resolved import-binding records / unresolved | 153 / 0 |
| Resolved declaration references / unresolved | 10304 / 764 |
| Bounded direct call targets / unresolved calls | 117 / 353 |
| Source-reviewed call examples passed | 12 / 12 |

Three fresh processes produced byte-identical artifacts. All target object-store files remained byte-identical before and after the measured runs, including refs and configuration. Every retained source citation passed immutable-source validation. No Hono scripts, tests, or dependency installation ran.

The 12-case evaluator checks six direct targets and six callback/dynamic cases against pinned-source review. It is an agent-authored, selected sample, with independent human review pending. It does not estimate overall call precision or recall. The eight M0 capability-question rubrics remain separate evaluator assets; no semantic question-quality score is claimed.

Median structural scan duration was **2.17 seconds**. Per-run source validation took 3.42–3.65 seconds. Node peak RSS was 456.6–475.9 MiB, including validation and serialization but excluding Git child memory. The host exposed eight available CPUs and a 20-GiB process memory limit; filesystem caches were warm. These results do not establish the plan's 4-vCPU/8-GiB performance gate.

The raw pretty-printed artifact is 22,809,315 bytes. It is a detailed structural interchange file, not a compact semantic overview or an LLM prompt. Context selection and presentation must reduce it in M2.

## Reproduce and inspect

```bash
npm ci --ignore-scripts
npm test
npm run benchmark:fetch
node dist/cli/main.js scan benchmark-checkouts/hono.git --target benchmarks/targets/hono.json --scope deep --project tsconfig.build.json --out benchmarks/results/local/hono-scan.json
node dist/cli/main.js validate benchmarks/results/local/hono-scan.json --repository benchmark-checkouts/hono.git
node scripts/evaluate-m1.mjs benchmarks/results/local/hono-scan.json benchmark-checkouts/hono.git
node scripts/measure-m1.mjs benchmark-checkouts/hono.git benchmarks/results/local/hono-m1-run
```

Fetch and output destinations must be new. Reuse an already verified bare checkout by skipping fetch. The [recorded summary](../benchmarks/results/hono-m1/summary.json) contains exact run timings and artifact hashes; the [source-review result](../benchmarks/results/hono-m1/reference-review.json) records each example. Raw benchmark runs are ignored and regenerated locally. The [computed fixture scan](../benchmarks/results/fixtures/m1-direct.scan.json) contains sample manifest, projects, facts, evidence, and coverage in one validated envelope. The README gives fixture setup and library usage.

## Limits and follow-up issues

- Source-only resolution is bounded. Standard libraries and external type packages are absent, and a complete typecheck is not performed. No claim is made that a target builds successfully.
- Call resolution is conservative for public methods, callbacks, factories, indexed access, overload/merged declarations, and assignments. Known reassignments are tracked syntactically; this is not whole-program alias or mutation analysis. Declaration references are separate from implementation links.
- Import usage reports explicit type-only versus value/side-effect syntax. It does not predict emit elision or prove runtime execution order. CommonJS require/import-equals links may remain unresolved; CommonJS assignment-based exports are not modeled.
- Project-reference graphs inform source ownership and config options; the adapter does not build referenced projects or consume generated declaration outputs. Unsupported or excluded configurations produce diagnostics and source-only fallback where needed.
- Source byte/file and project budgets are explicit. Git subprocess limits still apply. There is no hard end-to-end compiler wall-time/memory sandbox, no working-tree mode, and no Windows support yet.
- Each scan recomputes the scoped program. In-run source reads are cached; persistent syntax caches and incremental invalidation are deferred. readEvidence currently verifies the whole artifact/source set per call; repeated interactive retrieval needs a validated session cache.
- Facts describe supported syntax and bounded references. There is no control-flow graph, complete call graph, runtime trace, capability grouping, or semantic model. Parser errors and unknowns remain visible.

## Smallest M2 slice after structural review

1. Build a bounded evidence request for request dispatch and middleware composition, exposing lookup by evidence/declaration IDs and explicit scope expansion.
2. Exchange proposal files with the user's existing coding agent; preserve input/output and label replay separately from fresh inference.
3. Validate proposed concept/claim references against M1 evidence, then review claim support independently of citation integrity.
4. Add separate human Markdown/diagram rendering and an LLM context exporter over the same accepted records, using explicit context budgets.

Review the M1 structure and its unresolved cases before starting this semantic slice. No M2 interfaces or model integration have been implemented here.
