import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRust } from 'clearings/compiler';
import { validateProgram } from 'clearings/program';
import { runtimeIdentity } from './native/harness.mjs';
import {
  CompilerConformanceError,
  checkCase,
  differingPaths,
  nativeBatches,
  referenceObservation,
} from './native/conformance.mjs';
import { COMPILER_CORPUS_SEED, seededSuite } from './native/seeded-corpus.mjs';
import { accountingSuite } from './native/resource-corpus.mjs';
import { integer, literal, returned, program, success } from './native/programs.mjs';

test('compiler mismatch reports retain reproduction inputs, identities, versions, and exact differing fields', () => {
  const suite = accountingSuite();
  const item = suite.cases.find((entry) => entry.limits.work === 14);
  const source = suite.programs[item.program];
  const artifact = compileRust(source, runtimeIdentity);
  const reference = referenceObservation(source, item.args, item.limits);
  for (const [path, edit] of [
    ['/usage/work', (value) => value.usage.work++],
    ['/usage/allocation_units', (value) => value.usage.allocation_units++],
    ['/usage/value_units', (value) => value.usage.value_units++],
    ['/usage/evaluation_depth', (value) => value.usage.evaluation_depth++],
    ['/limits/work', (value) => value.limits.work++],
    ['/completion/limit', (value) => value.completion.limit++],
    ['/completion/diagnostic/phase', (value) => (value.completion.diagnostic.phase = 'execution')],
    ['/completion/diagnostic/path', (value) => (value.completion.diagnostic.path = '/wrong')],
    [
      '/completion/diagnostic/call_stack',
      (value) =>
        value.completion.diagnostic.call_stack.push({ function_id: 'wrong', call_path: '/wrong' }),
    ],
    ['/unexpected', (value) => (value.unexpected = true)],
  ]) {
    const native = structuredClone(reference);
    edit(native);
    assert.throws(
      () => checkCase(suite.name, item, source, artifact, reference, native),
      (error) => {
        assert(error instanceof CompilerConformanceError);
        assert.equal(error.report.comparison, 'reference/native');
        assert(error.report.paths.includes(path), path);
        assert.deepEqual(error.report.program, source);
        assert.deepEqual(error.report.arguments, item.args);
        assert.deepEqual(error.report.limits, reference.limits);
        assert.equal(error.report.backend.compiled_artifact_id, artifact.artifact_id);
        assert.equal(error.report.backend.module_sha256, artifact.module.sha256);
        assert.equal(error.report.backend.compiler_version, artifact.compiler_version);
        assert.equal(
          error.report.backend.execution_semantics_version,
          artifact.execution_semantics_version,
        );
        assert.deepEqual(error.report.backend.runtime, runtimeIdentity);
        assert.equal(JSON.parse(error.message.split('\n').slice(1).join('\n')).case, item.name);
        return true;
      },
    );
  }
  assert.deepEqual(
    differingPaths(
      { completion: { kind: 'runtime-fault', message: 'first' } },
      { completion: { kind: 'runtime-fault', message: 'second' } },
    ),
    ['/completion/message'],
  );
  assert.deepEqual(differingPaths({ error: { rule: 'type' } }, { error: { rule: 'arity' } }), [
    '/error/rule',
  ]);
  assert.deepEqual(differingPaths({ value: ['a', 'b'] }, { value: ['b', 'a'] }), [
    '/value/0',
    '/value/1',
  ]);
  assert.deepEqual(differingPaths({ 'a/b~c': 1 }, {}), ['/a~1b~0c']);
});

test('independent expectations reject shared wrong results and fault controls reject unchanged behavior', () => {
  const source = program([returned(literal(6))], integer);
  const artifact = compileRust(source, runtimeIdentity);
  const wrong = referenceObservation(source, []);
  const item = { name: 'shared-error', args: [], expected: success(7) };
  assert.throws(
    () => checkCase('checker-controls', item, source, artifact, wrong, wrong),
    (error) =>
      error instanceof CompilerConformanceError && error.report.comparison === 'independent/native',
  );
  assert.doesNotThrow(() =>
    checkCase('checker-controls', { ...item, reject: true }, source, artifact, wrong, wrong),
  );
  assert.throws(
    () =>
      checkCase(
        'checker-controls',
        { ...item, expected: success(6), reject: true },
        source,
        artifact,
        wrong,
        wrong,
      ),
    (error) =>
      error instanceof CompilerConformanceError && error.report.comparison === 'undetected-fault',
  );
  const altered = structuredClone(wrong);
  altered.usage.work++;
  assert.throws(
    () =>
      checkCase('checker-controls', { ...item, reject: true }, source, artifact, wrong, altered),
    (error) =>
      error instanceof CompilerConformanceError && error.report.comparison === 'reference/native',
  );
});

test('native partitioning retains every case exactly once within process bounds', () => {
  const cases = Array.from({ length: 400 }, (_, index) => ({
    name: String(index),
    program: Math.floor(index / 3) % 40,
  }));
  const batches = [...nativeBatches(cases)];
  assert.deepEqual(batches.flat(), cases);
  for (const batch of batches) {
    assert(batch.length <= 96);
    assert(new Set(batch.map((item) => item.program)).size <= 32);
  }
  for (const limit of [0, 97, 1.5]) assert.throws(() => [...nativeBatches(cases, limit)]);
});

test('the seeded corpus reproduces its programs and independent expectations exactly', () => {
  const suite = seededSuite();
  assert.deepEqual(suite, seededSuite(COMPILER_CORPUS_SEED));
  assert.notDeepEqual(suite, seededSuite(COMPILER_CORPUS_SEED + 1));
  assert.equal(suite.programs.length, 24);
  assert.equal(suite.cases.length, 192);
  assert.equal(new Set(suite.cases.map((item) => item.name)).size, 192);
  suite.programs.forEach(validateProgram);
});
