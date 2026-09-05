# Clearings development instructions

Read docs/PROTOTYPE_PLAN.md, docs/NEXT_IMPLEMENTATION_TASK.md, and docs/SEMANTIC_EXCHANGE.md before implementation. Read docs/SEMANTIC_CONTRACTS.md for the completed contract APIs. The next scope is shared report/demo integration and a recorded agent comprehension run. Historical plans and handoffs do not override the active task.

- Product name: Clearings. Slogan: "Internal representation for AI coding".
- Build one TypeScript library plus CLI. The first prototype needs PM and engineer reports plus an internal-representation demo over the same Hono model. Function and behavior contracts, inspection, and bounded context are implemented. The next task connects the reports and internal demo to that model. A code-change demo is optional and separate. Broader Hono coverage and other repositories/languages remain subsequent work.
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

Write all technical explanations in ASD-STE100 Simplified Technical English while preserving necessary domain-specific terms. Use in every Codex conversation for technical answers, plans, reports, diagnoses, instructions, status updates, and explanations. Do not change code, equations, commands, identifiers, citations, quotations, logs, or exact formal text unless the user asks for that change.

- Keep one consistent term for each concept. Put conditions before their consequences.
- Follow the reading order in docs/READING_GUIDES.md for human reports. Keep presentation data separate from semantic records. Preserve exact source text and make partial code ranges clear.
- Start the overview with purpose and outcomes. Start the engineer guide with one concrete case, then explain its mechanism and alternatives. Keep function summaries and source audit as reference material.
