# M0 implementation handoff

M0 provides reproducible source inventory and a reviewable benchmark foundation. It does not yet break repositories into semantic representations; M1 supplies the structural evidence those representations need.

## Completed

- One private TypeScript package, strict compiler configuration, Node CLI, library exports, exact dependency pins, and npm lockfile.
- Immutable Git commit/tree normalization, including SHA-1/SHA-256 repositories. Scope is normalized and matched as literal path prefixes.
- Full tracked-entry denominator with Git object IDs, modes, sizes, filename classifications, and explicit reasons for exclusions. Symlinks/submodules are not traversed.
- Canonical snapshot digest and versioned JSON inventory schema. CLI validation checks schema and internal consistency while explicitly declining to assert source revalidation.
- A target manifest reader and explicit pinned fetch into a new bare repository. This is an intentional refinement of the planned benchmark checkout: the object store supplies reproducible source access without checkout filters.
- Original direct-call and dynamic-dispatch fixtures, plus temporary-repository integration tests.
- Eight evaluator rubrics for request dispatch and middleware composition, with 12 blob/span citations. Agent source review is complete; independent human review is pending.

## Verification actually run

A clean `npm ci --ignore-scripts`, `npm run typecheck`, and `npm test` passed: 11 tests, zero failures. `npm pack --dry-run` confirmed that compiled modules, declarations, and the inventory schema are included, while fixtures and evaluator answers are excluded. No package was published.

`npm test` builds the library and runs Node integration tests. The suite exercises immutable reads despite dirty/staged/untracked files, object replacements, copied repository locations, both fixtures, unusual filenames, excluded symlinks/submodules, SHA-256 repositories, empty trees, bad refs/pins/scopes, artifact tampering, CLI envelopes, output protection, and separation of evaluation metadata.

The pinned Hono fetch matched commit `eebdf7be39abf0a872671835ccce0c4f03ea497a` and tree `7fd627b257e5b744bf23d4957a93a0d0413c8c19`. Both scopes were inventoried three times in separate Node processes. Each scope produced byte-identical JSON across its three runs. Hashes of every file in the bare target were unchanged before and after measurement. The actual CLI inventory and validate commands also succeeded against deep scope. No Hono scripts or tests ran and no Hono dependencies were installed.

| Measured scope | Tracked entries | Selected files | Excluded entries | Median inventory duration |
| --- | ---: | ---: | ---: | ---: |
| Broad inventory | 486 | 317 | 169 | 22.35 ms |
| Deep inventory | 486 | 30 | 456 | 23.49 ms |

Node peak RSS ranged from 53.83 to 54.62 MiB. These measurements exclude Git subprocess memory. Wall time covers inventory, validation, and serialization, excluding Node startup/imports and artifact writes. Filesystem caches were not flushed. These small inventory measurements establish no M1 extraction or semantic performance claim.

The [recorded summary](../benchmarks/results/hono-m0/summary.json) contains environment, sample timings, coverage, and exact artifact digests. Full locally generated manifests are deliberately ignored and regenerated with the commands in the README. The [five-file fixture sample](../benchmarks/results/fixtures/direct-calls.json) is a computed artifact that the validator can inspect without a source checkout.

`node scripts/verify-rubrics.mjs benchmark-checkouts/hono.git` verified all 12 cited blob identities, line bounds, span hashes, and required-claim references for eight questions. It does not evaluate whether claims follow from those citations. No answer-quality score has been reported.

## Deliberate limits

There are no ASTs, symbols, import links, source-span extraction, call relationships, model proposals, or semantic claims in M0. Files labelled source/test are classified by filename only. Inventory includes file metadata for excluded entries to preserve coverage. A scoped digest therefore changes if an out-of-scope entry changes; selected scope is not a concealment boundary.

Local Git metadata operations have a 30-second timeout and 64 MiB output buffer; explicit fetch has a 120-second timeout. Missing objects, unsupported UTF-8 path encodings, or exceeded limits fail visibly rather than reduce the denominator. Partial clones are not automatically repaired. Output protection covers normal paths and existing symlink ancestors; this is not a filesystem sandbox against concurrent hostile path substitution. Linux was tested, macOS is intended, and Windows support is deferred.

Artifact validation verifies a self-consistent manifest, not repository authenticity. Future source-span verification must re-read the declared Git objects. Benchmark manifests now declare schema version 0.1.0; the original planning-only 0.1-draft target format is superseded.

## M1 work, in order

1. Add bounded immutable blob reads and byte/line evidence spans keyed to this snapshot; verify stale or mismatched references against source objects.
2. Discover tsconfig/project references and explicit source-only mode without installing target dependencies. Define coverage for parse failures and unavailable dependencies.
3. Introduce the TypeScript compiler adapter behind portable file/symbol/fact interfaces. Inventory must stay usable independently of the adapter.
4. Resolve imports, aliases, re-exports, and direct references; distinguish type-only from runtime dependencies. Preserve dynamic callbacks, overload ambiguity, and missing imports as unresolved.
5. Add versioned Evidence/Fact schemas and `scan`. Keep `inventory` available as a cheap foundation. Extend `validate` by artifact kind without implying semantic entailment.
6. Add targeted fixtures for project references, alias/re-export chains, type-only imports, parse errors, and unavailable dependencies, then run pinned Hono's 25-source-file deep scope and report real extraction coverage/resource use.

After structural evidence review, the smallest M2 slice is a file-based proposal request/import for request dispatch and middleware composition, with evidence validation, honest replay labels, and separate human/LLM projections. M0 does not prebuild those interfaces.
