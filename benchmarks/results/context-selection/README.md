# Context-selection program evaluation

The [recorded evaluation](evaluation.json) accepts all 4,632 frozen cases, with no rejected or inconclusive cases. The [requirements and evaluator packet](../../evaluation/context-selection-v1/README.md) was committed at `7e1114f25c2593bd3a270603265553fbe3283797` before the candidate was authored. Its bytes remain unchanged.

The candidate is `program:60733f6ce9dcfbf419c89f996fab3b814051ed6a22056953ae7436aa41dffb78`. The report retains the generated Rust artifact, native build identity, evaluator and packet digests, and digests of the complete generated case corpus and execution observations. Each backend was compared to relational expectations; all completions, limits, and logical usage also agreed across backends. The adapter's original-record correspondence and 15 predefined controls are checked separately by the contract tests.

Maximum observed usage across these cases was 4,750,454 work units, 792,384 allocation units, 123,521 value units, and evaluation depth 13, within the unchanged frozen ceilings. Separate tests passed malformed admission, all four resource-exhaustion categories, executable IR selection/order mutations, and unavailable-native classification. Known reference failures still reject when native evidence is unavailable.

On this recording host, cold preparation took about 2.08 seconds. The reference case loop took about 14.42 seconds and the native case loop about 60.57 seconds. Native timing includes verification, argument transport, and a fresh process for every case; these measurements do not establish a production speedup. The algorithm uses existing Program IR constructs and Rust primitives. This is continuing-session development, not an independent coding-agent trial, universal refinement proof, or agent-efficiency comparison.

Reproduce from the repository root with Rust 1.85.1 available through rustup:

```bash
npm run test:selection
node --test tests/context-selection-evaluation.test.mjs
npm run selection:evaluate -- --candidate programs/clearings/context-selection.json --out /tmp/context-selection-evaluation.json
```

The saved result describes the pre-adoption selection program. Later ordinary-context integration has its own compatibility and recording checks.
