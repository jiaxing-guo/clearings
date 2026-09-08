import { PROGRAM_EXECUTION_DEFAULT_LIMITS } from 'clearings/program';
import { referenceObservation, semanticOutcome } from './conformance.mjs';
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
  fail,
  fn,
  program,
  success,
  failure,
  suiteBuilder,
} from './programs.mjs';

const frame = { function_id: 'main', call_path: '/entry_function' };
const diagnostic = (phase, path) => ({
  phase,
  path,
  call_stack: phase === 'execution' ? [frame] : [],
});
const exhaustion = (resource, limit, phase, path) => ({
  kind: 'resource-exhaustion',
  resource,
  limit,
  diagnostic: diagnostic(phase, path),
});

export function accountingSuite() {
  const suite = suiteBuilder('independent-accounting');
  const identity = program([returned(ref('x'))], integer, [{ name: 'x', type: integer }]);
  const observed = (
    args,
    limits,
    completion,
    work,
    allocation_units,
    value_units,
    evaluation_depth,
  ) => ({
    args,
    limits,
    expected: semanticOutcome({ completion }),
    observation: {
      limits: { ...PROGRAM_EXECUTION_DEFAULT_LIMITS, ...limits },
      completion,
      usage: { work, allocation_units, value_units, evaluation_depth },
    },
  });
  // Authored charge ledger for main(x) { return x; }, derived from the execution reference:
  // import 1; function entry 1; ID 4; bind 2; block 1; statement 1; expression 1;
  // name 1; two scope probes 1 each; result reserve 1 allocation, then export 1 work.
  const entries = [
    [1, 1, 1, 0, '/functions/0'],
    [2, 2, 1, 1, '/functions/0'],
    [3, 2, 1, 1, '/functions/0'],
    [4, 2, 1, 1, '/functions/0'],
    [5, 2, 1, 1, '/functions/0'],
    [6, 6, 1, 1, '/functions/0'],
    [7, 6, 1, 1, '/functions/0'],
    [8, 8, 1, 1, '/functions/0/body'],
    [9, 9, 1, 2, '/functions/0/body/0'],
    [10, 10, 1, 2, '/functions/0/body/0/value'],
    [11, 11, 1, 3, '/functions/0/body/0/value'],
    [12, 12, 1, 3, '/functions/0/body/0/value'],
    [13, 13, 1, 3, '/functions/0/body/0/value'],
    [14, 14, 2, 3, '/result/value'],
  ].map(([limit, work, allocation, depth, path]) =>
    observed(
      [7],
      { work: limit },
      exhaustion('work', limit, path.startsWith('/result') ? 'result' : 'execution', path),
      work,
      allocation,
      1,
      depth,
    ),
  );
  entries.push(
    observed([7], { work: 15 }, success(7), 15, 2, 1, 3),
    observed(
      [7],
      { allocation_units: 1 },
      exhaustion('allocation_units', 1, 'result', '/result/value'),
      14,
      1,
      1,
      3,
    ),
    // Depth checks follow the entry work charge, preserving the attempted location.
    observed(
      [7],
      { evaluation_depth: 1 },
      exhaustion('evaluation_depth', 1, 'execution', '/functions/0/body'),
      9,
      1,
      1,
      1,
    ),
    observed(
      [7],
      { evaluation_depth: 2 },
      exhaustion('evaluation_depth', 2, 'execution', '/functions/0/body/0/value'),
      11,
      1,
      1,
      2,
    ),
  );
  suite.add('identity-ledger', identity, entries);
  const textIdentity = program([returned(ref('x'))], string, [{ name: 'x', type: string }]);
  suite.add('argument-materialization', textIdentity, [
    observed(['aa'], { work: 2 }, exhaustion('work', 2, 'arguments', '/arguments/0'), 0, 0, 0, 0),
    observed(
      ['aa'],
      { value_units: 2 },
      exhaustion('value_units', 2, 'arguments', '/arguments/0'),
      3,
      0,
      0,
      0,
    ),
    observed(
      ['aa'],
      { allocation_units: 2 },
      exhaustion('allocation_units', 2, 'arguments', '/arguments/0'),
      3,
      0,
      0,
      0,
    ),
    observed(
      ['aa'],
      { value_units: 3, allocation_units: 2 },
      exhaustion('allocation_units', 2, 'arguments', '/arguments/0'),
      3,
      0,
      0,
      0,
    ),
  ]);
  suite.add('literal-materialization', program([returned(literal('aa', string))], string), [
    observed(
      [],
      { value_units: 2 },
      exhaustion('value_units', 2, 'execution', '/functions/0/body/0/value/value'),
      11,
      0,
      0,
      3,
    ),
  ]);
  const failed = program([fail('STOP', literal(1))], nil, [], [{ code: 'STOP', details: integer }]);
  suite.add('failure-export', failed, [
    observed([], { work: 9 }, exhaustion('work', 9, 'result', '/result/details'), 9, 2, 1, 3),
    observed(
      [],
      { allocation_units: 1 },
      exhaustion('allocation_units', 1, 'result', '/result/details'),
      9,
      1,
      1,
      3,
    ),
    observed(
      [],
      {},
      { ...failure('STOP', 1), diagnostic: diagnostic('execution', '/functions/0/body/0') },
      10,
      2,
      1,
      3,
    ),
  ]);
  const called = program(
    [returned(call('id', literal(7)))],
    integer,
    [],
    [],
    [fn('id', [returned(ref('x'))], integer, [{ name: 'x', type: integer }])],
  );
  suite.add('once-only-call', called, [
    observed([], { work: 22 }, success(7), 22, 2, 1, 6),
    observed([], { work: 21 }, exhaustion('work', 21, 'result', '/result/value'), 21, 2, 1, 6),
  ]);
  return suite.build();
}

