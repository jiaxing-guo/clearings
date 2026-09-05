# Clearings development instructions

Read docs/PROTOTYPE_PLAN.md and docs/FIRST_IMPLEMENTATION_TASK.md before implementation. Treat the current milestone as the scope boundary.

- Build a TypeScript library plus CLI for repository comprehension. M0-M1 implement immutable inventory and bounded source-only structural extraction. Keep semantic interpretation out of the current M1 milestone.
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
