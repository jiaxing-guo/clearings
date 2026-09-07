# Conformance artifacts

Conformance artifacts describe evaluation scope and captured evidence. They have their own `0.1.0` schema versions and do not revise the v0.3 operation specification. Validation checks well-formedness, content identity, references, and declarations; it does not execute an implementation or establish observation fidelity.

## Read an authored example

The [return example](../../specifications/clearings/conformance/examples/return.json) uses `origin: authored-example`. It identifies the baseline implementation but explicitly marks its adapter, evaluator, and runtime as unavailable. All measurements are unobserved. Its illustrative payload is not a valid operation context. This demonstrates record structure without presenting an unperformed execution as evidence.

The [throw](../../specifications/clearings/conformance/examples/throw.json), [timeout](../../specifications/clearings/conformance/examples/timeout.json), and [harness-failure](../../specifications/clearings/conformance/examples/harness-failure.json) examples demonstrate the other completion classes with the same limitations.

Validate the examples after `npm run build`:

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConformanceProfile, validateExecutionRecord } from 'clearings/conformance';
const read = name => JSON.parse(readFileSync(`specifications/clearings/conformance/${name}.json`, 'utf8'));
const specification = read('specification');
const profile = read('profile');
validateConformanceProfile(profile, specification);
for (const name of ['return', 'throw', 'timeout', 'harness-failure']) {
  const record = read(`examples/${name}`);
  validateExecutionRecord(record, profile, specification);
  assert.equal(record.origin, 'authored-example');
  assert(record.measurements.every(item => item.status === 'unobserved'));
}
```

## Conformance profile

The [profile schema](../../schemas/conformance-profile.v0.1.json) and [TypeScript interfaces](../../src/conformance/model.ts) define the portable format. The [context-assembly profile](../../specifications/clearings/conformance/profile.json) is the canonical obligation ledger for this slice.

| Field | Contract |
| --- | --- |
| `artifact_id` | `conformance-profile:` plus the digest of canonical content excluding this field |
| `specification_id` | Exact content identity of the associated intended specification |
| `target` | Repository-relative module and exported API; recorded metadata, never a dynamic import instruction |
| `scope` | Input-domain assumptions, explicit requirement IDs, and exclusions |
| `completion_operations` | Distinct specification operation IDs for return and throw |
| `measurements` | Unique IDs, value types, origins, and concrete measurement procedures |
| `obligations` | One entry for every declared requirement, with operation/rule/measurement references, method, mandatory flag, and limitation |

Verification methods are `predicate`, `independent-check`, and `unresolved`. An independent check ID names a required procedure; it is not evidence that the procedure exists or has run. Requirement descriptions can be stronger than predicates, so a profile still requires semantic review even when references validate.

## Context-assembly obligation ledger

| ID | Requirement | Method | Required evidence |
| --- | --- | --- | --- |
| `closure` | Exact least required closure, root inclusion, uniqueness | Predicates | Invocation graph and returned IDs |
| `ordering` | Stable traversal and sorted record groups | Independent check | Returned sequence and independently computed order |
| `record-preservation` | Complete selected records and faithful digest projection | Independent check | Raw input/return records and corresponding digests |
| `decisions` | Retain decisions on selected operations | Predicate | Input decisions and returned decision IDs |
| `omissions` | Complete, disjoint partition of available operations | Predicates | Available, selected, and omitted IDs |
| `state-selection` | Exact state selection and preservation | Independent check | Raw state records and independent selection |
| `evidence-selection` | Exact source selection from declared metadata | Independent check | Raw source records and independent selection |
| `identity` | Retain the invocation specification identity | Predicate | Original and returned artifact IDs |
| `byte-accounting` | Correct counters, UTF-8 encoding, and capacity | Predicates | Reported counters and independently measured bytes |
| `input-preservation` | Equal input values at completion boundaries | Predicates | Before/after canonical argument digests |
| `error-precedence` | Required-reference, budget, selection, and capacity ordering | Guards and predicates | Original invocation and actual exception code |
| `budget-failure` | Exact required size and justified capacity failure | Independent check | Exception detail and independently constructed package |
| `external-effects` | No external effects | Unresolved; not mandatory | Complete effect instrumentation, currently unavailable |

All other ledger entries are mandatory within the declared scope. Native checks must establish the properties that their associated predicates do not express. In particular, digest membership alone does not establish that a projection contains every returned record. The record-preservation check must compare the complete raw records and validate the projection.

## Execution record

The [execution-record schema](../../schemas/execution-record.v0.1.json) requires one completion, original invocation arguments, a resulting capture or explicit absence, and every profile measurement marked observed or unobserved. It has no acceptance or verdict field.

| Identity | Recorded binding |
| --- | --- |
| Profile and specification | Exact content IDs |
| Implementation | Repository locator, Git commit/tree, entrypoint, and file digests including the entrypoint |
| Adapter and evaluator | Named content digests or explicit unavailability; a recorder must bind its adapter, while evaluation may follow capture |
| Fixture | SHA-256 of the canonical `arguments_before` value, plus a descriptive name |
| Runtime | Runtime/version/platform/architecture and dependency lockfile digest, or explicit unavailability in authored examples |

`recorded-execution` requires bound adapter and runtime identities. Its evaluator may remain explicitly unavailable when capture precedes independent evaluation. A future evaluation result must bind the evaluator it actually uses and the original record identity. These are structural declarations, not authentication of an execution claim. Source-file digests do not establish that the implementation file list contains the full transitive dependency closure; the recorder must define and capture that closure. Bound component digests identify component manifests or immutable bundles whose dependency scope must be documented.

The record digest uses the existing canonical serializer and includes all record fields except `artifact_id`. Consequently, a changed fixture, capture, measurement, limitation, or identity changes the record identity. Validation never resolves repository locators, opens claimed component files, loads an adapter, or verifies a signature.

An observed measurement must match its profile value type. Return-derived measurements require a captured return; exception-derived measurements require a captured exception; resulting-argument measurements require a captured resulting snapshot. Other measurement fidelity, timing, and independent computation remain outside structural validation.

## Library interfaces

| Function | Contract |
| --- | --- |
| `conformanceProfileIdentity(profile)` | Compute the profile identity; no validation or acceptance |
| `sealConformanceProfile(profile, specification)` | Normalize, compute identity, and validate against the exact intended specification |
| `validateConformanceProfile(value, specification)` | Assert profile schema, identity, rule/measurement references, and declared coverage |
| `executionRecordIdentity(record)` | Compute the execution-record identity; no execution |
| `sealExecutionRecord(record, profile, specification)` | Normalize, compute identity, and validate the record and its bindings |
| `validateExecutionRecord(value, profile, specification)` | Assert record structure, identity, complete measurement accounting, and basic completion consistency |

These functions and types are exported from `clearings/conformance`. This entrypoint keeps evaluation metadata separate from the core library exports. JSON Schema subpaths are `clearings/schemas/conformance-profile` and `clearings/schemas/execution-record`. Profile/record errors use `INVALID_CONFORMANCE`; reused portability and specification validation retain their existing errors. Portability limits remain 200,000 visited values and depth 64. Identity functions assume portable caller input; use sealing or validation at an input boundary.

No conformance CLI command or generic executable-module loader is introduced here. Existing `clearings validate` dispatch is unchanged and does not accept these new artifact families. Use the library validators and the executable example above.

## Reproduce the definitions

From the repository root:

```bash
python3 scripts/generate-conformance-schemas.py
npm run build
node scripts/build-conformance-examples.mjs
node --test tests/conformance.test.mjs
```

The schema generator reuses the existing v0.3 value-domain definitions. The authored-artifact builder writes only the new conformance directory and never invokes `assembleContext`. It reads the baseline implementation bytes from Git commit `9d1fede2a32c9575635e22aa7fabed1158224306` to identify the example target. Regeneration therefore requires that Git object; a checkout must fetch that baseline if its history is shallow. An optional output-directory argument lets the builder reproduce the artifacts elsewhere.

Frozen experiments and the historical bootstrap specification are not rewritten. See [conformance semantics](../02-semantics/04-executable-conformance.md) for the observation mapping and acceptance boundary.
