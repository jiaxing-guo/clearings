# Development

The active build includes the Rust routine runtime and the documentation site. Runtime execution and documentation validation are separate gates.

## Runtime development

Install Rustup and a C compiler. `rust-toolchain.toml` selects the compiler, formatter and Clippy versions. Build and validate from the repository root:

```sh
cargo build --locked --workspace
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

Release builds use one code generation unit with thin LTO. This avoids the undefined hidden generic symbols observed with the pinned compiler when linking the expanded runtime across multiple units.

QuickJS and the TypeScript transformer are compiled into the binary. Installed users do not need either development toolchain. See [execution](execution.md) for platform isolation and supported interfaces.

## Agent prompts

Long host-owned instructions live in `crates/clearings/prompts/`, grouped by learning, agent integration and model requests. `src/prompts.rs` embeds them at build time with `include_str!`; installed users need no prompt files or additional configuration.

Prompt files contain exact text, including whitespace, and use plain text to avoid Markdown formatting changes. Client request assembly adds its separator explicitly. The configured response prompt has one `{field}` placeholder, replaced by its dedicated Rust function. Keep conversations, contracts, schemas and acceptance cases as structured data in the calling modules. Permission checks and execution limits remain enforced in Rust.

Keep short tool descriptions beside their schemas. Bundled skills remain in the plugin skill directories because they guide the coding agent outside these internal calls. Review wording changes separately from file moves, and run the runtime checks after either change.

## Setup

Use Node.js 24 and npm 11.9.0. From the repository root:

```sh
npm ci --ignore-scripts
npm run dev:setup
npm run docs:dev
```

The server binds to `127.0.0.1` and prints its local address. Markdown changes in `docs/` regenerate the site content. Pass Next.js development options after `--`, for example `npm run docs:dev -- --port 3100`.

## Commit checks

After installing root npm dependencies, `npm run dev:setup` installs website dependencies, pinned Ruff in `.venv-tools/`, and the Husky Git hook. It uses Python 3.10 or newer. The existing pinned Rust toolchain is also required for Rust changes. An agent can complete setup for the contributor. These are developer dependencies only.

Normal root npm installation enables Husky through `prepare`. Installation with `--ignore-scripts` skips that step, so run developer setup explicitly. Hooks apply to CLI and graphical Git clients that use this checkout. Node.js 24 must be available to the client. Missing tools block the commit with a setup message; hooks never install tools or download Cargo dependencies.

The hook formats supported staged files with Prettier and Python files with Ruff, checks basic JavaScript/TypeScript and Python lint rules, and checks shell syntax. Plain-text prompts are not formatted. Rust changes trigger workspace formatting checks and strict Clippy once. Website source or configuration changes trigger type generation and TypeScript checks; SDK changes trigger SDK type checks. Shared check configuration changes also check existing tracked files. Workspace checks do not rewrite Rust files.

Lint-staged backs up changes and hides unstaged tracked edits while checks run, then restores them. A failed check blocks the commit and restores the original staged changes. New untracked files remain in the working directory; these checks do not claim a fully isolated reproduction of the Git index. CI validates the committed checkout.

Use `npm run lint` for all tracked non-Rust source checks and `npm run test:hooks` for disposable-repository hook tests. Full Rust tests, Python packaging tests and documentation builds remain separate checks and run in CI. Local hooks are a convenience; CI remains required even when a hook is bypassed.

## Validation

```sh
npm run format
npm run check
```

`check` runs the formatter check, production site build, website typecheck and static verification. Verification checks internal links and fragments, local HTML assets, generated source hashes, navigation, historical routes and static search. It does not execute a service workload or test browser interaction.

The build exports to `website/out/`, using `/clearings` as its default URL prefix. Set the same `DOCS_BASE_PATH` for build and check when using a different prefix. For a site hosted at the domain root:

```sh
DOCS_BASE_PATH= npm run check
```

The development server defaults to an empty prefix. No build or check command deploys the site.

## Documentation sources

- Edit the Markdown in `docs/`; each page starts with one H1 title. `README.md` becomes `/docs`, and other filenames become `/docs/<name>`.
- `scripts/prepare-docs.mjs` generates Fumadocs content and a source manifest. Relative links between documentation pages become site routes. Other existing repository files link to the current source revision.
- Keep relative Markdown links within the repository and outside fenced examples. Use ordinary inline Markdown links; the projection does not support reference-style links or authored JSX.
- `website/` owns layout, styling, search and static export. Generated content is ignored by Git.
- The historical route map preserves earlier documentation entry points as clearly labeled pages linking to their original source revision. Those pages are excluded from the current search index and navigation.

## Cleaning generated files

```sh
npm run clean
```

This removes the named documentation outputs, generated content and type caches. It also removes earlier generated library, native build and demo outputs when updating an existing checkout. It preserves source files, installed dependencies and saved records. Run it once after switching from the historical implementation.

## Scope of future code

Keep one Rust application crate with concrete runtime, capability, routine, storage and interface modules. Add CLI/MCP operations and thin host integrations with their callers. Avoid empty packages, compatibility shims for unrelated old APIs and shared utilities without a consumer. The repository sets `RUST_TEST_THREADS=4` because tests in one process share the deliberately bounded I/O pool; high-core machines must not exhaust that pool through unrelated test concurrency. Runtime tests must exercise the process and authorization boundaries as well as valid execution.

## Packages and complete workflows

`cargo test --locked --workspace` includes the three examples and the CLI/MCP transport. The Packages workflow builds release executables, collects dependency licenses and checks the extracted artifact. The installed binary is exercised with an empty `PATH`. The packaging scripts use Python only in development and CI; Python is not shipped or required by the product.

`python3 scripts/package.py target/release/clearings /path/to/new/package-output` creates a package from an existing release build. `python3 scripts/verify-package.py /path/to/extracted/clearings` checks it. Use a fresh output directory for each package.

## Plugin packaging

The root marketplace catalogs select `plugins/clearings` for Codex and `integrations/claude-code/plugins/clearings` for Claude Code. Keep their launcher, hook configuration and runtime-version files identical. The SessionStart hook runs `plugin-register` with bounded host JSON on stdin; MCP has no registration operation and can only select existing projects. `python3 -m unittest discover -s tests -p 'test_*.py'` checks tracked source selection, bootstrap verification, offline reuse and concurrent installation. `plugin_transport` tests exercise real MCP processes and project boundaries.

Package creation embeds the native binary and all dependency license notices in both plugin roots. `scripts/verify-package.py` copies each into a client cache and connects it to a separate working project with an empty `PATH`. Packaging does not require the plugin bootstrap release to exist. Before publishing a version tag, update both plugin manifests, both runtime-version files and the Claude marketplace version together. The Packages workflow verifies that the runtime pins match the tag, validates native artifacts, then publishes the archives and checksums. PR builds remain downloadable review artifacts.
