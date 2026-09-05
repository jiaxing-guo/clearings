# Next implementation task: integrate the three demos

Planning label: M4. The contract implementation is complete. Its detailed task is preserved in [CONTRACT_IMPLEMENTATION_TASK.md](CONTRACT_IMPLEMENTATION_TASK.md), and its APIs and reproduction commands are in [SEMANTIC_CONTRACTS.md](SEMANTIC_CONTRACTS.md).

## Outcome

The PM report, engineer report, and internal-representation walkthrough use the same v0.2 semantic artifact for Hono request dispatch and middleware composition. A recorded agent run answers bounded questions from selected IR and reports additional source lookup.

## Required work

1. Adapt the existing presentation schema and renderers to v0.2 contracts. Keep the accepted article reading order. Generate function reference fields from canonical records. Preserve audience prose and layout as presentation data with source/assertion links and independent review status.
2. Explicitly regenerate presentation bindings for the new model. Keep historical v0.1 artifacts and replay intact. Do not change an old artifact ID in place to make a plan validate.
3. Generate four HTML reports and four Markdown reports from the new model. Check source ranges, code text, companion links, desktop/mobile layout, keyboard access, and offline behavior. If browser policy blocks a check, record the block and use permitted static checks without claiming a browser pass.
4. Produce a concise internal walkthrough from actual inspection and context output. Reuse the canonical capability, behavior, function, state, assertion, and evidence IDs. The current source-walkthrough.json is a starting point, not a second data source.
5. Record an agent comprehension run for the questions in PROTOTYPE_PLAN.md. Supply the selected IR first. Keep source-reviewed expected answers outside the agent input. Log extra evidence requests, final answers, unknowns, model/producer details, and available usage. Score critical distinctions and unsupported claims. Source lookup is allowed and must be visible.
6. Package all three demo views with one artifact identity, source notices, reproduction commands, scope, review state, and measurements. Keep author self-review distinct from independent support adjudication.

## Verification

Retain the contract import, stale-anchor, accessor, callback, shared-state, context-budget, deterministic replay, and target/output protection checks. Test the report adapter where it can change meaning or invalidate source links. Use the six bounded questions in the roadmap for comprehension. Do not claim efficiency or coding superiority without a comparable measured baseline.

## Limits

Do not start the optional refactor, broaden capabilities or repositories, add a provider SDK, build a hosted application, publish a package, or change repository visibility. Follow session authorization for commit and PR work.
