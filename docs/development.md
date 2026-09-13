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

QuickJS and the TypeScript transformer are compiled into the binary. Installed users do not need either development toolchain. See [execution](execution.md) for platform isolation and supported interfaces.

## Setup

Use Node.js 24 and npm 11.9.0. From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix website ci --ignore-scripts
npm run docs:dev
```

The server binds to `127.0.0.1` and prints its local address. Markdown changes in `docs/` regenerate the site content. Pass Next.js development options after `--`, for example `npm run docs:dev -- --port 3100`.

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

Keep one Rust application crate with concrete runtime, capability, routine, storage and interface modules. Add CLI/MCP operations and thin host integrations with their callers. Avoid empty packages, compatibility shims for unrelated old APIs and shared utilities without a consumer. Runtime tests must exercise the process and authorization boundaries as well as valid execution.

## Packages and complete workflows

`cargo test --locked --workspace` includes the three examples and the CLI/MCP transport. The Packages workflow builds release executables, collects dependency licenses and checks the extracted artifact. The installed binary is exercised with an empty `PATH`. The packaging scripts use Python only in development and CI; Python is not shipped or required by the product.

`python3 scripts/package.py target/release/clearings /path/to/new/package-output` creates a package from an existing release build. `python3 scripts/verify-package.py /path/to/extracted/clearings` checks it. Use a fresh output directory for each package.
