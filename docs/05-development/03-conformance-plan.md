# Executable conformance implementation plan

The objective is reproducible, independently checked agreement between one Clearings implementation and its operation specification over a bounded evaluation domain. The initial target is `assembleContext`, including dependency selection, projection, byte accounting, and exceptional completion.

## Four pull requests

| Sequence | Change | Completion criterion |
| --- | --- | --- |
| 1 | Define the scoped operation contracts, conformance profile, execution-record format, and obligation ledger | Every requirement identifies its measurement source, verification method, and limitation; schemas and authored examples validate |
| 2 | Implement execution recording and the observation adapter; expose structured budget-error details | Actual returns and exceptions produce faithful records; independent measurements remain separate from reported counters |
| 3 | Implement the independent evaluator and executable fault tests | Production and an independent conforming implementation pass the scoped checks; predefined non-equivalent faults are detected |
| 4 | Expose a reproducible command, replay, reports, documentation, and focused regression gates | A clean checkout reproduces results and explains failures without undocumented setup |

All four changes are implemented. The final two are combined into one integration change: independent reference evaluation, predefined implementation faults, reproducible CLI execution and replay, JSON/Markdown reports, and a focused CI gate. The initial authored examples remain format illustrations. Use [the recording guide](../04-guides/03-record-context-assembly.md) for raw evidence and [the evaluation guide](../04-guides/04-evaluate-context-conformance.md) for scoped results and reproduction.

## Evaluation commitments

The [suite manifest](../../specifications/clearings/conformance/suite.json) freezes the generated inputs and control source hashes before fault execution. The full domain covers all 512 directed required-dependency graphs on three labeled operations, including self-loops, with each of three roots: 1,536 graph/root combinations. Eighteen targeted cases cover optional edges, aliases, complete and partial state frames, evidence metadata, Unicode, exact byte boundaries, and simultaneous invalid inputs within the profile domain.

The reference evaluator imports no runtime functions. It computes traversal through shortest-path relaxation and byte accounting through a decimal-width equation. A separately implemented conforming candidate is a positive control. Twenty-six predefined source mutations exercise actual faulty implementations; edited records remain a separate evaluator-fidelity test category. The 25 application faults must fail their designated checks. The nontermination fault must time out and remain inconclusive.

Record retained unknowns and distinguish scoped acceptance from the broader contract verdict. The current specification intentionally retains opaque checks for independent evaluation and external effects. No complete effect monitor, source-refinement proof, or measured agent coding advantage is established by this sequence.

## Subsequent boundary

Program IR, a reference interpreter, compiler backends, general agent procedures, and staged compiler bootstrapping follow this milestone. The conformance infrastructure should provide an independent evaluation boundary for those implementation changes.

See [executable conformance](../02-semantics/04-executable-conformance.md), [artifact interfaces](../03-reference/05-conformance-artifacts.md), and [current project status](01-status-and-roadmap.md).
