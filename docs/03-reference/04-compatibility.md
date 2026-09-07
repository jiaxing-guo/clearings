# Compatibility and evolution

This documentation reorganization does not change schemas, public runtime behavior, specification identities, or historical experiment inputs. The current package contains several versioned artifact families; the version numbers do not define a compiler lowering hierarchy.

## Supported coexistence

| Family | Current role | Conversion policy |
| --- | --- | --- |
| Inventory and scan v0.1 | Immutable source inventory and structural evidence | Retained as the source-analysis foundation |
| Semantic exchange v0.1 | Historical capability/claim models and replay | Remains readable through existing APIs |
| Function/behavior contracts v0.2 | Source-linked contract reports and bounded queries | No implicit conversion into typed v0.3 requirements |
| Presentation v0.1/v0.2 | Audience prose and layout bound to a specific semantic artifact | Rebinding must be explicit |
| Specification v0.3 | Primary typed contract model for new semantic work | Authored intended and observed artifacts remain distinct |

The readable legacy adapter resolves English assertions while marking them `legacy-prose-only`. It does not infer a predicate equivalent to that prose. The typed Hono response model is a separately authored interpretation of a narrower slice.

## Revision rules

When semantic content changes, compute a new content identity and retain the old artifact as evidence where required. Preserve stable record IDs only when the entity's identity is intentionally maintained. There is no automatic snapshot reconciliation, rename matching, accepted-model migration, or requirement-acceptance API.

Do not convert an observed interpretation into intended requirements by changing a label. Its author, origin, review status, and requirement basis need explicit treatment. v0.3 validation enforces the perspective/origin pairing, but cannot authenticate author intent.

Any future schema migration must define input/output versions, retained information, explicitly lost information, treatment of unknowns, identity changes, and validation obligations. It must not silently discard a condition, state boundary, effect boundary, failure path, or blocking decision.

## Reproducibility artifacts

The exact [bootstrap design](../SPECIFICATION_ARCHITECTURE.md) remains at its original path because its text is embedded in [context-assembly.json](../../specifications/clearings/context-assembly.json). Its chronological statements are historical; the numbered reference defines the current documentation structure. [SEQUENCE_CHECKS.md](../SEQUENCE_CHECKS.md) remains a compatibility entry for links from that design.

The former top-level documentation is organized under [the archive](../archive/README.md). Relative Markdown links were rebased during relocation. Frozen source tarballs, manifests, prompts, submissions, test inputs, and generated review archives remain unchanged. To reproduce a frozen run, use its archived source baseline rather than copying current documentation into that baseline.

## Known limitations

The shared CLI JSON type probe applies a 64 MiB limit to legacy validation, although the legacy inventory/scan schema does not impose that size limit. This regression remains separate runtime work. No schema migration or Fumadocs integration is implemented by the documentation change.
