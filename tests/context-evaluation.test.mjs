import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContextAssemblyCases, getContextAssemblyContract, recordContextAssembly, evaluateContextAssembly, sealExecutionRecord } from 'clearings/conformance';

const cases = createContextAssemblyCases(), contract = getContextAssemblyContract();
const input = id => cases.find(item => item.case_id === id);
const reseal = record => sealExecutionRecord(record, contract.profile, contract.specification);

test('independent evaluation grants scoped acceptance without changing evidence or residual contract unknowns', async () => {
  const record = await recordContextAssembly(input('partial-frame-evidence')), original = structuredClone(record);
  const evaluation = evaluateContextAssembly(record);
  assert.equal(evaluation.acceptance, 'accepted'); assert.equal(evaluation.contract.verdict, 'unknown');
  assert.equal(evaluation.obligations.find(item => item.id === 'external-effects').status, 'unknown');
  assert(evaluation.obligations.filter(item => item.mandatory).every(item => ['pass', 'not-applicable'].includes(item.status)));
  assert(evaluation.reference_measurements.every(item => item.status === 'observed'));
  assert.deepEqual(record, original); assert.equal(evaluation.record_id, record.artifact_id);
  assert.match(evaluation.evaluator.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evaluateContextAssembly(record), evaluation, 'Replay is deterministic for unchanged evidence and evaluator files');
});

test('independent completion checks cover validation precedence and exact capacity boundaries', async () => {
  for (const id of ['dependency-before-budget-and-selection', 'budget-before-selection', 'missing-selection', 'byte-boundary-0', 'byte-boundary-1', 'byte-boundary-2']) {
    const record = await recordContextAssembly(input(id)), evaluation = evaluateContextAssembly(record);
    assert.equal(evaluation.acceptance, 'accepted', id);
    const budget = evaluation.obligations.find(item => item.id === 'budget-failure');
    assert.equal(budget.status, id === 'byte-boundary-0' ? 'pass' : 'not-applicable');
    if (!id.startsWith('byte-boundary')) assert(evaluation.reference_measurements.every(item => item.status === 'unobserved'));
  }
});

test('reference traversal, state frames, and evidence metadata match independently stated expectations', async () => {
  for (const [id, expected] of [
    ['breadth-first-order', { operation_ids: ['root', 'a', 'z', 'y', 'b'], state_ids: [], source_ids: [] }],
    ['partial-frame-evidence', { operation_ids: ['root', 'branch', 'leaf'], state_ids: ['state-z'], source_ids: ['decision', 'ensure', 'guarantee', 'implementation', 'operation', 'outcome', 'state-z'].map(id => `source-${id}`) }],
  ]) {
    const evaluation = evaluateContextAssembly(await recordContextAssembly(input(id)));
    assert.deepEqual(evaluation.reference_measurements.find(item => item.id === 'expected-projection').value, expected);
  }
  const reference = readFileSync(new URL('../dist/conformance/context-reference.js', import.meta.url), 'utf8');
  assert(!/^import\s/m.test(reference), 'The reference implementation has no runtime imports, including candidate helpers');
});

test('edited measurement claims are rejected instead of being repaired by evaluation', async () => {
  const original = await recordContextAssembly(input('optional-edges'));
  for (const id of ['serialized-bytes', 'reference-required-bytes', 'expected-projection']) {
    const record = structuredClone(original), measurement = record.measurements.find(item => item.id === id);
    measurement.status = 'observed'; delete measurement.reason;
    measurement.value = id === 'expected-projection' ? { operation_ids: [], state_ids: [], source_ids: [] } : -1;
    assert.equal(evaluateContextAssembly(reseal(record)).acceptance, 'rejected', id);
  }
});

test('authored evidence and missing captures cannot acquire scoped acceptance', async () => {
  const original = await recordContextAssembly(input('optional-edges'));
  const authored = structuredClone(original); authored.origin = 'authored-example';
  assert.equal(evaluateContextAssembly(reseal(authored)).acceptance, 'inconclusive');
  const missing = structuredClone(original); missing.arguments_after = { status: 'unavailable', reason: 'Checker test removes resulting evidence.' };
  missing.measurements = missing.measurements.map(item => item.id === 'arguments-after-digest' ? { id: item.id, status: 'unobserved', reason: 'Missing capture.' } : item);
  assert.equal(evaluateContextAssembly(reseal(missing)).acceptance, 'inconclusive');
});

test('evaluation does not open implementation locators and rejects stale record identities', async () => {
  const record = await recordContextAssembly(input('optional-edges'));
  record.identities.implementation.repository = 'file:///definitely-absent-conformance-candidate';
  assert.equal(evaluateContextAssembly(reseal(record)).acceptance, 'accepted');
  assert.throws(() => evaluateContextAssembly(record), { code: 'INVALID_CONFORMANCE' });
});
