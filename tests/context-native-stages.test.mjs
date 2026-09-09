import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { NativeStageRecorder } from '../dist/conformance/native-stages.js';
import { referenceContextAssembly } from '../dist/conformance/context-reference.js';
import { contextSelectionArguments } from '../dist/specification/selection-input.js';
import { canonical } from '../dist/repository/inventory.js';
import {
  recordContextAssembly,
  createContextAssemblyCases,
  evaluateContextAssembly,
  getContextAssemblyContract,
  sealExecutionRecord,
  validateExecutionRecord,
  renderContextConformanceReport,
} from 'clearings/conformance';
import {
  contextConformanceEntry,
  createContextConformanceReport,
} from '../dist/conformance/context-report.js';
import { candidateCheckout, controlSource } from './helpers/conformance.mjs';

const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const fixture = createContextAssemblyCases('smoke')[0].invocation;
const expected = referenceContextAssembly(fixture).context;
const selected = expected.operations.map((operation) => operation.id);
const programs = ['required-dependency-closure', 'context-selection'].map((name) => ({
  name,
  bytes: readFileSync(new URL(`../programs/clearings/${name}.json`, import.meta.url), 'utf8'),
}));
const args = [
  [
    [expected.selection.operation_id],
    fixture.specification.operations.map((operation) => ({
      id: operation.id,
      dependencies: operation.dependencies.map((edge) => ({
        target: edge.operation_id,
        required: edge.requirement === 'required',
      })),
    })),
  ],
  contextSelectionArguments(fixture.specification, selected),
];
const values = [
  selected,
  {
    state_ids: expected.states.map((state) => state.id),
    source_ids: expected.sources.map((source) => source.id),
  },
];
// Authored instrumentation controls, not claimed native execution measurements.
const observations = ['closure', 'selection'].map((stage, i) => ({
  stage,
  status: 'observed',
  policy: 'context-native-v2',
  arguments_sha256: hash(args[i]),
  result: { kind: 'return', value: values[i] },
  result_sha256: hash({ kind: 'return', value: values[i] }),
  completion: 'return',
  program_id: JSON.parse(programs[i].bytes).artifact_id,
  compiled_artifact_id: `compiled-program:${'1'.repeat(64)}`,
  compiler_version: 'control',
  execution_semantics_version: 'control',
  runtime: { abi_version: 'control', source_id: `rust-runtime:${'2'.repeat(64)}` },
  runner: { version: 'control', source_id: `rust-runner:${'3'.repeat(64)}` },
  native: {
    build_id: `native-build:${'4'.repeat(64)}`,
    executable_sha256: '5'.repeat(64),
    platform: 'control',
    architecture: 'control',
  },
  limits: {
    work: 10_000_000,
    allocation_units: 10_000_000,
    value_units: 1_000_000,
    evaluation_depth: 256,
  },
  usage: { work: 1, allocation_units: 1, value_units: 1, evaluation_depth: 1 },
}));
const begin = { event: 'begin', policy: 'context-native-v2' };
const stages = observations.flatMap((observation) => [
  { event: 'start', stage: observation.stage, arguments_sha256: observation.arguments_sha256 },
  { event: 'result', observation },
]);
const events = [begin, ...stages];

async function recorded(messages, extra = {}, ending = '') {
  const source =
    `import { channel } from 'node:diagnostics_channel';\n` +
    controlSource.replace(
      '// Mutations used by the separate fault manifest are inserted before accounting.',
      `for (const event of ${JSON.stringify(messages)}) channel('clearings.context.native.v2').publish(event); ${ending}`,
    );
  const checkout = candidateCheckout(source);
  try {
    mkdirSync(join(checkout.root, 'programs/clearings'), { recursive: true });
    for (const program of programs)
      writeFileSync(join(checkout.root, `programs/clearings/${program.name}.json`), program.bytes);
    return await recordContextAssembly({
      case_id: 'stage-control',
      invocation: fixture,
      implementation_root: checkout.root,
      ...extra,
    });
  } finally {
    checkout.dispose();
  }
}

