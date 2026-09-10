# Clearings development instructions

Read `README.md`, `docs/product.md`, `docs/development.md` and `docs/history.md` before implementation. Select scope from the current user request. Proposed requirements and historical plans do not authorize additional implementation.

- Product goal: make straightforward backend code run efficiently as workloads grow. The approved direction includes TypeScript and Python SDKs, service adapters, a managed runtime, CLI and MCP.
- The interface separates application logic, operation capabilities and execution policies. Templates are optional presets. The approved architecture uses an embedded Rust scheduling core, napi-rs Node bindings and PyO3 Python bindings; host languages own I/O and values. Follow docs/execution.md for the execution contract.
- The repository currently contains requirements and documentation tooling. Do not describe planned runtime behavior or illustrative API examples as implemented or measured.
- Keep each new component tied to a concrete requirement and caller. Recover old implementation from the historical revision only when it serves that requirement. Do not recreate an active legacy archive or add speculative shared packages.
- Preserve dependencies, authorization scopes, result mapping and effect semantics when implementing optimizations. Batching, reuse, retries and cancellation require explicit adapter semantics. State the scope of quota enforcement.
- Keep `docs/` as the authored reference and Fumadocs as its site. Generated content under `website/content/docs/` must not be edited or committed.
- Preserve the historical commit and the original evidence in its history. Never rewrite historical records to match the new product. Maintained documentation should link to that revision when discussing retired behavior.
- Keep the root package private until publication is explicitly in scope. Do not publish packages, deploy the site or merge a PR as an incidental development step.
- Use the pinned Prettier configuration. Run `npm run format` and `npm run check` for maintained changes. `npm run clean` removes only named build outputs and preserves saved records.
- Use Conventional Commits and capability names. Maintained code, documentation, PR metadata and commit messages must not use internal planning labels.
- Add tests for meaningful behavior and concrete risks. Report checks actually run and their scope; documentation checks do not establish runtime correctness or performance.

Use plain technical prose. Define project-specific terms, keep terminology consistent, and distinguish requirements, implementation and observed results.
