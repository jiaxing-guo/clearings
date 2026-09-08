# Clearings development instructions

Read docs/README.md, docs/01-architecture/01-system.md, docs/01-architecture/02-representations.md, and docs/05-development/01-status-and-roadmap.md before implementation. For typed semantic changes, read the three documents in docs/02-semantics and the affected interfaces in docs/03-reference. Select implementation scope from the current user request. Archived plans and handoffs do not override the active task.

The numbered Markdown reference defines current semantics and abstraction boundaries. New semantic work uses operation contracts with explicit guards, postconditions, state frames, effects, and decisions. Keep intended requirements separate from observed implementation. Context packages and reports are projections. Observation agreement does not establish source refinement. docs/SPECIFICATION_ARCHITECTURE.md is a preserved historical source embedded in the bootstrap specification; do not edit it during routine documentation changes.

- Product name: Clearings. Goal: a compiler and execution runtime for agentic coding, with explicit operation contracts and typed implementation IR.
- Build one TypeScript library plus CLI. Prioritize program semantics, deterministic compilation, execution, and independent evaluation. The current foundation includes typed operation contracts, bounded executable conformance, and Program IR with a reference interpreter and one authored Clearings algorithm. The Rust backend in docs/05-development/06-rust-backend-plan.md now includes deterministic compilation, bounded conformance, and the library/CLI/package workflow. Production adoption requires explicit compatibility and evidence migration; a plan does not authorize implementing it outside the current task. Source analysis, context assembly, and reports support the compiler workflow. Preserve the Hono demonstrations as evidence for their recorded scope; expanding those demonstrations is not the default development priority.
- Keep docs/ as the authoritative technical reference. Fumadocs renders its numbered Markdown with reading paths, worked examples, and static search. Follow docs/05-development/02-documentation.md and distinguish implemented behavior from proposed architecture. Existing CI checks are part of validation; public access and deployment remain separate scope decisions.
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

- Use the pinned Prettier configuration for maintained files. Run `npm run format` and `npm run format:check`; respect `.prettierignore` for frozen evidence and generator-owned data. Use `npm run clean` for generated build products. See docs/05-development/05-repository-maintenance.md for exclusions and repository organization.
- Use Conventional Commits. PR titles, descriptions, and commit messages describe behavior and must not include internal milestone labels.
- The approved backend target is Rust. Keep the compiler frontend and reference interpreter in TypeScript. Runtime primitives live in runtime/rust/; read docs/03-reference/09-rust-backend.md before changing them. Use the pinned Rust toolchain, `npm run format:rust`, `npm run check:rust`, and `npm run test:rust`. Preserve the Program IR value domain and logical accounting independently of Rust host behavior. Do not implement graph-specific operations in the runtime.

## Technical prose

Use standard technical language, including established compiler, programming-language, and formal-methods terminology. Define project-specific terms. Distinguish well-formedness, integrity, source authentication, claim support, observation agreement, refinement, and acceptance. Preserve code, equations, commands, identifiers, citations, quotations, logs, and exact formal text unless the user requests a change.

- Keep one consistent term for each concept. Put conditions before their consequences.
- Follow the reading order in docs/04-guides/02-author-and-review.md for human reports. Keep presentation data separate from semantic records. Preserve exact source text and make partial code ranges clear.
- Start the overview with purpose and outcomes. Start the engineer guide with one concrete case, then explain its mechanism and alternatives. Keep function summaries and source audit as reference material.
