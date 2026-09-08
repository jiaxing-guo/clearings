# Author and review a specification

Define and review a storage operation with two outcomes: an accepted write and a rejected write. The resulting specification constrains its output, changed state, preserved state, and external effects.

**Prerequisites:** the [first-contract tutorial](../00-learn/01-first-contract.md), Node.js 24, npm 11, and a built local library. Run `npm run build` from the repository root before executing the example.

This is an original intended specification used for documentation. It is not an interpretation of an existing storage implementation.

## Define the behavior before the record

| Case           | Guard             | Output           | Resulting `value` | Preserved `label` |
| -------------- | ----------------- | ---------------- | ----------------- | ----------------- |
| Accepted write | `reject` is false | Requested `next` | Requested `next`  | Unchanged         |
| Rejected write | `reject` is true  | Initial `value`  | Initial `value`   | Unchanged         |

Both outcomes can pass the contract. A rejected write is an allowed behavior, provided its output and state agree with the rejection rules. The complete frame protects `label`, which is outside the write set; the complete empty effect boundary rejects supplied undeclared effects.

## Authoring procedure

1. Define the operation boundary, inputs, output, and relevant state fields.
2. Document the concrete-to-abstract mapping and environment assumptions.
3. Define outcome guards and postconditions, then choose the outcome policy and coverage declaration.
4. Declare state access, frame conditions, effects, dependencies, and implementation responsibilities.
5. Retain unresolved requirements and analysis limits as decisions. Use `opaque` where a predicate cannot be encoded.
6. Attach exact evidence or requirement/design text and its hash where applicable.
7. Seal and validate the specification. Check positive cases, counterexamples, and incomplete observations.
8. Review prose obligations separately from the predicates and any external adapter.

Sealing establishes identity and structural validity. It does not approve requirements. An intended specification uses `origin: user-directed-design`; an observed specification uses `origin: source-interpretation`. Both retain `review: proposed`.

## Complete executable example

This original fixture defines a storage operation with successful and rejected writes. A rejected write preserves the value. An unrelated modeled field is protected by the complete frame. The example also demonstrates adjacent-state continuity and missing-state uncertainty.

Run `npm run docs:check:markdown` from the repository root to build the library and execute the trusted `js runnable` blocks. These examples are documentation conformance checks, not an independent proof of the implementation.

