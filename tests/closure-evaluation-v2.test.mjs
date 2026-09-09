import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { executeProgram } from 'clearings/program';
import { correctnessCases, scaleCases } from '../scripts/lib/closure-evaluation.mjs';
import { evaluateClosureCases } from '../scripts/lib/closure-evaluation-v2.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const baseline = JSON.parse(read('benchmarks/agent-runs/closure-scale-001/baseline.program.json'));
const candidate = JSON.parse(
  read('benchmarks/agent-runs/closure-scale-001/candidate.program.json'),
);
const cases = correctnessCases().filter((item) => ['breadth-first', 'unicode'].includes(item.id));
const unavailable = () => {
  throw Object.assign(new Error('Native process could not start'), {
    code: 'RUST_EXECUTION_FAILED',
  });
};
// These controlled native substitutes exercise evaluator policy. Real native
// conformance is checked separately by the complete CLI evaluation in CI.
const prepare = () => ({
  execute: (args, limits) => executeProgram(candidate, args, limits),
  dispose() {},
});

test('the correction binds its sources and the unchanged original protocol', () => {
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const protocol = JSON.parse(
    read('benchmarks/agent-runs/closure-scale-001-closeout/protocol.json'),
  );
  assert.equal(
    protocol.baseline_protocol_sha256,
    hash(read('benchmarks/agent-runs/closure-scale-001/protocol.json')),
  );
  for (const file of protocol.frozen_files)
    assert.equal(hash(read(file.path)), file.sha256, file.path);
});

test('complete agreement accepts; reference-only evaluation remains inconclusive', () => {
  const agreed = evaluateClosureCases(candidate, baseline, cases, { prepare });
  assert.equal(agreed.acceptance, 'accepted');
  assert.equal(agreed.native, 'passed');
  assert.deepEqual(agreed.native_errors, []);
  const reference = evaluateClosureCases(candidate, baseline, cases, {
    backend: 'reference',
    prepare: unavailable,
  });
  assert.equal(reference.acceptance, 'inconclusive');
  assert.equal(reference.native, 'not-run');
  assert.deepEqual(reference.native_errors, []);
});

test('preparation and disposal failures retain diagnostics without inventing disagreement', () => {
  for (const stage of ['preparation', 'disposal']) {
    const result = evaluateClosureCases(candidate, baseline, cases, {
      prepare:
        stage === 'preparation' ? unavailable : () => ({ ...prepare(), dispose: unavailable }),
    });
    assert.equal(result.acceptance, 'inconclusive', stage);
    assert.equal(result.reference, 'accepted');
    assert.equal(result.native, 'unavailable');
    assert.deepEqual(result.failures, []);
    assert.equal(result.native_errors[0].stage, stage);
    assert.equal(result.native_errors[0].code, 'RUST_EXECUTION_FAILED');
  }
});

test('execution exceptions remain unknown even when their code is ERR_ASSERTION', () => {
  for (const error of [
    Object.assign(new Error('Native process timed out'), { code: 'RUST_EXECUTION_FAILED' }),
    new assert.AssertionError({ message: 'An assertion inside the execution adapter failed' }),
    null,
  ]) {
    let calls = 0;
    let disposed = false;
    const result = evaluateClosureCases(candidate, baseline, cases, {
      prepare: () => ({
        execute(args, limits) {
          if (calls++ === 0) throw error;
          return prepare().execute(args, limits);
        },
        dispose() {
          disposed = true;
        },
      }),
    });
    assert.equal(result.acceptance, 'inconclusive');
    assert.equal(result.native, 'unavailable');
    assert.deepEqual(result.failures, []);
    assert.equal(result.rows[0].native.equal, null);
    assert.equal(result.rows[1].native.equal, true);
    assert.equal(result.native_errors[0].case_id, cases[0].id);
    assert.equal(result.native_errors[0].stage, 'execution');
    assert.equal(disposed, true);
  }
});

test('observed native disagreement rejects despite another missing native result', () => {
  for (const mismatchFirst of [true, false]) {
    let calls = 0;
    const result = evaluateClosureCases(candidate, baseline, cases, {
      prepare: () => ({
        ...prepare(),
        execute(args, limits) {
          if ((calls++ === 0) !== mismatchFirst) return unavailable();
          const native = prepare().execute(args, limits);
          native.usage.work += 1;
          return native;
        },
      }),
    });
    assert.equal(result.acceptance, 'rejected');
    assert.equal(result.native, 'failed');
    assert.equal(result.reference, 'accepted');
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /native\/reference disagreement/);
    assert.equal(result.native_errors.length, 1);
    assert.ok(result.rows.find((row) => row.native.equal === false).native.result);
  }
});

test('independent behavioral and work failures still reject when native execution is unavailable', () => {
  const unexpected = { ...cases[0], expected: { kind: 'return', value: [] } };
  const behavior = evaluateClosureCases(candidate, baseline, [unexpected], {
    prepare: unavailable,
  });
  assert.equal(behavior.acceptance, 'rejected');
  assert.equal(behavior.reference, 'rejected');
  assert.equal(behavior.native, 'unavailable');
  assert.match(behavior.failures[0], /unexpected behavior/);
  const work = evaluateClosureCases(
    baseline,
    baseline,
    scaleCases().filter((item) => item.id === 'chain-256'),
    { prepare: unavailable },
  );
  assert.equal(work.acceptance, 'rejected');
  assert.deepEqual(work.failures, ['chain-256: less than 25% work reduction']);
});
