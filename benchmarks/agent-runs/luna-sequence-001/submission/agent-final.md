Implemented the Clearings sequence check.

Changed files:

- `src/specification/sequence.ts`
- `src/index.ts`
- `tests/sequence.test.mjs`

Validation completed:

- `npm run build` — passed
- `npm run typecheck` — passed
- `node --test tests/sequence.test.mjs` — 3 passed, 0 failed

The implementation validates portable wrappers and options, delegates each step to `checkOperation`, compares explicitly selected adjacent state values, preserves unknowns and failures, normalizes state IDs, aggregates verdicts, and exports all four interfaces plus `checkOperationSequence`.
