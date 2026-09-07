# Check consecutive operation records

`checkOperationSequence` checks a list of supplied operation observations. It also compares selected shared state between adjacent records. Use it when you need to detect a gap between individually valid records.

## Start with two writes

Each item contains an operation ID or alias and an `OperationObservation`. The specification declares the operation's rules and the state field types.

```ts
import { checkOperationSequence } from 'clearings-semantic'

const result = checkOperationSequence(specification, [
  { operation: 'store', observation: firstWrite },
  { operation: 'store', observation: secondWrite },
], { stateIds: ['value'] })
```

The checker evaluates both writes with `checkOperation`. It then compares `firstWrite.after.value` with `secondWrite.before.value`.

| Adjacent state | Continuity result |
| --- | --- |
| Both values exist and match | `pass` |
| Both values exist and differ | `fail` |
| Either value is missing | `unknown` |

A rejected write can pass its contract if it preserves the required state. It does not become a failed check merely because the operation reports failure.

## Choose shared state explicitly

`stateIds` is required. Select only fields that refer to the same storage across these records. An invocation-local field in two unrelated calls can have the same ID without referring to the same storage. The checker cannot establish storage identity from scope metadata.

An empty list checks the operations without state continuity. The report removes duplicate IDs and sorts them by JavaScript's default string order. It preserves input step order. It compares every adjacent pair and selected field, even after a failed check.

Missing values remain unknown. The checker does not fill gaps from earlier records or infer resulting state from a frame rule. JSON object key order does not matter; array order matters.

## Read the result

The result contains:

- `steps`: the exact `checkOperation` result for each record, with its index and canonical operation ID.
- `continuity`: one result for each adjacent pair and selected field.
- `verdict`: `fail` if any check fails; otherwise `unknown` if any check is unknown; otherwise `pass`.
- The specification identity and perspective, with `acceptance: 'proposed'` and `interpretation: 'supplied-observations-only'`.

The function accepts 1–256 records. It validates the whole specification and each observation. Invalid input throws `ClearingsError`; no partial report is returned. Wrapper errors use `INVALID_OBSERVATION`, option errors use `INVALID_ARGUMENTS`, and operation selection errors use `INVALID_SELECTION`. Portable structural errors retain `INVALID_SPECIFICATION` from the existing validator. Full details are in the [frozen API contract](../benchmarks/agent-runs/luna-sequence-001/frozen/API.md).

The implementation does not execute target code, follow transitions, or prove source conformance. The caller supplies the records and their order. There is no concurrency model or general effect monitor.

## Inspect the intended model

```bash
node dist/cli/main.js inspect specifications/clearings/sequence-check.json
node dist/cli/main.js context specifications/clearings/sequence-check.json --operation check-sequence --max-bytes 131072
```

This intended model was frozen before the coding agent started. Typed rules cover verdict aggregation, result counts, and unchanged input through a test adapter. Five requirements remain opaque and need tests or source review. The typed checks therefore remain `unknown`; they are not a full implementation proof.

The [fresh-agent report](../benchmarks/agent-runs/luna-sequence-001/REPORT.md) contains the first submission, 17 frozen test groups, regression results, source review, and four recorded examples. The source was integrated without changes after that evaluation.
