import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  sealSpecification,
  checkOperation,
  checkOperationSequence,
  ClearingsError,
} from '../dist/index.js';

const sourceText = 'sequence test';
const source = {
  id: 'source',
  origin: 'requirement',
  locator: 'test',
  text: sourceText,
  sha256: createHash('sha256').update(sourceText).digest('hex'),
  binding: null,
};
const spec = sealSpecification({
  schema_version: '0.3.0',
  kind: 'specification',
  artifact_id: '',
  name: 'test',
  perspective: 'intended',
  provenance: {
    author: 'test',
    origin: 'user-directed-design',
    review: 'proposed',
    notes: ['test'],
  },
  sources: [source],
  states: [
    {
      id: 'value',
      name: 'Value',
      description: 'A value.',
      scope: 'request',
      type: { kind: 'integer' },
      evidence_ids: ['source'],
    },
    {
      id: 'constructor',
      name: 'Constructor',
      description: 'A value.',
      scope: 'request',
      type: { kind: 'integer' },
      evidence_ids: ['source'],
    },
  ],
  operations: [
    {
      id: 'operation:test',
      alias: 'test',
      name: 'Test',
      purpose: 'Test.',
      inputs: {},
      output: { kind: 'null' },
      reads: ['value'],
      writes: ['value'],
      frame: 'partial',
      effects: { completeness: 'partial', allowed: [] },
      outcome_policy: 'exclusive',
      coverage: 'complete',
      outcomes: [
        {
          id: 'ok',
          description: 'Ok.',
          when: { kind: 'literal', value: true },
          ensures: [],
          updates: [],
          effects: [],
          transitions: [],
          evidence_ids: ['source'],
        },
      ],
      guarantees: [],
      dependencies: [],
      implementations: [],
      decisions: [],
      evidence_ids: ['source'],
    },
  ],
});
const observation = (before, after) => ({ input: {}, before, outcome: 'ok', after });

test('checks steps and selected adjacent state in normalized order', () => {
  const steps = [
    {
      operation: 'test',
      observation: observation({ value: 0, constructor: 1 }, { value: 2, constructor: 1 }),
    },
    {
      operation: 'operation:test',
      observation: observation({ value: 2, constructor: 1 }, { value: 3, constructor: 1 }),
    },
  ];
  const report = checkOperationSequence(spec, steps, {
    stateIds: ['constructor', 'value', 'value'],
  });
  assert.deepEqual(report.state_ids, ['constructor', 'value']);
  assert.equal(report.steps.length, 2);
  assert.equal(report.continuity.length, 2);
  assert.deepEqual(
    report.continuity.map((item) => item.verdict),
    ['pass', 'pass'],
  );
  assert.equal(report.verdict, 'pass');
  assert.deepEqual(report.steps[0].result, checkOperation(spec, 'test', steps[0].observation));
});

test('reports unknown for an absent selected value and preserves failed steps', () => {
  const report = checkOperationSequence(
    spec,
    [
      { operation: 'test', observation: observation({ value: 0 }, { value: 2 }) },
      { operation: 'test', observation: observation({ value: 9 }, { value: 3 }) },
    ],
    { stateIds: ['value'] },
  );
  assert.equal(report.continuity[0].verdict, 'fail');
  assert.equal(report.verdict, 'fail');
  assert.equal(report.steps.length, 2);
  const unknown = checkOperationSequence(
    spec,
    [
      { operation: 'test', observation: observation({}, {}) },
      { operation: 'test', observation: observation({}, {}) },
    ],
    { stateIds: ['value'] },
  );
  assert.equal(unknown.continuity[0].verdict, 'unknown');
});

test('rejects malformed wrappers with the required error codes', () => {
  assert.throws(
    () =>
      checkOperationSequence(spec, [{ operation: 1, observation: observation({}, {}) }], {
        stateIds: [],
      }),
    (error) => error instanceof ClearingsError && error.code === 'INVALID_SELECTION',
  );
  assert.throws(
    () => checkOperationSequence(spec, [], { stateIds: [] }),
    (error) => error instanceof ClearingsError && error.code === 'INVALID_OBSERVATION',
  );
  assert.throws(
    () =>
      checkOperationSequence(spec, [{ operation: 'test', observation: observation({}, {}) }], {
        stateIds: ['missing'],
      }),
    (error) => error instanceof ClearingsError && error.code === 'INVALID_ARGUMENTS',
  );
});
