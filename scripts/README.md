# Repository scripts

Use the root npm commands for normal development. Scripts run against the Clearings checkout; benchmark tools require the pinned repository and keep results outside the analyzed target.

| Task                                       | Command or script                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Format maintained files                    | `npm run format`; check with `npm run format:check`                            |
| Remove generated build products            | `npm run clean`                                                                |
| Build or type-check the library            | `npm run build`, `npm run typecheck`                                           |
| Run Program IR examples                    | `npm run program -- demo`                                                      |
| Test Program IR and its CLI                | `npm run test:program`                                                         |
| Test Rust runtime primitives               | `npm run test:rust`                                                            |
| Format and check the Rust runtime          | `npm run format:rust`, `npm run check:rust`                                    |
| Record and evaluate context assembly       | `npm run conformance`                                                          |
| Run the complete conformance gate          | `npm run test:conformance`                                                     |
| Develop, build, or verify documentation    | `npm run docs:dev`, `npm run docs:build`, `npm run docs:check`                 |
| Check Markdown links and runnable examples | `npm run docs:check:markdown`                                                  |
| Measure inventory                          | `node scripts/measure-inventory.mjs <pinned-bare-repo> <new-output-directory>` |
| Measure structural scanning                | `node scripts/measure-scan.mjs <pinned-bare-repo> <new-output-directory>`      |
| Evaluate selected structural facts         | `node scripts/evaluate-scan.mjs <scan.json> <pinned-repo>`                     |

Build the library before invoking a `.mjs` benchmark script directly. The measurement and evaluation tools retain the historical rubric and result formats; their filenames now describe the measured operation.

`generate-*-schema.py` and `generate-conformance-schemas.py` own schema serialization. `build-required-closure-program.mjs` reproduces the authored Program IR artifact. Their tests compare generated output with committed bytes. Run the relevant generator for an intentional artifact change; Prettier does not rewrite these outputs.

The authoring, replay, report-building, packaging, and archive-verification scripts support the retained Hono and bootstrap demonstrations. They remain available because those records are referenced by documentation and checks. Follow [Contributing](../CONTRIBUTING.md#reproduce-benchmark-changes) and use new output directories for new evidence.

The one-time repository-creation script has been removed after repository setup. Historical commands remain in archived documents and Git history. See [Repository maintenance](../docs/05-development/05-repository-maintenance.md) for renamed paths, formatting exclusions, and cleanup scope.
