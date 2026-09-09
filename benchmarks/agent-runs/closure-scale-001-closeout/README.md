# Evaluator correction and milestone closeout

PRs #26–28 merged the frozen evaluation, first separately authored IR submission, and production integration. This closeout corrects infrastructure-error classification without rewriting the first experiment. The original `closure-scale-001` directory and all source files named by its protocol remain unchanged.

## Correction boundary

The original driver caught both native execution exceptions and comparison assertions in one handler. It could reject a candidate for a native/reference disagreement even when no native result existed. The v0.2 driver uses a separate orchestration module: preparation, execution, and disposal errors retain diagnostics and make otherwise successful evaluation inconclusive. A demonstrated reference failure, unmet work requirement, or observed native/reference disagreement still rejects the candidate. Returned logical resource exhaustion remains subject to the original behavioral requirements.

`protocol.json` binds the correction sources and the original protocol digest. Workloads, independent expectations, accounting, maximum limits, the 25% work-reduction threshold, candidate bytes, compiler, and runtime are unchanged. This is an evaluator correction after the original submission, not a new independent authoring experiment. Original evidence is retained under its original protocol identity.

The maintained command uses v0.2:

```bash
npm run closure:evaluate -- --candidate benchmarks/agent-runs/closure-scale-001/candidate.program.json --out /tmp/closure-recheck.json
```

Use a new output path. The historical v0.1 driver remains `scripts/evaluate-closure-candidate.mjs`; its native-error classification limitation is preserved for reproduction. New reports bind both the original and revised protocol digests. Successful observation rows retain their original serialization so their aggregate digest can be compared directly with the first recorded evaluation.

## Verification

The v0.2 `candidate-evaluation.json` accepts all 1,561 cases with reference/native agreement and no native infrastructure errors. Its candidate and compiled-artifact identities, limits, individual scalability results, and complete successful observation digest equal the original recorded evaluation. The observation digest is `49c49601eec45e8618cbf0b2ff0f08bca39e60c0a9c88242a8bafc4e9b5ca1fb`. The correction does not change the accepted candidate's measured result.

Validation on Linux x64 with Node.js 24 and Rust 1.85.1:

- Nine evaluator tests passed: the three original frozen-evaluation controls and six correction tests. They cover preparation/execution/disposal errors, execution exceptions carrying assertion codes, unknown agreement, disagreement precedence in either invocation order, reference-only execution, and rejection for independently observed behavioral or work failures. Native substitutes in these unit tests are explicitly labeled; the complete candidate evaluation uses real native execution.
- A separate CLI run with an empty executable search path retained all 1,561 reference observations and produced `inconclusive`, exit status 3, `RUST_TOOLCHAIN_UNAVAILABLE`, no mismatches, and no candidate-rejection failures.
- TypeScript build, Prettier, and whitespace checks passed. The original experiment directory, frozen evaluator inputs, production IR, compiler, interpreter, and runtime remain unchanged.
- Markdown checks passed 60 documents, 516 local links, and 12 runnable examples. Documentation build and static checks passed; browser interaction was not tested.

The local compiler/runtime and full production conformance gates recorded in the preceding integration remain evidence for that unchanged implementation. They were not rerun as part of this evaluator-only correction.

Hosted CI is still unresolved. On 2026-09-09, the merged-main Rust workflow at `8a34ecb97f68526822b969a80bc59c55f4dc5d6c` was retried. [Attempt 2](https://github.com/jiaxing-guo/clearings/actions/runs/34300609915/attempts/2) failed with zero job steps, so no repository checks executed. The available GitHub connection reports the failed job but does not expose its failure annotation. These local results do not establish passing hosted CI; the GitHub-side failure needs diagnosis before merge.

## Project assessment

Milestone 5's defined implementation scope is merged: one agent-authored Program IR change was independently evaluated, adopted byte-for-byte, and used by Clearings in a subsequent development task. The implementation now exercises requirements, typed algorithms, deterministic compilation, bounded execution, and independent acceptance in one production path.

The evidence remains narrow. It establishes one production algorithm and one separately authored improvement, with procedural author/evaluator separation. General contract-to-program synthesis, a managed repeated agent workflow, broad language adequacy, physical-resource isolation, and compiler self-hosting are unestablished. The subsequent task is recorded context assembly and integration review, rather than a second independent agent trial.

The proposed next development priority is a second substantive production algorithm, such as state and evidence selection in context projection, evaluated through the same boundaries. Cold preparation, synchronous execution, quadratic collection costs, and larger graph domains remain explicit engineering work. A new worker architecture, optimization IR, or language primitive should follow a measured workload requirement.
