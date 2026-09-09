# Production integration verification

Production loads the exact independently accepted `candidate.program.json`. The maintained authoring module received Prettier formatting only and reproduces the same JSON bytes and program identity. Compiler, reference-interpreter, primitive-runtime, accounting, and resource-limit sources retain their frozen digests.

The production regression now requires complete 512-operation contexts in both declaration orders. A 2,048-operation chain still verifies `CONTEXT_RESOURCE` and exit status 3, while a completed 512-operation closure with insufficient output capacity verifies `CONTEXT_BUDGET` and exit status 2. No partial context or input mutation is accepted. Installed-package checks retain native execution with interpreter/TypeScript traversal disabled, warm use without Rust, changed-IR detection, and invalid-cache rejection.

Implementation-specific function names and fault-injection locations changed with the accepted IR. Independent expected outputs, failure precedence, graph-domain coverage, and all five faulty-program controls remain in place. Production tests additionally bind the exact accepted submission.

The [subsequent task](followup/README.md) records this Clearings version assembling its own intended context contract for integration review. The independent evaluator accepts that invocation. The resulting byte-capacity obligation informed the added large-context regression. This is a recorded subsequent development task, not a second independent agent trial.

## Validation on Linux x64

- All 280 root tests passed on the integrated implementation.
- All 38 compiler-gate tests passed, including 2,254 compiler-conformance cases and five faulty-program controls.
- The complete context-conformance gate passed 3,108 conforming executions and detected all 26 predefined faults (25 application faults and one nontermination control).
- All six focused native-context regressions passed; all three frozen-evaluation regressions passed.
- Rust formatting, Clippy, and all 18 primitive-runtime tests passed on the unchanged runtime.
- All 13 runnable documentation examples passed. Documentation build/static checks passed 64 HTML pages and 37 technical-reference pages. Browser interaction was not tested.
- Historical bootstrap verification reproduced contexts byte-for-byte and retained original source hashes and fault-control results.
- The first root/conformance run lacked a historical Git object needed for example reproduction. The exact original commit, trees, and source blob were restored from GitHub; the affected test and the subsequent complete root run passed. No reproduction test was disabled or rewritten.

Hosted workflow runs currently fail before executing job steps. Local results do not establish hosted CI success, universal refinement, an unrestricted graph-size domain, or a general latency improvement.
