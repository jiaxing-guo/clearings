# Fresh Luna coding experiment

**The first submission passed all 19 candidate-facing frozen tests.** The independent oracle self-check also passed. Build and typecheck passed. All 73 existing library tests passed across the initial run and a targeted rerun after an evaluation setup correction. The candidate received no withheld-test feedback and needed no code repairs.

Run: `luna-impact-001`, 6 September 2026. Requested model: `gpt-5.6-luna`. The agent started with `fork_turns: none`.

This establishes that one fresh agent could implement this bounded feature from the supplied material. It does **not** establish that the typed IR is sufficient by itself or improves coding results over ordinary instructions.

## The task

Implement `analyzeImpact`: given changed operations, find operations whose declared dependencies may make them need review. Return a shortest dependency path for each result. Preserve open decisions, explain omissions, and distinguish required from optional links.

The feature is useful to Clearings itself. It asks which contracts may need review after a contract changes. Its result describes potential dependency impact; it does not establish actual changed program behavior.

The [API mapping](frozen/API.md) defines the public interface. The [typed specification](frozen/specification.json) and [generated agent context](frozen/context.json) record intended behavior. These inputs, the task, the oracle, and the tests were hashed before the agent started. See the [protocol](frozen/PROTOCOL.md) and [freeze manifest](freeze.json).

## Results

| Check | Result |
|---|---|
| Initial candidate build and typecheck | Pass |
| Frozen feature tests | 19/19 pass |
| Independent oracle self-check | 1/1 pass; does not test candidate code |
| Generated graph cases within the feature suite | 160 queries across 80 small graphs and two modes |
| Deep graph case within the feature suite | 350-operation chain with complete witnesses |
| Existing library tests | 71 initially passed; the remaining 2 passed after restoring a missing evaluator helper |
| Candidate repairs after submission | None |
| Frozen inputs and evaluator files | All 16 hashes unchanged |
| Main source snapshot | All 77 files unchanged by this experiment |

The feature tests cover reverse traversal, outgoing helpers, cycles, aliases, multiple roots, shortest paths, lexical ties, optional links, invalid arguments, stale models, independent object ownership, ordering, and the authored Hono model. The oracle searches outgoing paths from each operation. The candidate builds reverse links and propagates distances and witnesses. Their implementations differ.

Tests were authored by the orchestrator before coding and withheld from Luna. They are independent of the coding agent and candidate implementation. They are not independent human review. A baseline run without the new feature passed only the oracle self-check and failed all 19 candidate-facing tests.

The [initial evaluation](results/evaluated/evaluation.json) retains its original `failed-frozen-checks` result. The cause was an omitted `scripts/check-claim-review.mjs` in my evaluation snapshot. I restored that helper after verifying it matched the baseline Git commit, then reran only the blocked test file. Both tests passed. The [correction record](results/evaluation-setup-correction.json) preserves this deviation; no specification, feature test, or candidate source changed.

## A concrete result

On the frozen Hono model, changing `store-response` gives these paths:

| Operation to review | Shortest witness |
|---|---|
| `middleware-result` | `middleware-result` → `store-response` |
| `response-selection` | `response-selection` → `store-response` |
| `store-response` | `store-response` |

`read-response` is explicitly omitted because the supplied dependency model does not connect it to this change. The result is limited to those declared relationships. The [full report](results/observation/report.json) retains the open decisions and the exact input artifact identity. No Hono source was executed.

## What the agent used

The agent first read the generated context, API mapping, task, and repository instructions. It also read the full specification, seven project documents, and relevant library source. The recorder reports 21 distinct files and 155,721 bytes of file content. This is a file-access measure, not a token count or a claim that all returned content was processed by the model.

The captured [patch](submission/candidate.patch) adds `src/specification/impact.ts` and exports it from `src/index.ts`. The implementation builds a reverse dependency map, propagates shorter or lexically earlier paths, and returns copied records. The patch applies cleanly to the frozen working-tree baseline. It has not been applied to the main working tree.

Luna's own verification was weaker than its final message suggested:

- Build and typecheck passed.
- `npm test` exited successfully but ran **zero tests**. No own test file was submitted.
- One small runtime example passed. Its error checks did not fail if an expected exception was absent.
- Two manual graph examples failed while constructing invalid specifications. Neither reached the feature call. Those failures were not mentioned in the final message.

The external tests provide the useful correctness evidence here. The [recorded activity](submission/trace/activity.jsonl), command outputs, and [agent final message](submission/agent-final.md) are preserved without repairs.

## What this says about the IR

The operation has 16 rule records: eight use executable predicates and eight are explicitly `opaque`. Shortest paths, minimal closure, lexical order, public argument handling, and object ownership still depend on prose or external checks.

In a supplementary check of the actual Hono result, the typed checker reports **`unknown`**: 11 checks pass and eight remain unknown. The 11 passes comprise eight rule predicates, the outcome condition, the state frame, and the supplied effect list. This check was added after scoring and is not part of the frozen test score.

Even a non-opaque predicate can check less than its description says. For example, `rule:include-changes` checks membership. Its prose also requires distance zero and a one-element witness; the frozen external tests check those parts. A green predicate must not imply that every sentence in its description was verified.

The [observation](results/observation/observation.json) is an authored projection of the public result. Input content digests were measured before and after the call. The empty effect list was supplied from source inspection, without an instrumented external-effect trace. The checker does not verify that this adapter is faithful or complete. See its [full verdict](results/observation/check.json).

The main design lesson is to keep machine-checked predicates, prose obligations, adapters, and external test evidence distinct. The current combined package was usable for this task. We cannot attribute success to the typed predicates alone.

## Limits and next step

This was one agent, one task, and one initial submission. It used a shared container with a protocol boundary, not OS-enforced isolation. The recorder is not an independent audit of all tool access. No verified backend model revision or native token count was available. There was no prose-only control, repeated run, or performance comparison.

Before making a broader claim, run a matched prose-only control and a task with state changes and failure paths. Those tests would address whether the IR adds value beyond organizing graph requirements. Keep this candidate as a review patch until it has a normal code review and retained regression tests.

The prior typed refactor remains unchanged. This experiment, its results, and the candidate patch are local. Nothing was committed or pushed.

## Inspect or reproduce

Start with this report, then the frozen API and generated context, the candidate patch, and the withheld test cases. The [result summary](results/summary.json) provides machine-readable counts and limitations.

To replay the tests, use the package root as your working directory. The following commands create a new evaluation directory. They do not rerun the coding agent:

```bash
mkdir replay
tar -xzf frozen/source-baseline.tar.gz -C replay
tar -xzf frozen/integration-inputs.tar.gz -C replay
patch --directory=replay -p1 < submission/candidate.patch
mkdir -p replay/scripts
cp evaluation/supplement/scripts/check-claim-review.mjs replay/scripts/
npm --prefix replay ci --ignore-scripts
node evaluation/evaluate.mjs replay replay-results
```

Use the recorded Node version where practical. The supplemental helper corrects the documented initial setup error; it is not part of the original frozen archive. The package contains the lockfile and source snapshots but does not vendor installed dependencies. A fresh install needs package registry access. The original run used existing installed dependencies.
