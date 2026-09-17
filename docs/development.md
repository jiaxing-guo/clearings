# Development

The repository contains the native runtime, bundled plugins, examples, and the documentation site. Installed runtime users do not need the developer toolchains below.

## Set up

Use the pinned Rust toolchain and a C compiler for native components. Documentation and browser tests use Node.js 24 and npm 11.9.0. Python 3.10 or newer supports packaging checks.

```sh
rustup show
npm ci --ignore-scripts
npm run dev:setup
```

Developer setup installs website dependencies, pinned Python checks, and the Git hook. Normal root npm installation also enables Husky through `prepare`; `--ignore-scripts` skips that step.

## Validate changes

For Rust:

```sh
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

For maintained content and tools:

```sh
npm run format
npm run check
npm run lint
npm run test:hooks
python3 -m unittest discover -s tests -p 'test_*.py'
```

`npm run check` checks formatting, builds the documentation, checks TypeScript, verifies links/assets/navigation/search and source hashes, and checks SDK types. These checks do not establish runtime correctness or performance.

For the workbench browser flow:

```sh
npx playwright install chromium
npm run test:workbench
```

`CLEARINGS_TEST_BROWSER` selects an existing compatible browser. The suite uses a disposable store and local model fixture, so it needs no account credentials or paid requests.

## Commit checks

The hook formats staged supported files, runs JavaScript/TypeScript and Python lint checks, and checks shell syntax. Rust changes trigger workspace formatting and strict Clippy. Website and SDK changes trigger their type checks. Full tests remain separate checks and run in CI.

Lint-staged backs up changes, hides unstaged tracked edits, then restores them. Missing tools block a commit with a setup message; hooks do not download tools. CI validates the committed checkout.

## Documentation

`docs/` is the authored reference, with `docs/README.md` as the guide index. The root README is the repository entry point. Fumadocs renders the authored pages; do not edit or commit generated `website/content/docs/` files.

```sh
npm run docs:dev
```

The development server uses the site root. Static exports use `/clearings` by default. Set the same `DOCS_BASE_PATH` for build and check when using another prefix.

Keep relative links valid and use one H1 per page. The generator records source hashes and links each page to its Markdown source. The site owns presentation, navigation and search; product facts stay in authored documentation.

The landing page lives in `website/app/page.tsx`, with styles in `website/app/landing.css`. Its sample and workflow story are small client components under `website/components/landing/`; the rest is rendered on the server. The sample uses synthetic browser data and makes no runtime or model calls.

The documentation keeps Fumadocs navigation, static search, anchors, and code-copy controls. Shared typography and reading styles live in `website/app/global.css`. Geist fonts are bundled with their license under `website/fonts/`. Keep both surfaces in the same light theme and respect reduced-motion preferences.

## Prompts and skills

Host instructions live in `crates/clearings/prompts/` and are embedded at build time. Keep structured contracts, cases and evidence as data in their calling modules. Short tool descriptions stay beside their schemas.

Bundled skills live in the two plugin directories. Keep corresponding guidance and launch assets aligned. Use skill validation and behavioral testing when changing decision rules.

## Native packages

```sh
cargo build --locked --release --workspace
python3 scripts/package.py target/release/clearings /path/to/package-output
```

Package creation copies tracked regular files from its allowlist, includes dependency licenses, and produces checksums. Source symlinks and untracked files are excluded. `verify-package.py` tests extracted artifacts with an empty PATH, including four examples and plugin startup.

Before a release, align plugin manifests, runtime pins, and the release tag. A normal PR or main-branch check does not publish. Keep the root package private unless publication is explicitly in scope.

## Cleanup and scope

`npm run clean` removes named build outputs. It preserves source, dependencies and saved records. Never treat a user's routine store or source conversations as build garbage.

Use Conventional Commits, concrete capability names and small changes tied to real callers. Preserve locks and authorization boundaries. Add tests for meaningful behavior and failures; report the checks actually run.
