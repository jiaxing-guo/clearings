# Context state and source selection

Context selection determines which modeled states and supporting source records accompany the operation IDs returned by required dependency closure. The [context projection contract](../03-reference/02-context-and-projections.md) remains authoritative for the full context. The portable selection boundary, mechanical adapter, and frozen independent evaluator are implemented. Production selection currently remains in TypeScript; adoption of the IR program is a subsequent integration change.

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

Required successful cases must complete under 10,000,000 work units, 10,000,000 allocation units, 1,000,000 value units, and evaluation depth 256. Observed wrong output, mutation, or exhaustion rejects the case. Unavailable execution or ownership evidence is inconclusive for the affected obligation; another demonstrated violation still rejects. These results are bounded evidence, not universal refinement or source authentication.

The planned production policy `context-native-v2` gives closure and selection separate copies of these limits. It is not one aggregate logical budget. Each stage separately admits at most 50,000 portable values and 1,000,000 input units; existing native process limits and the recorder's overall invocation deadline also apply. The additional stage can reject a previously successful input, so adoption must document the resource compatibility change and retain `CONTEXT_RESOURCE` separately from post-projection `CONTEXT_BUDGET`. Native operational failures must remain explicit, without fallback or partial contexts.

Recording must retain both stages under an explicit execution-record version, including stage order, program/build identities, argument/result bindings, usage, completion, and unavailable or not-run status. Historical records keep their original single-stage meaning. Successful context bytes, ownership, omissions, and revalidation remain unchanged by the recording representation.
