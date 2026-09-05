# First implementation task: M0-M1

Historical task: this structural work is complete. The instructions below record that earlier scope. The active implementation task is [NEXT_IMPLEMENTATION_TASK.md](NEXT_IMPLEMENTATION_TASK.md), under the [realigned roadmap](PROTOTYPE_PLAN.md). Current exchange behavior is documented in [SEMANTIC_EXCHANGE.md](SEMANTIC_EXCHANGE.md).

Implement only the structural foundation of Clearings, following PROTOTYPE_PLAN.md. Do not attempt the whole roadmap in one change.

## Outcome

A developer can run a TypeScript CLI against a local repository and obtain a reproducible source inventory, bounded structural facts, source evidence, and explicit diagnostics. Run it against small original fixtures and the pinned Hono benchmark. No semantic model or LLM integration is required in this first change.

## Required work

1. Create one private npm package with TypeScript strict mode, Node.js 24 LTS support, a CLI bin, a build script, one test runner, and a committed lockfile. Choose compatible exact dependency versions. Keep the new package private until a separate release decision.
2. Implement local repository and commit-snapshot input. Normalize revisions to SHAs. Do not checkout another branch in the target directory. Working-tree support can be a separate explicit flag if it materially delays commit-mode correctness.
3. Read the supplied Hono target manifest. Fetch the public repository into a dedicated benchmark checkout and verify its pinned revision. Never copy its implementation into this repository as production code.
4. Discover source units, tsconfig project references, path aliases, imports, exports/re-exports, declarations, and directly resolved references. Distinguish runtime dependencies from type-only dependencies. Treat ambiguous callbacks and dynamic method assignment as unresolved where necessary.
5. Define versioned Snapshot, Evidence, Fact, and Coverage schemas. Record content hashes and source spans. Keep compiler API values internal to the adapter.
6. Implement scan and validate commands with JSON output envelopes, stderr progress, documented exit codes, and output paths outside the target checkout by default.
7. Add original fixtures for direct cross-file calls, alias/re-export resolution, type-only imports, dynamic callbacks, empty root tsconfig plus project references, parse errors, and symlinks leaving the selected root.
8. Test replay determinism for extraction output, correct evidence resolution, honest diagnostics, and no target writes. A failed parse is included in coverage; it must not disappear from the denominator.
9. Run the scanner against the pinned Hono deep scope. Record actual duration, memory measurement method, resolution limitations, and resulting artifact paths. Do not claim the planned resource budget was met unless measured.
10. Review the first eight candidate Hono benchmark questions against source and write evaluator rubrics separately from analyzer inputs. Model assistance is acceptable, but mark whether any human review occurred.

## Required handoff

- A concise explanation of the pipeline and source/schema boundaries.
- Exact commands to install, build, test, scan the fixture, and scan Hono.
- Test results and actual scan results; distinguish unresolved constructs from implementation bugs.
- A sample manifest, facts, evidence, and coverage report.
- A list of remaining M1 issues and the proposed smallest M2 semantic slice.

## Scope exclusions

Do not add a browser UI, MCP server, hosted backend, runtime tracing, embeddings, a graph database, a provider integration collection, Python/C support, autonomous code changes, or general semantic diffs. Do not add synthetic passing outputs that pretend to be computed results. Do not move on to M2 merely because the scaffold builds.

If the compiler cannot resolve the target's entire project graph without installing dependencies, implement and document the bounded source-only mode first. Do not run target installation scripts implicitly.
