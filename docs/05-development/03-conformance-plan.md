# Executable conformance implementation plan

The objective is reproducible, independently checked agreement between one Clearings implementation and its operation specification over a bounded evaluation domain. The initial target is `assembleContext`, including dependency selection, projection, byte accounting, and exceptional completion.

## Four pull requests

| Sequence | Change | Completion criterion |
| --- | --- | --- |
| 1 | Define the scoped operation contracts, conformance profile, execution-record format, and obligation ledger | Every requirement identifies its measurement source, verification method, and limitation; schemas and authored examples validate |
| 2 | Implement execution recording and the observation adapter; expose structured budget-error details | Actual returns and exceptions produce faithful records; independent measurements remain separate from reported counters |
| 3 | Implement the independent evaluator and executable fault tests | Production and an independent conforming implementation pass the scoped checks; predefined non-equivalent faults are detected |
| 4 | Expose a reproducible command, replay, reports, documentation, and focused regression gates | A clean checkout reproduces results and explains failures without undocumented setup |

The first change defines formats and requirements. Its authored examples are not execution evidence, and its independent check IDs name future procedures. The second change introduces a runner only for the declared context-assembly slice. The third supplies independent reference behavior. The fourth integrates those components without redefining operation semantics.

## Evaluation commitments

Freeze the initial evaluation properties before executing candidate faults. Cover all 512 directed required-dependency graphs on three labeled operations, including self-loops, with each of three roots: 1,536 graph/root combinations. Add targeted cases for optional edges, aliases, complete and partial state frames, evidence metadata, Unicode, exact byte boundaries, and simultaneous invalid inputs within the profile domain.

The evaluator must not reuse candidate dependency-selection, byte-accounting, or context-revalidation functions to compute its expected results. A separately implemented conforming candidate is a positive control. Fault tests execute changed implementation code; edited observation records remain a separate checker-test category.

Record retained unknowns and distinguish scoped acceptance from the broader contract verdict. The current specification intentionally retains opaque checks for independent evaluation and external effects. No complete effect monitor, source-refinement proof, or measured agent coding advantage is established by this sequence.

## Subsequent boundary

Program IR, a reference interpreter, compiler backends, general agent procedures, and staged compiler bootstrapping follow this milestone. The conformance infrastructure should provide an independent evaluation boundary for those implementation changes.

See [executable conformance](../02-semantics/04-executable-conformance.md), [artifact interfaces](../03-reference/05-conformance-artifacts.md), and [current project status](01-status-and-roadmap.md).
