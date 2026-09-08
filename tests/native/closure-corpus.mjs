import { readFileSync } from 'node:fs';
import { sealProgram } from 'clearings/program';
import { referenceRequiredClosure } from '../helpers/program-closure-reference.mjs';
import { failure, success } from './programs.mjs';

const closure = () =>
  JSON.parse(
    readFileSync(
      new URL('../../programs/clearings/required-dependency-closure.json', import.meta.url),
      'utf8',
    ),
  );
const record = (id, required = [], optional = []) => ({
  id,
  dependencies: [
    ...required.map((target) => ({ target, required: true })),
    ...optional.map((target) => ({ target, required: false })),
  ],
});
const ordering = [
  record('root', ['z', 'a']),
  record('z', ['b']),
  record('a', ['y']),
  record('y'),
  record('b'),
];

export function exhaustiveClosureSuite() {
  const labels = ['a', 'b', 'c'];
  const cases = [];
  // Nine possible directed edges, including self-loops: 2^9 graphs times three roots.
  for (let mask = 0; mask < 512; mask++) {
    const graph = [...labels].reverse().map((id) =>
      record(
        id,
        [...labels]
          .reverse()
          .filter((target) => mask & (1 << (labels.indexOf(id) * 3 + labels.indexOf(target)))),
      ),
    );
    for (const root of labels)
      cases.push({
        name: `graph-${mask}/root-${root}`,
        program: 0,
        args: [[root], graph],
        expected: success(referenceRequiredClosure([root], graph)),
      });
  }
  return { name: 'exhaustive-closure', programs: [closure()], cases };
}

export function targetedClosureSuite() {
  const cases = [];
  const add = (name, roots, records, expected) =>
    cases.push({ name, program: 0, args: [roots, records], expected });
  add('empty', [], [], success([]));
  add('unused-record', [], [record('unused')], success([]));
  add('isolated-root', ['one'], [record('one')], success(['one']));
  add('duplicate-roots', ['z', 'a', 'z'], [record('a'), record('z')], success(['z', 'a']));
  for (const [name, roots, expected] of [
    ['breadth-first', ['root'], ['root', 'a', 'z', 'y', 'b']],
    ['multiple-roots', ['z', 'root', 'z'], ['z', 'root', 'b', 'a', 'y']],
    ['root-precedence', ['b', 'root'], ['b', 'root', 'a', 'z', 'y']],
  ]) {
    add(name, roots, ordering, success(expected));
    add(
      `${name}/permuted`,
      roots,
      [...ordering].reverse().map((item) => ({
        ...item,
        dependencies: [...item.dependencies].reverse(),
      })),
      success(expected),
    );
  }
  add(
    'diamond',
    ['root'],
    [
      record('root', ['z', 'a']),
      record('z', ['shared', 'b']),
      record('a', ['shared', 'y']),
      record('shared', ['root']),
      record('y'),
      record('b'),
    ],
    success(['root', 'a', 'z', 'shared', 'y', 'b']),
  );
  add(
    'shortcut',
    ['root'],
    [
      record('root', ['z', 'a']),
      record('a', ['b']),
      record('b', ['c']),
      record('c', ['z']),
      record('z', ['leaf']),
      record('leaf'),
    ],
    success(['root', 'a', 'z', 'b', 'leaf', 'c']),
  );
  add(
    'duplicate-edges-and-cycle',
    ['root', 'root'],
    [record('root', ['root', 'a', 'a']), record('a', ['root', 'b', 'b']), record('b', ['a', 'b'])],
    success(['root', 'a', 'b']),
  );
  add('optional-missing', ['root'], [record('root', [], ['missing'])], success(['root']));
  add(
    'mixed-edges',
    ['root'],
    [record('root', ['x'], ['x', 'missing']), record('x')],
    success(['root', 'x']),
  );
  add(
    'unreachable-missing',
    ['root'],
    [record('root'), record('unused', ['missing'])],
    success(['root']),
  );
  add('unreachable-missing-empty-roots', [], [record('unused', ['missing'])], success([]));
  const labels = [
    '\ue000',
    '😀',
    '\ud800',
    'a',
    '__proto__',
    'constructor',
    '',
    '2',
    '10',
    'A',
    'e\u0301',
    'é',
    '\0',
  ];
  add(
    'utf16-identifiers',
    ['root'],
    [record('root', labels), ...labels.map((id) => record(id))],
    success([
      'root',
      '',
      '\0',
      '10',
      '2',
      'A',
      '__proto__',
      'a',
      'constructor',
      'e\u0301',
      'é',
      '\ud800',
      '😀',
      '\ue000',
    ]),
  );
  add('empty-id', [''], [record('')], success(['']));
  for (const [name, roots, records, missing] of [
    ['missing-root', ['absent'], [], 'absent'],
    ['missing-edge', ['root'], [record('root', ['missing'])], 'missing'],
    ['deep-missing', ['root'], [record('root', ['a']), record('a', ['missing'])], 'missing'],
    ['sorted-failure', ['root'], [record('root', ['z-missing', 'a-missing'])], 'a-missing'],
    [
      'root-before-edge',
      ['root', 'missing-root'],
      [record('root', ['missing-edge'])],
      'missing-root',
    ],
    [
      'parent-before-global-order',
      ['root'],
      [record('root', ['z', 'a']), record('a', ['y-missing']), record('z', ['b-missing'])],
      'y-missing',
    ],
    [
      'optional-and-required-missing',
      ['root'],
      [record('root', ['missing'], ['missing'])],
      'missing',
    ],
  ])
    add(name, roots, records, failure('MISSING_REQUIRED_DEPENDENCY', missing));
  for (const roots of [[], ['a'], ['missing']])
    add(
      `duplicate-before-traversal/${JSON.stringify(roots)}`,
      roots,
      [record('a'), record('a')],
      failure('DUPLICATE_RECORD_ID', 'a'),
    );
  add(
    'first-duplicate',
    ['root'],
    [record('root', ['missing']), record('b'), record('a'), record('b'), record('a')],
    failure('DUPLICATE_RECORD_ID', 'b'),
  );
  add('empty-duplicate', [''], [record(''), record('')], failure('DUPLICATE_RECORD_ID', ''));
  const ids = Array.from({ length: 32 }, (_, index) => `n${String(index).padStart(2, '0')}`);
  const chain = ids.map((id, index) => record(id, index + 1 < ids.length ? [ids[index + 1]] : []));
  add('chain-32', [ids[0]], [...chain].reverse(), success(ids));
  add(
    'cycle-32',
    [ids[0]],
    chain.map((item, index) => (index === 31 ? record(item.id, [ids[0]]) : item)),
    success(ids),
  );
  add(
    'fan-out-32',
    ['root'],
    [record('root', [...ids].reverse()), ...ids.map((id) => record(id))],
    success(['root', ...ids]),
  );
  return { name: 'targeted-closure', programs: [closure()], cases };
}

