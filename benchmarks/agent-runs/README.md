# Recorded coding experiments

These records test how an agent uses Clearings. They are evaluator and review assets, not analyzer input or production implementations.

| Run | Task | Result |
| --- | --- | --- |
| [luna-impact-001](luna-impact-001/REPORT.md) | Find potential review impact through declared operation dependencies | First candidate passed 19 withheld feature tests; eight prose-only rules remain unknown to the typed checker |
| [luna-sequence-001](luna-sequence-001/REPORT.md) | Add operation-sequence checks from frozen requirements and source | First submission passed 17 withheld groups and was integrated; the report preserves its original review-time status |
| [closure-scale-001](closure-scale-001/README.md) | Improve the production dependency-closure algorithm in Program IR | Retains the frozen baseline, candidate, and evaluations; see the [current evaluation account](../../docs/05-development/09-agent-ir-improvement.md) for acceptance and adoption |
| [closure-scale-001-closeout](closure-scale-001-closeout/README.md) | Re-evaluate the accepted candidate with corrected infrastructure-failure handling | A separate record preserves the original experiment while checking the corrected evaluator |

Each run retains its original freeze, candidate, trace, evaluation, and limitations. Do not rewrite an earlier run to reflect later source or documentation changes. The original snapshots include the uncommitted source state used during the experiment. Local-work statements in a report describe that capture time.

Publishing these records does not integrate the candidate into the library. A production change needs a separate review and retained regression tests. Do not run the archived `prepare.py` or `package.py` against a later working tree to replace the record. Use the reproduction commands in the run report to evaluate its captured source in a new directory.
