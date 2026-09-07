# Next task: review the integrated sequence checker

The review fixes and one fresh-agent self-development cycle are complete on the PR branches. The sequence checker was implemented by a fresh Luna agent from frozen requirements and current Clearings context. Its first submission passed all 17 frozen test groups and 81 regression/own tests without repairs. Source review approved integration without code changes.

Read [sequence checks](SEQUENCE_CHECKS.md) and the [experiment report](../benchmarks/agent-runs/luna-sequence-001/REPORT.md).

1. Review the exact API and its explicit shared-storage assumption. The caller must identify which fields represent the same storage across records.
2. Inspect the captured code and frozen tests. Check rejected writes, missing observations, and invalid inputs.
3. Compare the four recorded examples with their operation and continuity checks. Five opaque requirements keep the intended-model checks unknown.
4. Review the PR. The feature is integrated into production source on the branch; the PR is not merged by this task.
5. Select the next development task and a matched prose-only comparison before a further coding cycle. Keep requirements and tests fixed for both runs.

The earlier impact-analysis candidate stays outside production. Its frozen inputs and results are unchanged. The new `checkOperationSequence` is part of the public library API on this branch. No further development cycle using the improved version has started.

Keep intended requirements separate from observed source interpretations. Preserve the accepted reading text. Do not silently change intent to fit code. Keep the repository private. Deployment, package publication, CI, and public access remain deferred.

## Historical report handoff

The three required demos and the static Fumadocs documentation are implemented. The completed scope is preserved in [SHARED_DEMO_IMPLEMENTATION_TASK.md](SHARED_DEMO_IMPLEMENTATION_TASK.md). Results and commands are in [SHARED_DEMOS.md](SHARED_DEMOS.md).

## Review the current change

1. Read the overview and engineer reports from the new contract-bound bundle.
2. Follow the internal walkthrough and inspect its actual query output.
3. Review the recorded comprehension answers and the limits of their author assessment.
4. Check the README, contribution guide, and Fumadocs reading order.
5. Complete desktop/mobile interaction checks when permitted. Keep independent claim support separate from presentation acceptance.

## Select subsequent work explicitly

The optional next experiment is one small behavior-preserving refactor using selected IR. It requires a separate disposable target workspace, stated behavior constraints, before/after evidence, and appropriate tests. It is not started by building or opening these demos.

Broader coverage, other languages, provider transport, and public packaging remain later choices. The user requested static Fumadocs implementation first. GitHub Pages serving, CI, and public access are deferred until separately requested.

Keep the repository private. Do not publish packages, deploy the site, modify the analysis target, or reinterpret pending review as a passed gate.
