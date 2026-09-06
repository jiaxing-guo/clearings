Implemented `analyzeImpact` in `src/specification/impact.ts` and exported its public types/API from `src/index.ts`.

Behavior includes:

- Specification validation.
- Selection validation and alias resolution.
- Required/all dependency modes.
- Reverse transitive closure with cycle handling.
- Shortest lexicographically ordered witnesses.
- Stable sorting and deduplicated changed IDs.
- Deep-copied decisions.
- Omitted operation accounting.
- Unavailable optional dependency reporting.
- Required `ImpactReport` metadata and acceptance scope.
- Runtime `ClearingsError` codes for invalid selections and arguments.

Verification completed:

- `npm run typecheck`
- `npm run build`
- `npm test`
- Basic runtime validation against `input/specification.json`

The IR’s opaque requirements guided implementation of the explicit graph, ordering, witness, API, and report rules. Remaining uncertainty is limited to withheld evaluator edge cases; no external tests were available.
