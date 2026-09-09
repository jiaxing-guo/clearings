# Independent candidate evaluation

The first final candidate passed the frozen 1,561-case evaluation on Linux x64 with Rust 1.85.1. Reference and native execution agree exactly on each candidate's completion, diagnostic locations, limits, and logical usage. No evaluator changes or evaluation feedback were supplied to the candidate author after the protocol was frozen.

The exact submitted authoring module is `candidate.mjs`; it reproduces `candidate.program.json` byte-for-byte. The program identity is `program:e08458748756b1d965490a1bda8572814b468e7f1868a2222ff7a3faad0cc1d8`. `candidate-evaluation.json` records independent results. `SUBMISSION.md` records the author's separate development checks; those counts are author-reported and are not the independent evaluation count. `candidate-manifest.json` binds the submitted artifacts, results, and procedural limits.

## Established improvement

| Workload | Baseline work | Candidate work | Result |
| --- | ---: | ---: | --- |
| 256-record forward chain | 4,134,308 | 850,897 | 79.4% lower work |
| 512-record forward chain | Exhausted at the 10,000,000-unit ceiling | 2,258,797 | Returned the expected closure |
| 512-record reversed declarations | Exhausted at the same ceiling | 2,263,234 | Returned the expected closure |

All other frozen scale workloads also returned their expected values. No language primitive, runtime implementation, resource rule, or limit changed. The candidate builds a stable index of record positions, checks duplicate precedence using original positions, performs logarithmic record lookup, and keeps a unique FIFO of discovered IDs. These computations execute in IR. Record payloads remain input values rather than repeatedly copied index entries.

## Measured costs and remaining limits

The five-sample local profile observed approximately 4.34 seconds median cold preparation for the candidate versus 2.07 seconds for the baseline. The candidate emits a larger program with additional indexing functions. Complete native execution of the 256-record chain measured approximately 35 ms versus 58 ms. These observations include the measurement overhead documented in the profile, and concurrent activity on the shared host was not controlled. They are not a controlled speedup result or regression thresholds.

Record indexing improves lookup comparisons; immutable list construction, visited-ID membership, and per-record target deduplication still have quadratic aggregate costs in some workloads. Index setup can also cost more on small graphs or inputs that the baseline rejected early. Different algorithms can exhaust at different inputs under the same accounting policy. Acceptance applies to the frozen domain, not every possible input or a universally improved success domain.

Preserve explicit preparation and cache reuse. The observations do not justify a persistent worker or a change to process isolation yet. Larger graph domains, stronger isolation of the author from evaluation files, matched agent-efficiency trials, and compiler self-hosting remain separate work.

## Integration boundary

This change preserves the accepted candidate and evidence without replacing production IR. The next dependent change copies the accepted JSON unchanged into production, adapts implementation-specific regressions while preserving their behavioral assertions and fault controls, and records a subsequent Clearings context task. Hosted CI must pass before merge; local results do not substitute for hosted execution.
