# Closure scalability evaluation baseline

This directory records a bounded, separately authored Program IR improvement experiment. The evaluator and baseline were frozen before the candidate author started, using the digests in `protocol.json`. `TASK.md` is the exact authoring task. `inputs.json` identifies supplied source/document inputs. The agent receives no conversation history or evaluation feedback. Workspace restrictions are procedural; the processes share a filesystem.

## Baseline observations

The baseline is the production IR at `aa52dd4e2b457036201efc7df1fe698c329550e5`. `baseline-evaluation.json` records 1,561 cases through the reference and native implementations. They agree on every execution. The baseline intentionally fails the new improvement gate: both 512-record chains exhaust work, and comparison with itself cannot satisfy the 25% work-reduction requirement. That rejection is the measured starting condition, not an existing compiler-conformance failure.

Three faulty-program controls independently exercise removed ordering, optional-edge expansion, and suppressed failure. `tests/closure-evaluation.test.mjs` also checks the frozen source inventory and distinguishes resource exhaustion from successful computation.

`baseline-profile.json` records five local timing samples per measurement on Linux x64 with Rust 1.85.1. Source generation, cold and warm preparation, argument admission, encoding, reference execution, and complete native invocation are measured separately. Cold preparation includes disposal; invocation timings include comparison overhead. This is a shared development host and concurrent activity was not controlled. These measurements do not isolate subprocess startup or establish a latency guarantee. Timing does not determine candidate acceptance.

## Reproduction

From a built checkout with the pinned Rust toolchain and linker:

```bash
node --test tests/closure-evaluation.test.mjs
node scripts/evaluate-closure-candidate.mjs --candidate benchmarks/agent-runs/closure-scale-001/baseline.program.json --out baseline-evaluation.json
node scripts/profile-context-runtime.mjs --program benchmarks/agent-runs/closure-scale-001/baseline.program.json --out baseline-profile.json
```

The baseline evaluation exits 1 because it does not meet the new improvement criteria. Native unavailability produces an inconclusive candidate evaluation, never acceptance. Use new output paths. Preserved reports and the protocol are not regenerated during normal tests.

The candidate and production integration are separate dependent changes. This baseline alone establishes neither an accepted agent improvement nor production adoption of a revised algorithm.
