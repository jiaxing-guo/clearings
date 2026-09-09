# Compiled context selection in production

This observation records Clearings assembling its own `assemble-context` contract with compiled dependency closure followed by compiled state/source selection. The [execution record](record.json) binds implementation commit `889ee9163f0ea6e598083efa460ec278b64fc212`, the executed source and build inventory, both program identities, ordered native results, and the complete context. The [evaluation](evaluation.json) accepts both context behavior and native-stage evidence. The [summary](summary.json) binds the record and evaluation by SHA-256.

The result contains `assemble-context`, `measure-package`, `project-operation`, and `select-required`, together with state `model-digest` and supporting source `design:context`. Its compact serialization uses 29,489 bytes within a 131,072-byte budget. Both programs match their separately frozen evaluation results.

| Stage | Work | Cumulative allocation units | Peak value units | Evaluation depth |
| --- | ---: | ---: | ---: | ---: |
| Closure | 5,705 | 1,845 | 261 | 21 |
| Selection | 12,962 | 4,316 | 782 | 13 |

These are logical counters under `context-native-v2`. Each stage receives its own declared limits; physical memory and an aggregate invocation work budget are not measured here.

## Integration review using the assembled contract

The assembled `outcome:budget` requires reporting insufficient capacity without truncated context. The implementation retains byte accounting after both compiled stages, and the regression gate checks successful native execution followed by `CONTEXT_BUDGET`. Selection exhaustion has a separate regression: a valid input with 2,048 selected states would produce a 301,213-byte host context, but the compiled selection exceeds 10,000,000 work units after closure succeeds. It returns `CONTEXT_RESOURCE` with exit status 3 and no partial context. This is an explicit finite-resource compatibility restriction.

The assembled contract also retains all operation outcomes and open decisions, exact specification identity, and the modeled input digest. Integration review confirmed that host code still projects complete records and owns byte accounting, while IR determines state/source membership and ordering. Recorded input comparisons and revalidation tests cover ownership. Source integrity does not establish source authenticity or narrative support; the context retains those distinctions.

The installed-package gate disables host traversal and reference-interpreter execution. A change only to selection IR changes the context's selected states and sources while retaining the closure artifact. Warm execution works without Rust available; missing selection builds and corrupted selection executables fail explicitly after the completed closure observation is retained. Replay of this saved record was accepted with only Node and Git on `PATH`, no Rust tools, and no cache directory created.

## Reproduction and scope

From a built checkout with the pinned toolchain, record a new observation in a new directory:

```bash
npm run native:prepare
node scripts/record-indexed-context.mjs compiled-context-review
```

Replay these saved bytes without candidate execution:

```bash
node dist/cli/main.js conformance replay benchmarks/results/compiled-context-selection/record.json
```

Full adoption gates are `npm test`, `npm run test:conformance`, `npm run test:compiler`, runnable Markdown/Rust examples, documentation build/static checks, formatting, and bootstrap snapshot verification. The frozen selector evaluation covers 4,632 cases and 15 fault controls; see [its result](../context-selection/README.md).

This is a continuing-session integration review using the updated system. It is not another independent coding-agent trial, a matched efficiency experiment, universal refinement, or compiler self-hosting. Native instrumentation and local build products remain trusted evidence sources. Historical records and frozen evaluator packets were preserved unchanged.
