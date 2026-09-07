# Clearings technical documentation

Clearings represents repository structure and proposed behavior, constructs bounded agent context, and checks supplied observations against typed contracts. This directory is the canonical Markdown reference for its semantics and abstraction boundaries.

## Reading order

| Order | Document | Question answered |
| --- | --- | --- |
| 1 | [System architecture](01-architecture/01-system.md) | What does Clearings implement, and where are the trust boundaries? |
| 2 | [Representation inventory](01-architecture/02-representations.md) | Which models exist, and which artifacts are derived views? |
| 3 | [Abstraction and refinement](01-architecture/03-abstraction-and-refinement.md) | How does a contract relate to concrete program behavior? |
| 4 | [Values and expressions](02-semantics/01-values-and-expressions.md) | What do types, predicates, and unknown values mean? |
| 5 | [Operation contracts](02-semantics/02-operations.md) | What do outcomes, state frames, effects, and dependencies require? |
| 6 | [Observations and sequences](02-semantics/03-observations-and-sequences.md) | How are verdicts computed, and what do they establish? |
| 7 | [Identity and validation](03-reference/01-identity-and-validation.md) | What is validated, bound by a digest, or still unverified? |
| 8 | [Context and projections](03-reference/02-context-and-projections.md) | What does selection preserve, and how are budgets enforced? |
| 9 | [API and CLI](03-reference/03-api-and-cli.md) | Which interfaces implement each operation? |
| 10 | [Compatibility](03-reference/04-compatibility.md) | How do versions and historical artifacts coexist? |
| 11 | [Check a Hono case](04-guides/01-check-a-case.md) | How do I inspect and evaluate an existing model? |
| 12 | [Author and review a specification](04-guides/02-author-and-review.md) | How do I construct a contract and test its meaning? |
| 13 | [Status and development roadmap](05-development/01-status-and-roadmap.md) | Which capabilities and bootstrap milestones are established? |
| 14 | [Documentation maintenance](05-development/02-documentation.md) | How do I change this reference and verify it? |

For a first practical example, start with **Check a Hono case**. For a language or architecture change, read documents 1–8 first.

## Status and authority

This reference describes the implemented v0.3.0 contract language and its relationship to the v0.1/v0.2 models. It does not introduce a schema revision or a new runtime abstraction. References to future implementation IRs and refinement checks are explicitly identified as proposals.

Sections on semantics and interfaces specify the current contract. Architecture explanations, examples, and roadmap proposals have different roles. If source, schema, tests, and reference disagree, record a defect and resolve the discrepancy explicitly. Passing schema validation does not override semantic requirements; a prose sentence does not become an executable predicate by appearing beside one.

The terms **must**, **must not**, and **may** express requirements or permitted behavior within the stated interface and scope. They do not imply that the checker establishes every requirement. Each relevant page identifies enforcement limits.

## Organization and publishing

Numbered directories and filenames define a stable reading order. Documents use ordinary Markdown, relative repository links, tables, and fenced examples. The new reference does not depend on Fumadocs, MDX, generated site assets, or a server. Integrating this reference into Fumadocs is subsequent work; the existing website remains a separate, historical presentation.

[Historical plans and implementation reports](archive/README.md) are retained for provenance. Two root files remain for compatibility: [the original bootstrap design](SPECIFICATION_ARCHITECTURE.md), whose exact text is embedded in the context-assembly specification, and [the sequence guide entry](SEQUENCE_CHECKS.md), which preserves a link from that design. Use the numbered reference for current semantics.
