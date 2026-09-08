# Context and projections

Context assembly selects canonical records for a consumer. It does not infer new behavior, formalize prose, execute dependency edges, or accept requirements.

## Follow a required dependency

Suppose operation `A` requires `B`, and `B` requires `A`. Operation `A` also has an optional dependency on `C`. Selecting `A` includes `A` and `B` once each; the cycle terminates, and the optional edge alone does not include `C`.

| Record                                | Included?    | Reason                                    |
| ------------------------------------- | ------------ | ----------------------------------------- |
| `A`                                   | Yes          | Selected root                             |
| `B`                                   | Yes          | Required dependency                       |
| `C`                                   | No           | Only optionally reachable in this example |
| Decisions and outcomes of `A` and `B` | Yes, in full | Part of the selected contracts            |

State and evidence records follow the inclusion rules below. If the complete required package exceeds the byte budget, assembly raises an error. It does not remove postconditions to produce a smaller package.

## v0.3 selection

`assembleContext(specification, selection, { maxBytes })` validates the whole specification and resolves an operation by exact ID or unambiguous alias. Missing required references are rejected even outside the selected root.

Starting from the root, it computes the least set closed under required dependency edges. Optional edges do not expand the selection. Traversal is breadth-first, with required target IDs sorted at each expansion. Each operation appears once; the root appears first. Cycles terminate through visited-ID tracking.

The same ordered closure kernel now has an [implementation in Program IR](../02-semantics/06-required-dependency-closure.md), evaluated independently on bounded graph inputs. That program operates on explicit roots and record/dependency values. It does not perform whole-specification validation, alias resolution, state/evidence projection, or byte accounting. The production assembler retains the TypeScript kernel in this version.

Each selected operation is retained in full, including every outcome, rule, implementation responsibility, and decision. State selection includes all declared reads/writes; if any selected operation has a complete frame, all modeled state fields are included. State and source records are sorted by ID. All evidence referenced by selected operations and state records is attached.

Evidence references come from the schema-defined `evidence_ids` fields on operations, guarantees, outcomes, postconditions, implementation responsibilities, decisions, and selected state records. Keys named `evidence_ids` inside expression literals are ordinary JSON data and do not select source records.

The package retains specification identity, perspective, provenance, relationship roles, omitted operation IDs, and deferred dependencies. A deferred dependency records whether its target exists in the original specification. An optional target can still be included if it is reachable through another required path.

## Budget semantics

The supported budget is an integer from 1 through 2,097,152 bytes. Serialization is compact `JSON.stringify` output followed by one newline, measured as UTF-8. Accounting includes metadata and the counters themselves.

`accountBytes` iterates until the encoded counters stabilize, with a maximum of 16 attempts. For v0.3, `required_bytes` and `used_bytes` are equal because optional expansion is not performed. A package fits when its measured size is at most `max_bytes`; otherwise assembly throws `CONTEXT_BUDGET` with `details.required_bytes` and `details.max_bytes`. Its existing message, error code, and exit code are preserved. These details describe the package computed for that exact requested budget.

The budget applies to the serialized JSON package. It is not a token count, a bound on rendered HTML/Markdown, or a guarantee of efficient model context use. No selected outcome or decision is truncated to satisfy the budget. Changing the requested budget can change the size because `max_bytes` itself is serialized; exact-boundary reasoning must use the size of that candidate package.

## Integrity and ownership

The assembler returns a normalized copy and does not mutate the specification. Repeated identical input yields identical serialized output. Use `serializeOperationContext` for the measured format; pretty-printing changes the byte count.

`validateOperationContext(context, specification)` reconstructs the expected package using its selection and budget, then compares canonical values. Identity comparison alone is insufficient: reconstruction detects altered records, omissions, provenance, and accounting.

## Human projections

`renderSpecification` assembles context and renders Markdown or HTML. `renderOperationContext` accepts an existing package. Supply its original specification to revalidate that package. Without a supplied specification and without scenarios, the renderer expects a trusted, previously validated package.

Scenario rendering requires the original specification. It checks scenario bindings and recomputes results from observations instead of trusting stale caller-provided verdicts. Human rendering preserves the canonical records and exposes source and exact predicates, but its reading order is presentation metadata, not execution order.

`describeOperation` is a readable summary of selected fields. It does not include every contract field and must not replace a complete operation package when formal obligations matter.

## Legacy context

v0.2 context selection follows function dependencies, state, assertions, flow records, implementation anchors, and applicable critical unknowns. Referenced flows remain complete. Optional neighboring behaviors can be added in stable order if their complete closure fits; `includeNeighbors: false` disables that expansion.

`required_bytes` records the required legacy package before optional additions; `used_bytes` records the final package. `createContractBrief` resolves English assertion text in place and labels it `legacy-prose-only`. It does not synthesize typed predicates.

Historical audience reports use their own v0.2 artifact and presentation plan. The newer typed Hono slice has a separate identity and narrower scope. Neither shared branding nor adjacent report links make these the same model.

See [context implementation](../../src/specification/context.ts), [dependency traversal](../../src/analysis/dependencies.ts), [byte accounting](../../src/analysis/budget.ts), and [legacy query implementation](../../src/contracts/query.ts).
