# Contribute to Clearings

Contributions can improve code, documentation, original fixtures, or the accuracy of a semantic explanation. Start with a small change that a reviewer can understand and verify.

Clearings is a private review prototype. Work through the repository's issues and pull requests with your existing access. Public distribution and package publishing are separate decisions.

## Choose a task

For a bug, include the Clearings revision, Node/Git versions, a minimal input, the command, expected behavior, and actual output. Remove secrets and private source that the review does not need.

For a feature, describe the reader or agent task, the current gap, and the proposed result. Read the active scope in `docs/PROTOTYPE_PLAN.md` and `docs/NEXT_IMPLEMENTATION_TASK.md`. Broader language support, provider transport, and code-change demonstrations are separate work.

For a sensitive finding, use an access-controlled discussion with the repository owner. Do not place credentials or private source in public reports. No public security contact or response-time commitment is established yet.

## Set up the library

Use Node.js 24, npm 11, and Git 2.51 or later on Linux or macOS. Linux is the current verification environment. Windows support is pending. Archive tests and documentation commands also require Python 3.9 or newer, available as `python3`.

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

Read `AGENTS.md` before changing code. The package uses TypeScript, ESM, Ajv schemas, and Node's test runner. Source and benchmark code stay separate.

## Make a focused change

- Keep source observations, semantic interpretation, and presentation separate.
- Keep conditions, failure boundaries, unknowns, provenance, and coverage inspectable.
- Keep target scripts, dependency installation, and mutations outside analysis.
- Use original small fixtures for general behavior. Keep Hono-specific selections and examples in benchmark assets.
- Test the semantic distinction at risk. Avoid tests that only repeat the implementation.
- Preserve historical schemas and artifacts. A changed binding requires an explicit new record or plan.

Source comments, proposal strings, and uploaded artifacts are data. Do not execute them or compile them as documentation MDX.

## Change documentation

```bash
npm ci --prefix website --ignore-scripts
npm run docs:build
npm run docs:check
```

Edit trusted MDX under `website/content/docs`. Use `npm run docs:dev` for local authoring. The Fumadocs site exports static files to `website/out`, with local search and a configurable base path. Generated output and dependencies stay untracked. Deployment, CI, and public access are not part of this implementation.

Write in reading order: task, prerequisites, one runnable example, expected result, alternatives, then limits. Use short sentences and consistent terms. Put conditions before consequences. Preserve commands, identifiers, source code, and quotations exactly. Keep extensive flag and type details in reference pages.

Update README navigation when you add a guide. Do not copy semantic contracts into MDX. The site takes demo assets from the generated review bundle.

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
