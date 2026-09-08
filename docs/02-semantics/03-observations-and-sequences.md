# Observations and sequences

The checker evaluates supplied observations against modeled rules. It does not execute target code, discover the actual outcome, or prove source conformance.

## Interpret a check result

For a branch whose postcondition requires `output = "not-found"`, an observed `context-response` is a failure. If the output is omitted, that predicate is unknown. If the output has an invalid type, observation validation raises an error before returning a verdict.

| Situation                                          | Result    | What to do next                                                |
| -------------------------------------------------- | --------- | -------------------------------------------------------------- |
| Every evaluated constraint agrees                  | `pass`    | Review the result's modeled scope and limitations              |
| At least one constraint is false                   | `fail`    | Inspect the failed rule and its supplied values                |
| No failures, but at least one check lacks a result | `unknown` | Supply the missing observation or review the opaque obligation |
| Observation shape, domain, or selection is invalid | Exception | Correct the input before interpreting semantics                |

A rejected write or propagated error can satisfy a contract that permits it. The verdict describes contract agreement, not whether the application operation succeeded.

## Observation protocol

| Field     | Required? | Meaning                                                                                                      |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `input`   | Yes       | Exact record matching all declared inputs                                                                    |
| `before`  | Yes       | Map of observed initial state fields; may omit fields, but supplied fields must be known and correctly typed |
| `outcome` | No        | ID of the observed modeled outcome                                                                           |
| `output`  | No        | Observed result matching the output type                                                                     |
| `after`   | No        | Map of observed resulting state fields                                                                       |
| `effects` | No        | List of observed effect IDs                                                                                  |

Unknown top-level keys, invalid types, unknown state IDs, and unknown outcome IDs are invalid observations. Invalid input throws an error rather than producing a semantic verdict. To represent missing information, omit the optional field or the relevant state entry. JSON `null` is a known value and is valid only in a compatible declared domain. Partial operation inputs are not accepted.

## Single-operation evaluation

`checkOperation` validates the complete specification and observation, resolves the operation by ID or alias, and performs these checks:

1. Evaluate operation-wide guarantees, even if `outcome` is absent.
2. Evaluate every outcome guard, recording true and unknown guards separately.
3. Check observed exclusivity and uncovered cases according to the policy and coverage declarations.
4. If `outcome` is absent, report an unknown observed-outcome check. A supplied effect trace is still checked against a complete operation-level boundary.
5. If `outcome` is present, check its guard, postconditions, updates, and applicable effect requirements.
6. For a complete frame, check preservation of every modeled field outside the write set.
7. Aggregate the check verdicts and retain limitations.

The checker does not infer a missing outcome even when exactly one guard is true. Missing data needed by a predicate yields unknown. Partial coverage, frames, effects, and decisions are retained as limitations; their presence alone does not force an unknown verdict for an otherwise checked case.

## Verdict aggregation

The aggregate is `fail` if any constituent check fails; otherwise `unknown` if any check is unknown; otherwise `pass`.

| Combined with | `pass`    | `unknown` | `fail` |
| ------------- | --------- | --------- | ------ |
| `pass`        | `pass`    | `unknown` | `fail` |
| `unknown`     | `unknown` | `unknown` | `fail` |
| `fail`        | `fail`    | `fail`    | `fail` |

A known violation therefore remains a failure even when other observations are missing. A contract can legitimately permit an error result: a rejected write that preserves required state can pass its contract.

`OperationCheck` contains the specification identity, operation ID, perspective, aggregate verdict, applicable and uncertain outcome IDs, individual checks, and limitations. A pass covers these predicates and this observation, not all behavior described in prose or all executions of the source.

## Sequence evaluation

`checkOperationSequence(spec, steps, { stateIds })` accepts 1–256 ordered records. Each step contains exactly `operation` and `observation`. The function delegates each observation to `checkOperation` and compares selected state across each adjacent pair:

```text
steps[i].observation.after[state_id]
    equals
steps[i + 1].observation.before[state_id]
```

Both values known and equal produce `pass`; both known and unequal produce `fail`; either missing produces `unknown`. Object-key order is irrelevant, but array order matters. The checker does not fill missing state using earlier observations or frame conditions.

`stateIds` is required. Unknown IDs are invalid. Duplicate IDs are removed and the remainder are sorted in default JavaScript string order. An empty selection checks individual operations without continuity checks. Step order is preserved; every adjacent pair and selected state is checked, including after an earlier failure. The continuity result count is `(steps.length - 1) * distinctStateIds.length`.

The caller must establish that a selected ID refers to the same storage instance across records. Equal field names or matching scope metadata do not establish that fact.

## Sequence result and limits

The result includes `steps`, `continuity`, selected `state_ids`, specification identity and perspective, and an aggregate verdict using the same precedence. It retains `interpretation: supplied-observations-only` and `acceptance: proposed`. Invalid input throws without returning a partial report.

The sequence checker does not validate transition legality, observe runtime order, model concurrency, or prove composition of contracts. It revalidates the specification through the per-step checker; no performance improvement is claimed. See [implementation](../../src/specification/sequence.ts), [API reference](../03-reference/03-api-and-cli.md), and the [executable example](../04-guides/02-author-and-review.md).
