# Recorded coding experiments

These records test how an agent uses Clearings. They are evaluator and review assets, not analyzer input or production implementations.

| Run | Task | Result |
| --- | --- | --- |
| [luna-impact-001](luna-impact-001/REPORT.md) | Find potential review impact through declared operation dependencies | First candidate passed 19 withheld feature tests; eight prose-only rules remain unknown to the typed checker |

Each run retains its original freeze, candidate, trace, evaluation, and limitations. Do not rewrite an earlier run to reflect later source or documentation changes. The original snapshots include the uncommitted source state used during the experiment. Local-work statements in a report describe that capture time.

Publishing these records does not integrate the candidate into the library. A production change needs a separate review and retained regression tests. Do not run the archived `prepare.py` or `package.py` against a later working tree to replace the record. Use the reproduction commands in the run report to evaluate its captured source in a new directory.
