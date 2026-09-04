# Clearings

Understand and maintain agent-built codebases through evidence-backed semantic representations.

**M0 implemented:** a TypeScript library and CLI that inventory immutable Git commits. Structural extraction, capability explanations, and human/LLM presentation are subsequent milestones. The package and GitHub repository remain private.

## Install and verify

Use Node.js 24 LTS, npm 11, and Git 2.51 or later on Linux/macOS. This change was verified on Linux with Node 24.19.0, npm 11.9.0, and Git 2.51.1. Windows is not yet supported; Git isolation currently uses `/dev/null`.

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
node dist/cli/main.js --help
```

Dependencies are exact and locked: TypeScript 5.9.3, @types/node 24.13.3, and Ajv 8.20.0. M0 uses Node's test runner and argument parser. The compiler version can be revisited with the M1 adapter; target repositories do not select Clearings' compiler version.

## Inventory a local repository

```bash
node dist/cli/main.js inventory /path/to/repository --ref HEAD --include src --out /tmp/clearings-inventory.json
node dist/cli/main.js validate /tmp/clearings-inventory.json
```

Output must be a new file outside the target checkout and Git object store. Omit `--out` to use stdout only. Included/excluded paths are literal, repository-relative paths, not globs; repeat the flags as needed. With no scope flags, all tracked regular files are selected. A nonexistent include path is an error. Symlinks and submodules remain explicit excluded entries.

The CLI normalizes revisions to commit/tree hashes, reads Git tree metadata, and emits versioned JSON. It does not check out a revision, read dirty working-tree content, execute target scripts, install target dependencies, or silently fetch missing objects. Missing objects fail the operation. Working-tree and remote-URL inventory modes are not implemented.

`status: complete` means the requested **inventory** completed. Coverage always reports `parsed_files: 0` and `semantic_analysis: not-run`. Filename-based source/test labels are inventory hints. No symbols, imports, call relationships, or conceptual groups have been extracted yet.

## Run the pinned Hono benchmark

```bash
npm run benchmark:fetch
node dist/cli/main.js inventory benchmark-checkouts/hono.git --target benchmarks/targets/hono.json --scope inventory --out benchmarks/results/local/hono-inventory.json
node dist/cli/main.js inventory benchmark-checkouts/hono.git --target benchmarks/targets/hono.json --scope deep --out benchmarks/results/local/hono-deep.json
node dist/cli/main.js validate benchmarks/results/local/hono-deep.json
node scripts/verify-rubrics.mjs benchmark-checkouts/hono.git
node scripts/measure-m0.mjs benchmark-checkouts/hono.git benchmarks/results/local/hono-m0-run
```

Fetch requires a new destination and downloads the pinned commit into a **bare repository**, then verifies both commit and tree. This avoids checking out source or invoking checkout filters. It is the only command that requests network access. A failed fetch leaves its new directory available for inspection. Use a new output filename/directory for repeat artifact or measurement runs.

Hono 4.13.7 is pinned at `eebdf7be39abf0a872671835ccce0c4f03ea497a`. Its inventory has 486 tracked entries, including 311 `src` TS/TSX files. The broad scope selects 317 files: 311 TS/TSX, one JSON fixture, and five supporting configs. Deep scope selects 25 source files and those five configs. All 486 entries remain in each denominator, with exclusions recorded.

See [measured M0 results](benchmarks/results/hono-m0/summary.json) and [the M0 handoff](docs/M0_STATUS.md). The first eight [benchmark questions](benchmarks/questions/hono.json) have [source-backed rubrics](benchmarks/rubrics/hono-m0.json), authored through agent source review. They have not received independent human review and are not adjudicated gold answers. Evaluation files are never read by the analyzer; the target reader projects only repository pins and scope settings.

## Original fixture walkthrough

```bash
mkdir -p benchmark-checkouts
cp -R tests/fixtures/direct-calls benchmark-checkouts/direct-calls
git -C benchmark-checkouts/direct-calls init
git -C benchmark-checkouts/direct-calls add .
git -C benchmark-checkouts/direct-calls -c user.name="Clearings fixture" -c user.email="fixture@example.invalid" -c commit.gpgsign=false commit -m "Original fixture"
node dist/cli/main.js inventory benchmark-checkouts/direct-calls --out benchmarks/results/local/direct-calls.json
```

Use a new fixture directory. The [committed sample](benchmarks/results/fixtures/direct-calls.json) was generated from the same five-file fixture; a newly authored commit has a different commit hash and snapshot ID. Tests also exercise the original callback/dynamic-dispatch fixture.

## Library interface and boundaries

```ts
import { inventory, validateInventory } from 'clearings-semantic'

const result = inventory({ repository: '/path/to/repository', ref: 'HEAD', include: ['src'] })
validateInventory(result)
console.log(result.snapshot_id, result.coverage)
```

The M0 library is synchronous, runs bounded Git subprocesses, and performs no writes during inventory. `readTarget(path)` and `fetchTarget(target, destination)` support explicit benchmark setup. `fetchTarget` performs writes and network access only when called.

- `src/repository/`: Git revision/object access, inventory, scope, and output handling.
- `src/model/`: portable JSON types and artifact validation.
- `src/cli/`: arguments, JSON output, and exit codes.
- `schemas/`: versioned interchange schema, shipped alongside the compiled package.
- `tests/fixtures/`: original code samples, never executed by inventory.
- `benchmarks/` and evaluator scripts: pins, questions, source reviews, and measured results; separate from production imports.

JSON is the initial machine interface. Future human renderers and LLM context exporters will consume shared evidence/semantic records separately; M0 does not invent a semantic layer from file names. See [the prototype plan](docs/PROTOTYPE_PLAN.md) for those later boundaries.

The snapshot ID hashes canonical inventory data including schema/tool versions, commit/tree, normalized scope, and every entry's Git object ID. It excludes local paths, timestamps, and performance measurements. `validate` checks schema, digest, counts, ordering, and scope consistency; it does **not** re-read the repository or prove source claims. This is an integrity check, not an authenticity signature.

Successful command output and structured failures go to stdout as JSON; progress/errors go to stderr. Help/version are plain text. Exit codes are 0 for success, 1 for operational failure (including missing Git objects/revisions), and 2 for invalid arguments, pins, schema, or output destination. M0 has no partial analysis or strict semantic completeness gate.

## Next milestone and licensing

M1 adds compiler-backed structure: source spans, evidence/fact IDs, tsconfig/project-reference discovery, import/export resolution, and honest unresolved relationships. Its `scan` command is intentionally absent from M0. Follow [the first implementation task](docs/FIRST_IMPLEMENTATION_TASK.md), which spans M0 and M1, after reviewing [remaining M1 work](docs/M0_STATUS.md).

Select an open-source license before public distribution. Nothing in this private prototype applies Hono's license to Clearings or publishes an npm package.
