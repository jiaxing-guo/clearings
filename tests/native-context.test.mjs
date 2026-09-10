import test from 'node:test';
import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import {
  assembleContext,
  sealSpecification,
  prepareContextRuntime,
  validateOperationContext,
} from '../dist/index.js';
import { referenceContextAssembly } from '../dist/conformance/context-reference.js';
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
  assert.equal(record.schema_version, '0.3.0');
  assert.equal(evaluateContextAssembly(record).native_evidence.verdict, 'accepted');
  assert.deepEqual(
    record.native_stages.map((stage) => stage.stage),
    ['closure', 'selection'],
  );
  assert.equal(evaluateContextAssembly(record).acceptance, 'accepted');
  const observed = record.native_stages[0];
  assert.equal(observed.status, 'observed');
  assert.equal(observed.policy, 'context-native-v2');
  assert.equal(observed.completion, 'return');
  assert(observed.usage.work > 0);
  const prepared = prepareContextRuntime();
  assert.equal(observed.program_id, prepared.program_id);
  assert.equal(observed.compiled_artifact_id, prepared.compiled_artifact_id);
  assert.deepEqual(observed.native, prepared.native);
  for (const [i, stage] of record.native_stages.entries()) {
    assert.equal(stage.status, 'observed');
    assert.equal(stage.program_id, prepared.stages[i].program_id);
    assert.equal(stage.compiled_artifact_id, prepared.stages[i].compiled_artifact_id);
    assert.deepEqual(stage.native, prepared.stages[i].native);
  }
  assert.notEqual(prepared.stages[0].native.build_id, prepared.stages[1].native.build_id);
  for (const path of [
    'programs/clearings/required-dependency-closure.json',
    'programs/clearings/context-selection.json',
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
  assert(!('native_stages' in record.completion.result.value));
  assert.deepEqual(
    record.completion.result.value.operations.map((item) => item.id),
    ['root', 'a', 'z', 'y', 'b'],
  );

  const invalid = structuredClone(record);
  invalid.native_stages[0].usage.work = invalid.native_stages[0].limits.work + 1;
  assert.throws(() => reseal(invalid), { code: 'INVALID_CONFORMANCE' });
  const historical = structuredClone(record);
  historical.schema_version = '0.1.0';
  delete historical.native_stages;
  delete historical.native_programs;
  delete historical.native_stage_errors;
  validateExecutionRecord(reseal(historical), contract.profile, contract.specification);
});

test('validation guards precede native execution and byte capacity follows it', async () => {
  const guarded = await recordContextAssembly(input('dependency-before-budget-and-selection'));
  assert(guarded.native_stages.every((stage) => stage.status === 'not-run'));
  assert.equal(evaluateContextAssembly(guarded).acceptance, 'accepted');
  assert.equal(guarded.completion.thrown.value.code, 'MISSING_REQUIRED_DEPENDENCY');
  const capacity = await recordContextAssembly(input('byte-boundary-0'));
  assert(capacity.native_stages.every((stage) => stage.completion === 'return'));
  assert.equal(capacity.completion.thrown.value.code, 'CONTEXT_BUDGET');
  assert.equal(evaluateContextAssembly(capacity).acceptance, 'accepted');
});

test('compiled state and declared-source selection preserves complete contexts and revalidation', async () => {
  for (const id of [
    'partial-frame-evidence',
    'complete-frame-evidence',
    'dependency-complete-frame',
  ]) {
    const request = input(id),
      before = structuredClone(request.invocation);
    const record = await recordContextAssembly({ ...request, native_recording: 'stages' });
    const context = record.completion.result.value;
    assert.deepEqual(context, referenceContextAssembly(before).context);
    assert.equal(evaluateContextAssembly(record).acceptance, 'accepted');
    assert.deepEqual(record.native_stages[1].result, {
      kind: 'return',
      value: {
        state_ids: context.states.map((state) => state.id),
        source_ids: context.sources.map((source) => source.id),
      },
    });
    assert(context.states.length > 0 && context.sources.length > 0);
    assert(!context.sources.some((source) => source.id === 'source-decoy'));
    validateOperationContext(context, before.specification);
    context.states[0].description = 'Caller change';
    assert.deepEqual(request.invocation, before);
    const again = assembleContext(before.specification, before.selection, before.options);
    assert.notEqual(again.states[0].description, 'Caller change');
  }
});

test('selection exhaustion is a distinct compatibility limit after successful closure', () => {
  const invocation = structuredClone(cases[0].invocation);
  const operation = invocation.specification.operations.find(
    (op) => op.id === invocation.selection,
  );
  invocation.specification.operations = [operation];
  invocation.specification.states = Array.from({ length: 2048 }, (_, i) => ({
    id: `state-${i}`,
    name: `state ${i}`,
    description: 'Modeled state.',
    scope: 'invocation',
    type: { kind: 'string' },
    evidence_ids: [],
  }));
  operation.reads = invocation.specification.states.map((state) => state.id);
  invocation.specification = sealSpecification(invocation.specification);
  invocation.options.maxBytes = 2_097_152;
  const before = structuredClone(invocation),
    reference = referenceContextAssembly(invocation);
  assert.equal(reference.completion, 'return');
  const observed = [],
    events = channel('clearings.context.native.v2');
  const listener = (event) => {
    if (event.event === 'result') observed.push(event.observation);
  };
  events.subscribe(listener);
  try {
    assert.throws(
      () => assembleContext(invocation.specification, invocation.selection, invocation.options),
      (error) =>
        error.code === 'CONTEXT_RESOURCE' &&
        error.exitCode === 3 &&
        error.details.context_stage === 'selection',
    );
  } finally {
    events.unsubscribe(listener);
  }
  assert.deepEqual(
    observed.map((stage) => [stage.stage, stage.completion]),
    [
      ['closure', 'return'],
      ['selection', 'resource-exhaustion'],
    ],
  );
  assert.equal(observed[1].policy, 'context-native-v2');
  assert.deepEqual(invocation, before);
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
  const events = channel('clearings.context.native.v2');
  const listener = (value) => {
    if (value.event === 'result') observation = value.observation;
  };
  events.subscribe(listener);
  try {
    assert.throws(
      () => assembleContext(invocation.specification, invocation.selection, invocation.options),
      (error) => {
        assert.equal(error.code, 'CONTEXT_RESOURCE');
        assert.equal(error.exitCode, 3);
        assert.equal(error.details.policy, 'context-native-v2');
        assert.equal(error.details.context_stage, 'closure');
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
  const events = channel('clearings.context.native.v2');
  const listener = (value) => {
    if (value.event === 'result') completion = value.observation.completion;
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
  record.native_stages = ['closure', 'selection'].map((stage) => ({
    stage,
    status: 'unavailable',
    reason: 'Authored infrastructure interruption.',
  }));
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
