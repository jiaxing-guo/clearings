# Check a sequence of supplied operation observations

Add `checkOperationSequence` to the public library API. It checks each supplied operation record and compares selected shared state across adjacent records. It does not execute code, prove call order, follow declared transitions, or model concurrent operations.

## API

```ts
interface SequenceStep {
  operation: string;
  observation: OperationObservation;
}
interface SequenceOptions { stateIds: readonly string[] }
interface ContinuityCheck {
  from_index: number;
  to_index: number;
  state_id: string;
  verdict: Verdict;
  reason: string | null;
}
interface OperationSequenceCheck {
  schema_version: '0.3.0';
  command: 'check-sequence';
  artifact_id: string;
  perspective: SemanticSpecification['perspective'];
  state_ids: string[];
  steps: { index: number; operation_id: string; result: OperationCheck }[];
  continuity: ContinuityCheck[];
  verdict: Verdict;
  interpretation: 'supplied-observations-only';
  acceptance: 'proposed';
}
function checkOperationSequence(
  spec: SemanticSpecification,
  steps: readonly SequenceStep[],
  options: SequenceOptions,
): OperationSequenceCheck;
```

Export the function and all four new interfaces through `src/index.ts`. Put the implementation and interfaces in `src/specification/sequence.ts`. Existing public behavior and dependencies must stay unchanged. No CLI, schema change, target execution, file access, network access, or dependency installation is needed.

## Validation and errors

Validate the whole specification first with `validateSpecification`. Preserve its error code, including a missing required dependency outside the selected operations and stale identity.

Steps must be a dense portable array of 1–256 records. Each record has exactly the two own enumerable fields `operation` and `observation`. Missing or extra fields, a non-array, or a count outside the range throws `ClearingsError('INVALID_OBSERVATION', ...)`. A non-string operation selection throws `INVALID_SELECTION`; an unknown string retains the error from `checkOperation`. Portable structural failures (including sparse arrays, accessors, hidden fields, cycles, nonfinite numbers, and undefined values) retain `INVALID_SPECIFICATION` from `assertPortable`. Call `assertPortable` before reading step or option contents. JavaScript proxies are outside this API contract.

Options are required. They must be a portable object with exactly one own enumerable field `stateIds`, whose value is a dense array of known state ID strings. Missing options, null, a non-object, extra fields, wrong member types, or unknown state IDs throws `INVALID_ARGUMENTS`, except that portable structural failures retain `INVALID_SPECIFICATION`. Handle omitted options explicitly before `assertPortable`. An empty state list is valid. Duplicate IDs are accepted. Use unique IDs sorted by JavaScript's default string order in the report. Do not sort by locale.

After validating the wrapper and options, use `checkOperation(spec, step.operation, step.observation)` for every step. Preserve its validation errors and its exact result. An observation is valid under the existing checker; do not add required before/after fields to its state maps. Invalid input returns no partial report. Error text is not fixed. For simultaneous wrapper and option errors, either wrapper-first or option-first is allowed after specification validation.

## Step and state rules

Retain step order, zero-based indexes, and canonical operation IDs. Do not stop when a step verdict is fail or unknown. The nested result must equal a direct `checkOperation` result for that step.

The caller explicitly chooses `stateIds` that refer to the same logical storage across the sequence. Scope metadata alone cannot establish that identity. Do not automatically select other state fields. For each adjacent pair, compare each selected field from the earlier observation's `after` map with the later observation's `before` map. Use only own properties. If either value is absent, return unknown for that link. Do not infer an after value from a before value, a frame rule, or a more distant record.

If both values exist, compare portable JSON values by content. Object key order does not matter. Array order does matter. Matching values pass; different values fail. A value of null, false, zero, or an empty string is present. State IDs such as `constructor` and `toString` are legal and must not use inherited object properties.

Order continuity records first by the earlier step index and then by the normalized state ID list. A sequence of N steps and K selected states has exactly (N-1)*K continuity records. One step or an empty state list has none. A passing continuity record has `reason: null`. A failing or unknown continuity record has a nonempty explanation.

The overall verdict combines all nested step verdicts and all continuity verdicts. Any fail gives fail. Otherwise any unknown gives unknown. Otherwise return pass. A modeled failure outcome can pass its contract; it must not become a failed check merely because its name describes failure.

Copy artifact identity and perspective from the validated specification. Report `interpretation: 'supplied-observations-only'` and `acceptance: 'proposed'`. Do not add a claim that transitions ran or source code conforms. Return fresh report data on each call. Do not mutate the specification, steps, observations, or options, and do not share mutable input or output objects across calls.

## Reading the supplied representation

`specification.json` is the proposed intended model for this addition. `context.json` is generated by the current `assembleContext` and serializer. It contains that operation's rules and this API mapping. Typed rules check verdict selection, record counts, and input preservation through an observation adapter. Other requirements remain explicit opaque rules and require tests or review. An unknown typed result is expected when those rules are included; do not remove them to obtain pass.
