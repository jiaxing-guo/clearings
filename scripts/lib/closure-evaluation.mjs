import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { executeProgram, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';
import { referenceRequiredClosure } from '../../tests/helpers/program-closure-reference.mjs';

export const limits = PROGRAM_EXECUTION_MAX_LIMITS;
const record = (id, targets = [], optional = []) => ({
  id,
  dependencies: [
    ...targets.map((target) => ({ target, required: true })),
    ...optional.map((target) => ({ target, required: false })),
  ],
});
const returned = (value) => ({ kind: 'return', value });
const failed = (code, details) => ({ kind: 'application-failure', code, details });

/** Workloads have construction-derived expectations, independent of candidate traversal. */
export function scaleCases() {
  const cases = [];
  for (const size of [32, 128, 256, 512]) {
    const ids = Array.from({ length: size }, (_, i) => `n${i}`);
    const chain = ids.map((id, i) => record(id, ids.slice(i + 1, i + 2)));
    cases.push({ id: `chain-${size}`, args: [[ids[0]], chain], expected: returned(ids) });
    cases.push({
      id: `reversed-chain-${size}`,
      args: [[ids[0]], [...chain].reverse()],
      expected: returned(ids),
    });
  }
  for (const size of [32, 128]) {
    const ids = Array.from({ length: size }, (_, i) => `v${i}`);
    cases.push({
      id: `star-${size}`,
      args: [
        [ids[0]],
        [record(ids[0], ids.slice(1).reverse()), ...ids.slice(1).map((id) => record(id))],
      ],
      expected: returned([ids[0], ...ids.slice(1).sort()]),
    });
    cases.push({
      id: `cycle-${size}`,
      args: [[ids[0]], ids.map((id, i) => record(id, [ids[(i + 1) % size]]))],
      expected: returned(ids),
    });
    cases.push({
      id: `duplicate-edges-${size}`,
      args: [
        [ids[0], ids[0]],
        ids.map((id, i) => record(id, i + 1 < size ? Array(4).fill(ids[i + 1]) : [])),
      ],
      expected: returned(ids),
    });
  }
  const unrelated = Array.from({ length: 510 }, (_, i) => record(`unrelated-${i}`, [], ['absent']));
  cases.push({
    id: 'small-closure-large-specification',
    args: [['root'], [...unrelated, record('leaf'), record('root', ['leaf'])]],
    expected: returned(['root', 'leaf']),
  });
  return cases;
}

export function correctnessCases() {
  const cases = [];
  const ids = ['a', 'b', 'c'];
  for (let mask = 0; mask < 512; mask++) {
    const records = [...ids].reverse().map((id) =>
      record(
        id,
        [...ids]
          .reverse()
          .filter((target) => mask & (1 << (ids.indexOf(id) * 3 + ids.indexOf(target)))),
      ),
    );
    for (const root of ids)
      cases.push({
        id: `graph-${mask}-${root}`,
        args: [[root], records],
        expected: returned(referenceRequiredClosure([root], records)),
      });
  }
  const ordered = [
    record('root', ['z', 'a']),
    record('z', ['b']),
    record('a', ['y']),
    record('y'),
    record('b'),
  ];
  const special = ['', '__proto__', '\ud800', '\ud83d\ude00', '\ue000'];
  cases.push(
    {
      id: 'breadth-first',
      args: [['root'], ordered],
      expected: returned(['root', 'a', 'z', 'y', 'b']),
    },
    {
      id: 'multiple-roots',
      args: [['z', 'root', 'z'], ordered],
      expected: returned(['z', 'root', 'b', 'a', 'y']),
    },
    { id: 'empty', args: [[], []], expected: returned([]) },
    {
      id: 'unicode',
      args: [
        ['root'],
        [record('root', [...special].reverse()), ...special.map((id) => record(id))],
      ],
      expected: returned(['root', ...special.sort()]),
    },
    {
      id: 'optional-and-unreachable',
      args: [['root'], [record('root', [], ['absent']), record('unreachable', ['also-absent'])]],
      expected: returned(['root']),
    },
    {
      id: 'missing-root',
      args: [['absent'], ordered],
      expected: failed('MISSING_REQUIRED_DEPENDENCY', 'absent'),
    },
    {
      id: 'missing-target-order',
      args: [['root'], [record('root', ['z', 'a'])]],
      expected: failed('MISSING_REQUIRED_DEPENDENCY', 'a'),
    },
    {
      id: 'root-before-target-failure',
      args: [['root', 'missing-root'], [record('root', ['a'])]],
      expected: failed('MISSING_REQUIRED_DEPENDENCY', 'missing-root'),
    },
    {
      id: 'first-duplicate',
      args: [['absent'], [record('z'), record('a'), record('a'), record('z')]],
      expected: failed('DUPLICATE_RECORD_ID', 'a'),
    },
    {
      id: 'duplicate-with-empty-roots',
      args: [[], [record('z'), record('z')]],
      expected: failed('DUPLICATE_RECORD_ID', 'z'),
    },
  );
  return cases;
}

/** Program locations/usage can change after an algorithm revision; behavior cannot. */
export function behavior(completion) {
  if (completion.kind === 'application-failure') {
    const { kind, code, details } = completion;
    return { kind, code, details };
  }
  return completion;
}

export function observe(program, item, execute = (args) => executeProgram(program, args, limits)) {
  const args = structuredClone(item.args);
  const result = execute(args);
  return {
    result,
    matches: isDeepStrictEqual(behavior(result.completion), item.expected),
    unchanged: isDeepStrictEqual(args, item.args),
  };
}

/** Compare a candidate to its frozen baseline, never to machine timing thresholds. */
export function assess(rows, nativeStatus) {
  const failures = [];
  const nativeFailures = [];
  for (const row of rows) {
    if (!row.candidate.unchanged) failures.push(`${row.id}: input mutation`);
    if (!row.candidate.matches) failures.push(`${row.id}: unexpected behavior or exhaustion`);
    if (row.native && !row.native.equal)
      nativeFailures.push(`${row.id}: native/reference disagreement`);
  }
  const chain = rows.find((row) => row.id === 'chain-256');
  if (chain && chain.candidate.result.usage.work > chain.baseline.result.usage.work * 0.75)
    failures.push('chain-256: less than 25% work reduction');
  return {
    reference: failures.length ? 'rejected' : 'accepted',
    native: nativeStatus,
    acceptance:
      failures.length || nativeFailures.length
        ? 'rejected'
        : nativeStatus === 'passed'
          ? 'accepted'
          : 'inconclusive',
    failures: [...failures, ...nativeFailures],
  };
}

export function compareNative(reference, native) {
  for (const field of ['program_id', 'limits', 'usage', 'completion'])
    assert.deepEqual(native[field], reference[field], field);
}
