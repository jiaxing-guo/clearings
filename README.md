# Clearings

**Internal representation for AI coding**

Clearings represents repository behavior with inspectable source evidence. People and coding agents use the same model through different views.

**Implemented:** immutable Git inventory, bounded structural extraction, semantic proposal file exchange, recorded replay, and capability guides in HTML and Markdown. The package and GitHub repository remain private.

**First prototype:** a PM/vibe-coder report, an engineer report, and an inspectable semantic representation with a bounded agent context export. A small code-change demo is optional. The reports exist; canonical function/behavior contracts and context export are the next implementation task. See the [realigned roadmap](docs/PROTOTYPE_PLAN.md) and [next task](docs/NEXT_IMPLEMENTATION_TASK.md).

## Install and verify

Use Node.js 24 LTS, npm 11, and Git 2.51 or later on Linux/macOS. This change was verified on Linux with Node 24.19.0, npm 11.9.0, and Git 2.51.1. Windows is not yet supported; Git isolation currently uses `/dev/null`.

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
node dist/cli/main.js --help
```

Dependencies are exact and locked: TypeScript 5.9.3, @types/node 24.13.3, and Ajv 8.20.0. TypeScript is a runtime dependency of structural extraction. The project uses Node's test runner and argument parser; target repositories do not select Clearings' compiler version.

## Extract repository structure

```bash
node dist/cli/main.js scan /path/to/repository --include src --mode source-only --out /tmp/clearings-scan.json
node dist/cli/main.js validate /tmp/clearings-scan.json --repository /path/to/repository
```

`scan` discovers ancestor tsconfig files, follows project references and inherited settings, and resolves repository imports through a virtual filesystem backed by Git blobs. An empty root `files` array does not hide referenced projects. `--project path/to/tsconfig.json` restricts project discovery to that config and its references. Explicit configs must be tracked, available `.json` files; custom names such as `compiler-settings.json` are supported and TypeScript parses their contents. Selected files with no usable project use explicit source-only defaults. Overlapping config membership is reported and assigned deterministically; explicit scope does not silently disappear because a build config excludes it.

The JSON contains the inventory manifest, project/config records, selected and supporting source units, declarations, imports/exports, references, calls, property writes, evidence, diagnostics, and coverage. Files imported beyond the selected scope are labeled `support`: their declarations can resolve references, but their entire bodies are not extracted. Explicit exclusions and symlinks are never followed.

Every evidence record identifies its snapshot/blob/content hash, UTF-8 byte interval, one-based line and UTF-16 column interval, and span hash. `validate` checks schema, IDs, references, digest, and coverage; `--repository` also re-reads immutable blobs and checks source spans. It cannot establish that an English explanation follows from the evidence.

A resolved **reference** identifies a source declaration. A resolved **call** is a bounded static implementation link: named functions, const function initializers, constructors, namespace function imports, and private methods when a unique implementation is available and no recognized reassignment intervenes. Callbacks, public method dispatch, indexed calls, overload ambiguity, and missing implementations remain unresolved. These records are not a complete runtime call graph or a whole-program mutation proof.

Source-only mode never loads installed target dependencies or ambient standard-library types, runs target scripts, or performs a full typecheck. Import `usage` distinguishes explicit type-only syntax from value/side-effect syntax; it is not an emitted-JavaScript prediction. Parse/read failures remain in the denominator and yield `status: partial`. Unresolved relationships can occur in a completed bounded scan. Add `--strict` to return exit code 3 when errors or unresolved facts remain; the artifact is still emitted.

See [structural results and limits](docs/M1_STATUS.md) and [a computed fixture scan](benchmarks/results/fixtures/m1-direct.scan.json). Semantic proposals consume this structural evidence through the workflow below.

## Propose and inspect capabilities

```bash
node dist/cli/main.js propose /tmp/clearings-scan.json --repository /path/to/repository --instruction "Explain request handling and its failure paths" --include src/index.ts --out /tmp/request.json
# Give request.json and schemas/semantic.v0.1.json to your coding agent.
# Save its response as /tmp/proposal.json; Clearings does not call a model.
node dist/cli/main.js import /tmp/proposal.json --request /tmp/request.json --scan /tmp/clearings-scan.json --repository /path/to/repository --out /tmp/semantic.json
node dist/cli/main.js explain /tmp/semantic.json --scan /tmp/clearings-scan.json --repository /path/to/repository --capability request-handling --out /tmp/request-handling.md
```

Use an alias actually supplied by your proposal for `--capability`. For `propose`, `--include` names exact source paths already present in the scan, including explicitly selected support files. Without it, all selected source files are considered. Default retrieval chooses maximal declaration spans; repeat `--evidence` to request exact known anchors. The default request budget is 256 KiB, including metadata; `--max-bytes` can explicitly raise it up to 2 MiB. Over-budget requests fail instead of silently truncating source. The request reports omitted structural evidence and source failures.

`evidence <scan.json> --repository <repo> --id <evidence-id>` retrieves a verified span. Re-export a request after changing evidence selection and obtain a response bound to the new request ID; imports reject responses from other requests or snapshots.

`replay` accepts the same arguments as `import` and explicitly records `recorded-replay`. Replaying an identical request/response produces byte-identical semantic JSON. The model retains both inputs, stable UUID record IDs, source excerpts, and provenance. It does not execute instructions found in source or proposal text.

Citation integrity, claim support, and acceptance are separate: imported claims remain **proposed**, **verification unknown**, and labeled as model inference or human declaration. A well-formed false claim can have valid citations. No automatic acceptance or English-entailment certification is performed.

The [semantic exchange guide](docs/SEMANTIC_EXCHANGE.md) explains the schemas, API, validation boundaries, and recorded demonstration. Read the current [request dispatch](benchmarks/results/hono-audiences/request-dispatch.engineer.md) and [middleware composition](benchmarks/results/hono-audiences/middleware-composition.engineer.md) guides.

Each capability now has two reading views. The overview starts with purpose, three main actions, and possible outcomes. The engineer guide starts with a concrete case, then explains the mechanism with short source excerpts. Function summaries and the complete audit remain available as reference.

Use `--audience overview --format html --presentation plan.json` with `explain` to produce the overview. Use `--audience engineer` for the engineer guide. Omit `--format` for Markdown. Both formats use the same presentation plan, bound to the exact semantic artifact.

The [reading guide reference](docs/READING_GUIDES.md) describes the interface, writing rules, and review tasks. The accepted prototype reports are under [hono-audiences](benchmarks/results/hono-audiences). Each HTML file opens directly in a browser. Keep the files together to switch between audience views. The [review package](benchmarks/results/hono-audiences/clearings-reading-review.zip) includes all eight reports, the semantic model, and verification records.

To reproduce both audiences and formats from pinned source and a recorded response:

```bash
node scripts/replay-semantics.mjs benchmark-checkouts/hono.git benchmarks/results/local/hono-semantic-replay
node scripts/check-claim-review.mjs benchmarks/results/local/hono-semantic-replay/semantic.json benchmarks/results/local/hono-semantic-replay/scan.json benchmark-checkouts/hono.git benchmarks/results/hono-semantics/claim-review.json
```

Skip fetching when the pinned checkout already exists, and choose a new output directory. The 53-claim review is an author self-review with a recorded correction; independent human support review is pending. Replay and review accounting do not constitute a fresh inference or an independent precision result.

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
node dist/cli/main.js scan benchmark-checkouts/hono.git --target benchmarks/targets/hono.json --scope deep --project tsconfig.build.json --out benchmarks/results/local/hono-scan.json
node dist/cli/main.js validate benchmarks/results/local/hono-scan.json --repository benchmark-checkouts/hono.git
node scripts/evaluate-m1.mjs benchmarks/results/local/hono-scan.json benchmark-checkouts/hono.git
node scripts/measure-m1.mjs benchmark-checkouts/hono.git benchmarks/results/local/hono-m1-run
node scripts/verify-rubrics.mjs benchmark-checkouts/hono.git
node scripts/measure-m0.mjs benchmark-checkouts/hono.git benchmarks/results/local/hono-m0-run
```

