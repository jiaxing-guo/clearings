import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeProgram, sealProgram, validateProgram } from 'clearings/program';
import { requiredClosure } from '../dist/analysis/dependencies.js';
import { createRequiredDependencyClosureProgram } from '../programs/clearings/required-dependency-closure.mjs';
import { referenceRequiredClosure } from './helpers/program-closure-reference.mjs';

const bytes = readFileSync(
  new URL('../programs/clearings/required-dependency-closure.json', import.meta.url),
  'utf8',
);
const program = JSON.parse(bytes);
const record = (id, required = [], optional = []) => ({
  id,
  dependencies: [
    ...required.map((target) => ({ target, required: true })),
    ...optional.map((target) => ({ target, required: false })),
  ],
});
const run = (roots, records, options) => executeProgram(program, [roots, records], options);
const returned = (roots, records, expected) => {
  const result = run(roots, records);
  assert.deepEqual(result.completion, { kind: 'return', value: expected });
  return result;
};
const failed = (roots, records, code, id, helper = 'lookup') => {
  const result = run(roots, records),
    completion = result.completion;
  assert.equal(completion.kind, 'application-failure');
  assert.equal(completion.code, code);
  assert.equal(completion.details, id);
  assert.equal(completion.diagnostic.phase, 'execution');
  assert.deepEqual(
    completion.diagnostic.call_stack.map((frame) => frame.function_id),
    ['required_dependency_closure', helper],
  );
  assert(!('value' in completion));
  return result;
};
const ordering = [
  record('root', ['z', 'a']),
  record('z', ['b']),
  record('a', ['y']),
  record('y'),
  record('b'),
];

test('closure artifact validates, reproduces exactly, and contains its algorithm as closed IR', () => {
  validateProgram(program);
  assert.equal(JSON.stringify(createRequiredDependencyClosureProgram(), null, 2) + '\n', bytes);
  assert.equal(
    bytes,
    readFileSync(
      new URL('../benchmarks/agent-runs/closure-scale-001/candidate.program.json', import.meta.url),
      'utf8',
    ),
    'Production executes the exact independently accepted submission',
  );
  assert.equal(program.entry_function, 'required_dependency_closure');
  assert.deepEqual(
    program.functions.map((fn) => fn.id),
    ['required_dependency_closure', 'record_index', 'block', 'merge', 'lookup', 'targets'],
  );
  const kinds = new Set(),
    calls = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.kind) kinds.add(value.kind);
    if (value.kind === 'call') calls.add(value.function_id);
    // Literal payloads remain data, even if their fields resemble syntax.
    if (value.kind !== 'literal') Object.values(value).forEach(visit);
  };
  visit(program);
  for (const kind of [
    'while',
    'if',
    'let',
    'var',
    'assign',
    'call',
    'fail',
    'contains',
    'append',
    'sort',
    'index',
    'field',
  ])
    assert(kinds.has(kind), kind);
  assert.deepEqual([...calls].sort(), ['block', 'lookup', 'merge', 'record_index', 'targets']);
});

