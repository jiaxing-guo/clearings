# Production adoption of compiled dependency closure

The goal is for ordinary context assembly to execute dependency closure from compiled Program IR. The four dependent changes preserve historical evidence, prepare reusable executables, integrate the production caller, and verify the installed workflow.

## Implemented preparation

Historical bindings now reference the [preserved source snapshot](../../benchmarks/sources/clearings-bootstrap/README.md). `prepareRustProgram` separates compilation from invocation and supports an explicit local cache. Every invocation starts a fresh native process, admits fresh arguments, resets accounting, and verifies the prepared executable. Cache identity includes the program's compiled artifact, runtime through that artifact, driver, toolchain/options, platform, and architecture. Cached binaries remain local trusted build products.

## Production compatibility decision

Integration preserves the synchronous context API, whole-specification validation before root resolution and traversal, required-edge selection, breadth-first/UTF-16 ordering, input ownership, and exact successful serialization. Byte-budget accounting remains a separate operation after projection.

Native execution introduces explicit operational requirements and finite execution limits. The context policy `context-native-v1` uses the existing maximum Program IR limits: 10,000,000 work units, 10,000,000 allocation units, 1,000,000 peak value units, and evaluation depth 256. Existing argument preparation and process bounds remain applicable. An input accepted by specification validation can exceed these limits; this is an explicit compatibility addition, not a claim of identical successful input domains. It must produce `CONTEXT_RESOURCE` with exit status 3 and retain the underlying diagnostic, rather than a partial context or `CONTEXT_BUDGET`. Native infrastructure failures remain operational failures. There is no automatic TypeScript fallback.

The adapter converts all operation records to the portable graph representation; it does not implement traversal in host code. Whole-specification validation still rejects missing required references outside the reached closure. The pinned IR program checks its own duplicate-record and reached-reference conditions. Success/failure mapping must preserve these different scopes.

Production integration uses an owned cache outside package source, with an explicit environment override for isolated consumers. Setup and CI must prepare it before bounded recording so compilation does not consume the worker's invocation deadline. Cold ordinary use can prepare on demand; warm invocation needs no Rust compiler. Package documentation must identify Rust and host-linker prerequisites for a cache miss.

## Adoption evidence

Fresh recording must include Program IR and Rust source inventories, plus observed native program/artifact/build identities and logical usage. These identities establish content bindings and reported execution context, not authentication against a malicious candidate. They must not change semantic context bytes. Historical records remain readable without native metadata.

The final gate retains the full context-conformance domain, independent expectations, fault controls, native compiler tests, installed-package checks, source snapshot verification, and runnable documentation. The ordinary caller now uses the compiled algorithm, and the local adoption gates have recorded passing results. Hosted CI and PR review remain integration gates; the implementation does not establish universal refinement or self-hosting.

Agent-authored IR changes, new language effects, optimization, additional targets, and self-hosting follow this implementation scope.

## Review and integration order

| PR                                                     | Purpose                                    | Review boundary                                                                                      |
| ------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [21](https://github.com/jiaxing-guo/clearings/pull/21) | Preserve exact historical source evidence  | Snapshot integrity and source-binding reproduction                                                   |
| [22](https://github.com/jiaxing-guo/clearings/pull/22) | Prepare reusable native executables        | Cache identity, lifetime, fresh per-invocation state, and measured preparation cost                  |
| [23](https://github.com/jiaxing-guo/clearings/pull/23) | Adopt compiled closure in context assembly | Caller compatibility, explicit resource policy, and v0.2 execution records                           |
| Final adoption gate                                    | Validate the ordinary installed workflow   | Independent context conformance, IR mutation control, native failure controls, CI, and documentation |

All four dependent PRs are merged. Their review order is retained here as implementation history. The [fresh adoption observation](../../benchmarks/results/native-context-adoption-20260908/README.md) preserves one recorded production invocation and explains how to reproduce the full gates.
