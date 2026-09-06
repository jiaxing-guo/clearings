# Next task: review the typed core and fresh-agent result

The active request replaces the prose-heavy IR with a typed specification core and a Clearings self-development slice. See [the active plan](PROTOTYPE_PLAN.md) and [typed specifications](TYPED_SPECIFICATIONS.md). The previous report task below is historical.

1. Open the Clearings bootstrap page. Inspect the dependency-cycle case and seven rejected output faults. Check whether the rules express the intended behavior independently of the implementation.
2. Open the Hono typed page. Compare direct and Promise fallbacks, then inspect the getter, setter, and middleware assignment as separate operations.
3. Inspect the actual context JSON. Conditions, outcomes, state, responsibilities, and decisions must be meaningful without joining assertion IDs.
4. Check the boundary between scenario agreement and implementation conformance. The checker evaluates supplied observations; it does not run source or authenticate requirements.
5. Review the new report in a browser. Then inspect the [fresh Luna experiment](../benchmarks/agent-runs/luna-impact-001/REPORT.md), its frozen specification, generated context, captured patch, and withheld tests. The initial candidate passed all 19 feature tests. The separate oracle self-check also passed. A recorded evaluator setup correction allowed the remaining two regression tests to run; all 73 passed across the two runs.
6. Check which requirements remain prose-only. Eight of the experiment's 16 rules are opaque, and the typed checker returns unknown. Luna's own test command ran zero tests, and two manual graph fixtures failed before calling the feature. The withheld tests provide the useful evidence.

The current priority is PR review. The experiment is a separate archived candidate; `analyzeImpact` is not part of the production API. Its results do not approve the candidate for integration or establish a coding advantage.

After the architecture review, select a second task with state changes and failure handling. Compare a fresh agent using Clearings with a separate fresh agent using the same requirements as ordinary prose. Freeze equivalent requirements and independent tests before either run. Neither a second coding run nor the comparison is started by this handoff.

Keep intended specifications and observed source models separate. Preserve the accepted reading guides. Do not silently edit intent to fit an implementation. Keep the repository private and do not deploy or publish packages as part of this task.

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
