# Development

The repository builds documentation and a host-independent Rust execution core. Native SDK packages and the CLI are not implemented in this change.

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

Add SDKs, adapters, a runtime and CLI/MCP implementations with their actual callers and behavior checks. Python and runtime CI should arrive with real packages. The approved core is embedded Rust; Node and Python retain host I/O and payload ownership. See the [execution contract](execution.md). Avoid empty packages, compatibility shims for unrelated old APIs and shared utilities without a consumer.

## Execution core

Install Rust with rustup; `rust-toolchain.toml` selects the pinned toolchain and components.

```sh
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
node scripts/check-protocol.mjs
```

The core tests use injected time and fake host completions. They establish scheduling and lifecycle behavior without claiming real-service performance. `contracts/protocol.schema.json` is generated from Rust types; `contracts/execution-cases.json` contains separately authored public-result expectations.