export function resourceSweepSuite() {
  const suite = suiteBuilder('resource-sweeps');
  const ints = list(integer),
    strings = list(string);
  const inputs = [
    [
      'identity',
      program([returned(ref('x'))], ints, [{ name: 'x', type: ints }]),
      [[1, 2, 3]],
      success([1, 2, 3]),
    ],
    [
      'sort',
      program([returned({ kind: 'sort', list: ref('x') })], ints, [{ name: 'x', type: ints }]),
      [[3, 1, 2, 1, 0]],
      success([0, 1, 1, 2, 3]),
    ],
    [
      'string-equality',
      program([returned(binary('eq', ref('left'), ref('right')))], boolean, [
        { name: 'left', type: strings },
        { name: 'right', type: strings },
      ]),
      [
        ['aa', 'a\ud800'],
        ['aa', 'a\ud800'],
      ],
      success(true),
    ],
    [
      'constructed-record-order',
      program(
        [
          returned(
            binary(
              'eq',
              {
                kind: 'record',
                fields: [
                  { name: 'z', value: literal(1) },
                  { name: 'a', value: literal(2) },
                ],
              },
              literal({ a: 2, z: 1 }, record({ a: integer, z: integer })),
            ),
          ),
        ],
        boolean,
      ),
      [],
      success(true),
    ],
    [
      'failure-copy',
      program(
        [fail('STOP', literal(['aa', '\ud800'], strings))],
        nil,
        [],
        [{ code: 'STOP', details: strings }],
      ),
      [],
      failure('STOP', ['aa', '\ud800']),
    ],
  ];
  for (const [name, source, args, expected] of inputs) {
    const baseline = referenceObservation(source, args);
    // Limits are reference-derived; application outcomes are independently specified above.
    // The separate authored ledger checks exact accounting without deriving it from execution.
    if (JSON.stringify(semanticOutcome(baseline)) !== JSON.stringify(expected))
      throw new Error(`Invalid resource baseline: ${name}`);
    const entries = [{ args, expected }];
    for (const resource of Object.keys(PROGRAM_EXECUTION_DEFAULT_LIMITS)) {
      const peak = baseline.usage[resource];
      const cap = resource === 'work' ? 96 : 24;
      const limits = new Set([
        ...Array.from({ length: Math.min(peak, cap) }, (_, index) => index + 1),
        peak - 1,
        peak,
        peak + 1,
      ]);
      for (const limit of limits) {
        if (limit < 1) continue;
        entries.push({
          name: `${name}/${resource}/${limit}`,
          args,
          limits: { [resource]: limit },
          expected: limit < peak ? { kind: 'resource-exhaustion', resource, limit } : expected,
        });
      }
    }
    suite.add(name, source, entries);
  }
  // Acyclic calls can exceed the permitted evaluation depth; the attempted frame must survive.
  const functions = Array.from({ length: 127 }, (_, index) =>
    fn(`f${index}`, [returned(index === 126 ? literal(1) : call(`f${index + 1}`))]),
  );
  const deep = program([returned(call('f0'))], integer, [], [], functions);
  suite.add(
    'deep-call-chain',
    deep,
    [128, 256].map((limit) => ({
      args: [],
      limits: { evaluation_depth: limit },
      expected: { kind: 'resource-exhaustion', resource: 'evaluation_depth', limit },
    })),
  );
  return suite.build();
}
