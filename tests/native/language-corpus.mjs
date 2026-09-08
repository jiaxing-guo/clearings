import {
  integer,
  boolean,
  string,
  nil,
  list,
  record,
  literal,
  ref,
  binary,
  call,
  returned,
  local,
  assign,
  branch,
  loop,
  fail,
  fn,
  program,
  success,
  failure,
  inputError,
  suiteBuilder,
} from './programs.mjs';
import { PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';

export function languageSuite() {
  const suite = suiteBuilder('language-boundaries');
  const ints = list(integer);
  const overflow = binary('add', literal(Number.MAX_SAFE_INTEGER), literal(1));
  const failures = [{ code: 'STOP', details: string }];
  const failer = (id, type) => fn(id, [fail('STOP', literal(id, string))], type, [], failures);
  const helpers = [
    failer('first', integer),
    failer('second', integer),
    failer('collection', ints),
    fn('pair', [returned(ref('a'))], integer, [
      { name: 'a', type: integer },
      { name: 'b', type: integer },
    ]),
  ];
  for (const [name, expression, type, details] of [
    ['binary-order', binary('add', call('first'), overflow), integer, 'first'],
    [
      'list-order',
      { kind: 'list', element_type: integer, items: [call('first'), call('second')] },
      ints,
      'first',
    ],
    [
      'record-order',
      {
        kind: 'record',
        fields: [
          { name: 'z', value: call('first') },
          { name: 'a', value: call('second') },
        ],
      },
      record({ a: integer, z: integer }),
      'first',
    ],
    [
      'index-order',
      { kind: 'index', list: call('collection'), index: call('second') },
      integer,
      'collection',
    ],
    [
      'append-order',
      { kind: 'append', list: call('collection'), value: call('second') },
      ints,
      'collection',
    ],
    [
      'contains-order',
      { kind: 'contains', list: call('collection'), value: call('second') },
      boolean,
      'collection',
    ],
    ['call-argument-order', call('pair', call('first'), call('second')), integer, 'first'],
  ])
    suite.add(name, program([returned(expression)], type, [], failures, helpers), [
      { expected: failure('STOP', details) },
    ]);
  suite.add(
    'fault-before-failure',
    program([returned(binary('add', overflow, call('first')))], integer, [], failures, helpers),
    [{ expected: { kind: 'runtime-fault', code: 'INTEGER_OVERFLOW' } }],
  );
  for (const [index, body] of [
    [local('x', overflow), returned(literal(0))],
    [local('x', literal(0)), assign('x', overflow), returned(ref('x'))],
    [returned(call('pair', overflow, literal(0)))],
    [fail('FAULT_PAYLOAD', overflow)],
  ].entries())
    suite.add(
      `fault-context-${index}`,
      program(
        body,
        integer,
        [],
        [...failures, { code: 'FAULT_PAYLOAD', details: integer }],
        helpers,
      ),
      [{ expected: { kind: 'runtime-fault', code: 'INTEGER_OVERFLOW' } }],
    );
  const failureType = record({ reason: string, ids: ints });
  const payload = { reason: 'missing', ids: [2, 3] };
  const declared = [{ code: 'MISSING', details: failureType }];
  suite.add(
    'nested-failure-unwinds',
    program(
      [local('x', literal(0)), assign('x', call('middle')), returned(overflow)],
      integer,
      [],
      declared,
      [
        fn(
          'middle',
          [
            loop(literal(true, boolean), [
              branch(literal(true, boolean), [returned(call('leaf'))]),
            ]),
            returned(overflow),
          ],
          integer,
          [],
          declared,
        ),
        fn('leaf', [fail('MISSING', literal(payload, failureType))], integer, [], declared),
      ],
    ),
    [{ expected: failure('MISSING', payload) }],
  );
  for (const [op, left, expected] of [
    ['and', false, success(false)],
    ['and', true, failure('STOP', 'boolean_failure')],
    ['or', true, success(true)],
    ['or', false, failure('STOP', 'boolean_failure')],
  ]) {
    suite.add(
      `short-circuit-${op}-${left}`,
      program(
        [returned(binary(op, literal(left, boolean), call('boolean_failure')))],
        boolean,
        [],
        failures,
        [failer('boolean_failure', boolean)],
      ),
      [{ expected }],
    );
  }
  const aliasType = record({ original: ints, sorted: ints, appended: ints, alias: ints });
  suite.add(
    'immutable-aliases',
    program(
      [
        local('original', ref('x'), ints, 'let'),
        local('alias', ref('x'), ints),
        local('sorted', { kind: 'sort', list: ref('alias') }, ints, 'let'),
        assign('alias', { kind: 'append', list: ref('alias'), value: literal(4) }),
        returned({
          kind: 'record',
          fields: [
            { name: 'original', value: ref('original') },
            { name: 'sorted', value: ref('sorted') },
            { name: 'appended', value: ref('alias') },
            { name: 'alias', value: ref('x') },
          ],
        }),
      ],
      aliasType,
      [{ name: 'x', type: ints }],
    ),
    [
      {
        args: [[3, 1, 2]],
        expected: success({
          original: [3, 1, 2],
          sorted: [1, 2, 3],
          appended: [3, 1, 2, 4],
          alias: [3, 1, 2],
        }),
      },
    ],
  );
  const nested = list(record({ ['__proto__']: list(string), x: integer }));
  suite.add(
    'nested-equality',
    program([returned(binary('eq', ref('left'), ref('right')))], boolean, [
      { name: 'left', type: nested },
      { name: 'right', type: nested },
    ]),
    [
      {
        args: [
          [{ x: 0, ['__proto__']: ['\ud800', '😀'] }],
          [{ ['__proto__']: ['\ud800', '😀'], x: -0 }],
        ],
        expected: success(true),
      },
      {
        args: [
          [{ x: 0, ['__proto__']: ['\ud800', '😀'] }],
          [{ ['__proto__']: ['😀', '\ud800'], x: 0 }],
        ],
        expected: success(false),
      },
    ],
  );
  for (const [name, element, inputs] of [
    [
      'numeric',
      integer,
      [[], [1], [2, 1], [3, 1, 2], [3, 1, 3, -1, 0], [9, 2, 2, 1, 8, 7, 6, 5, 4]],
    ],
    [
      'utf16',
      string,
      [
        [],
        [''],
        ['\ue000', '😀'],
        ['a', 'aa', 'a', '\ud800', '\udfff'],
        ['é', 'e\u0301', 'a\0', 'a', '\uffff'],
      ],
    ],
  ])
    suite.add(
      `sort-${name}`,
      program([returned({ kind: 'sort', list: ref('x') })], list(element), [
        { name: 'x', type: list(element) },
      ]),
      inputs.map((values) => ({
        args: [values],
        expected: success(
          element === integer ? [...values].sort((a, b) => a - b) : [...values].sort(),
        ),
      })),
    );
  for (const op of ['add', 'sub'])
    suite.add(
      `safe-integer-${op}`,
      program([returned(binary(op, ref('left'), ref('right')))], integer, [
        { name: 'left', type: integer },
        { name: 'right', type: integer },
      ]),
      [
        [Number.MAX_SAFE_INTEGER, 0],
        [Number.MIN_SAFE_INTEGER, 0],
        [Number.MAX_SAFE_INTEGER, 1],
        [Number.MIN_SAFE_INTEGER, -1],
        [Number.MIN_SAFE_INTEGER, 1],
        [Number.MAX_SAFE_INTEGER, -1],
        [0, -0],
      ].map(([left, right]) => {
        const exact = op === 'add' ? BigInt(left) + BigInt(right) : BigInt(left) - BigInt(right);
        return {
          args: [left, right],
          expected:
            exact < BigInt(Number.MIN_SAFE_INTEGER) || exact > BigInt(Number.MAX_SAFE_INTEGER)
              ? { kind: 'runtime-fault', code: 'INTEGER_OVERFLOW' }
              : success(Number(exact)),
        };
      }),
    );
  suite.add(
    'index-boundaries',
    program([returned({ kind: 'index', list: ref('items'), index: ref('index') })], integer, [
      { name: 'items', type: ints },
      { name: 'index', type: integer },
    ]),
    [
      { args: [[], 0], expected: { kind: 'runtime-fault', code: 'INDEX_OUT_OF_BOUNDS' } },
      ...[-1, 0, 1, 2, Number.MAX_SAFE_INTEGER].map((index) => ({
        args: [[7, 9], index],
        expected:
          index >= 0 && index < 2
            ? success([7, 9][index])
            : { kind: 'runtime-fault', code: 'INDEX_OUT_OF_BOUNDS' },
      })),
    ],
  );
  const entryType = record({ ['__proto__']: string, a: integer, nested: ints });
  suite.add(
    'argument-validation',
    program(
      [fail('BODY', literal(1))],
      integer,
      [{ name: 'x', type: entryType }],
      [{ code: 'BODY', details: integer }],
    ),
    [
      { args: [], expected: inputError('/arguments', 'arity') },
      { args: [null], expected: inputError('/arguments/0', 'type') },
      {
        args: [{ ['__proto__']: 'safe', a: 1, nested: [2, false] }],
        expected: inputError('/arguments/0/nested/1', 'type'),
      },
      {
        args: [{ ['__proto__']: 'safe', a: false, nested: [false] }],
        expected: inputError('/arguments/0/a', 'type'),
      },
      {
        args: [{ ['__proto__']: 'safe', a: 1, nested: [], extra: 0 }],
        expected: inputError('/arguments/0', 'type'),
      },
      { args: [{ a: 1, nested: [] }], expected: inputError('/arguments/0', 'type') },
      { args: [{ ['__proto__']: 'safe', a: 1, nested: [] }], expected: failure('BODY', 1) },
    ],
  );
  return suite.build();
}

export function preparationSuite() {
  const suite = suiteBuilder('preparation-boundaries');
  const ignoredString = program([returned(literal(null, nil))], nil, [{ name: 'x', type: string }]);
  suite.add('input-units', ignoredString, [
    { args: ['x'.repeat(999998)], limits: PROGRAM_EXECUTION_MAX_LIMITS, expected: success(null) },
    { args: ['x'.repeat(999999)], expected: inputError('/arguments', 'input-limit') },
  ]);
  const ignoredList = program([returned(literal(null, nil))], nil, [
    { name: 'x', type: list(integer) },
  ]);
  suite.add('portable-node-count', ignoredList, [
    { args: [Array(49998).fill(0)], expected: success(null) },
    { args: [Array(49999).fill(0)], expected: inputError('/arguments', 'portability') },
  ]);
  const nested = (layers) => {
    let value = null;
    for (let index = 0; index < layers; index++) value = [value];
    return value;
  };
  suite.add('depth-and-precedence', ignoredString, [
    { args: [nested(63)], expected: inputError('/arguments/0', 'type') },
    { args: [nested(64)], expected: inputError('/arguments', 'portability') },
    { args: ['x'.repeat(999999), nested(64)], expected: inputError('/arguments', 'portability') },
    { args: ['x'.repeat(999999), null], expected: inputError('/arguments', 'input-limit') },
    { args: [null, null], expected: inputError('/arguments', 'arity') },
  ]);
  return suite.build();
}
