# Clearings development instructions

Read docs/README.md, docs/01-architecture/01-system.md, docs/01-architecture/02-representations.md, and docs/05-development/01-status-and-roadmap.md before implementation. For typed semantic changes, read the three documents in docs/02-semantics and the affected interfaces in docs/03-reference. Select implementation scope from the current user request. Archived plans and handoffs do not override the active task.

The numbered Markdown reference defines current semantics and abstraction boundaries. New semantic work uses operation contracts with explicit guards, postconditions, state frames, effects, and decisions. Keep intended requirements separate from observed implementation. Context packages and reports are projections. Observation agreement does not establish source refinement. docs/SPECIFICATION_ARCHITECTURE.md is a preserved historical source embedded in the bootstrap specification; do not edit it during routine documentation changes.

- Product name: Clearings. Slogan: "Internal representation for AI coding".
- Build one TypeScript library plus CLI. The first prototype needs PM and engineer reports plus an internal-representation demo over the same Hono model. Function and behavior contracts, inspection, and bounded context are implemented. The reports and internal demo now use that model. The current technical reference uses ordered Markdown under docs/. Fumadocs renders this reference from generated Markdown pages, with ordered navigation and static search. Keep docs/ as the authoritative source. CI and public access remain separate scope decisions. A code-change demo is optional and separate. Broader Hono coverage and other repositories/languages remain subsequent work.
- Keep repository evidence, semantic interpretation, and presentation as separate responsibilities. Reports and agent context consume the same canonical contracts; presentation data owns audience prose and layout.
- Do not execute target-repository scripts, modify its source, or install its dependencies during a scan.
- Keep compiler API objects and provider SDK types out of the semantic interchange model.
- Preserve unknowns and coverage information. An evidence pointer resolving does not establish that it supports a narrative claim.
- Keep benchmarks/questions and future gold answers out of analyzer inputs and prompts.
- Do not hard-code Hono capabilities, paths, or expected answers in production extraction logic. Scope configuration and evaluator references are allowed.
- Do not present recorded model replay as fresh analysis. Label manual examples clearly.
- Prefer one package with clear internal modules. Add dependencies and abstractions only for current milestone requirements.
- Test the semantic distinctions at risk, including type-only imports, unresolved calls, and stale evidence. Avoid tests that merely duplicate implementation.
- Do not publish packages, make the repository public, or change unrelated repositories as part of prototype development.
- Report completed work, verification actually run, and remaining limitations separately.

- Use Conventional Commits. PR titles, descriptions, and commit messages describe behavior and must not include internal milestone labels.

## Technical prose

Use standard technical language, including established compiler, programming-language, and formal-methods terminology. Define project-specific terms. Distinguish well-formedness, integrity, source authentication, claim support, observation agreement, refinement, and acceptance. Preserve code, equations, commands, identifiers, citations, quotations, logs, and exact formal text unless the user requests a change.

- Keep one consistent term for each concept. Put conditions before their consequences.
- Follow the reading order in docs/04-guides/02-author-and-review.md for human reports. Keep presentation data separate from semantic records. Preserve exact source text and make partial code ranges clear.
- Start the overview with purpose and outcomes. Start the engineer guide with one concrete case, then explain its mechanism and alternatives. Keep function summaries and source audit as reference material.
