# A fresh agent adds sequence checks to Clearings

A fresh Luna agent implemented `checkOperationSequence` from frozen requirements, generated Clearings context, and baseline source. Its first completed submission passed all 17 withheld test groups without repairs. After source review, the implementation was integrated unchanged into the production source on PR #6.

This completes one small self-development cycle through integration. The PR remains subject to review and merge. A further coding cycle using the improved version has not started.

## What changed

The new API checks supplied operation observations and compares explicitly selected shared state between adjacent records. It retains pass, fail, and unknown results. A modeled failure can be a valid operation result. The checker does not run source code or prove that the supplied records occurred in this order.

The starting version is commit `4709ce2f9303b17d28621fe31ba52f0fc147b389`. It includes the reviewed guarantee and inspection fixes. Later report-link, enum-validation, and context-minimality fixes were developed outside the coding workspace and did not change the frozen baseline. The integrated code is tested again with those fixes.

## Frozen inputs and first submission

| Record | Purpose |
| --- | --- |
| [freeze.json](freeze.json) | Time and hashes fixed before coding |
| [frozen/API.md](frozen/API.md) | Exact public API, errors, limits, state rules, and ownership |
| [frozen/specification.json](frozen/specification.json) | Proposed intended behavior |
| [frozen/context.json](frozen/context.json) | Actual output of the current Clearings context assembler; 16,564 bytes |
| [frozen/source-baseline.tar.gz](frozen/source-baseline.tar.gz) | Exact source and allowed documentation; no historical tests or benchmark answers |
| [evaluation/sequence.test.mjs](evaluation/sequence.test.mjs) | Tests authored before the coding session and withheld from Luna |
| [submission/candidate.patch](submission/candidate.patch) | First completed implementation and its own tests |
| [submission/trace/activity.jsonl](submission/trace/activity.jsonl) | Recorded reads, commands, and edit notes |
| [results/integration-review.json](results/integration-review.json) | Source review and integration decision |

The agent received no prior conversation. It could read the prose API, the typed context, and baseline source. Requirements, tests, and source inputs remained unchanged during coding. The capture occurred before withheld evaluation. No evaluator feedback was sent to the agent.

## Results

| Check | First-submission result |
| --- | --- |
| Baseline without the feature | Fixture self-check passes; all 16 feature tests fail as expected |
| Luna's own tests | 3/3 pass |
| Build and typecheck | Pass |
| Frozen evaluation | 17/17 pass, including the fixture self-check |
| Full regression run | 81/81 pass: 78 existing tests and Luna's 3 tests |
| Source review | No defect found in the new implementation; integrate unchanged |
| Repairs after evaluator feedback | None |

After integration with the later review fixes, typecheck and all **103** library tests pass. The documentation build checks 27 HTML pages and 2,398 links. Both review archives pass content verification. See [the integration verification](results/integrated/verification.json).

The tests cover exact delegation to the existing checker, rejected writes, missing observations, failed continuity, state selection, JSON equality, inherited property names, deterministic order, frozen input, independent output objects, invalid input, all 256 allowed steps, and an exhaustive 27-case verdict table. Full logs are in [results/evaluated](results/evaluated).

The post-submission inspection has four cases: valid recorded writes with a rejected write, individually valid records with inconsistent shared state, missing resulting state, and a rejected write that changes storage. Their results are `pass`, `fail`, `unknown`, and `fail`. The first uses records from an original in-memory fixture. The other three edit those records to expose failures. See [inspection.json](results/inspection/inspection.json).

The typed intended-model checks return `unknown` for all four cases because five requirements remain opaque. The adapter projects candidate continuity verdicts to check aggregation; it does not independently establish those verdicts. The frozen tests check their truth separately. Input digests and case counts are measured outside the expression kernel.

## Reproduce the evaluation

From an authorized checkout with this experiment available:

```bash
git worktree add --detach ../clearings-sequence-eval 4709ce2f9303b17d28621fe31ba52f0fc147b389
git -C ../clearings-sequence-eval apply "$PWD/benchmarks/agent-runs/luna-sequence-001/submission/candidate.patch"
npm --prefix ../clearings-sequence-eval ci --ignore-scripts
node benchmarks/agent-runs/luna-sequence-001/evaluation/evaluate.mjs ../clearings-sequence-eval benchmarks/results/local/sequence-eval
```

To check the archived inputs and submission first, run `node benchmarks/agent-runs/luna-sequence-001/verify.mjs`.

Use new workspace and result directories. The runner builds the captured candidate, runs the frozen tests, and runs the baseline regression suite with Luna's own tests. It does not start another coding agent.

To repeat the recorded-case inspection:

```bash
node benchmarks/agent-runs/luna-sequence-001/results/inspect-sequence.mjs ../clearings-sequence-eval benchmarks/agent-runs/luna-sequence-001 benchmarks/results/local/sequence-inspection
```

`frozen/prepare.py` recreates the coding workspace from the archived inputs. It can link an existing dependency directory as its second argument. `MANIFEST.json` checks the completed experiment files; `freeze.json` separately identifies what was fixed before coding.

## What this establishes

This is a bounded example of an independent coding session producing a useful addition to Clearings, then passing separately authored tests and source review before integration. The earlier `luna-impact-001` candidate remains unchanged and outside production. The new sequence checker is part of the library API on the PR branch.

There is no matched prose-only trial, so this does not establish an advantage for semantic IR or a reduction in time or tokens. The coding agent saw substantial prose and source. Test authorship and source review were separate from Luna, but were done by the active AI agent; independent human review remains open.

The shared filesystem was not isolated by the OS. The recorder shows no withheld test reads. It records one failed attempt to read absent test files inside the coding workspace and one rejected Git command. The exact command outputs are retained. Native token usage is unavailable.

The operation checker revalidates the specification for each step. This run makes no performance claim. State continuity, case agreement, and passed tests are distinct from a formal proof, general code generation, or a self-hosting compiler.
