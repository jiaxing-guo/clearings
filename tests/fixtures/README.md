# Original fixtures

These sources were authored for Clearings and are never executed by the analyzer. Tests copy each fixture into a temporary Git repository and commit it.

- `direct-calls`: local cross-file imports and function calls.
- `dynamic-dispatch`: callbacks and key-dependent dispatch.
- `projects`: an empty root config, project references, inherited path aliases, re-exports, namespace imports, and explicit type-only dependencies.
- `negative`: parse errors, missing imports, callback/indexed dispatch, overloads, and reassignment. Tests add an external symlink and an untracked dependency without loading either.
- `unicode`: UTF-8/BOM/CRLF source with Unicode names and byte-accurate citations.
- `js`: JavaScript imports and direct calls.
- `exports`: anonymous/default exports, export stars, and a shadowed require function.

M0 verifies inventory only. M1 checks structural distinctions, evidence integrity, immutable reads, and honest failure coverage.
