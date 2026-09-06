# Typed specifications and Clearings self-development

This design replaces prose-linked records as the primary interface for new semantic work. Historical source models remain readable. They are evidence-bearing observations; they do not become intended requirements through conversion.

## Bootstrap decision

The first operation is **assemble agent context**. Its consumer needs a selected operation's purpose, conditional outcomes, effects, dependencies, implementation roles, and unknowns together. The operation takes a specification, a selection, and a byte budget. It returns a self-contained package or an explicit error. Required information is never silently truncated.

The specification is authored before the new implementation. The active coding session then implements it. This is a continuing-session self-development experiment, not a fresh or independent agent trial. The compiler, test runner, typed expression interpreter, and structural validator form the initial implementation foundation.

## Canonical model

The v0.3 specification has an explicit `perspective`: `intended` or `observed`. Its content identity binds all records and provenance. A source-derived record never receives requirement acceptance automatically.

An operation owns typed inputs and outputs, its own purpose, state reads/writes, conditional outcomes, guarantees, permitted effects, dependency roles, implementation responsibilities, and open decisions. Dependencies are typed references, not an execution trace. Cycles are valid. A transition links an outcome to a declared dependent operation, with a specific handoff role. A complete call graph is not claimed.

Conditions use an expression tree with literals, scoped references, boolean composition, comparisons, collection membership, and bounded universal quantification. No source, JavaScript, or expression string is executed. `opaque` conditions retain unsupported meaning explicitly and evaluate to unknown. The interpreter reports pass, fail, or unknown. A model accepting a scenario is not a proof that source implements the model.

State fields have separate identities and types. A complete frame preserves every modeled field outside the write set; a partial frame makes no such guarantee. Effect declarations distinguish required from permitted effects. An empty complete effect list forbids effects; an empty partial list does not establish purity.

Open decisions distinguish unresolved requirements, analysis limits, and intentional implementation choices. Source anchors retain exact text and hashes. Source integrity and assertion support remain separate.

## Context assembly requirements

1. Resolve a root by exact ID or unique alias. Reject an absent or ambiguous root.
2. Follow required dependency edges to a fixed point. Keep each operation once, including in cycles. Required dependency order is stable and starts with the selected operation.
3. Reject missing required dependencies. Optional dependencies may be absent, and remain listed as deferred references.
4. Return each operation's meaning with its fields inline. Dependency references include the target's name and the reason for the link. Implementation entries explain each function's individual responsibility.
5. Include all state fields and source records referenced by the selected operations. Keep every applicable open decision, including blocking decisions. A partial package is inspectable; it is not an accepted specification.
6. Report omitted operations and deferred optional links. An omitted branch inside a selected operation is never treated as optional.
7. Measure compact UTF-8 JSON plus one final newline. Include the accounting fields themselves. A budget equal to the required size succeeds; one byte less fails with the measured required size.
8. Selection, rendering, and checking do not mutate input records or execute analyzed source. Repeated input produces identical serialized output.
9. Bind context to the exact specification identity and perspective. Describe how to retrieve deferred information.

## Review before implementation

The author-reviewed cases are: a single operation; a diamond dependency; a dependency cycle; a missing root; a missing required edge; an absent optional target; a blocking unknown; exact and insufficient byte budgets; Unicode; a state write with an unchanged field; an undeclared effect; and an opaque condition. Independent held-out evaluation remains future work.

A later [fresh-agent experiment](../benchmarks/agent-runs/luna-impact-001/REPORT.md) used a separately frozen dependency-impact task. Its candidate passed the withheld feature checks. This does not change the authorship or evidence boundary of the original context-assembly bootstrap. The new task also exposed a gap: some executable predicates cover less than their English descriptions. The review must distinguish predicate results from unverified prose obligations.

The conformance checks must also reject deliberately incorrect implementations: dropping a required dependency, losing an unknown, claiming the wrong specification identity, silently truncating to fit, and changing input data. These cases live outside the specification consumed by the implementation.

## Human and agent interfaces

One report starts with purpose and a concrete scenario, then shows rules/outcomes, then implementation and evidence. The graph is a generated relationship view. It does not replace the conditions and guarantees. The agent gets the same rules as self-contained JSON or deterministic readable text; the HTML is a human view.

The legacy v0.2 adapter resolves assertion text without inventing formal predicates. Its prose remains explicitly unformalized. The Hono observed specification provides a separately authored typed response-selection slice with source links. Existing engineer and overview reports remain historical source-backed views.

## Scope

Implement the typed kernel, scenario checker, required-context closure, readable projections, CLI, Clearings specification/demo, and Hono response-selection example. Do not add a solver, hosted service, provider SDK, universal source-to-specification conversion, or automatic requirement acceptance. Formal proof, concurrency model checking, source equivalence, and fresh-agent performance evaluation are not established by this bootstrap.