```js runnable
import assert from 'node:assert/strict';
import {
  sealSpecification, checkOperation, checkOperationSequence,
} from './dist/index.js';

const integer = { kind: 'integer' };
const ref = (root, ...path) => ({ kind: 'ref', root, path });
const rule = (id, value) => ({
  id, description: 'The output equals the specified value.', evidence_ids: [],
  predicate: { kind: 'compare', op: 'eq', left: ref('output'), right: value },
});
const outcome = (id, when, value) => ({
  id, description: id === 'written' ? 'Store the requested value.' : 'Reject without changing storage.',
  when, ensures: [rule(`${id}:output`, value)],
  updates: [{ state_id: 'value', value }],
  effects: [], transitions: [], evidence_ids: [],
});
const specification = sealSpecification({
  schema_version: '0.3.0', kind: 'specification', name: 'Storage fixture',
  perspective: 'intended',
  provenance: {
    author: 'Documentation example', origin: 'user-directed-design',
    review: 'proposed', notes: ['Original abstract fixture; no source-conformance claim.'],
  },
  states: [
    { id: 'value', name: 'Stored value', description: 'The selected storage cell.', scope: 'process', type: integer, evidence_ids: [] },
    { id: 'label', name: 'Storage label', description: 'A modeled field outside the write set.', scope: 'process', type: { kind: 'string' }, evidence_ids: [] },
  ],
  operations: [{
    id: 'store', alias: 'store-value', name: 'Store a value',
    purpose: 'Write the requested integer unless the request is rejected.',
    inputs: { next: integer, reject: { kind: 'boolean' } }, output: integer,
    reads: ['value'], writes: ['value'], frame: 'complete',
    effects: { completeness: 'complete', allowed: [] },
    outcome_policy: 'exclusive', coverage: 'complete',
    outcomes: [
      outcome('written', { kind: 'not', value: ref('input', 'reject') }, ref('input', 'next')),
      outcome('rejected', ref('input', 'reject'), ref('before', 'value')),
    ],
    guarantees: [], dependencies: [], implementations: [], decisions: [], evidence_ids: [],
  }],
  sources: [],
});
const first = {
  input: { next: 2, reject: false }, before: { value: 1, label: 'cell' },
  outcome: 'written', output: 2, after: { value: 2, label: 'cell' }, effects: [],
};
const rejected = {
  input: { next: 9, reject: true }, before: { value: 2, label: 'cell' },
  outcome: 'rejected', output: 2, after: { value: 2, label: 'cell' }, effects: [],
};
assert.equal(checkOperation(specification, 'store', rejected).verdict, 'pass');
const steps = [first, rejected].map(observation => ({ operation: 'store', observation }));
const sequence = checkOperationSequence(specification, steps, { stateIds: ['value', 'label', 'value'] });
assert.equal(sequence.verdict, 'pass');
assert.deepEqual(sequence.state_ids, ['label', 'value']);
assert.equal(sequence.continuity.length, 2);

const gap = structuredClone(steps);
Object.assign(gap[1].observation, {
  before: { value: 3, label: 'cell' }, output: 3, after: { value: 3, label: 'cell' },
});
assert.equal(checkOperation(specification, 'store', gap[1].observation).verdict, 'pass');
assert.equal(checkOperationSequence(specification, gap, { stateIds: ['value'] }).verdict, 'fail');
const missing = structuredClone(steps);
delete missing[0].observation.after;
assert.equal(checkOperationSequence(specification, missing, { stateIds: ['value'] }).verdict, 'unknown');

const frameViolation = structuredClone(first);
frameViolation.after.label = 'different';
assert.equal(checkOperation(specification, 'store', frameViolation).verdict, 'fail');
const undeclaredEffect = structuredClone(first);
delete undeclaredEffect.outcome;
undeclaredEffect.effects = ['network'];
assert.equal(checkOperation(specification, 'store', undeclaredEffect).verdict, 'fail');
const impossible = structuredClone(specification);
impossible.operations[0].guarantees.push({
  id: 'impossible', description: 'An integer equals a fraction.', evidence_ids: [],
  predicate: { kind: 'compare', op: 'eq', left: ref('input', 'next'), right: { kind: 'literal', value: 1.5 } },
});
assert.throws(() => sealSpecification(impossible), error => error.code === 'SPEC_TYPE');
```

The caller asserts that `value` and `label` refer to the same storage across these records. The fixture supplies effect lists; it does not instrument I/O. The first sequence passes because both contracts and selected state links agree. The altered sequence shows that individually valid operations can still have inconsistent adjacent state.

## Interpret the expected results

| Check in the example                                      | Expected result         | Semantic distinction                                             |
| --------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| Rejected write preserves the stored value                 | `pass`                  | Application rejection can satisfy the contract                   |
| Two individually valid records disagree on adjacent state | `fail` for the sequence | Per-operation agreement does not establish continuity            |
| A required resulting state observation is absent          | `unknown`               | Missing data is not a known violation                            |
| The write changes `label`                                 | `fail`                  | A complete frame constrains modeled fields outside the write set |
| An undeclared network effect is supplied                  | `fail`                  | A complete effect boundary excludes undeclared IDs               |
| An integer equality rule uses literal `1.5`               | `SPEC_TYPE` error       | Invalid predicates are rejected before observation checking      |

The executable block checks these expectations. Inspect the individual rule or continuity entry when an aggregate verdict differs.

## Review record

For each substantive obligation, record the specification identity and rule ID, its executable predicate or opaque status, any residual prose requirement, the observation adapter, and independent tests or source-review evidence. A claim-support assessment should identify the cited source span and distinguish supported, contradicted, and uncertain assertions.

For human review, present purpose, a concrete case, a decision table, state changes, and implementation responsibilities before raw JSON. Derive formal rule displays from the canonical records. Audience explanations may add reading guidance, but must retain the model's limits and must not create an independently maintained contract.

If implementation behavior conflicts with an intended contract, resolve the requirement explicitly. Do not change intent silently to make the implementation pass. For observed models, correct the interpretation and issue a new artifact identity when source review reveals an error.
