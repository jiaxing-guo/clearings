import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeProgram, sealProgram, validateProgram } from 'clearings/program';
import { createContextSelectionProgram } from '../programs/clearings/context-selection.mjs';
import { selectionCases } from '../benchmarks/evaluation/context-selection-v1/cases.mjs';
import { expectedSelection } from '../benchmarks/evaluation/context-selection-v1/oracle.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const program = read('../programs/clearings/context-selection.json');
const contract = read('../benchmarks/evaluation/context-selection-v1/contract.json');
const reviewCases = read('../benchmarks/evaluation/context-selection-review-v1/cases.json');

test('selection is reproducible closed IR with the frozen entry signature', () => {
  validateProgram(program);
  assert.deepEqual(program, createContextSelectionProgram());
  const entry = program.functions.find((fn) => fn.id === contract.entry_function);
  assert.deepEqual(entry.parameters, contract.parameters);
  assert.deepEqual(entry.returns, contract.returns);
  assert.deepEqual(entry.failures, contract.failures);
});

test('reference execution satisfies original selection cases and review regressions', () => {
  let count = 0;
  for (const item of [...selectionCases(), ...reviewCases]) {
    const before = structuredClone(item.args);
    const result = executeProgram(program, item.args, contract.limits);
    assert.deepEqual(
      result.completion,
      { kind: 'return', value: item.expected ?? expectedSelection(before) },
      item.id,
    );
    assert.deepEqual(item.args, before, item.id);
    count++;
  }
  assert.equal(count, contract.domain.total + reviewCases.length);
});

test('selection rejects malformed arguments at admission and preserves resource exhaustion', () => {
  for (const args of [
    [],
    [[], [], []],
    [[], [], [], [1]],
    [[], [{ id: 'a' }], [], []],
    [[], [], [{ id: 'a', evidence_ids: [], extra: false }], []],
  ])
    assert.throws(() => executeProgram(program, args), { code: 'INVALID_PROGRAM_EXECUTION' });
  const item = [...selectionCases()].find((item) => item.id === 'dense/16');
  for (const limits of [
    { work: 1 },
    { allocation_units: 1 },
    { value_units: 1 },
    { evaluation_depth: 1 },
  ]) {
    const result = executeProgram(program, item.args, limits);
    assert.equal(result.completion.kind, 'resource-exhaustion');
    assert.equal(result.completion.resource, Object.keys(limits)[0]);
    assert(!('value' in result.completion));
  }
});

test('independent expectations detect executable IR selection and ordering faults', () => {
  const item = [...selectionCases()].find((item) => item.id === 'complete-state-evidence');
  const mutations = [
    (p) => {
      p.functions[0].body.at(-1).value.fields[0].value = {
        kind: 'list',
        element_type: { kind: 'string' },
        items: [],
      };
    },
    (p) => {
      p.functions[0].body.at(-1).value.fields[1].value = {
        kind: 'list',
        element_type: { kind: 'string' },
        items: [],
      };
    },
    (p) => {
      p.functions[0].body.at(-1).value.fields[0].value = { kind: 'ref', name: 'selected_states' };
    },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(program);
    mutate(candidate);
    const completion = executeProgram(
      sealProgram(candidate),
      item.args,
      contract.limits,
    ).completion;
    assert.notDeepEqual(completion, { kind: 'return', value: expectedSelection(item.args) });
  }
});

test('mutating returned selection lists preserves inputs and later results', () => {
  const item = [...selectionCases()].find((item) => item.id === 'complete-state-evidence');
  const before = structuredClone(item.args);
  const expected = expectedSelection(before);
  assert(expected.state_ids.length > 0 && expected.source_ids.length > 0);
  const first = executeProgram(program, item.args, contract.limits).completion.value;
  const second = executeProgram(program, item.args, contract.limits).completion.value;
  first.state_ids.splice(0, first.state_ids.length, 'caller mutation');
  first.source_ids.splice(0, first.source_ids.length, 'caller mutation');
  assert.deepEqual(item.args, before);
  assert.deepEqual(second, expected);
  assert.deepEqual(executeProgram(program, item.args, contract.limits).completion.value, expected);
});