Fetch requires a new destination and downloads the pinned commit into a **bare repository**, then verifies both commit and tree. This avoids checking out source or invoking checkout filters. It is the only command that requests network access. A failed fetch leaves its new directory available for inspection. Use a new output filename/directory for repeat artifact or measurement runs.

Hono 4.13.7 is pinned at `eebdf7be39abf0a872671835ccce0c4f03ea497a`. Its inventory has 486 tracked entries, including 311 `src` TS/TSX files. The broad scope selects 317 files: 311 TS/TSX, one JSON fixture, and five supporting configs. Deep scope selects 25 source files and those five configs. All 486 entries remain in each denominator, with exclusions recorded.

See [measured M1 results](benchmarks/results/hono-m1/summary.json), [the M1 handoff](docs/M1_STATUS.md), [measured M0 results](benchmarks/results/hono-m0/summary.json) and [the M0 handoff](docs/M0_STATUS.md). The first eight [benchmark questions](benchmarks/questions/hono.json) have [source-backed rubrics](benchmarks/rubrics/hono-m0.json), authored through agent source review. They have not received independent human review and are not adjudicated gold answers. Evaluation files are never read by the analyzer; the target reader projects only repository pins and scope settings.

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
import { scan, validateScan, readEvidence } from 'clearings-semantic'

