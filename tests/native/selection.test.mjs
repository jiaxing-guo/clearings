import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeProgram } from 'clearings/program';
import { prepareRustProgram } from 'clearings/compiler';
import { selectionCases } from '../../benchmarks/evaluation/context-selection-v1/cases.mjs';
import { expectedSelection } from '../../benchmarks/evaluation/context-selection-v1/oracle.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const program = read('../../programs/clearings/context-selection.json');
const contract = read('../../benchmarks/evaluation/context-selection-v1/contract.json');
const reviewCases = read('../../benchmarks/evaluation/context-selection-review-v1/cases.json');

test('compiled selection agrees with independent expectations and reference accounting on the original domain and review regressions', () => {
  const cache = mkdtempSync(join(tmpdir(), 'clearings-selection-test-'));
  try {
    const native = prepareRustProgram(program, { cacheDirectory: cache });
    let count = 0;
    for (const item of [...selectionCases(), ...reviewCases]) {
      const before = structuredClone(item.args);
      const reference = executeProgram(program, item.args, contract.limits);
      const compiled = native.execute(item.args, contract.limits);
      assert.deepEqual(
        compiled.completion,
        { kind: 'return', value: item.expected ?? expectedSelection(before) },
        item.id,
      );
      assert.deepEqual(compiled.completion, reference.completion, item.id);
      assert.deepEqual(compiled.usage, reference.usage, item.id);
      assert.deepEqual(compiled.limits, reference.limits, item.id);
      assert.deepEqual(item.args, before, item.id);
      count++;
    }
    assert.equal(count, contract.domain.total + reviewCases.length);
    const args = [...selectionCases()].find((item) => item.id === 'dense/16').args;
    for (const limits of [
      { work: 1 },
      { allocation_units: 1 },
      { value_units: 1 },
      { evaluation_depth: 1 },
    ]) {
      const reference = executeProgram(program, args, limits),
        compiled = native.execute(args, limits);
      assert.equal(compiled.completion.kind, 'resource-exhaustion');
      assert.deepEqual(compiled.completion, reference.completion);
      assert.deepEqual(compiled.usage, reference.usage);
    }
    for (const invalid of [[], [[], [], [], [1]], [[], [{ id: 'a' }], [], []]])
      assert.throws(() => native.execute(invalid), { code: 'INVALID_PROGRAM_EXECUTION' });
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
