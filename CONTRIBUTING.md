# Contribute to Clearings

Contributions can improve code, documentation, original fixtures, or the accuracy of a semantic explanation. Start with a small change that a reviewer can understand and verify.

Clearings is a private review prototype. Work through the repository's issues and pull requests with your existing access. Public distribution and package publishing are separate decisions.

## Choose a task

For a bug, include the Clearings revision, Node/Git versions, a minimal input, the command, expected behavior, and actual output. Remove secrets and private source that the review does not need.

For a feature, describe the reader or agent task, the current gap, and the proposed result. Read the [technical reference](docs/README.md) and [status and roadmap](docs/05-development/01-status-and-roadmap.md). Broader language support, provider transport, and code-change demonstrations are separate work.

For a sensitive finding, use an access-controlled discussion with the repository owner. Do not place credentials or private source in public reports. No public security contact or response-time commitment is established yet.

## Set up the library

Use Node.js 24, npm 11, and Git 2.51 or later on Linux or macOS. Linux is the current verification environment. Windows support is pending. Archive tests and documentation commands also require Python 3.9 or newer, available as `python3`.

```bash
npm ci --ignore-scripts
npm run format:check
npm run typecheck
npm test
```

Read `AGENTS.md` before changing code. The package uses TypeScript, ESM, Ajv schemas, and Node's test runner. Source and benchmark code stay separate.

For context-assembly or conformance changes, also run `npm run test:conformance`. This checks the recorder/evaluator/CLI regressions, all 1,554 inputs against production and an independent positive control, and the predefined executable fault suite. `npm run test:conformance:smoke` provides a smaller development run. The [suite manifest](specifications/clearings/conformance/suite.json) fixes input and control hashes; do not regenerate it to conceal a regression. The [evaluation guide](docs/04-guides/04-evaluate-context-conformance.md) explains the acceptance boundary and saved-evidence replay.

For the Rust backend, install [rustup](https://rust-lang.org/tools/install/) and read the [backend contract](docs/03-reference/09-rust-backend.md). Run `npm run test:rust` and `npm run check:rust`; these select the toolchain pinned under `runtime/rust/` and test the dependency-free crate offline after toolchain installation. Use `npm run format:rust` for Rust formatting. The compiler frontend and reference interpreter remain TypeScript, and ordinary library use does not require Rust.

## Format and clean

Run `npm run format` before committing. The pinned Prettier configuration applies to maintained library, CLI, documentation, and website files; `npm run format:check` enforces it in CI. Frozen evidence, generator-owned artifacts, intentional fixtures, and four source files with historical byte bindings are excluded. See [Repository maintenance](docs/05-development/05-repository-maintenance.md) for the exact boundaries and renamed benchmark scripts.

Use `npm run clean` to remove generated library and documentation build products. Stop development servers first, then rebuild with `npm run build` or `npm run docs:dev`. Recorded runs and dependencies are retained.

## Make a focused change

- Keep source observations, semantic interpretation, and presentation separate.
- Keep conditions, failure boundaries, unknowns, provenance, and coverage inspectable.
- Keep target scripts, dependency installation, and mutations outside analysis.
- Use original small fixtures for general behavior. Keep Hono-specific selections and examples in benchmark assets.
- Test the semantic distinction at risk. Avoid tests that only repeat the implementation.
- Preserve historical schemas and artifacts. A changed binding requires an explicit new record or plan.

Source comments, proposal strings, and uploaded artifacts are data. Do not execute them or compile them as documentation MDX.

## Change documentation

Author the current technical reference as Markdown under `docs/`. Read [documentation maintenance](docs/05-development/02-documentation.md) for organization, terminology, semantic authority, and historical-source preservation.

```bash
npm run docs:check:markdown
```

The command builds the library, checks local Markdown navigation, and executes trusted reference examples. Use standard technical language and distinguish implemented semantics, proposed abstractions, and external assumptions. Update the documentation index when adding a page.

Fumadocs under `website/` renders the current reference from `docs/`. Run `docs:build` and `docs:check` after changing documentation or navigation. Use `npm run docs:dev` and open `http://localhost:3000` for local preview. Canonical Markdown edits regenerate automatically. Restart after changing library code, specification fixtures, or asset generators. Generated files under `website/content/docs/technical/` are ignored and must not be edited directly. Do not compile source excerpts or semantic proposal strings as MDX.

## Review an explanation

Record the semantic artifact ID, assertion ID, relevant source span, and your assessment: supported, contradicted, or uncertain. Explain the condition that makes a claim correct or incorrect.

Also check missing behavior. Individually correct claims can still omit a consequential branch. Keep source validity, claim support, and presentation acceptance separate. Identify whether the reviewer is the author or an independent reviewer. Do not mark an independent gate passed from author self-review.

## Reproduce benchmark changes

```bash
npm run benchmark:fetch
node scripts/replay-contracts.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts
node scripts/build-shared-demo.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts benchmarks/results/local/my-demo
python3 scripts/package-shared-demo.py benchmarks/results/local/my-demo
node scripts/check-shared-demo.mjs benchmarks/results/local/my-demo
```

Skip the fetch command when the pinned bare checkout already exists. Use new output directories. Keep source notices with distributed excerpts. Do not overwrite historical results to make a new run appear unchanged.

## Open a pull request

Use Conventional Commits, for example `fix: preserve callback uncertainty in reports`. Use the same style for the PR title. Commit and PR text describe behavior and omit internal planning labels.

Explain the problem, the change, and the resulting behavior. Include the checks actually run and material limits. For generated artifacts, include reproduction commands and binding information. State browser policy blocks instead of claiming that static checks establish interactive behavior.

Respond to review findings with a fix or a source-backed reason. A maintainer reviews and merges the change. Do not publish a package, change repository visibility, or enable deployment as part of a routine contribution.
