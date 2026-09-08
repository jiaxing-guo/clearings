# Identity and validation

Identity, integrity, source authentication, claim support, and acceptance are distinct properties. A valid content digest establishes a relationship between bytes and an identifier; it does not authenticate an author or prove a semantic assertion.

## Distinguish the questions

Consider a specification containing an English requirement, its predicate, and a cited source excerpt. Each check establishes a different property:

| Question                                                | Property              |
| ------------------------------------------------------- | --------------------- |
| Does the artifact match its recorded digest?            | Integrity             |
| Does the excerpt match the claimed repository revision? | Source authentication |
| Does the cited source support the assertion?            | Claim support         |
| Does this observation satisfy the predicates?           | Observation agreement |
| Has the requirement been approved?                      | Acceptance            |

These properties are not interchangeable. In particular, a digest can be valid for an inaccurate interpretation. The stages below identify which properties the current validators check.

## Identity domains

| Identity                   | Bound information                                                          | Limit                                                |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Repository snapshot        | Immutable Git commit/tree and inventory metadata                           | Working-tree changes are outside the snapshot        |
| Structural artifact        | Extracted source records, facts, and analysis metadata                     | Does not establish runtime behavior                  |
| Authoring request          | Exact selected source, scope, instructions, budget, and structural binding | A proposal for a different request is stale          |
| Semantic artifact/proposal | Recorded content, provenance, references, and derived checks               | No automatic claim acceptance                        |
| v0.3 specification         | All specification content except its own `artifact_id`                     | No source authenticity or author authentication      |
| Semantic record ID         | A particular modeled entity within the applicable artifact                 | Cross-run identity reconciliation is not implemented |

`specificationIdentity` computes `specification:` followed by the SHA-256 digest of canonical JSON for the specification with `artifact_id` removed. Object keys are canonicalized recursively; array order remains significant. Narrative, source text, provenance, and decisions contribute to identity. A documentation edit embedded as source text therefore changes the specification identity.

`sealSpecification` creates a normalized copy with a computed identity and validates it. Sealing does not accept requirements or certify source conformance. The current encoding follows [the canonical serializer](../../src/repository/inventory.ts) and [identity helpers](../../src/semantics/identity.ts); it is not claimed to implement an external canonical-JSON standard.

Legacy semantic IDs are allocated UUIDs and should be retained when the same entity is explicitly revised. v0.3 uses schema-constrained string IDs and aliases; it does not require UUID allocation. Do not infer a cross-version entity mapping from matching names alone.

## Validation stages

| Stage            | Current checks                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Portability      | Supported JSON-like objects, finite numbers, dense arrays, no accessors/hidden/symbol properties, no object cycles                       |
| Schema           | Required fields, field domains, unknown-field rejection, supported version                                                               |
| Integrity        | Specification content digest and each attached source-text hash                                                                          |
| Provenance       | `intended` pairs with `user-directed-design`; `observed` pairs with `source-interpretation`; review remains `proposed`                   |
| References       | Unique canonical IDs, unambiguous operation selection, known evidence/state IDs, required dependencies, explicit transition dependencies |
| Types and scopes | Expression types, local bindings, legal guard roots, declared state access, assignable updates, literal-domain constraints               |
| Boundaries       | Known effect IDs, unique updates/effect references where required, a decision for partial operation coverage                             |

The v0.3 validator checks attached source text against its supplied hash. It does not reopen Git or validate a `symbol_id` against an authenticated scan. Source/requirement/design locators and bindings are recorded metadata.

Legacy request/model validation can additionally revalidate source against a supplied structural scan and repository. Without those inputs, internal digest checks do not establish repository authenticity. Even complete source revalidation does not prove that English claims follow from the excerpts.

## Resource limits

The portability guard defaults to at most 200,000 visited values and nesting depth 64. Violations produce `INVALID_SPECIFICATION`, including when the guard is reused for observation or sequence wrapper validation. These bounds are separate from the expression evaluator's work budget and the context byte budget.

The CLI reader used by inspection, context, checking, and semantic exchange applies a 64 MiB file limit. The `validate` command identifies the artifact family after parsing and applies that limit to specifications. Legacy validation has no explicit file-size cap; inventory and scan artifacts larger than 64 MiB remain validatable, subject to available memory and their existing validation rules.

## Claims outside validation

Validation does not establish exhaustive outcome coverage, predicate satisfiability, termination, complete call graphs, effect instrumentation, observation fidelity, requirement approval, source equivalence, or independent review. `coverage: complete` is an author declaration checked only against supplied cases by the observation checker.

A description can be stronger than its predicate. Review it against the expression and retain any residual obligation explicitly. See [operation semantics](../02-semantics/02-operations.md) and [abstraction mappings](../01-architecture/03-abstraction-and-refinement.md).

## Primary implementation

Use [specification validation](../../src/specification/validate.ts), [expression typing](../../src/specification/expressions.ts), [legacy exchange validation](../../src/semantics/validate.ts), and [contract validation](../../src/contracts/validate.ts) when reviewing a change to this contract.
