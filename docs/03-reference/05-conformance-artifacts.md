# Conformance artifacts

Conformance artifacts describe evaluation scope and captured evidence. They have their own `0.1.0` schema versions and do not revise the v0.3 operation specification. Validation checks well-formedness, content identity, references, and declarations; it does not execute an implementation or establish observation fidelity.

## Read an authored example

The [return example](../../specifications/clearings/conformance/examples/return.json) uses `origin: authored-example`. It identifies the baseline implementation but explicitly marks its adapter, evaluator, and runtime as unavailable. All measurements are unobserved. Its illustrative payload is not a valid operation context. This demonstrates record structure without presenting an unperformed execution as evidence.

The [throw](../../specifications/clearings/conformance/examples/throw.json), [timeout](../../specifications/clearings/conformance/examples/timeout.json), and [harness-failure](../../specifications/clearings/conformance/examples/harness-failure.json) examples demonstrate the other completion classes with the same limitations.

These files retain the initial definition-stage provenance and unavailable components. Introducing a recorder does not convert them into execution evidence. Use [Record a context-assembly invocation](../04-guides/03-record-context-assembly.md) for a fresh execution.

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
| `measurements` | Unique IDs, value types, origins, capture prerequisites, and concrete measurement procedures |
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

An observed measurement must match its profile value type and satisfy every entry in its definition's `capture_requirements`. The permitted prerequisites are `arguments-before`, `arguments-after`, `return`, and `exception`; an empty list declares no capture prerequisite. Original arguments are always present in a valid record. The other prerequisites require a captured resulting snapshot, return value, or exception respectively. A direct capture source must appear in its measurement's prerequisites.

Measurement origin and capture prerequisites are separate properties. `serialized-bytes` has `source: "independent"` and `capture_requirements: ["return"]`: independent computation still requires the candidate's captured return. `reference-required-bytes` and `expected-projection` require only `arguments-before` and may be observed without a candidate return. Missing prerequisites require an unobserved measurement. Validation checks these declarations; their semantic completeness, measurement fidelity, timing, and independent computation remain outside structural validation.

## Library interfaces

| Function | Contract |
| --- | --- |
| `conformanceProfileIdentity(profile)` | Compute the profile identity; no validation or acceptance |
| `sealConformanceProfile(profile, specification)` | Normalize, compute identity, and validate against the exact intended specification |
| `validateConformanceProfile(value, specification)` | Assert profile schema, identity, rule/measurement references, and declared coverage |
| `executionRecordIdentity(record)` | Compute the execution-record identity; no execution |
| `sealExecutionRecord(record, profile, specification)` | Normalize, compute identity, and validate the record and its bindings |
| `validateExecutionRecord(value, profile, specification)` | Assert record structure, identity, complete measurement accounting, and basic completion consistency |
| `getContextAssemblyContract()` | Read and validate an owned copy of the bundled context-assembly profile and intended specification |
| `recordContextAssembly(options)` | Execute the synchronous context-assembly API in a bounded worker and return a sealed `ExecutionRecord` |
| `mapContextAssemblyObservation(record)` | Validate the built-in contract binding and supported measurement projections; return a typed observation or an explicit mapping failure |

These functions and types are exported from `clearings/conformance`. This entrypoint keeps evaluation metadata separate from the core library exports. JSON Schema subpaths are `clearings/schemas/conformance-profile` and `clearings/schemas/execution-record`. Profile/record errors use `INVALID_CONFORMANCE`; reused portability and specification validation retain their existing errors. Portability limits remain 200,000 visited values and depth 64. Identity functions assume portable caller input; use sealing or validation at an input boundary.

No conformance CLI command or generic executable-module loader is introduced here. Existing `clearings validate` dispatch is unchanged and does not accept these new artifact families. Use the library validators and the executable example above.

## Recording interface and identity scope

