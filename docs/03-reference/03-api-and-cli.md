# API and CLI reference

The library returns objects or text and leaves ordinary file I/O to the caller. Build the repository with `npm run build`; its local ESM entry is `dist/index.js`. Package consumers use `clearings`. [src/index.ts](../../src/index.ts) is the authoritative export list.

## Check one observation

The library entrypoint for a single case is:

```ts
checkOperation(specification, selection, observation): OperationCheck
```

`selection` is an operation ID or alias. The function validates the specification and observation, then returns individual checks, an aggregate verdict, and limitations. Invalid input throws; it does not return a failing semantic verdict.

The equivalent CLI invocation reads an observation file:

```bash
node dist/cli/main.js check specifications/hono/response-selection.json --operation response-selection --observation /path/to/case.json
```

The output is JSON. Exit status is 0 for `pass`, 1 for `fail`, 3 for `unknown`, and 2 for a command or input error. The [Hono case guide](../04-guides/01-check-a-case.md) provides the observation and reproducible steps. The tables below describe the remaining entrypoints and their contracts.

## Typed specification API

| Function | Result and contract |
| --- | --- |
| `specificationIdentity(spec)` | Compute the content identity without accepting the specification |
| `sealSpecification(spec)` | Normalize, assign identity, validate, and return a copy |
| `validateSpecification(value)` | Assert valid specification structure, integrity, types, and references; return no model |
| `resolveOperation(spec, selection)` | Resolve an ID or alias; callers outside checked entrypoints must validate the specification first |
| `evaluateExpression(expression, environment, maxSteps?)` | Return a known JSON value or unknown with a reason |
| `formatExpression(expression)` | Format a readable expression; does not parse text back into an AST |
| `checkOperation(spec, selection, observation)` | Return `OperationCheck` or throw for invalid input |
| `checkOperationSequence(spec, steps, { stateIds })` | Return `OperationSequenceCheck`; 1–256 steps, explicit state selection |
| `assembleContext(spec, selection, { maxBytes })` | Return a complete required `OperationContext` or an explicit error |
| `serializeOperationContext(context)` | Compact JSON plus a final newline |
| `validateOperationContext(context, spec)` | Reconstruct and validate the exact projection |
| `describeOperation(operation)` | Return readable summary lines, not a complete replacement contract |
| `renderSpecification(spec, selection, options?)` | Assemble and render a specification selection |
| `renderOperationContext(context, options?)` | Render an existing context; original specification is required for scenarios |

Report options are `format` (`html` or `markdown`, default Markdown), `maxBytes`, `scenarios`, and `specification`. `renderSpecification` defaults to the 2 MiB context maximum. A `CheckedScenario` contains `name`, `operation_id`, `observation`, and `result`; rendering recomputes the result when scenarios are supplied.

The package does not export the internal `matchesType`, `expressionType`, or `assertPortable` helpers as public library functions.

## Typed CLI

Run commands from the repository root after building.

| Command | Selection and input | Output/default |
| --- | --- | --- |
| `validate spec.json` | No operation selection | JSON validation summary |
| `inspect spec.json` | No selection | JSON operation catalog |
| `inspect spec.json --operation ALIAS` | ID or alias | Selected context; JSON; fixed 2 MiB maximum |
| `context spec.json --operation ALIAS` | ID or alias; optional `--max-bytes` | Selected context; JSON; default 128 KiB |
| `explain spec.json --operation ALIAS` | ID or alias; optional `--max-bytes` | Markdown; default 128 KiB |
| `check spec.json --operation ALIAS --observation case.json` | JSON observation file | JSON check result |

Prefix each command with `node dist/cli/main.js`. `--id` is an alternative to `--operation`; they are mutually exclusive. Selected `inspect`, `context`, and `explain` support `--format json`, `markdown`, or `html`. A catalog inspection requires JSON. `check` requires JSON output. `inspect` does not accept `--max-bytes`; its selected projection uses the maximum internally.

There is no `check-sequence` CLI command; sequence checking is a library API. Typed commands do not accept legacy `--scan`, `--request`, `--capability`, `--behavior`, presentation, or audience options.

Where supported, `--out` requires `--repository` so output protection can reject target paths. This use of `--repository` does not authenticate the specification's source. The CLI still writes the result to standard output.

## Exit codes and errors

| Code | Meaning |
| --- | --- |
| `0` | Successful command or passing observation check |
| `1` | Failed observation rule |
| `2` | Invalid arguments, malformed input, selection, or other command error |
| `3` | Unknown observation-check verdict |

Library errors use `ClearingsError.code`, not these semantic verdicts. Principal codes are `INVALID_SPECIFICATION`, `SPEC_TYPE`, `INVALID_OBSERVATION`, `INVALID_SELECTION`, `INVALID_ARGUMENTS`, `INVALID_BUDGET`, `MISSING_REQUIRED_DEPENDENCY`, `INVALID_CONTEXT`, and `CONTEXT_BUDGET`.

For sequences, wrapper-shape errors use `INVALID_OBSERVATION`, option errors use `INVALID_ARGUMENTS`, and selection errors use `INVALID_SELECTION`. Structural portability errors retain `INVALID_SPECIFICATION`. Invalid input does not return a partial sequence report.

## Source-analysis and legacy APIs

| Task | Library entrypoints | CLI commands |
| --- | --- | --- |
| Inventory and source scan | `inventory`, `scan`, `validateInventory`, `validateScan` | `inventory`, `scan`, `validate` |
| Exact evidence | `readEvidence`, `createEvidenceReader` | `evidence` |
| v0.1 authoring exchange | `createProposalRequest`, `importProposal`, model/request/proposal validators | `propose`, `import`, `replay` |
| v0.2 authoring exchange | `createContractRequest`, `importContractProposal`, contract validators | `propose --schema-version 0.2.0`, `import`, `replay` |
| v0.2 queries | `inspectSemantic`, `createContextPack`, `serializeContextPack`, `createContractBrief` | `inspect`, `context` |
| Audience reports | `renderCapability`, presentation-plan helpers | `explain` with legacy selection/presentation options |

Use `node dist/cli/main.js --help` for the complete flag inventory. The archived [v0.1 exchange guide](../archive/2026-09-07/SEMANTIC_EXCHANGE.md) and [v0.2 contract guide](../archive/2026-09-07/SEMANTIC_CONTRACTS.md) retain the original detailed workflows. Their historical task/status paragraphs do not define current development scope.

## Schema exports

The package subpaths are `/schemas/inventory`, `/schemas/scan`, `/schemas/semantic` (v0.1), `/schemas/presentation` (v0.1), `/schemas/contracts` (v0.2), `/schemas/contract-presentation` (v0.2), and `/schemas/specification` (v0.3). Each is prefixed by `clearings`. See [package.json](../../package.json) for exact files.
