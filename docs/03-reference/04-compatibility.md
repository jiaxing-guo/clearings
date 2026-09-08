# Compatibility and evolution

Clearings retains several versioned artifact families. Choose APIs according to the artifact's schema and purpose. A version number does not identify an abstraction level, and a later schema does not imply automatic conversion of earlier content.

## Supported coexistence

| Family                           | Current role                                                    | Conversion policy                                        |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Inventory and scan v0.1          | Immutable source inventory and structural evidence              | Retained as the source-analysis foundation               |
| Semantic exchange v0.1           | Historical capability/claim models and replay                   | Remains readable through existing APIs                   |
| Function/behavior contracts v0.2 | Source-linked contract reports and bounded queries              | No implicit conversion into typed v0.3 requirements      |
| Presentation v0.1/v0.2           | Audience prose and layout bound to a specific semantic artifact | Rebinding must be explicit                               |
| Specification v0.3               | Primary typed contract model for new semantic work              | Authored intended and observed artifacts remain distinct |

The readable legacy adapter resolves English assertions while marking them `legacy-prose-only`. It does not infer a predicate equivalent to that prose. The typed Hono response model is a separately authored interpretation of a narrower slice.

## Revision rules

When semantic content changes, compute a new content identity and retain the old artifact as evidence where required. Preserve stable record IDs only when the entity's identity is intentionally maintained. There is no automatic snapshot reconciliation, rename matching, accepted-model migration, or requirement-acceptance API.

Do not convert an observed interpretation into intended requirements by changing a label. Its author, origin, review status, and requirement basis need explicit treatment. v0.3 validation enforces the perspective/origin pairing, but cannot authenticate author intent.

Any future schema migration must define input/output versions, retained information, explicitly lost information, treatment of unknowns, identity changes, and validation obligations. It must not silently discard a condition, state boundary, effect boundary, failure path, or blocking decision.

## Reproducibility artifacts

The exact [bootstrap design](../SPECIFICATION_ARCHITECTURE.md) remains at its original path because its text is embedded in [context-assembly.json](../../specifications/clearings/context-assembly.json). Its chronological statements are historical; the numbered reference defines the current documentation structure. [SEQUENCE_CHECKS.md](../SEQUENCE_CHECKS.md) remains a compatibility entry for links from that design.

The former top-level documentation is organized under [the archive](../archive/README.md). Relative Markdown links were rebased during relocation. Frozen experiment source tarballs, manifests, prompts, submissions, test inputs, and review archives remain unchanged. To reproduce a frozen run, use its archived source baseline rather than copying current documentation into that baseline.

The preserved [bootstrap demonstration](../../benchmarks/results/clearings-bootstrap/README.md) records exact bindings to its [archived source snapshot](../../benchmarks/sources/clearings-bootstrap/README.md). Preserve that snapshot, the demonstration, its checksums, and its download archive when production functions change. Generate fresh evidence against the current implementation in a separate output directory. Fresh bindings declare `source_scope: "working-tree"` and are verified against current source bytes; historical bindings remain verified against the immutable snapshot. Producing fresh evidence does not rewrite the preserved demonstration or rerun the frozen agent experiments.

## Validation compatibility

Legacy `validate` accepts inventory and scan files larger than 64 MiB. Artifact detection does not impose the specification reader's size limit on legacy validation. Specification validation retains its 64 MiB file limit. These compatibility fixes do not change schema versions or rewrite historical artifacts.

## Program IR v0.1

Program IR introduces the independent `program` artifact family and `clearings/program` entrypoint. Its v0.1 version identifies its own serialization contract, not a rollback or migration of the v0.3 operation contract. Program expressions have executable value/control-flow semantics and do not reuse the contract expression interpreter's unknown-observation rules. Existing root exports, schemas, validators, and conformance artifacts retain their current interfaces. No automatic conversion from contracts to programs is defined. See [program artifacts](06-program-artifacts.md).
