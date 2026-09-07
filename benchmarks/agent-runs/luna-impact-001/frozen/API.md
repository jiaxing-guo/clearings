# Dependency impact query

Implement `analyzeImpact` in `src/specification/impact.ts` and export it and its public types from `src/index.ts`.

```ts
import type { SemanticSpecification, OpenDecision, Dependency } from './model.js';

export interface ImpactOptions { mode?: 'required' | 'all' }
export interface ImpactEntry {
  operation_id: string;
  name: string;
  distance: number;
  witness: string[];
  decisions: OpenDecision[];
}
export interface ImpactReport {
  schema_version: '0.3.0';
  command: 'impact';
  artifact_id: string;
  perspective: SemanticSpecification['perspective'];
  mode: 'required' | 'all';
  changed_operation_ids: string[];
  affected: ImpactEntry[];
  omitted_operation_ids: string[];
  unavailable_optional_dependencies: {
    from_id: string;
    to_id: string;
    kind: Dependency['kind'];
    role: string;
  }[];
  interpretation: 'potential-impact-from-declared-dependencies';
  acceptance: 'proposed';
}
export function analyzeImpact(
  specification: SemanticSpecification,
  changed: readonly string[],
  options?: ImpactOptions,
): ImpactReport;
```

## Observation adapter for the typed rules

The frozen operation record uses a smaller observation domain than this public function. This mapping does not supply an implementation:

- `input.available_ids`: all specification operation IDs.
- `input.root_ids`: the resolved, deduplicated changed operation IDs.
- `input.active_edges`: `{from, to}` for dependencies selected by mode whose target exists.
- `input.artifact_id`: the input specification identity.
- `output.included_ids`: `report.affected.map(item => item.operation_id)`.
- `output.omitted_ids`: `report.omitted_operation_ids`.
- `output.reported_root_ids`: `report.changed_operation_ids`.
- `output.artifact_id`: `report.artifact_id`.
- `before.model_digest` and `after.model_digest`: externally measured input content digests.

The typed record owns the behavior requirements. Some graph and API requirements use explicit `opaque` predicates. They are still requirements, but the current expression interpreter cannot prove them. Independently authored tests will check concrete behavior. A declaration of `opaque` is not permission to omit that requirement.

## Error boundary

Validate the supplied specification with `validateSpecification`. Its validation errors remain visible, including stale identity and missing required dependencies anywhere in the model.

Reject an empty changed list, a non-array changed argument, any non-string selection, and any unknown selection with `ClearingsError` code `INVALID_SELECTION`. Resolve each selection by exact operation ID or unique alias. Deduplicate selections after resolution.

Options default to required mode. An explicitly undefined mode also means required. Reject a null or non-object options value, array options, unknown option keys, and any mode other than required/all/undefined with `ClearingsError` code `INVALID_ARGUMENTS`. Ordinary JSON/plain-object options are sufficient; proxies and arbitrary JavaScript accessors are outside this task. Error precedence between simultaneously invalid arguments is unconstrained.

No CLI command, package dependency, renderer change, or migration is required. The operation is synchronous. Do not perform I/O, install dependencies, or run source from an analyzed repository.
