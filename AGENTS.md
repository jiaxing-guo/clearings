# Clearings development instructions

Read `README.md`, `docs/product.md`, `docs/development.md` and `docs/history.md` before implementation. Select scope from the current user request. Proposed requirements and historical plans do not authorize additional implementation.

- Product goal: turn user-selected repeated agent work into reusable routines that reduce repeated model work. Rust owns the host, embedded TypeScript preparation, isolated JavaScript execution, capabilities, and storage. Codex and Claude Code are the initial authoring interfaces.
- Generate TypeScript with the bundled routine SDK. Oxc transforms source and QuickJS executes derived JavaScript. No Node, Python, npm installation, or Rust compiler is required by installed runtime users. Full TypeScript type checking is separate from transpilation.
- Keep generated code outside the privileged host process. Require OS isolation, per-invocation grants, bounded messages, deadlines, and explicit failures. A routine manifest requests capabilities and cannot grant them. Fail closed if isolation cannot be established.
- Maintain accurate implementation status. Do not present planned behavior, illustrative interfaces, agent summaries, or test fixtures as measured production behavior.
- Keep each new component tied to a concrete requirement and caller. Recover old implementation from the historical revision only when it serves that requirement. Do not recreate an active legacy archive or add speculative shared packages.
- Preserve authorization scopes, result mapping and effect semantics. Routine reuse is different from output caching. A successful trace does not establish generality. Acceptance records are independent of candidate submission and immutable after preparation.
- Keep `docs/` as the authored reference and Fumadocs as its site. Generated content under `website/content/docs/` must not be edited or committed.
- Preserve the historical commit and the original evidence in its history. Never rewrite historical records to match the new product. Maintained documentation should link to that revision when discussing retired behavior.
- Keep the root package private until publication is explicitly in scope. Do not publish packages, deploy the site or merge a PR as an incidental development step.
- Use the pinned Prettier configuration. Run `npm run format` and `npm run check` for maintained changes. `npm run clean` removes only named build outputs and preserves saved records.
- Use Conventional Commits and capability names. Maintained code, documentation, PR metadata and commit messages must not use internal planning labels.
- Add tests for meaningful behavior and concrete risks. Report checks actually run and their scope; documentation checks do not establish runtime correctness or performance.
- Run `cargo fmt --all --check`, `cargo clippy --locked --workspace --all-targets -- -D warnings`, and `cargo test --locked --workspace` for Rust changes. Preserve the dependency lockfile. Routine errors and missing usage evidence must remain explicit.

Use plain technical prose. Define project-specific terms, keep terminology consistent, and distinguish requirements, implementation and observed results.
