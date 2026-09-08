# Your first operation contract

Follow one Hono response-selection case from its contract to a check result. By the end, you should be able to distinguish a guard from a postcondition, interpret `pass`, `fail`, and `unknown`, and identify what a passing check leaves unverified.

You need basic familiarity with functions and JSON. Reading this tutorial does not require a Hono checkout or an API key. To run the commands, use the [Hono case guide](../04-guides/01-check-a-case.md).

## 1. Start with a behavior question

Suppose a handler returns `undefined` directly while the context is already finalized. Does the response-selection operation use the context response or select the not-found handler?

The authored [Hono specification](../../specifications/hono/response-selection.json) says that this direct nullish branch selects the not-found handler. The finalized state does not alter that branch. A falsy Promise result follows a different branch.

This is an interpretation recorded in the specification. Checking a supplied case against it does not independently verify the interpretation against Hono source.

## 2. Choose the abstract values

The contract records distinctions needed for response selection:

| Concrete fact                                         | Observation field  | Abstract value |
| ----------------------------------------------------- | ------------------ | -------------- |
| The handler returns directly                          | `input.path`       | `direct`       |
| The result is `undefined`                             | `input.value`      | `nullish`      |
| The context is already finalized                      | `before.finalized` | `true`         |
| The selected response source is the not-found handler | `output`           | `not-found`    |

The label `nullish` includes both `null` and `undefined`. The output label identifies a response source; it is not an HTTP response object. These choices form part of the [abstraction mapping](../01-architecture/03-abstraction-and-refinement.md).

## 3. Read the guard and postcondition

The selected outcome is `outcome:direct-missing`. Its guard determines when the branch applies. Its postcondition constrains the observed result.

```text
Guard:         input.path = "direct" and input.value = "nullish"
Postcondition: output = "not-found"
```

This notation is a readable summary of the expression AST. It is not a second executable contract language. The [operation reference](../02-semantics/02-operations.md) displays the exact record and provides an interactive comparison of the cases below.

A guard classifies the supplied input and initial state. A postcondition checks the supplied result. The checker does not call a handler, generate a response, or infer a missing observation.

## 4. Supply an observation

An observation records the values you want to check:

```json
{
  "input": { "path": "direct", "value": "nullish" },
  "before": { "finalized": true },
  "outcome": "outcome:direct-missing",
  "output": "not-found"
}
```

The observation explicitly names the outcome. A true guard does not cause the checker to fill in a missing outcome ID.

## 5. Compare three results

Keep the input, initial state, and outcome fixed. Change only the output field:

| Supplied output    | Guard | Output postcondition | Aggregate verdict |
| ------------------ | ----- | -------------------- | ----------------- |
| `not-found`        | True  | True                 | `pass`            |
| `context-response` | True  | False                | `fail`            |
| Omitted            | True  | Unknown              | `unknown`         |

The differing output is a known violation. The omitted output is insufficient evidence. Substituting JSON `null` would instead violate this operation's output type and raise an input error.

The [observation reference](../02-semantics/03-observations-and-sequences.md) defines aggregation when a check contains several rules. A failure takes precedence over unknown results.

## 6. State the conclusion precisely

A passing result establishes agreement between this observation and the evaluated rules. This operation declares partial coverage, a partial state frame, and a partial effect boundary. Unmodeled cases, state changes, and effects remain outside the result.

Clearings does not establish that the supplied execution happened, that every source execution satisfies the contract, or that all narrative requirements are encoded. Those questions require an observation adapter, source review, or additional validation.

## Continue

- [Check the case locally](../04-guides/01-check-a-case.md) using the library or CLI.
- [Inspect operation semantics](../02-semantics/02-operations.md) for outcomes, state frames, and effects.
- [Understand the system architecture](../01-architecture/01-system.md) to see how specifications, source evidence, and context packages relate.
