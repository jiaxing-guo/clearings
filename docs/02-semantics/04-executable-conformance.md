# Executable conformance

Executable conformance relates a concrete invocation to an operation specification through an explicit observation mapping and independently defined checks. The scope is a stated set of inputs, completion classes, and observable properties.

**Implementation status:** Clearings defines and validates conformance profiles and execution-record formats. The context-assembly contracts, obligation ledger, and four protocol examples are authored artifacts. The execution recorder, observation adapter, independent evaluator, acceptance report, and replay command are subsequent work. No implementation is executed when these artifacts are generated or validated.

## One byte-accounting obligation

Suppose an implementation returns a context whose `budget.used_bytes` is 980. An independent encoder measures 1,012 UTF-8 bytes for the complete package, including its final newline. The adapter must preserve both values. The byte-accounting predicate then fails their equality comparison. Substituting 1,012 for the reported counter would conceal the implementation defect.

| Evidence | Value | Source |
| --- | --- | --- |
| Reported byte count | 980 | Actual returned `budget.used_bytes` |
| Measured byte count | 1,012 | Independent encoding of the entire returned package |
| Equality check | Fail | Comparison of the two separately captured values |

This is an illustrative case, not an execution result. The [conformance profile](../../specifications/clearings/conformance/profile.json) defines the measurement procedures and verification obligations.

## Responsibilities

| Component | Responsibility | Current availability |
| --- | --- | --- |
| Operation specification | Define allowed behavior and residual obligations | Two authored v0.3 completion contracts |
| Conformance profile | Declare input scope, measurements, obligation coverage, and verification methods | Schema, TypeScript types, and cross-reference validation |
| Recorder | Capture actual arguments, completion, and resulting state | Planned |
| Observation adapter | Map raw evidence to typed observations without replacing missing information | Protocol defined; implementation planned |
| Independent evaluator | Establish reference results and check obligations beyond the predicates | Named checks defined; implementation planned |
| Report | Present scoped results, unknowns, coverage, and reproduction details | Planned |

The profile and record are evaluation metadata. They are not Program IR, a compiler lowering level, or an extension to the v0.3 expression language. The [historical bootstrap demonstration](../../benchmarks/results/clearings-bootstrap/README.md) remains a separate recorded experiment.

## Completion classes

An execution record distinguishes `return`, `throw`, `timeout`, and `harness-failure`. Return and throw contain an explicitly captured value or an unavailable capture with a reason. JSON `null` is a captured value when observed. It never denotes an absent capture.

The context-assembly profile maps successful completion to `assembly-return` and exceptional completion to `assembly-throw`. These are two observation contracts for the same `assembleContext` API. They are not separate implementation functions. Separate output types avoid inventing an empty return package when an invocation throws.

The exception projection contains the actual string `code` and a `required_bytes` list. This list encodes an optional structured error detail: zero elements means the exception did not provide that detail; one element is its observed value. The budget-failure contract requires exactly one value. Absence is never replaced with a numeric zero. Structured error details will be added with the recorder; current production error messages are not parsed by this protocol.

Timeout and harness failure are evaluation failures. They do not select an application outcome or manufacture a passing observation. If a return value cannot be captured, its return-derived measurements remain unobserved. If an exception cannot be captured, the same restriction applies to exception-derived measurements.

When the completion class is known but its value cannot be represented, retain `return` or `throw` with an unavailable capture. Use `harness-failure` when the recorder cannot reliably establish the application completion class. This prevents a serialization failure from erasing a known return or exception.

## Observation mapping

The recorder retains original JSON invocation arguments before execution, an available resulting snapshot, and the actual completion. An adapter constructs the following fields from separately identified measurements:

| Contract field | Measurement or raw evidence |
| --- | --- |
| Root, available IDs, required edges, budget, artifact ID, decisions | `invocation`; valid aliases resolve against the original specification |
| Input operation digests | `input-records` |
| Returned IDs, complete record digests, and reported counters | `returned-context` and `returned-records`, checked against the raw returned value |
| `output.measured_bytes` | `serialized-bytes`, independently computed |
| Initial and resulting argument digest state | `arguments-before-digest` and `arguments-after-digest` |
| Exception code and optional required size | `exception`, derived from the captured thrown value |
| Required package size used by the independent evaluator | `reference-required-bytes`, never taken from the candidate error |
| Expected traversal and state/evidence selection | `expected-projection`, independently derived from invocation inputs |
| Effect occurrences | `effects`, available only with the declared instrumentation coverage |

Before constructing an observation, the adapter must validate the required measurement types and availability. Partial v0.3 output records are not allowed. If required fields cannot be constructed, preserve the unmapped record and the mapping failure; do not insert plausible defaults. Unknown exception codes remain visible as unsupported or failing behavior. Outcome IDs must be selected from the observed completion and code, never copied from fixture expectations.

The current artifact validator checks declared measurement types and basic completion consistency. It does not perform this mapping, verify its fidelity, or recompute measurements from raw captures. Those are adapter and evaluator responsibilities.

## Scope and error precedence

The initial profile covers portable invocation specifications whose schemas, identities, and expression types are valid. Required dependency targets may be absent to exercise that error path. Selections are nonempty strings. Budgets are safe integers, including zero, negative integers, and values above the supported maximum. Noninteger/nonfinite budgets, other invalid specifications, and non-JSON arguments are excluded from this profile; their existing API behavior is not removed.

Within that domain, exception guards encode this order:

1. Reject missing required references anywhere in the invocation specification.
2. Reject a budget outside 1 through 2,097,152.
3. Reject an absent operation selection.
4. Reject a complete package that does not fit the requested budget.

The first three conditions are expressible in the contract. Determining whether a valid invocation should return or raise `CONTEXT_BUDGET` also requires an independently constructed complete package. The corresponding residual predicate stays opaque until that independent check is supplied.

Input preservation compares canonical argument content at invocation boundaries. It does not establish absence of transient writes that are later restored or of aliases retained after return. General effect freedom is explicitly unresolved; an empty recorded trace cannot establish it without an adequate monitor.

## Obligation coverage and acceptance

The profile has 13 obligations: seven predicate-verifiable declarations, five independent-check declarations, and one unresolved external-effect obligation. Twelve obligations are mandatory for the defined scope. These categories describe required verification methods, not completed verification results.

Every declared requirement must have exactly one ledger entry. Every guarantee and postcondition in the mapped completion contracts must appear in the ledger. Guards define applicability and error precedence; their evaluation is required alongside the associated predicates. Predicate verification must cover every referenced rule and cannot include an opaque expression. A mandatory obligation cannot be classified as unresolved.

Future scoped acceptance requires passing checks for every applicable mandatory obligation. It must retain unresolved requirements and distinguish an inapplicable obligation from an unknown one. Timeout, harness failure, mapping failure, or missing required evidence cannot count as conformance. The acceptance report is not implemented in this PR.

Even an otherwise correct supplied case currently has an overall typed verdict of `unknown`, because independent checks and external effects remain opaque. Passing schema validation or the repository tests does not change that verdict. A future report may establish scoped acceptance while still displaying the broader contract's unresolved obligations; it must not relabel the broad contract as proved.

See [artifact interfaces and the obligation ledger](../03-reference/05-conformance-artifacts.md), [abstraction and refinement](../01-architecture/03-abstraction-and-refinement.md), and [the implementation sequence](../05-development/03-conformance-plan.md).
