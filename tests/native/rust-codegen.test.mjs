import assert from 'node:assert/strict';
import test from 'node:test';
import { executeProgram } from 'clearings/program';
import { nativeBatch } from './harness.mjs';
import { corpus } from './corpus.mjs';

// These tests deliberately require the pinned Rust toolchain; no silent skip/fallback.
test(
  'generated native programs preserve independently expected behavior and reference instrumentation',
  { timeout: 180_000 },
  (t) => {
    const { programs, cases } = corpus();
    const { results, measurements } = nativeBatch(programs, cases);
    cases.forEach((item, i) => {
      const actual = results[i];
      const context = `${i}: ${item.name}, program=${programs[item.program].artifact_id}, limits=${JSON.stringify(item.limits ?? {})}`;
      if (item.inputError) {
        assert.throws(
          () => executeProgram(programs[item.program], item.args, item.limits),
          (e) => {
            assert.deepEqual(
              actual.error,
              { code: e.code, path: e.details.path, rule: e.details.rule },
              context,
            );
            return true;
          },
        );
        return;
      }
      if (Object.hasOwn(item, 'expected'))
        assert.deepEqual(actual.completion, { kind: 'return', value: item.expected }, context);
      if (item.application) {
        assert.equal(actual.completion.kind, 'application-failure', context);
        assert.equal(actual.completion.code, item.application, context);
        assert.deepEqual(actual.completion.details, item.details, context);
      }
      if (item.fault) {
        assert.equal(actual.completion.kind, 'runtime-fault', context);
        assert.equal(actual.completion.code, item.fault, context);
      }
      if (item.exhausted) {
        assert.equal(actual.completion.kind, 'resource-exhaustion', context);
        assert.equal(actual.completion.resource, item.exhausted, context);
      }
      const { limits, usage, completion } = executeProgram(
        programs[item.program],
        item.args,
        item.limits,
      );
      assert.deepEqual(actual, { limits, usage, completion }, context);
    });
    t.diagnostic(
      `${programs.length} programs, ${cases.length} native cases; ${JSON.stringify(measurements)}`,
    );
  },
);
