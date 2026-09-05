# Clearings development instructions

Read docs/PROTOTYPE_PLAN.md, docs/FIRST_IMPLEMENTATION_TASK.md, and docs/SEMANTIC_EXCHANGE.md before implementation. Treat the current milestone as the scope boundary.

- Build a TypeScript library plus CLI for repository comprehension. The current scope is file-based semantic proposal requests/import, recorded replay, evidence validation, and two capability pages, built on immutable inventory and structural extraction. Broader context selection and diagrams remain subsequent work.
- Keep repository evidence, semantic interpretation, and presentation as separate responsibilities.
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
