import { readFileSync } from 'node:fs';
import { sealProgram, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';
import { referenceRequiredClosure } from '../helpers/program-closure-reference.mjs';

const integer = { kind: 'integer' },
  boolean = { kind: 'boolean' },
  string = { kind: 'string' },
  nil = { kind: 'null' };
const list = (element) => ({ kind: 'list', element });
const record = (fields) => ({ kind: 'record', fields });
const lit = (value, type = integer) => ({ kind: 'literal', type, value });
const ref = (name) => ({ kind: 'ref', name });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
const ret = (value) => ({ kind: 'return', value });
const local = (name, value, type = integer, kind = 'var') => ({ kind, name, type, value });
const assign = (name, value) => ({ kind: 'assign', name, value });
const branch = (condition, then, otherwise = []) => ({
  kind: 'if',
  condition,
  then,
  else: otherwise,
});
const loop = (condition, body) => ({ kind: 'while', condition, body });
const fail = (code, details) => ({ kind: 'fail', code, details });
const fn = (id, body, returns = integer, parameters = [], failures = []) => ({
  id,
  body,
  returns,
  parameters,
  failures,
});
const program = (body, returns = integer, parameters = [], failures = [], helpers = []) =>
  sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Native compiler fixture',
    entry_function: 'main',
    functions: [fn('main', body, returns, parameters, failures), ...helpers],
  });
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../../programs/${path}.json`, import.meta.url), 'utf8'));

export function corpus() {
  const programs = [],
    cases = [];
  const add = (name, p, entries) => {
    const index = programs.push(p) - 1;
    for (const entry of entries) cases.push({ name, program: index, args: [], ...entry });
  };
  add(
    'identity',
    read('examples/identity'),
    ['', 'Clearings', '\ud800\u0000😀\udfff"\\\n'].map((text) => ({
      args: [text],
      expected: text,
    })),
  );
  add('sum', read('examples/sum-nonnegative'), [
    { args: [[]], expected: 0 },
    { args: [[2, 0, 3]], expected: 5 },
    { args: [[2, -1, 3]], application: 'NEGATIVE_VALUE', details: -1 },
    { args: [[Number.MAX_SAFE_INTEGER, 1]], fault: 'INTEGER_OVERFLOW' },
  ]);
  const closure = read('clearings/required-dependency-closure');
  const edge = (target, required = true) => ({ target, required });
  const graph = [
    { id: 'root', dependencies: [edge('z'), edge('a'), edge('absent', false)] },
    { id: 'a', dependencies: [edge('leaf'), edge('root')] },
    { id: 'z', dependencies: [edge('leaf')] },
    { id: 'leaf', dependencies: [] },
    { id: 'unused', dependencies: [edge('absent')] },
  ];
  const closureCases = [[], ['root'], ['z', 'root', 'z'], ['leaf', 'root']].map((roots) => ({
    args: [roots, graph],
    expected: referenceRequiredClosure(roots, graph),
  }));
  closureCases.push(
    { args: [['missing'], graph], application: 'MISSING_REQUIRED_DEPENDENCY', details: 'missing' },
    {
      args: [['missing'], [...graph, graph[0]]],
      application: 'DUPLICATE_RECORD_ID',
      details: 'root',
    },
    { args: [[], []], expected: [] },
  );
  const labels = ['\ue000', '😀', '\ud800', '__proto__', ''];
  const unicodeGraph = [
    { id: 'root', dependencies: labels.map((label) => edge(label)) },
    ...labels.map((id) => ({ id, dependencies: [] })),
  ];
  closureCases.push({
    args: [['root'], unicodeGraph],
    expected: ['root', '', '__proto__', '\ud800', '😀', '\ue000'],
  });
  add('closure', closure, closureCases);

  // One independently specified record exercises all scalar, aggregate, and binary forms.
  const ints = lit([3, -2, 3, 0], list(integer));
  const strings = lit(['\ue000', '😀', '\ud800', ''], list(string));
  const protoType = record({ ['__proto__']: string, match: integer });
  const fields = [
    ['nil', nil, lit(null, nil), null],
    ['empty_record', record({}), { kind: 'record', fields: [] }, {}],
    ['flag', boolean, lit(false, boolean), false],
    ['zero', integer, lit(-0), 0],
    ['min', integer, lit(Number.MIN_SAFE_INTEGER), Number.MIN_SAFE_INTEGER],
    ['text', string, lit('"\\\n\u0000\ud800😀', string), '"\\\n\u0000\ud800😀'],
    ['sorted', list(integer), { kind: 'sort', list: ints }, [-2, 0, 3, 3]],
    ['unicode', list(string), { kind: 'sort', list: strings }, ['', '\ud800', '😀', '\ue000']],
    ['appended', list(integer), { kind: 'append', list: ints, value: lit(7) }, [3, -2, 3, 0, 7]],
    ['found', boolean, { kind: 'contains', list: ints, value: lit(-2) }, true],
    ['absent', boolean, { kind: 'contains', list: ints, value: lit(9) }, false],
    ['item', integer, { kind: 'index', list: ints, index: lit(1) }, -2],
    ['size', integer, { kind: 'length', list: ints }, 4],
    ['negated', boolean, { kind: 'not', value: lit(false, boolean) }, true],
    [
      'constructed',
      list(integer),
      { kind: 'list', element_type: integer, items: [lit(4), lit(9)] },
      [4, 9],
    ],
    ['empty', list(integer), { kind: 'list', element_type: integer, items: [] }, []],
    [
      'field',
      string,
      {
        kind: 'field',
        name: '__proto__',
        record: lit({ match: 8, ['__proto__']: 'safe' }, protoType),
      },
      'safe',
    ],
    [
      'aggregate',
      boolean,
      binary('eq', lit({ match: 8, ['__proto__']: 'safe' }, protoType), {
        kind: 'record',
        fields: [
          { name: '__proto__', value: lit('safe', string) },
          { name: 'match', value: lit(8) },
        ],
      }),
      true,
    ],
  ];
  for (const [op, a, b, expected] of [
    ['add', 7, 4, 11],
    ['sub', 7, 4, 3],
    ['eq', 7, 7, true],
    ['ne', 7, 4, true],
    ['lt', 7, 4, false],
    ['lte', 7, 7, true],
    ['gt', 7, 4, true],
    ['gte', 7, 7, true],
  ])
    fields.push([
      op,
      typeof expected === 'boolean' ? boolean : integer,
      binary(op, lit(a), lit(b)),
      expected,
    ]);
  fields.push([
    'string_order',
    boolean,
    binary('lt', lit('😀', string), lit('\ue000', string)),
    true,
  ]);
  for (const op of ['and', 'or'])
    for (const a of [false, true])
      for (const b of [false, true])
        fields.push([
          `${op}_${a}_${b}`,
          boolean,
          binary(op, lit(a, boolean), lit(b, boolean)),
          op === 'and' ? a && b : a || b,
        ]);
  add(
    'constructs',
    program(
      [ret({ kind: 'record', fields: fields.map(([name, , value]) => ({ name, value })) })],
      record(Object.fromEntries(fields.map(([name, type]) => [name, type]))),
    ),
    [{ expected: Object.fromEntries(fields.map(([name, , , value]) => [name, value])) }],
  );

  // Sibling scopes reuse names; loop locals are initialized on each iteration; a call returns through nested blocks.
  const scopes = program(
    [
      local('match', lit(0)),
      local('__proto__', lit(0)),
      local('unchanged', lit([1], list(integer)), list(integer), 'let'),
      loop(binary('lt', ref('match'), lit(3)), [
        local('type', ref('match'), integer, 'let'),
        branch(
          binary('eq', ref('type'), lit(1)),
          [
            local('same', lit(10)),
            assign('__proto__', binary('add', ref('__proto__'), ref('same'))),
          ],
          [
            local('same', lit(2)),
            assign('__proto__', binary('add', ref('__proto__'), ref('same'))),
          ],
        ),
        local(
          'copy',
          { kind: 'append', list: ref('unchanged'), value: ref('type') },
          list(integer),
        ),
        assign('match', binary('add', ref('match'), lit(1))),
      ]),
      ret(call('return', ref('__proto__'))),
    ],
    integer,
    [],
    [],
    [
      fn(
        'return',
        [loop(lit(true, boolean), [branch(lit(true, boolean), [ret(ref('self'))])]), ret(lit(-1))],
        integer,
        [{ name: 'self', type: integer }],
      ),
    ],
  );
  add('scope-and-return', scopes, [{ expected: 14 }]);

  const failures = [{ code: 'STOP', details: string }];
  const failer = (id, type) => fn(id, [fail('STOP', lit(id, string))], type, [], failures);
  const signatures = [
    failer('left', integer),
    failer('right', integer),
    failer('boolean_failure', boolean),
  ];
  add(
    'left-to-right-failure',
    program([ret(binary('add', call('left'), call('right')))], integer, [], failures, signatures),
    [{ application: 'STOP', details: 'left' }],
  );
  add(
    'short-circuit-failure',
    program(
      [ret(binary('or', lit(true, boolean), call('boolean_failure')))],
      boolean,
      [],
      failures,
      signatures,
    ),
    [{ expected: true }],
  );
  add(
    'short-circuit-fault',
    program(
      [
        ret(
          binary(
            'and',
            lit(false, boolean),
            binary('eq', binary('add', lit(Number.MAX_SAFE_INTEGER), lit(1)), lit(0)),
          ),
        ),
      ],
      boolean,
    ),
    [{ expected: false }],
  );
  add(
    'negative-index',
    program([ret({ kind: 'index', list: lit([1], list(integer)), index: lit(-1) })]),
    [{ fault: 'INDEX_OUT_OF_BOUNDS' }],
  );
  add(
    'upper-index',
    program([ret({ kind: 'index', list: lit([1], list(integer)), index: lit(1) })]),
    [{ fault: 'INDEX_OUT_OF_BOUNDS' }],
  );
  add('underflow', program([ret(binary('sub', lit(Number.MIN_SAFE_INTEGER), lit(1)))]), [
    { fault: 'INTEGER_OVERFLOW' },
  ]);
  add('nontermination', program([loop(lit(true, boolean), []), ret(lit(0))]), [
    { limits: { work: 60 }, exhausted: 'work' },
  ]);
  add(
    'parameter-record',
    program([ret(ref('match'))], protoType, [{ name: 'match', type: protoType }]),
    [
      {
        args: [{ match: 3, ['__proto__']: '\ud800' }],
        expected: { match: 3, ['__proto__']: '\ud800' },
      },
      { args: [{ match: false, ['__proto__']: 'x' }], inputError: true },
      { args: [{ match: 3 }], inputError: true },
      { args: [], inputError: true },
    ],
  );
  add('null-parameter', program([ret(ref('x'))], nil, [{ name: 'x', type: nil }]), [
    { args: [null], expected: null },
  ]);
  // Add a compact set of instrumentation boundaries; the following PR expands the evaluated domain.
  for (const [index, args] of [
    [0, ['abc']],
    [1, [[2, -1]]],
    [2, [['root'], graph]],
    [4, []],
  ]) {
    for (const limits of [
      { work: 1 },
      { work: 21 },
      { work: 100 },
      { allocation_units: 1 },
      { allocation_units: 7 },
      { allocation_units: 10 },
      { value_units: 2 },
      { evaluation_depth: 1 },
      { evaluation_depth: 4 },
    ])
      cases.push({ name: 'resource-boundary', program: index, args, limits });
  }
  cases.push(
    {
      name: 'maximum-limits',
      program: 0,
      args: ['bounded'],
      limits: PROGRAM_EXECUTION_MAX_LIMITS,
      expected: 'bounded',
    },
    {
      name: 'minimum-limits',
      program: 0,
      args: ['bounded'],
      limits: Object.fromEntries(Object.keys(PROGRAM_EXECUTION_MAX_LIMITS).map((key) => [key, 1])),
      exhausted: 'work',
    },
  );
  return { programs, cases };
}