/** These statically valid wrong algorithms must execute normally and disagree with the oracle. */
export function closureFaultSuite() {
  const mutations = [
    {
      name: 'skipped-traversal',
      args: [['root'], ordering],
      expected: success(['root', 'a', 'z', 'y', 'b']),
      edit(program) {
        program.functions[0].body = [{ kind: 'return', value: { kind: 'ref', name: 'roots' } }];
      },
    },
    {
      name: 'unsorted-targets',
      args: [['root'], ordering],
      expected: success(['root', 'a', 'z', 'y', 'b']),
      edit(program) {
        program.functions.find((fn) => fn.id === 'required_targets').body.at(-1).value = {
          kind: 'ref',
          name: 'targets',
        };
      },
    },
    {
      name: 'optional-expansion',
      args: [['root'], [record('root', [], ['optional']), record('optional')]],
      expected: success(['root']),
      edit(program) {
        program.functions
          .find((fn) => fn.id === 'required_targets')
          .body.find((statement) => statement.kind === 'while')
          .body.find((statement) => statement.kind === 'if').condition = {
          kind: 'literal',
          type: { kind: 'boolean' },
          value: true,
        };
      },
    },
    {
      name: 'global-output-sort',
      args: [['root'], ordering],
      expected: success(['root', 'a', 'z', 'y', 'b']),
      edit(program) {
        program.functions[0].body.at(-1).value = {
          kind: 'sort',
          list: { kind: 'ref', name: 'selected' },
        };
      },
    },
    {
      name: 'lost-missing-failure',
      args: [['absent'], [record('present')]],
      expected: failure('MISSING_REQUIRED_DEPENDENCY', 'absent'),
      edit(program) {
        const body = program.functions.find((fn) => fn.id === 'lookup_record').body;
        body[body.length - 1] = {
          kind: 'return',
          value: {
            kind: 'index',
            list: { kind: 'ref', name: 'records' },
            index: { kind: 'literal', type: { kind: 'integer' }, value: 0 },
          },
        };
      },
    },
  ];
  const original = closure();
  const programs = [original];
  const cases = [];
  for (const mutation of mutations) {
    const candidate = structuredClone(original);
    mutation.edit(candidate);
    const sealed = sealProgram(candidate);
    if (sealed.artifact_id === original.artifact_id)
      throw new Error('Fault control did not change the program.');
    const index = programs.push(sealed) - 1;
    // A corresponding positive control prevents a broken expectation from counting as detection.
    cases.push({
      name: `${mutation.name}/positive`,
      program: 0,
      args: mutation.args,
      expected: mutation.expected,
    });
    cases.push({
      name: mutation.name,
      program: index,
      args: mutation.args,
      expected: mutation.expected,
      reject: true,
    });
  }
  return { name: 'closure-fault-controls', programs, cases };
}
