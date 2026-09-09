# Context state and source selection

Context selection determines which modeled states and supporting source records accompany the operation IDs returned by required dependency closure. The [context projection contract](../03-reference/02-context-and-projections.md) remains authoritative for the full context. The portable selection boundary, mechanical adapter, frozen independent evaluator, and [Program IR implementation](../../programs/clearings/context-selection.json) are implemented. The same IR runs in the reference interpreter and through the Rust backend. Production selection currently remains in TypeScript; adoption is a subsequent integration change.

## Portable boundary

The entry `context_selection` takes four positional arguments:

| Argument       | Type            | Meaning                                                          |
| -------------- | --------------- | ---------------------------------------------------------------- |
| `selected_ids` | list of strings | Operation IDs from required closure                              |
| `operations`   | list of records | `id`, `complete_frame`, `reads`, `writes`, and `evidence_groups` |
| `states`       | list of records | `id` and `evidence_ids`                                          |
| `source_ids`   | list of strings | Available source catalog IDs                                     |

`complete_frame` is Boolean; reads, writes, and evidence IDs are string lists; evidence groups are lists of string lists. Return exactly `{ state_ids: string[], source_ids: string[] }`. The [frozen signature](../../benchmarks/evaluation/context-selection-v1/contract.json) specifies the complete Program IR types. There are no additional record fields or declared application failures.

The [adapter](../../src/specification/selection-input.ts) copies all catalog rows and selected IDs, including their order and duplicates. It enumerates only the declared evidence positions: operation, guarantees, implementations, decisions, outcomes, and outcome ensures. It copies state evidence separately. Literal and expression payloads are never recursively searched for keys named `evidence_ids`. The adapter performs no semantic membership selection, complete-frame expansion, union, deduplication, or sorting.

## Selection rules

A state ID is selected exactly when it occurs in the state catalog and a selected operation either has a complete frame or explicitly reads or writes that ID. Thus one selected complete frame includes all modeled states, even those otherwise unrelated to the closure. An unselected complete frame has no effect.

A source ID is selected exactly when it occurs in the source catalog and appears in a selected operation's declared evidence groups or a selected state's evidence IDs. This includes evidence on states added by a complete frame. Dependencies, literal values, and unselected operation metadata do not independently select sources.

Both output lists are unique and ascending in UTF-16 code-unit order. Input data remains unchanged and results are independently owned. Operation order and the rest of the context are outside this program's responsibility.

The low-level projection is defined for every well-typed portable metadata array within execution limits. Duplicate catalog rows contribute by existential membership; unknown IDs contribute no matching rows. Malformed shapes, field types, or nonportable values are argument-admission failures. This totalized low-level boundary does not relax production validation: the full specification is validated before root resolution and either native stage.

## Evaluation and compatibility

The [frozen evaluation packet](../../benchmarks/evaluation/context-selection-v1/README.md) defines 4,632 cases, 15 fault controls, and a relational membership oracle. Independent bit equations and explicit expected answers validate the oracle. Original-record adapter checks cover every declared evidence position, duplicate/order preservation, and exclusion of literal data. Reference/native agreement alone cannot establish adapter correctness or the independent obligations.

The [review supplement](../../benchmarks/evaluation/context-selection-review-v1/README.md) adds ten post-authoring regressions for longer evidence groups and lists. Current evaluation v2 runs all 4,642 cases and reports the original and supplemental totals separately; the original packet and historical results retain their exact bytes and scope.

Required successful cases must complete under 10,000,000 work units, 10,000,000 allocation units, 1,000,000 value units, and evaluation depth 256. Observed wrong output, mutation, or exhaustion rejects the case. Unavailable execution or ownership evidence is inconclusive for the affected obligation; another demonstrated violation still rejects. These results are bounded evidence, not universal refinement or source authentication.

The planned production policy `context-native-v2` gives closure and selection separate copies of these limits. It is not one aggregate logical budget. Each stage separately admits at most 50,000 portable values and 1,000,000 input units; existing native process limits and the recorder's overall invocation deadline also apply. The additional stage can reject a previously successful input, so adoption must document the resource compatibility change and retain `CONTEXT_RESOURCE` separately from post-projection `CONTEXT_BUDGET`. Native operational failures must remain explicit, without fallback or partial contexts.

The [stage-aware execution record](../03-reference/05-conformance-artifacts.md#ordered-native-stages) implements the explicit v0.3 recording boundary: stage order, program/build identities, argument/result bindings, usage, completion, and unavailable or not-run status. Historical records keep their original single-stage meaning. Successful context bytes, ownership, omissions, and revalidation remain unchanged by the recording representation.

## Reproduce the program evaluation

The [syntax builder](../../programs/clearings/context-selection.mjs) constructs IR only. The program computes membership, complete-frame expansion, unions, duplicate removal, and final sorting. No runtime primitive was added.

```bash
npm run build
node scripts/build-context-selection-program.mjs
npm run test:selection
npm run selection:evaluate -- --candidate programs/clearings/context-selection.json --out /tmp/context-selection-evaluation.json
```

The evaluator pins both manifest identities before loading packet code and checks the candidate signature before execution. Each backend is compared to independent expectations, then completions, limits, and logical usage are compared across backends. The report binds the generated artifact, native build, case corpus, executions, and evaluator, and measures cold preparation separately from per-case invocation. Its exit status is zero for scoped acceptance, one for rejection, and two for unavailable required evidence. Native availability is aggregated from individual executions: partial or entirely unavailable execution retains counted diagnostics even beyond the bounded failure examples. Native adapter exceptions remain unavailable evidence while observed semantic violations still reject. Report output requires a new file and cannot overwrite existing files or symlink targets. Tests additionally exercise malformed admission, exhaustion, and executable IR mutations.
