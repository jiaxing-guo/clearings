import test from 'node:test';
import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import { assembleContext, sealSpecification, prepareContextRuntime } from '../dist/index.js';
import {
  createContextAssemblyCases,
  recordContextAssembly,
  evaluateContextAssembly,
  getContextAssemblyContract,
  sealExecutionRecord,
  validateExecutionRecord,
} from 'clearings/conformance';

const cases = createContextAssemblyCases();
const input = (id) => structuredClone(cases.find((item) => item.case_id === id));
const contract = getContextAssemblyContract();
const reseal = (record) => sealExecutionRecord(record, contract.profile, contract.specification);

function chain(size) {
  const invocation = input('optional-edges').invocation;
  const template = invocation.specification.operations[0];
  invocation.specification.operations = Array.from({ length: size }, (_, i) => ({
    ...structuredClone(template),
    id: `n${i}`,
    alias: `alias-n${i}`,
    name: `n${i}`,
    outcomes: template.outcomes.map((outcome) => ({
      ...structuredClone(outcome),
      id: `done-n${i}`,
    })),
    dependencies:
      i === size - 1
        ? []
        : [
            {
              operation_id: `n${i + 1}`,
              requirement: 'required',
              kind: 'uses-contract',
              role: 'Next record.',
            },
          ],
  }));
  invocation.specification = sealSpecification(invocation.specification);
  invocation.selection = 'n0';
  invocation.options.maxBytes = 2_097_152;
  return invocation;
}

test('ordinary context assembly reports native execution without changing context or input', async () => {
  const request = input('breadth-first-order');
  const before = structuredClone(request.invocation);
  const record = await recordContextAssembly(request);
  assert.equal(record.schema_version, '0.2.0');
  assert.equal(evaluateContextAssembly(record).acceptance, 'accepted');
  const observed = record.native_execution;
  assert.equal(observed.status, 'observed');
  assert.equal(observed.policy, 'context-native-v1');
  assert.equal(observed.completion, 'return');
  assert(observed.usage.work > 0);
  const prepared = prepareContextRuntime();
  assert.equal(observed.program_id, prepared.program_id);
  assert.equal(observed.compiled_artifact_id, prepared.compiled_artifact_id);
  assert.deepEqual(observed.native, prepared.native);
  for (const path of [
    'programs/clearings/required-dependency-closure.json',
    'runtime/rust/src/lib.rs',
    'runtime/rust/runner/main.rs',
    'runtime/rust/rust-toolchain.toml',
  ])
    assert(
      record.identities.implementation.files.some((file) => file.path === path),
      path,
    );
  assert.deepEqual(request.invocation, before);
  assert(!('native_execution' in record.completion.result.value));
  assert.deepEqual(
    record.completion.result.value.operations.map((item) => item.id),
    ['root', 'a', 'z', 'y', 'b'],
  );

  const invalid = structuredClone(record);
  invalid.native_execution.usage.work = invalid.native_execution.limits.work + 1;
  assert.throws(() => reseal(invalid), { code: 'INVALID_CONFORMANCE' });
  const historical = structuredClone(record);
  historical.schema_version = '0.1.0';
  delete historical.native_execution;
  validateExecutionRecord(reseal(historical), contract.profile, contract.specification);
});

test('validation guards precede native execution and byte capacity follows it', async () => {
  const guarded = await recordContextAssembly(input('dependency-before-budget-and-selection'));
  assert.equal(guarded.native_execution.status, 'unavailable');
  assert.equal(guarded.completion.thrown.value.code, 'MISSING_REQUIRED_DEPENDENCY');
  const capacity = await recordContextAssembly(input('byte-boundary-0'));
  assert.equal(capacity.native_execution.completion, 'return');
  assert.equal(capacity.completion.thrown.value.code, 'CONTEXT_BUDGET');
  assert.equal(evaluateContextAssembly(capacity).acceptance, 'accepted');
});

test('the accepted indexed IR returns complete 512-operation contexts in either declaration order', () => {
  for (const reverse of [false, true]) {
    const invocation = chain(512);
    if (reverse) invocation.specification.operations.reverse();
    invocation.specification = sealSpecification(invocation.specification);
    const before = structuredClone(invocation);
    const context = assembleContext(
      invocation.specification,
      invocation.selection,
      invocation.options,
    );
    assert.deepEqual(
      context.operations.map((item) => item.id),
      Array.from({ length: 512 }, (_, i) => `n${i}`),
    );
    assert.deepEqual(invocation, before);
  }
});

test('native resource exhaustion still returns no partial context or input mutation', () => {
  const invocation = chain(2048);
  const before = structuredClone(invocation);
  let observation;
  const events = channel('clearings.context.native.v1');
  const listener = (value) => {
    observation = value;
  };
  events.subscribe(listener);
  try {
    assert.throws(
      () => assembleContext(invocation.specification, invocation.selection, invocation.options),
      (error) => {
        assert.equal(error.code, 'CONTEXT_RESOURCE');
        assert.equal(error.exitCode, 3);
        assert.equal(error.details.policy, 'context-native-v1');
        assert.equal(error.details.resource, 'work');
        assert.equal(error.details.limit, 10_000_000);
        return true;
      },
    );
  } finally {
    events.unsubscribe(listener);
  }
  assert.equal(observation.completion, 'resource-exhaustion');
  assert.deepEqual(invocation, before);
});

test('a complete 512-operation closure still rejects an insufficient byte budget without truncation', () => {
  // Follow-up review of the context contract requires a distinct byte-capacity failure.
  const invocation = chain(512);
  invocation.options.maxBytes = 1;
  const before = structuredClone(invocation);
  let completion;
  const events = channel('clearings.context.native.v1');
  const listener = (value) => {
    completion = value.completion;
  };
  events.subscribe(listener);
  try {
    assert.throws(
      () => assembleContext(invocation.specification, invocation.selection, invocation.options),
      (error) => {
        assert.equal(error.code, 'CONTEXT_BUDGET');
        assert.equal(error.exitCode, 2);
        assert(error.details.required_bytes > invocation.options.maxBytes);
        return true;
      },
    );
  } finally {
    events.unsubscribe(listener);
  }
  assert.equal(completion, 'return');
  assert.deepEqual(invocation, before);
});

test('operational interruption is inconclusive but captured mutation remains a violation', async () => {
  const record = await recordContextAssembly(input('optional-edges'));
  // Authored perturbation of a real capture tests evaluation, not native execution evidence.
  record.origin = 'authored-example';
  record.native_execution = {
    status: 'unavailable',
    reason: 'Authored infrastructure interruption.',
  };
  record.completion = {
    kind: 'throw',
    thrown: { status: 'captured', value: { code: 'RUST_TOOLCHAIN_UNAVAILABLE' } },
  };
  for (const item of record.measurements) {
    item.status = 'unobserved';
    delete item.value;
    item.reason = 'Authored interruption.';
  }
  assert.equal(evaluateContextAssembly(reseal(record)).acceptance, 'inconclusive');
  record.arguments_after.value.selection = 'changed';
  assert.equal(evaluateContextAssembly(reseal(record)).acceptance, 'rejected');
});
