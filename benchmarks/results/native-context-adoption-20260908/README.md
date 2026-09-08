# Compiled closure production adoption

This record captures ordinary `assembleContext` executing the bundled Program IR closure through a prepared Rust executable on Linux x64. It is a fresh integration observation, separate from the preserved bootstrap demonstration.

The [record](record.json) retains the invocation, complete result, source-file inventory, and native program/artifact/runtime/runner/build identities. The [independent evaluation](evaluation.json) accepts this invocation within the context profile. The [manifest](manifest.json) binds both files by SHA-256. Source-file digests identify the executed working version, including the adoption-gate changes made on top of the recorded PR 3 commit; the baseline commit alone does not describe those changes.

The independently specified breadth-first case returns `["root", "a", "z", "y", "b"]`. Native execution reports 5,774 work units, 912 cumulative allocation units, 166 peak value units, and evaluation depth 12 under `context-native-v1`. These are logical counters; physical memory was not measured. Instrumentation and the local build cache are trusted, and do not independently authenticate execution.

The installed-package control disables both the reference interpreter and the TypeScript traversal, then exercises the ordinary context API and CLI. Cold compilation and cache reuse without Rust available both succeed. Removing the target sort from the IR alone produces `["root", "z", "a", "b", "y"]` and a different compiled-artifact identity; the independent expected result rejects that mutation. A modified cached executable fails explicitly. A 512-operation chain exercises resource exhaustion and CLI exit status 3 without a partial context.

## Reproduction

Install the pinned dependencies, Rust 1.85.1 via rustup, and a host linker. Then run:

```bash
npm run native:prepare
npm test
npm run test:conformance
npm run test:compiler
npm run check:rust
npm run test:rust
npm run docs:check:rust
npm run docs:build
npm run docs:check
npm run format:check
```

To generate another bounded execution report, use `npm run conformance`. To replay this saved record without compiling or executing a candidate:

```bash
npm run conformance -- replay benchmarks/results/native-context-adoption-20260908/record.json
```

The replay binds the current evaluator identity and the saved record; its new report identity can differ from the recorded evaluation when evaluator files change. Neither scoped acceptance nor the mutation control establishes universal refinement, compiler self-hosting, or an agent coding advantage.

## Local validation results

- Root regression suite: 271 tests passed.
- Recorder, evaluator, and conformance CLI regressions: 39 tests passed.
- Full context domain: 3,108 conforming executions (1,554 cases each for production and the independent control); all 26 predefined faults detected, including one nontermination case.
- Compiler gate: 38 tests passed, including 2,254 conformance cases and five faulty-program controls, installed-package execution, and preparation reuse/failure controls.
- Rust formatting and Clippy passed; all 18 runtime tests passed.
- Runnable reference validation passed 13 examples across 59 Markdown files with Rust examples enabled.
- Documentation build and static validation passed 63 HTML pages, including 36 technical-reference pages. Browser interaction was not tested.
- Bootstrap verification reproduced the saved contexts byte-for-byte and validated historical hashes, nine actual Clearings cases, nine authored Hono cases, and eight injected output faults.
- Saved-evidence replay was accepted with Rust unavailable and an unused cache location. Isolated cleanup retained source, dependencies, and an explicitly selected cache.

GitHub Actions runs observed during this work failed before any job steps ran. These local results do not claim successful hosted CI.
