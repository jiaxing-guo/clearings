# Hono contract review bundle

This bundle demonstrates source-linked contracts, record inspection, and bounded context for the pinned Hono snapshot. The model has **22 function contracts, four behavior contracts, 73 assertions, and ten critical unknowns**. Eighteen function implementations have exact source anchors. Four callback roles have unknown runtime implementations.

Start with [the source walkthrough](source-walkthrough.json). It follows request dispatch → response selection → the response getter and shared state → an assertion → exact source. Its queries were generated through `inspectSemantic`. Then inspect [the catalog and capabilities](inspection.json), or use the CLI below.

| File | Purpose | Serialized bytes |
| --- | --- | ---: |
| [semantic.json](semantic.json) | Complete v0.2 model, including recorded request/proposal | 221,800 |
| [request-dispatch.context.json](request-dispatch.context.json) | Required request-dispatch context | 96,657 |
| [middleware-composition.context.json](middleware-composition.context.json) | Required composition context | 69,521 |
| [response-getter.context.json](response-getter.context.json) | Focused getter, state, constraints, and evidence references | 26,803 |

Context JSON is compact and includes one newline. The recorded budgets are 131,072 bytes per capability and 32,768 bytes for the getter. Conditions, state rules, failure boundaries, and applicable critical unknowns remain in the required set. Source text is retrieved separately. These are measured byte counts, not token counts or an efficiency claim.

## Reproduce

From the repository root, with the pinned Hono bare repository available:

```bash
npm ci --ignore-scripts
npm run build
node scripts/replay-contracts.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contract-review
node dist/cli/main.js inspect benchmarks/results/local/my-contract-review/semantic.json
node dist/cli/main.js inspect benchmarks/results/local/my-contract-review/semantic.json --behavior response-selection
node scripts/check-claim-review.mjs benchmarks/results/local/my-contract-review/semantic.json benchmarks/results/local/my-contract-review/scan.json benchmark-checkouts/hono.git benchmarks/results/hono-contracts/source-review.json
```

Use a new output directory. The script recreates the source request, imports the recorded response twice, checks byte-identical replay/context selection, and verifies unchanged target files. It writes the 22 MB structural `scan.json` needed for evidence retrieval. That reproducible scan is not duplicated in this bundle. Its hash remains in [summary.json](summary.json).

The producer input/output are in [hono-contracts](../../proposals/hono-contracts). Replaying them does not call a model. Producer/model usage fields remain null where measurements were unavailable. The summary records input/output bytes, run times, memory, scope, and hashes.

## Review status and limits

[Source review](source-review.json) records an author self-review of all 73 assertions and 26 contracts. The original 53 assertions retained their identity only after source review against the new request. Twenty assertions are new. [Review accounting](review-accounting.json) verifies review coverage and binding; it does not judge English entailment. Independent support is **not established**. The model's assertions remain proposed and verification unknown.

The full tests pass. Both v0.2 and v0.1 replay preserve target bytes. The historical semantic JSON and all eight audience reports remain byte-identical. No new browser check was needed because this change does not alter rendering.

The two existing human reports still use their historical v0.1 model. The next task connects both reports to these contracts and records an agent comprehension run. The source walkthrough is actual query output; it is not a demonstration of improved coding performance or an agent answering questions. Scope remains two Hono capabilities from 11 excerpts across three files. The Hono license accompanies those excerpts.
