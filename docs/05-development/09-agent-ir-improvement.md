# Independently evaluated IR improvement

The next bootstrap step is an agent-authored improvement to Clearings' compiled dependency-closure algorithm. Production adoption is merged. This work connects a frozen behavioral contract, candidate Program IR, deterministic compilation, independent evaluation, and use of the resulting Clearings implementation.

## Review sequence

| Change                 | Purpose                                                                                                          | Acceptance boundary                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Evaluation baseline    | Freeze workload construction, independent expectations, resource policy, and candidate authoring inputs          | Baseline characterization and predefined faulty candidates exercise the evaluator; no production algorithm change      |
| Agent candidate        | Preserve one separately authored IR submission and its evaluation evidence                                       | Correct behavior on the frozen domain, reference/native agreement for the candidate, and explicit scalability criteria |
| Production integration | Adopt an accepted candidate, update implementation-specific regressions, and execute a subsequent Clearings task | Ordinary installed context execution, existing conformance/compiler gates, and a recorded subsequent use               |

The candidate can revise its algorithm without changing the Program IR language or abstract accounting rules. New function locations and lower work/allocation usage are expected implementation changes. Reference and compiled execution of the same revised program must still agree on usage and diagnostic details. Across old and new algorithms, compare return values, application-failure codes/payloads, precedence, and ownership, rather than requiring identical implementation locations or resource usage.

## Frozen evaluation

The [protocol](../../benchmarks/agent-runs/closure-scale-001/protocol.json) binds the baseline program, evaluator, independent path oracle, and execution implementation by source digests before authoring. The [task](../../benchmarks/agent-runs/closure-scale-001/TASK.md) specifies the agent's allowed inputs and modifications. The candidate receives a separate workspace and no conversation history. Withholding is enforced by instructions in a shared filesystem; it is not adversarial process isolation.

Correctness retains all 1,536 directed three-node graph/root cases plus explicit ordering, Unicode, optional-edge, missing-reference, duplicate-record, and empty-root cases. Scale workloads add chains in both declaration orders through 512 records, stars, cycles, repeated edges, and small closures in a larger inventory. Expectations come from path enumeration for the small domain and direct workload construction for larger cases.

Every scale workload must return the independently expected value under unchanged maximum limits. The 256-record chain must use at least 25% less logical work than the baseline. Timings are observations rather than acceptance thresholds. Predefined faulty programs check omitted sorting, optional expansion, and suppressed failure. Exhaustion remains distinct from an incorrect returned value and from a native infrastructure error.

Run a candidate evaluation from a built checkout:

```bash
node scripts/evaluate-closure-candidate.mjs --candidate candidate.json --out candidate-evaluation.json
```

The default executes both reference and native backends. `--backend reference` supports preliminary checks but cannot establish acceptance. Output creation refuses replacement. Reports bind the frozen protocol, candidate bytes, program, compiled artifact, resource limits, aggregate observation digest, and individual scalability results. Mismatches retain complete observations. The workload generator and candidate reproduce the evaluated inputs and outputs.

## Runtime cost and integration prerequisites

Restore passing hosted CI before merge. Provision Rust 1.85.1 and a host linker before native tests. Compilation is prepared outside bounded invocation recording. Cache reuse, input admission, executable verification, process execution, and response decoding remain part of the current runner contract.

Measure repeated cold preparation, warm preparation, generated-source compilation, reference execution, and complete native invocation separately. These measurements do not isolate every internal phase or establish that subprocess startup dominates. Asynchronous calls, persistent workers, and new language primitives require a separate measured need and explicit lifecycle or semantic contracts.

This is one bounded agent experiment. Passing it supports an evaluated algorithm improvement and a subsequent production use. It does not establish universal refinement, physical-resource isolation, compiler self-hosting, or a measured advantage over a matched prose-only coding workflow.

## Recorded result and production integration

The [first candidate](../../benchmarks/agent-runs/closure-scale-001/RESULT.md) passed all 1,561 frozen cases with native/reference agreement. The 256-record chain uses 79.4% less work, and both 512-record chain declaration orders return under the existing ceilings. Production now loads the exact accepted JSON. Its authoring module received formatting only; reproducibility is checked against the preserved submission.

The [subsequent context task](../../benchmarks/agent-runs/closure-scale-001/followup/README.md) uses that Clearings version to assemble its own context contract for integration review. The resulting byte-budget obligation is covered by a new large-context regression. Installed-package checks retain disabled interpreter/TypeScript traversal controls, successful 512-operation CLI execution, explicit exhaustion at a larger workload, IR mutation detection, and invalid-cache rejection.

This completes the implementation for review. Hosted CI remains a merge gate. Cold preparation remains material and the runner remains synchronous; broader optimization requires measured evidence.