test('worker recording preserves both stage results, their bindings, and replay without the candidate checkout', async () => {
  const record = await recorded(events);
  assert.equal(record.schema_version, '0.3.0');
  assert(!('native_execution' in record));
  assert.deepEqual(record.native_stages, observations);
  assert.deepEqual(record.native_stage_errors, []);
  assert(record.native_programs.every((binding) => binding.status === 'bound'));
  const evaluation = evaluateContextAssembly(record);
  assert.equal(evaluation.native_evidence.verdict, 'accepted');
  assert.equal(evaluation.acceptance, 'accepted');
  const replay = evaluateContextAssembly(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(replay, evaluation);
  const entry = contextConformanceEntry(record, evaluation, 0, JSON.stringify(record));
  const report = createContextConformanceReport(
    'replay',
    'single',
    [entry],
    evaluation.evaluator,
    null,
  );
  assert.match(renderContextConformanceReport(report), /Native evidence/);
});

test('missing instrumentation stays unavailable; declared unstarted stages remain distinct', async () => {
  const missing = await recorded([], { native_recording: 'stages' });
  assert(missing.native_stages.every((stage) => stage.status === 'unavailable'));
  assert.equal(evaluateContextAssembly(missing).acceptance, 'inconclusive');
  const omitted = await recorded([begin]);
  assert(omitted.native_stages.every((stage) => stage.status === 'not-run'));
  assert.equal(
    evaluateContextAssembly(omitted).acceptance,
    'rejected',
    'Returned context contradicts declared unexecuted required stages',
  );
  const old = await recorded([]);
  assert.equal(old.schema_version, '0.2.0');
  assert.equal(evaluateContextAssembly(old).acceptance, 'accepted');
});

test('byte-budget rejection requires both stages while interruptions retain unknown evidence', async () => {
  const invocation = structuredClone(fixture);
  invocation.options.maxBytes = 1;
  const reference = referenceContextAssembly(invocation);
  assert.equal(reference.code, 'CONTEXT_BUDGET');
  assert(reference.context);
  for (const messages of [[begin], [begin, ...stages.slice(0, 2)], events]) {
    const record = await recorded(messages, { invocation });
    assert.equal(record.completion.kind, 'throw');
    assert.equal(record.completion.thrown.value.code, 'CONTEXT_BUDGET');
    const evaluation = evaluateContextAssembly(record);
    assert.equal(evaluation.acceptance, messages === events ? 'accepted' : 'rejected');
    for (const stage of record.native_stages.filter((stage) => stage.status === 'not-run'))
      assert.equal(
        evaluation.native_evidence.checks.find(
          (check) => check.id === `native-${stage.stage}-execution`,
        ).status,
        'fail',
      );
  }
  for (const code of ['CONTEXT_RESOURCE', 'RUST_EXECUTION_FAILED']) {
    const record = await recorded(
      [begin],
      {},
      `throw Object.assign(new Error('interrupted'), { code: '${code}' });`,
    );
    const evaluation = evaluateContextAssembly(record);
    assert.equal(evaluation.native_evidence.verdict, 'inconclusive');
    assert.equal(evaluation.acceptance, 'inconclusive');
  }
});

test('completed closure survives missing selection evidence and malformed, repeated, or reordered events', async () => {
  const partial = await recorded([begin, ...stages.slice(0, 2), stages[2]]);
  assert.deepEqual(partial.native_stages[0], observations[0]);
  assert.equal(partial.native_stages[1].status, 'unavailable');
  assert.equal(evaluateContextAssembly(partial).native_evidence.verdict, 'inconclusive');
  for (const messages of [
    [begin, ...stages, stages[1]],
    [begin, ...stages.slice(2), ...stages.slice(0, 2)],
    [begin, ...stages, begin],
    [begin, ...stages, ...Array(8).fill(stages[1])],
    [
      begin,
      ...stages.slice(0, 2),
      { event: 'start', stage: 'selection', arguments_sha256: '6'.repeat(64) },
      stages[3],
    ],
  ]) {
    const record = await recorded(messages);
    assert(record.native_stage_errors.length > 0);
    assert.equal(evaluateContextAssembly(record).acceptance, 'rejected');
  }
});

test('result/program/argument bindings and stage ordering cannot be silently replaced', async () => {
  const original = await recorded(events),
    { profile, specification } = getContextAssemblyContract();
  for (const edit of [
    (record) => record.native_stages.reverse(),
    (record) => {
      record.native_stages[1] = structuredClone(record.native_stages[0]);
    },
    (record) => {
      record.native_stages[0].result_sha256 = '0'.repeat(64);
    },
    (record) => {
      record.native_programs[0].sha256 = '0'.repeat(64);
    },
    (record) => {
      record.native_stages[0].usage.work = 10_000_001;
    },
  ]) {
    const record = structuredClone(original);
    edit(record);
    assert.throws(() => sealExecutionRecord(record, profile, specification), {
      code: 'INVALID_CONFORMANCE',
    });
  }
  for (const edit of [
    (record) => {
      record.native_stages[0].program_id = record.native_stages[1].program_id;
    },
    (record) => {
      record.native_stages[1].arguments_sha256 = '0'.repeat(64);
    },
    (record) => {
      record.native_stages[0].result.value = ['wrong'];
      record.native_stages[0].result_sha256 = hash(record.native_stages[0].result);
    },
  ]) {
    const record = structuredClone(original);
    edit(record);
    const sealed = sealExecutionRecord(record, profile, specification);
    assert.equal(evaluateContextAssembly(sealed).acceptance, 'rejected');
  }
  const historical = structuredClone(original);
  historical.schema_version = '0.1.0';
  delete historical.native_stages;
  delete historical.native_stage_errors;
  delete historical.native_programs;
  const old = sealExecutionRecord(historical, profile, specification);
  validateExecutionRecord(old, profile, specification);
  assert.equal(evaluateContextAssembly(old).acceptance, 'accepted');
  assert(!('native_evidence' in evaluateContextAssembly(old)));
});

test('stage collector retains closure when selection reports an operational failure', () => {
  const recorder = new NativeStageRecorder();
  for (const event of [
    begin,
    ...stages.slice(0, 2),
    stages[2],
    { event: 'unavailable', stage: 'selection', reason: 'Process failed.' },
  ])
    recorder.receive(event);
  assert.deepEqual(recorder.stages[0], observations[0]);
  assert.equal(recorder.stages[1].status, 'unavailable');
  assert.equal(recorder.stages[1].arguments_sha256, observations[1].arguments_sha256);
  assert.deepEqual(recorder.errors, []);
});

test('worker timeout and observed exhaustion preserve the completed prefix without hiding violations', async () => {
  const timed = await recorded(
    [begin, ...stages.slice(0, 2), stages[2]],
    { timeout_ms: 2500 },
    'while (true) {}',
  );
  assert.equal(timed.completion.kind, 'timeout');
  assert.deepEqual(timed.native_stages[0], observations[0]);
  assert.equal(timed.native_stages[1].status, 'unavailable');
  assert.equal(evaluateContextAssembly(timed).acceptance, 'inconclusive');
  const exhausted = structuredClone(observations[1]);
  exhausted.completion = 'resource-exhaustion';
  exhausted.result = {
    kind: 'resource-exhaustion',
    resource: 'work',
    limit: 10_000_000,
    diagnostic: { phase: 'execution', path: '/control', call_stack: [] },
  };
  exhausted.result_sha256 = hash(exhausted.result);
  const messages = [begin, ...stages.slice(0, 3), { event: 'result', observation: exhausted }];
  const ending =
    "throw Object.assign(new Error('Selection exhausted'), { code: 'CONTEXT_RESOURCE', exitCode: 3 });";
  const record = await recorded(messages, {}, ending);
  assert.equal(evaluateContextAssembly(record).acceptance, 'inconclusive');
  assert.equal(evaluateContextAssembly(record).native_evidence.verdict, 'inconclusive');
  const bad = structuredClone(messages);
  bad[2].observation.program_id = observations[1].program_id;
  assert.equal(evaluateContextAssembly(await recorded(bad, {}, ending)).acceptance, 'rejected');
});