test('the committed invocation example executes through the JSON artifact', () => {
  const args = JSON.parse(
    readFileSync(
      new URL('../programs/clearings/required-dependency-closure.arguments.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(args, [['root'], ordering]);
  returned(...args, ['root', 'a', 'z', 'y', 'b']);
});

test('the path oracle agrees with explicit expectations for roots, breadth-first order, and cycles', () => {
  assert.deepEqual(referenceRequiredClosure(['root'], ordering), ['root', 'a', 'z', 'y', 'b']);
  assert.deepEqual(referenceRequiredClosure(['z', 'root', 'z'], ordering), [
    'z',
    'root',
    'b',
    'a',
    'y',
  ]);
  assert.deepEqual(
    referenceRequiredClosure(
      ['c'],
      [record('a', ['b']), record('b', ['c']), record('c', ['a', 'c'])],
    ),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(referenceRequiredClosure([], []), []);
});

test('IR and production kernels agree with independent path ordering on all 512 three-vertex graphs and three roots', () => {
  const labels = ['a', 'b', 'c'];
  let cases = 0;
  for (let mask = 0; mask < 512; mask++) {
    const graph = [...labels].reverse().map((id) =>
      record(
        id,
        [...labels]
          .reverse()
          .filter((target) => mask & (1 << (labels.indexOf(id) * 3 + labels.indexOf(target)))),
      ),
    );
    for (const root of labels) {
      const expected = referenceRequiredClosure([root], graph),
        result = run([root], graph);
      assert.deepEqual(
        result.completion,
        { kind: 'return', value: expected },
        `graph ${mask}, root ${root}`,
      );
      const existing = requiredClosure(
        [root],
        new Map(graph.map((record) => [record.id, record])),
        (record) => record.dependencies.filter((edge) => edge.required).map((edge) => edge.target),
      );
      assert.deepEqual(existing, expected, `production kernel: graph ${mask}, root ${root}`);
      cases++;
    }
  }
  assert.equal(cases, 1536);
});

test('empty inputs, isolated roots, duplicate roots, and ordered multiple roots have exact closure semantics', () => {
  returned([], [], []);
  returned([], [record('unused')], []);
  returned(['one'], [record('one')], ['one']);
  returned(['z', 'a', 'z'], [record('a'), record('unused'), record('z')], ['z', 'a']);
  returned(['root', 'a', 'root'], ordering, ['root', 'a', 'z', 'y', 'b']);
  returned(['z', 'root', 'z'], ordering, ['z', 'root', 'b', 'a', 'y']);
  returned(['root', 'b'], ordering, ['root', 'b', 'a', 'z', 'y']);
  returned(['b', 'root'], ordering, ['b', 'root', 'a', 'z', 'y']);
});

test('breadth-first discovery sorts targets per parent and selects shortest paths before lexicographic ties', () => {
  returned(['root'], ordering, ['root', 'a', 'z', 'y', 'b']);
  const diamond = [
    record('root', ['z', 'a']),
    record('z', ['shared', 'b']),
    record('a', ['shared', 'y']),
    record('shared', ['root']),
    record('y'),
    record('b'),
  ];
  returned(['root'], diamond, ['root', 'a', 'z', 'shared', 'y', 'b']);
  const shortcut = [
    record('root', ['z', 'a']),
    record('a', ['b']),
    record('b', ['c']),
    record('c', ['z']),
    record('z', ['leaf']),
    record('leaf'),
  ];
  returned(['root'], shortcut, ['root', 'a', 'z', 'b', 'leaf', 'c']);
});

test('duplicate dependencies, self-loops, and multi-node cycles terminate without duplicate output', () => {
  returned(
    ['root', 'root'],
    [
      record('root', ['root', 'a', 'a', 'root']),
      record('a', ['root', 'b', 'b']),
      record('b', ['a', 'b']),
    ],
    ['root', 'a', 'b'],
  );
  returned(['c'], [record('a', ['b']), record('b', ['c']), record('c', ['a'])], ['c', 'a', 'b']);
  returned(['only'], [record('only', ['only', 'only'])], ['only']);
});

test('optional edges alone do not expand closure, even when missing or mixed with required duplicates', () => {
  const graph = [
    record('root', ['branch'], ['optional', 'absent']),
    record('branch', ['leaf']),
    record('leaf'),
    record('optional', ['absent-too']),
  ];
  returned(['root'], graph, ['root', 'branch', 'leaf']);
  returned(['root'], [record('root', ['x'], ['x', 'missing']), record('x')], ['root', 'x']);
  returned(['root'], [record('root', [], ['missing'])], ['root']);
  const both = record('root');
  both.dependencies = [
    { target: 'missing', required: false },
    { target: 'missing', required: true },
  ];
  failed(['root'], [both], 'MISSING_REQUIRED_DEPENDENCY', 'missing');
});

test('successful output ignores record and edge declaration permutations while preserving root order', () => {
  for (const graph of [
    ordering,
    [...ordering].reverse(),
    [...ordering.slice(2), ...ordering.slice(0, 2)],
  ]) {
    for (const reverse of [false, true]) {
      const reordered = graph.map((item) => ({
        ...item,
        dependencies: reverse ? [...item.dependencies].reverse() : item.dependencies,
      }));
      returned(['root'], reordered, ['root', 'a', 'z', 'y', 'b']);
      returned(['z', 'root'], reordered, ['z', 'root', 'b', 'a', 'y']);
    }
  }
});

test('IDs use UTF-16 string semantics and never use prototypes, aliases, or numeric coercion', () => {
  const ids = [
    '\uE000',
    '\uD83D\uDE00',
    '\uD800',
    'a',
    '__proto__',
    'constructor',
    '',
    '2',
    '10',
    'A',
    'e\u0301',
    '\u00E9',
    '\u0000',
  ];
  const graph = [record('root', ids), ...ids.map((id) => record(id))];
  returned(['root'], graph, [
    'root',
    '',
    '\u0000',
    '10',
    '2',
    'A',
    '__proto__',
    'a',
    'constructor',
    'e\u0301',
    '\u00E9',
    '\uD800',
    '\uD83D\uDE00',
    '\uE000',
  ]);
  returned([''], [record('')], ['']);
  failed(['alias-root'], [record('root')], 'MISSING_REQUIRED_DEPENDENCY', 'alias-root');
});

test('missing roots and reached required records propagate the exact missing ID from the IR lookup function', () => {
  failed(['missing'], [], 'MISSING_REQUIRED_DEPENDENCY', 'missing');
  failed(['root'], [record('root', ['missing'])], 'MISSING_REQUIRED_DEPENDENCY', 'missing');
  failed(
    ['root'],
    [record('root', ['a']), record('a', ['deep-missing'])],
    'MISSING_REQUIRED_DEPENDENCY',
    'deep-missing',
  );
  failed(
    ['root'],
    [record('root', ['z-missing', 'a-missing'])],
    'MISSING_REQUIRED_DEPENDENCY',
    'a-missing',
  );
  failed(
    ['root', 'missing-root'],
    [record('root', ['missing-edge'])],
    'MISSING_REQUIRED_DEPENDENCY',
    'missing-root',
  );
  failed(
    ['root'],
    [record('root', ['z', 'a']), record('a', ['y-missing']), record('z', ['b-missing'])],
    'MISSING_REQUIRED_DEPENDENCY',
    'y-missing',
  );
});

test('unreachable missing references remain outside the kernel traversal boundary', () => {
  const graph = [record('root'), record('unused', ['missing'])];
  returned(['root'], graph, ['root']);
  returned([], graph, []);
  failed(['unused'], graph, 'MISSING_REQUIRED_DEPENDENCY', 'missing');
});

test('duplicate record declarations are rejected before traversal and before missing-root failure', () => {
  for (const roots of [[], ['a'], ['missing']])
    failed(roots, [record('a'), record('a')], 'DUPLICATE_RECORD_ID', 'a', 'record_index');
  failed(
    ['root'],
    [record('root', ['missing']), record('b'), record('a'), record('b'), record('a')],
    'DUPLICATE_RECORD_ID',
    'b',
    'record_index',
  );
  failed([''], [record(''), record('')], 'DUPLICATE_RECORD_ID', '', 'record_index');
});

test('workload signature rejects malformed data before an application failure can be interpreted', () => {
  for (const args of [
    [],
    [['root']],
    ['root', []],
    [[1], []],
    [[], [{ id: 1, dependencies: [] }]],
    [[], [{ id: 'a', dependencies: [], extra: 1 }]],
    [[], [{ id: 'a', dependencies: [{ target: 'b', required: 'required' }] }]],
    [[], [{ id: 'a', dependencies: [{ target: 'b' }] }]],
  ]) {
    assert.throws(() => executeProgram(program, args), { code: 'INVALID_PROGRAM_EXECUTION' });
  }
});

test('execution preserves caller data and returns independently owned deterministic results', () => {
  const roots = ['root', 'root'],
    records = structuredClone(ordering),
    before = structuredClone([roots, records]),
    programBefore = structuredClone(program);
  const first = run(roots, records),
    second = run(roots, records);
  assert.deepEqual(first, second);
  assert.deepEqual([roots, records], before);
  assert.deepEqual(program, programBefore);
  first.completion.value.push('caller-change');
  assert.deepEqual(second.completion.value, ['root', 'a', 'z', 'y', 'b']);
  records[0].dependencies.length = 0;
  assert.deepEqual(second.completion.value, ['root', 'a', 'z', 'y', 'b']);
  roots.push('another-change');
  assert.deepEqual(second.completion.value, ['root', 'a', 'z', 'y', 'b']);
});

test('larger finite chain, cycle, and fan-out workloads complete with default interpreter limits', () => {
  const ids = Array.from({ length: 32 }, (_, i) => `n${String(i).padStart(2, '0')}`);
  const chain = ids.map((id, i) => record(id, i + 1 < ids.length ? [ids[i + 1]] : []));
  returned([ids[0]], [...chain].reverse(), ids);
  chain.at(-1).dependencies.push({ target: ids[0], required: true });
  returned([ids[0]], [...chain].reverse(), ids);
  const fan = [record('root', [...ids].reverse()), ...ids.map((id) => record(id))];
  returned(['root'], fan, ['root', ...ids]);
});

test('runtime resource exhaustion is preserved instead of reporting a partial closure or application failure', () => {
  for (const [options, phase] of [
    [{ work: 1000 }, 'execution'],
    [{ allocation_units: 700 }, 'execution'],
    [{ value_units: 10 }, 'arguments'],
    [{ evaluation_depth: 5 }, 'execution'],
  ]) {
    const result = run(['root'], ordering, options);
    assert.equal(result.completion.kind, 'resource-exhaustion');
    assert.equal(result.completion.resource, Object.keys(options)[0]);
    assert.equal(result.completion.diagnostic.phase, phase);
    assert(!('value' in result.completion));
    assert(!('details' in result.completion));
  }
  returned(['root'], ordering, ['root', 'a', 'z', 'y', 'b']);
});

test('independent expectations reject valid IR mutations of closure, ordering, edge filtering, and failure behavior', () => {
  const mutations = [
    {
      name: 'incomplete closure',
      args: [['root'], ordering],
      expected: { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] },
      edit: (p) => {
        p.functions[0].body = [{ kind: 'return', value: { kind: 'ref', name: 'roots' } }];
      },
    },
    {
      name: 'unsorted targets',
      args: [['root'], ordering],
      expected: { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] },
      edit: (p) => {
        p.functions.find((fn) => fn.id === 'targets').body.at(-1).value = {
          kind: 'ref',
          name: 't',
        };
      },
    },
    {
      name: 'optional expansion',
      args: [['root'], [record('root', [], ['optional']), record('optional')]],
      expected: { kind: 'return', value: ['root'] },
      edit: (p) => {
        p.functions
          .find((fn) => fn.id === 'targets')
          .body.find((s) => s.kind === 'while')
          .body.find((s) => s.kind === 'if').condition = {
          kind: 'literal',
          type: { kind: 'boolean' },
          value: true,
        };
      },
    },
    {
      name: 'global output sort',
      args: [['root'], ordering],
      expected: { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] },
      edit: (p) => {
        p.functions[0].body.at(-1).value = {
          kind: 'sort',
          list: { kind: 'ref', name: 'q' },
        };
      },
    },
    {
      name: 'missing record substitution',
      args: [['absent'], [record('present')]],
      expected: {
        kind: 'application-failure',
        code: 'MISSING_REQUIRED_DEPENDENCY',
        details: 'absent',
      },
      edit: (p) => {
        const body = p.functions.find((fn) => fn.id === 'lookup').body;
        body[body.length - 1] = {
          kind: 'return',
          value: {
            kind: 'index',
            list: { kind: 'ref', name: 'r' },
            index: { kind: 'literal', type: { kind: 'integer' }, value: 0 },
          },
        };
      },
    },
  ];
  for (const mutation of mutations) {
    const candidate = structuredClone(program);
    mutation.edit(candidate);
    const sealed = sealProgram(candidate);
    assert.notEqual(sealed.artifact_id, program.artifact_id);
    const completion = executeProgram(sealed, mutation.args).completion;
    // Only application data is compared; diagnostics cannot mask a behavioural disagreement.
    const observed =
      completion.kind === 'application-failure'
        ? { kind: completion.kind, code: completion.code, details: completion.details }
        : completion;
    assert.notDeepEqual(observed, mutation.expected, mutation.name);
  }
});
