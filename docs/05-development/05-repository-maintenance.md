# Repository maintenance

Clearings uses one TypeScript library and CLI, a Fumadocs presentation of the canonical Markdown reference, and separately preserved evaluation evidence. Maintenance should keep these responsibilities visible and preserve artifact identities and reproducibility.

## Directory responsibilities

| Directory                     | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `src/`                        | Maintained library and CLI implementation                                         |
| `programs/`                   | Authored executable Program IR and example arguments                              |
| `schemas/`, `specifications/` | Versioned interchange schemas and contract artifacts                              |
| `tests/`                      | Regression tests, independent expectations, and intentional source fixtures       |
| `docs/`                       | Canonical technical Markdown; historical material under `archive/`                |
| `website/`                    | Fumadocs application, authored legacy pages, and generated site assets            |
| `scripts/`                    | Development commands, generators, benchmark tools, and evidence verification      |
| `benchmarks/`                 | Pinned inputs, authored proposals, recorded results, and frozen agent experiments |

Large benchmark archives and reports remain required evidence. File age or size alone does not make a record disposable. Review references, manifests, source bindings, and reproduction procedures before deleting or moving a file. Public exports, schema paths, and existing CLI commands are compatibility boundaries.

## Formatting

Install root dependencies with `npm ci --ignore-scripts`. The repository pins Prettier as a development dependency so local commands, editors, and CI use the same formatter version. This follows the [Prettier installation guidance](https://prettier.io/docs/install).

```bash
npm run format
npm run format:check
```

The first command formats maintained files. The second reports deviations without modifying files and runs in the formatting CI workflow. The root configuration applies to both library and website code: single quotes, a 100-column preferred width, preserved prose wrapping, and no formatting of embedded code. The last setting protects authored code examples and template-string content. Prettier controls layout; TypeScript's strict checks and unused-local/parameter checks cover a separate class of defects.

The [ignore file](../../.prettierignore) excludes:

- Generated builds, caches, dependencies, and copied website assets.
- Frozen benchmark evidence, test fixtures with intentional source coordinates or malformed syntax, and archived documentation.
- Generator-owned schemas, contract/program JSON, and npm lockfiles.
- The historical bootstrap design and compatibility document.
- Four implementation files whose exact bytes remain bound by the preserved bootstrap demonstration: `src/analysis/budget.ts`, `src/analysis/dependencies.ts`, `src/specification/context.ts`, and `src/specification/render.ts`.

Those four source exclusions are an existing evidence dependency, not an alternative formatting convention. The [bootstrap verifier](../../scripts/check-bootstrap-demo.mjs) checks their whole-file hashes and byte ranges against the recorded bindings. Removing that coupling requires an explicit evidence migration to immutable source snapshots; formatting must not silently replace the historical bindings or weaken their checks. For a new generator-owned artifact, preserve its serialization procedure and add the appropriate exclusion.

## Formatting history

The initial formatting pass was a separate commit during review and was squash-merged with repository maintenance in PR #14. The final merged commit is recorded in [the blame ignore file](../../.git-blame-ignore-revs). For local Git, enable it with `git config blame.ignoreRevsFile .git-blame-ignore-revs`. Future entries must use commits present in maintained history, rather than temporary PR hashes. The initial entry includes the accompanying maintenance changes as well as formatting because squash merging combined them.

## Remove generated files

Stop a running documentation development server before cleaning:

```bash
npm run clean
```

The command removes `dist/`, `coverage/`, Next.js build/export and generated type files, generated Fumadocs source metadata, copied demo assets, and generated technical documentation pages/indexes. It resolves paths relative to the repository, so it also works from another working directory. It retains source, npm dependencies, specifications, authored programs, benchmark checkouts, and recorded runs. Missing generated paths are harmless.

Rebuild with `npm run build` or `npm run docs:build`; use `npm run docs:dev` for local documentation development. Clean builds prevent removed or renamed source files from leaving stale JavaScript in `dist/`. The [script index](../../scripts/README.md) lists the supported maintenance and benchmark commands.

## Descriptive filenames

| Earlier path                      | Current path                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `scripts/measure-m0.mjs`          | [measure-inventory.mjs](../../scripts/measure-inventory.mjs)                      |
| `scripts/measure-m1.mjs`          | [measure-scan.mjs](../../scripts/measure-scan.mjs)                                |
| `scripts/evaluate-m1.mjs`         | [evaluate-scan.mjs](../../scripts/evaluate-scan.mjs)                              |
| `tests/program.test.mjs`          | [program-validation.test.mjs](../../tests/program-validation.test.mjs)            |
| `website/lib/layout.shared.tsx`   | [layout-options.ts](../../website/lib/layout-options.ts)                          |
| `website/components/provider.tsx` | [documentation-provider.tsx](../../website/components/documentation-provider.tsx) |

Archived commands retain the filenames used by their recorded revision; use the current paths above for new runs. The original `scripts/create-private-repo.sh` served only initial repository creation and has been removed. Its source remains in Git history. The active repository URL is `https://github.com/jiaxing-guo/clearings`. Frozen records and their reproduction script retain the repository URL captured at their original revision.