const repository = '/path/to/repository'
const result = scan({ repository, ref: 'HEAD', include: ['src'] })
validateScan(result, { repository })
const first = result.data.evidence[0]
if (first) console.log(readEvidence(result, repository, first.id))
```

The library is synchronous, runs bounded Git subprocesses, and performs no writes during inventory or scan. `scan` accepts optional source byte/file/project budgets through its `limits` option. `max_projects` bounds loaded configuration records; exhaustion adds an error diagnostic and preserves unassigned selected files in at most one additional fallback program. `readEvidence` verifies the artifact and sources before returning text. `createEvidenceReader(result, repository)` verifies once and returns a reader with immutable evidence and source indexes for repeated retrieval. `readTarget(path)` and `fetchTarget(target, destination)` support explicit benchmark setup. `fetchTarget` performs writes and network access only when called.

- `src/repository/`: Git revision/object access, inventory, scope, and output handling.
- `src/model/`: portable JSON types, artifact integrity, and source-span verification.
- `src/adapters/typescript/`: isolated compiler host, project discovery, and structural extraction.
- `src/analysis/`: scan orchestration, deterministic record IDs, and coverage.
- `src/semantics/`: bounded requests, proposal/model validation, stable IDs, and recorded import/replay.
- `src/presentation/`: version-bound reading order, summaries, cases, and validation.
- `src/renderers/`: HTML and Markdown reports over shared semantic records and presentation plans.
- `src/cli/`: arguments, requested output, and exit codes.
- `schemas/`: versioned interchange schema, shipped alongside the compiled package.
- `tests/fixtures/`: original code samples, never executed by inventory.
- `benchmarks/` and evaluator scripts: pins, questions, source reviews, and measured results; separate from production imports.

JSON is the machine interface. The HTML and Markdown renderers consume the same proposal/model records; a future LLM context packer can select from them without owning a second semantic model. The structural extractor itself does not infer conceptual groups.

The snapshot ID hashes canonical inventory data including schema/tool versions, commit/tree, normalized scope, and every entry's Git object ID. It excludes local paths, timestamps, and performance measurements. `validate` checks schema, digest, counts, ordering, and scope consistency; without `--repository`, it does **not** re-read source. Neither mode proves semantic claims. For scan artifacts, `artifact_id` additionally hashes adapter/version/budget information and all structural records. This is an integrity check, not an authenticity signature.

Structured output and failures go to stdout as JSON; `explain` emits Markdown by default, or HTML with `--format html`. When stdout is a terminal, semantic commands display unsafe control characters as visible Unicode escapes. Files written with `--out` and redirected stdout retain exact content. Progress/errors go to stderr. Help/version are plain text. Exit codes are 0 for success, 1 for operational failure (including missing Git objects/revisions), and 2 for invalid arguments, pins, schema, or output destination. Scan also uses exit code 3 for its requested strict structural gate. A normal partial scan returns 0 and retains its errors in the output.

## Next work and licensing

Next: canonical function and behavior contracts, record inspection, and bounded agent context. Then connect both reports to those records and package the three required demos. A small refactor guided by the representation is optional. Additional capabilities, a second repository, other languages, and broader change studies follow the first prototype. Independent claim review remains pending. See the [active roadmap](docs/PROTOTYPE_PLAN.md) and [semantic exchange guide](docs/SEMANTIC_EXCHANGE.md).

Select an open-source license before public distribution. Nothing in this private prototype applies Hono's license to Clearings or publishes an npm package. Recorded upstream excerpts retain their [MIT notice](benchmarks/proposals/hono/LICENSE).
