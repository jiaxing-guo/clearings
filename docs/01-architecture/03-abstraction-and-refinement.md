# Abstraction and refinement

An abstraction mapping relates concrete program behavior to the values represented by a contract. Refinement asks whether the implementation's abstracted behaviors are permitted by that contract.

**Implementation status:** Clearings evaluates supplied abstract observations and implements a concrete recording and mapping procedure for context assembly. General abstraction adapters and refinement proof procedures remain design concepts.

## Abstract domains

A contract may represent only the distinctions relevant to a particular behavior. The Hono response-selection model classifies results as `truthy`, `non-nullish-falsy`, or `nullish`. It records whether a response is present and whether the context is finalized, without representing every HTTP header or response byte.

This abstraction permits useful local reasoning. It also limits which implementation properties can be inferred. Equality of the modeled state does not imply equality of all concrete program state.

| Concrete behavior | Existing abstract representation | Boundary |
| --- | --- | --- |
| A direct result is `null` or `undefined` | `path: direct`, `value: nullish` | Both values belong to one category |
| A Promise resolves to `0` | `path: promise`, `value: non-nullish-falsy` | Classification occurs outside the checker |
| Response storage is initialized by the getter | `response-present` changes to `true` | The concrete response object is omitted |
| A setter successfully assigns `undefined` | Output label `stored`; storage absent; finalized true | `stored` is a model label, not a TypeScript return value |
| A header merge throws | Output label `propagated-error` | Unmodeled intermediate header mutations remain unconstrained |

These mappings summarize the [authored Hono slice](../../specifications/hono/response-selection.json). They do not establish source conformance. The `path` field represents a branch already classified by the observer; the specification does not classify arbitrary thenables.

## What abstraction discards

If two concrete executions both map to `output: not-found`, the checker sees the same output category. They can still differ in response headers, allocation, timing, or other concrete behavior. A contract constrains those differences only when its state, effects, or values represent them.

Choose an abstract domain by identifying the distinctions needed for the requirement. Then document how the observer obtains those values. A detailed JSON record does not establish that this mapping is faithful.

## Observation adapters

An observation adapter translates a concrete execution or test fixture into `OperationObservation`. For a reproducible evaluation, its documentation should identify:

1. The concrete API, source revision, and modeled operation.
2. The classification of concrete inputs, returns, and exceptions.
3. The concrete storage instance represented by each state ID.
4. The measurement points for `before` and `after`.
5. How effect IDs are captured, and which effects are unobserved.
6. Which values are independently measured, manually supplied, or derived from the candidate under test.

The [conformance profile and execution record](../03-reference/05-conformance-artifacts.md) serialize measurement procedures, component identities, completion classes, and obligation coverage for the bounded context-assembly slice. Their validators do not execute the adapter or establish mapping fidelity. The separate `recordContextAssembly` and `mapContextAssemblyObservation` APIs capture actual evidence and check its projections for that slice. `ImplementationRole` still records a responsibility and optional symbol/evidence links; it does not encode an executable adapter. `SpecificationSource.binding` records provenance identity, not an abstraction function.

## Refinement

Let `B(P)` denote the concrete behaviors of an implementation `P` within the stated environment and preconditions. Let `A(S)` denote the behaviors permitted by a specification `S`. Given an abstraction mapping `alpha`, the intended refinement obligation is:

```text
alpha(B(P)) is a subset of A(S)
```

The environment, observable state/effects, exceptional behavior, and termination assumptions must be stated before this relation is useful. Partial boundaries constrain only the modeled projection. This notation describes a design obligation; Clearings does not compute either behavior set or prove the inclusion.

`checkOperation(S, operation, observation)` evaluates one supplied observation. A passing result is evidence about that observation and those predicates. It does not establish universal refinement. An observation copied from candidate verdicts can test result aggregation while leaving the truth of those verdicts unchecked.

## Abstraction levels and implementation status

| Level | Responsibility | Existing basis |
| --- | --- | --- |
| Behavior specification | External capabilities, outcomes, invariants, failure policies | Legacy capability and behavior records |
| Operation contract IR | Typed interfaces, guards, postconditions, state, effects | Current v0.3 model |
| Implementation IR | Concrete values, algorithms, calls, and control flow | [Program IR v0.1](../02-semantics/05-program-ir.md) syntax, static validation, and reference interpretation; target lowering remains subsequent work |

Contract-to-implementation conversion is synthesis and refinement: multiple algorithms may satisfy the same contract. Once implementation choices are explicit, a later source-emission step can be deterministic. A report, larger context package, or additional schema version alone does not create a new abstraction level.

Program IR now has static checks, a reference interpreter, and an [ordered required dependency closure implementation](../02-semantics/06-required-dependency-closure.md). Independent graph-domain tests evaluate that algorithm separately from language tests. This establishes bounded algorithm agreement; it does not prove universal contract refinement. The [implementation plan](../05-development/04-program-ir-plan.md) retains CLI and developer-workflow integration as the next step. A later lowering pass must define and independently validate its transformation contract. Do not treat prose-linked historical models as automatically formalized lower or higher levels.