`RecordContextAssemblyOptions` requires a canonical `case_id` and `invocation: { specification, selection, options: { maxBytes } }`. Optional fields are `fixture_name`, `implementation_root`, `repository`, and `timeout_ms`. The default target is the current built Git checkout. A custom target must be a Git working-tree root with regular `src/specification/context.ts`, `dist/specification/context.js`, `package.json`, and `package-lock.json` files. The loaded export is always `assembleContext`. Repository locators are metadata and are never fetched; a custom checkout defaults to its local file URL.

The recorder validates the profile input domain, allowing missing required dependency targets while checking other specification constraints. Dependency declarations remain subject to uniqueness and transition-reference checks even when their targets are absent. The original dependency requirements are preserved in the recorded and executed invocation. It copies invocation values before worker transfer. Nonportable inputs and values exceeding 25,000 visited values or depth 48 are rejected before execution. Returned values and resulting snapshots have the same capture limits; unsupported values remain unavailable. Promise returns are not awaited because the declared API is synchronous. Native errors are projected to own string-keyed data fields plus inherited data properties for `name` and `message`; stack traces and prototypes are excluded. Accessor fields are not invoked.

`timeout_ms` defaults to 10,000 and accepts integers from 1 through 60,000. It covers worker startup, candidate import, invocation, and capture. The worker is terminated after recording or timeout. If the completion class is already known, a capture failure or deadline preserves that class with an unavailable value and any resulting snapshot already received. A deadline without a known completion produces `timeout`; unexpected worker failure produces `harness-failure` with the known phase. Worker termination and V8 heap limits are resource controls, not a security sandbox or complete effect instrumentation. Candidate code must be trusted local code.

Implementation manifests include regular `.ts`, `.js`, and `.json` files under the target's `src`, `dist`, and `schemas` directories, excluding declaration files, plus package metadata and bundled conformance contracts when present. Manifest roots, traversed subdirectories, and ancestor directories of bundled contract files must be directories without symbolic links; symbolic links to files are also rejected. The adapter digest binds the same file-set scope in the recorder checkout. Git commit/tree identify the baseline; file digests identify working bytes read before execution, including dirty files and emitted JavaScript. The manifest therefore records actual runtime files without claiming that the Git commit contains every working change or that the source compiled to those bytes. Installed dependency bytes, external dynamic imports, and native modules are not authenticated; the runtime binding includes the target lockfile digest. Concurrent file modifications are outside this protocol. Both the recorder and candidate require built source checkouts; execution from a source-free installed package is not supported.

Failure to bind the checkout produces `CONFORMANCE_PREPARATION` before execution because a complete execution record cannot be formed. Invalid recorder options produce `INVALID_CONFORMANCE`; input portability and specification checks retain their existing errors. After preparation, application and worker completions are represented in the returned record.

`ContextAssemblyMapping` binds the source `record_id`, `profile_id`, and `specification_id`. A `mapped` result contains `operation_id` and `observation`; an `unmapped` result contains `reason` and `missing_measurement_ids`. Neither result has an acceptance verdict. Missing typed fields, unknown exception codes, and conflicting measurement claims remain explicit failures. Mapping requires both boundary digests; it never substitutes an empty effect trace or reference result.

## Reproduce the definitions

From the repository root:

```bash
python3 scripts/generate-conformance-schemas.py
npm run build
node scripts/build-conformance-examples.mjs
node --test tests/conformance.test.mjs
```

The schema generator reuses the existing v0.3 value-domain definitions. The authored-artifact builder writes only the new conformance directory and never invokes `assembleContext`. It resolves the repository root and default output directory relative to its own file, so invocation does not depend on the working directory. An explicit relative output-directory argument resolves against the caller's working directory.

The builder reads baseline implementation bytes from Git commit `9d1fede2a32c9575635e22aa7fabed1158224306` to identify the example target. Regeneration requires that Git object. If it is missing from a shallow checkout, run `git fetch origin 9d1fede2a32c9575635e22aa7fabed1158224306` from the repository root. A failed baseline read reports the required commit and source path before writing artifacts.

Frozen experiments and the historical bootstrap specification are not rewritten. See [conformance semantics](../02-semantics/04-executable-conformance.md) for the observation mapping and acceptance boundary.
