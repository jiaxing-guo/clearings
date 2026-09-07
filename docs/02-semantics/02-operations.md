# Operation contracts

`SemanticOperation` is a declarative contract for a modeled operation. An operation defines permitted results and observable state/effect constraints. It does not contain a complete implementation body.

## A concrete outcome

In the authored Hono model, `outcome:direct-missing` applies when the handler returns a nullish value directly. Its postcondition requires the selected response source to be `not-found`.

| Part of the contract | Example | Responsibility |
| --- | --- | --- |
| Input domain | `path: direct`, `value: nullish` | Classify the supplied execution branch and result |
| Guard | Direct path and nullish value | Determine modeled applicability |
| Postcondition | Output equals `not-found` | Constrain the supplied result |
| Initial state | `finalized: true` | Record context state; it does not alter this guard |
| State and effect boundaries | Both partial | Retain unmodeled behavior explicitly |

Keeping the input and outcome fixed, `not-found` passes the output rule, `context-response` fails it, and an omitted output makes it unknown. The [first-contract tutorial](../00-learn/01-first-contract.md) develops this example; the [case guide](../04-guides/01-check-a-case.md) reproduces it locally.

The interactive version of this page compares those three authored observations and displays the exact contract and checker results. The definitions below apply independently of that presentation.

## Outcomes and guarantees

Each outcome contains an ID, description, Boolean `when` guard, `ensures` rules, explicit state `updates`, effect occurrences, declared `transitions`, and evidence links.

`guarantees` apply regardless of the selected outcome. An outcome's `ensures`, `updates`, and required/permitted effects apply when that outcome is supplied for checking. Guards classify modeled applicability. The checker does not execute an outcome or synthesize an output from it.

| Declaration | Meaning | Current enforcement |
| --- | --- | --- |
| `outcome_policy: exclusive` | At most one guard may apply; coverage determines whether a case must be covered | Fail multiple true guards or a true alternative to the supplied outcome, even if the supplied outcome's guard is unknown; unresolved alternatives otherwise yield unknown |
| `outcome_policy: allowed` | Guards may overlap; the supplied outcome must have an applicable guard | Check the supplied outcome, without requiring other applicable outcomes' postconditions |
| `coverage: complete` | The model claims to cover the relevant input domain | Fail an observed case with no true or unknown guard; no exhaustive coverage proof |
| `coverage: partial` | Behavior outside modeled cases is unspecified | Require at least one decision explaining the boundary; an uncovered case yields unknown |

A complete coverage declaration does not imply complete state or effect modeling. Likewise, a complete frame does not imply complete outcome coverage.

## State and frame conditions

Each `StateField` has a stable ID, name, description, type, evidence, and scope: `invocation`, `request`, `repository`, `process`, or `external`. Scope describes intended lifetime; it does not establish concrete storage identity.

An outcome update must target a unique field in the operation's write set. The update expression is evaluated against the supplied observation environment and compared with `after[state_id]`. Updates are constraints, not sequential assignments executed by the checker; later entries do not consume an earlier update's computed value.

For `frame: complete`, every modeled field in the specification outside the operation's write set must retain its value. Checking preservation requires both before and after observations. For `frame: partial`, unrecorded state changes are not excluded.

State maps contain only explicitly supplied own properties. An omitted field named `constructor`, `toString`, or `hasOwnProperty` remains missing; inherited object properties cannot satisfy an update or frame condition.

A writable field without an update or postcondition remains unconstrained. Declaring `reads` does not monitor runtime reads. An empty write set with a partial frame does not establish purity.

## Effects

The operation-level `allowed` list declares effect IDs. Each outcome may reference these IDs as `required` or `permitted`. The representation records occurrence by ID; it does not model effect payloads, counts, ordering, or a general I/O trace.

| Boundary and observation | Check |
| --- | --- |
| Complete boundary, outcome supplied, effects supplied | Every observed ID must be allowed by that outcome; each required ID must occur |
| Complete boundary, outcome omitted, effects supplied | Every observed ID must be declared at operation level; outcome-specific rules remain unchecked |
| Complete boundary, outcome supplied, effects omitted | Unknown effect check |
| Partial boundary, required outcome effect | Require its occurrence; missing effect data yields unknown |
| Partial boundary without required effects | No exclusion check for additional effects |

An empty complete effect boundary forbids modeled external effects. An empty partial boundary does not establish absence of effects. Supplied effect IDs remain external observations; the checker does not instrument source execution.

## Dependencies and transitions

Dependency kinds are `uses-contract`, `invokes`, `awaits`, and `continuation`. Each dependency specifies `required` or `optional` context inclusion and a role. Required references must resolve; optional references may remain absent. Cycles are valid.

Outcome transitions declare a handoff (`invoke`, `await`, `continue`, or `propagate`) to a dependency. Validation requires an explicit dependency for each transition target. Transitions are not executed or verified by the observation checker, and they do not establish complete runtime call order.

## Decisions and narrative obligations

Decision dispositions are `unresolved-requirement`, `analysis-limit`, and `implementation-choice`. The `blocking` flag is retained for consumers; it does not automatically prevent context assembly or convert an operation verdict to unknown. Decisions appear as limitations. No acceptance workflow is implemented.

A rule description can express more than its predicate checks. Reviewers must identify that difference. Use `opaque` for a Boolean obligation that lacks a supported encoding, or split a compound obligation into separately identified rules. Neither a resolved evidence pointer nor a passing predicate validates every sentence of associated prose.

## Enforcement limits

Operation checking evaluates guards and constraints against supplied values. It does not execute a program body, instrument effects, establish adapter fidelity, or prove universal source refinement. Keep these limits visible when presenting a passing result.

Use the [observation protocol](03-observations-and-sequences.md) for missing-data and error behavior, and [abstraction and refinement](../01-architecture/03-abstraction-and-refinement.md) for the relation to concrete executions.

## Record fields

| Fields | Meaning |
| --- | --- |
| `id`, `alias`, `name`, `purpose` | Canonical record identity, selection alias, display name, and local explanation |
| `inputs`, `output` | Exact input record and output value type |
| `reads`, `writes`, `frame` | Declared state access and preservation boundary |
| `effects` | Declared effect IDs and completeness of the effect boundary |
| `outcome_policy`, `coverage`, `outcomes` | Applicability, permitted alternatives, and modeled behavioral coverage |
| `guarantees` | Operation-wide predicates, independent of the supplied outcome |
| `dependencies` | Required or optional related contracts and their roles |
| `implementations` | Individual implementation responsibilities and optional source links |
| `decisions` | Unresolved requirements, analysis limits, and implementation choices |
| `evidence_ids` | References to source, requirement, or design records |

The full schema is [specification.v0.3.json](../../schemas/specification.v0.3.json). JSON Schema defines record structure; the [semantic validator](../../src/specification/validate.ts) adds cross-reference and type constraints.
