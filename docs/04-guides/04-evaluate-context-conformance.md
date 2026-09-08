# Evaluate and replay context conformance

Run the bounded context-assembly suite, inspect its evidence, and repeat the evaluation without executing the implementation again. The report distinguishes scoped acceptance from the broader contract verdict, which retains unknown external-effect obligations.

## Run from a clean checkout

Use Node.js 24, npm 11, and a Git checkout with its history. From the repository root:

```bash
npm ci --ignore-scripts
npm run build
node dist/cli/main.js conformance run --suite smoke --out ../clearings-conformance-smoke
```

The smoke suite executes 36 cases against the current built checkout. The output directory must be new and outside both the recorder and candidate repositories and their Git object stores. Use a different directory name for another run. Candidate code must be trusted local code; workers provide time and memory limits, not a security sandbox.

The command prints the scoped result and output path. Open `report.md` to inspect the case table and follow its links to the raw execution records and detailed evaluations.

| File | Contents |
| --- | --- |
| `run.json` | Content identity, execution/replay mode, suite coverage, evaluator identity, summary, and record checksums |
| `report.md` | Human-readable results, failed checks, unresolved obligations, and evidence links |
| `record-00000.json` | Original/resulting arguments, actual completion, component identities, and measurements for one invocation |
| `evaluation-00000.json` | Independent reference measurements, obligation results, and the unchanged broader contract verdict |

The numeric suffix increases for each case. Records and evaluations are saved as cases complete; `run.json` is written only after the entire requested run completes. If preparation or evaluation is interrupted, existing individual records can still be replayed. A partial directory without a completed manifest is not a completed suite result.

## Interpret the result

| Scoped result | Meaning | Exit code |
| --- | --- | --- |
| `accepted` | Every applicable mandatory obligation and evaluation prerequisite passes for all recorded cases | 0 |
| `rejected` | At least one captured case violates a checked requirement | 1 |
| `inconclusive` | No known violation, but required evidence or evaluation is unavailable | 3 |
| Input/preparation error | The requested evaluation cannot be formed | 2 for invalid input; filesystem or operational failures may use 1 |

A permitted application exception can be accepted. A timeout, incomplete capture, or authored example cannot establish acceptance. A known violation remains rejected even if other evidence is unavailable.

`acceptance: accepted` can coexist with `contract.verdict: unknown`. The independent evaluator discharges the applicable native-check obligations in its own ledger. It preserves the original predicate-check result, including opaque rules and unobserved effects. Read [executable conformance semantics](../02-semantics/04-executable-conformance.md) before interpreting this as a broader correctness claim.

## Replay saved evidence

```bash
node dist/cli/main.js conformance replay ../clearings-conformance-smoke --out ../clearings-conformance-replay
```

Replay validates the run identity, record checksums, contract bindings, and exact named-suite inputs. It recomputes results using the current evaluator. It does not import candidate code, resolve implementation repository locators, or trust saved evaluation results. The candidate checkout may be absent. The replay report identifies the source run and the evaluator that performed the new evaluation.

For one record:

```bash
node dist/cli/main.js conformance replay ../clearings-conformance-smoke/record-00000.json --out ../clearings-single-replay
```

Replay output must be outside its input evidence directory. Input files are preserved. If the evaluator changes, new evaluation identities can differ while the original record identity remains the same. A stale profile or suite binding is rejected explicitly.

## Evaluate a specific invocation or implementation

The input file contains `{ specification, selection, options: { maxBytes } }`, using a complete v0.3 invocation specification. The [recording guide](03-record-context-assembly.md) shows how to construct that value.

```bash
node dist/cli/main.js conformance run invocation.json --out ../clearings-single-run
node dist/cli/main.js conformance run --suite smoke --implementation-root ../candidate-checkout --timeout-ms 10000 --out ../clearings-candidate-run
```

The target must be a built Git checkout with the fixed `src/specification/context.ts` and `dist/specification/context.js` entrypoints, package metadata, and an exported synchronous `assembleContext`. No candidate-selected module path is read from an artifact. The recorder binds working-file digests as well as the Git baseline; concurrent file changes are outside the protocol.

## Run the exhaustive domain and controls

```bash
node dist/cli/main.js conformance run --suite full --out ../clearings-conformance-full
npm run test:conformance
```

The full suite contains 1,554 cases: all 1,536 graph/root combinations from 512 directed graphs on three labeled operations, plus 18 targeted cases. This exhausts the declared three-node graph domain; it does not exhaust all v0.3 specifications.

The regression command checks production and an independently authored conforming implementation on all 1,554 cases each, then executes 26 predefined source faults. Twenty-five faults must be rejected by their designated checks; a nontermination fault must time out and remain inconclusive. The control is separate from the reference evaluator. The [suite manifest](../../specifications/clearings/conformance/suite.json) binds generated inputs, control source, and fault definitions before execution. The [control documentation](../../tests/fixtures/conformance/README.md) describes the independence boundary. Exhaustive execution takes several minutes; `npm run test:conformance:smoke` runs the smaller domain with the same fault set.

The [focused CI workflow](../../.github/workflows/conformance.yml) installs declared dependencies, runs the exhaustive regression command, and checks executable Markdown examples. It grants read-only repository permissions and does not publish artifacts or packages.

## Use the evaluator as a library

```js runnable
import assert from 'node:assert/strict';
import { createContextAssemblyCases, recordContextAssembly, evaluateContextAssembly } from 'clearings/conformance';
const input = createContextAssemblyCases('smoke').find(item => item.case_id === 'byte-boundary-0');
const record = await recordContextAssembly(input);
const evaluation = evaluateContextAssembly(record);
assert.equal(record.completion.kind, 'throw');
assert.equal(evaluation.acceptance, 'accepted');
assert.equal(evaluation.contract.verdict, 'unknown');
assert.equal(evaluation.obligations.find(item => item.id === 'external-effects').status, 'unknown');
```

This example records an actual capacity exception. The evaluator independently confirms its required byte count and retains the unresolved effect boundary. It does not modify the execution record.
