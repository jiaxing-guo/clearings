import {
  integer,
  boolean,
  string,
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
  suiteBuilder,
} from './programs.mjs';

export const COMPILER_CORPUS_SEED = 0xc1ea1203;

/** Fixed templates combine supported constructs; closed-form and collection oracles supply outcomes. */
export function seededSuite(seed = COMPILER_CORPUS_SEED) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)
    throw new Error('Expected a nonzero uint32 seed.');
  let state = seed;
  const next = (bound) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % bound;
  };
  const suite = suiteBuilder('seeded-language');
  const ints = list(integer);
  for (let variant = 0; variant < 8; variant++) {
    const threshold = next(11) - 5,
      bias = next(13) - 6;
    const op = ['gt', 'gte', 'lt', 'lte'][variant % 4];
    const accepts = {
      gt: (value) => value > threshold,
      gte: (value) => value >= threshold,
      lt: (value) => value < threshold,
      lte: (value) => value <= threshold,
    }[op];
    const source = program(
      [
        local('index', literal(0)),
        local('total', literal(0)),
        local('selected', literal([], ints), ints),
        loop(binary('lt', ref('index'), { kind: 'length', list: ref('values') }), [
          local(
            'item',
            { kind: 'index', list: ref('values'), index: ref('index') },
            integer,
            'let',
          ),
          branch(binary(op, ref('item'), literal(threshold)), [
            local('adjusted', call('adjust', ref('item')), integer, 'let'),
            assign('selected', { kind: 'append', list: ref('selected'), value: ref('adjusted') }),
            assign('total', binary('add', ref('total'), ref('adjusted'))),
          ]),
          assign('index', binary('add', ref('index'), literal(1))),
        ]),
        returned({
          kind: 'record',
          fields: [
            { name: 'selected', value: ref('selected') },
            { name: 'total', value: ref('total') },
            { name: 'sorted', value: { kind: 'sort', list: ref('selected') } },
            { name: 'original', value: ref('values') },
          ],
        }),
      ],
      record({ selected: ints, total: integer, sorted: ints, original: ints }),
      [{ name: 'values', type: ints }],
      [],
      [
        fn('adjust', [returned(binary('add', ref('x'), literal(bias)))], integer, [
          { name: 'x', type: integer },
        ]),
      ],
    );
    const inputs = [
      [],
      [threshold - 1, threshold, threshold + 1],
      [threshold, threshold],
      ...Array.from({ length: 5 }, () => Array.from({ length: next(7) }, () => next(21) - 10)),
    ];
    suite.add(
      `filter-map-fold-${variant}`,
      source,
      inputs.map((values) => {
        const selected = values.filter(accepts).map((value) => value + bias);
        return {
          seed,
          args: [values],
          expected: success({
            selected,
            total: selected.reduce((sum, value) => sum + value, 0),
            sorted: [...selected].sort((a, b) => a - b),
            original: values,
          }),
        };
      }),
    );
  }
  for (let variant = 0; variant < 8; variant++) {
    const element = variant % 2 ? string : integer;
    const domain =
      element === string
        ? ['', '\ud800', '😀', '\ue000', '__proto__', 'a', 'a']
        : [-9, -1, 0, 2, 2, 10];
    const valuesType = list(element),
      needle = domain[next(domain.length)];
    const source = program(
      [
        local(
          'equal',
          binary('eq', { kind: 'sort', list: ref('left') }, { kind: 'sort', list: ref('right') }),
          boolean,
          'let',
        ),
        local(
          'has',
          { kind: 'contains', list: ref('left'), value: literal(needle, element) },
          boolean,
          'let',
        ),
        returned({
          kind: 'record',
          fields: [
            { name: 'equal', value: ref('equal') },
            {
              name: 'selected',
              value: binary(
                'and',
                ref('equal'),
                binary('or', ref('has'), {
                  kind: 'not',
                  value: binary('eq', { kind: 'length', list: ref('left') }, literal(0)),
                }),
              ),
            },
            { name: 'sorted', value: { kind: 'sort', list: ref('left') } },
            { name: 'original', value: ref('left') },
          ],
        }),
      ],
      record({ equal: boolean, selected: boolean, sorted: valuesType, original: valuesType }),
      [
        { name: 'left', type: valuesType },
        { name: 'right', type: valuesType },
      ],
    );
    const entries = Array.from({ length: 8 }, (_, index) => {
      const left = Array.from(
        { length: index === 0 ? 0 : next(7) + 1 },
        () => domain[next(domain.length)],
      );
      const right = index % 2 === 0 ? [...left].reverse() : [...left, needle];
      // Frequency counts supply equality independently of both implementations' sorting algorithms.
      const frequency = (values) => {
        const counts = new Map();
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        return counts;
      };
      const leftCounts = frequency(left),
        rightCounts = frequency(right);
      const equal =
        leftCounts.size === rightCounts.size &&
        [...leftCounts].every(([value, count]) => rightCounts.get(value) === count);
      const sorted = element === string ? [...left].sort() : [...left].sort((a, b) => a - b);
      return {
        seed,
        args: [left, right],
        expected: success({
          equal,
          selected: equal && (leftCounts.has(needle) || left.length > 0),
          sorted,
          original: left,
        }),
      };
    });
    suite.add(`multiset-and-boolean-${variant}`, source, entries);
  }
  for (let variant = 0; variant < 8; variant++) {
    const bias = next(13) - 6,
      positiveFirst = next(2) === 1;
    const failures = [{ code: 'NEGATIVE', details: integer }];
    const source = program(
      [
        branch(binary('lt', ref('count'), literal(0)), [fail('NEGATIVE', ref('count'))]),
        local('index', literal(0)),
        local('sum', literal(0)),
        local('positive', literal(positiveFirst, boolean), boolean),
        loop(binary('lt', ref('index'), ref('count')), [
          branch(
            ref('positive'),
            [
              local('term', call('term', ref('index')), integer, 'let'),
              assign('sum', binary('add', ref('sum'), ref('term'))),
            ],
            [
              local('term', call('term', ref('index')), integer, 'let'),
              assign('sum', binary('sub', ref('sum'), ref('term'))),
            ],
          ),
          assign('positive', { kind: 'not', value: ref('positive') }),
          assign('index', binary('add', ref('index'), literal(1))),
        ]),
        returned({
          kind: 'record',
          fields: [
            { name: 'sum', value: ref('sum') },
            { name: 'iterations', value: ref('index') },
          ],
        }),
      ],
      record({ sum: integer, iterations: integer }),
      [{ name: 'count', type: integer }],
      failures,
      [
        fn('term', [returned(binary('add', ref('x'), literal(bias)))], integer, [
          { name: 'x', type: integer },
        ]),
      ],
    );
    suite.add(
      `alternating-sum-${variant}`,
      source,
      [-1, 0, 1, 2, 3, 4, 7, 8].map((count) => {
        // Sum of paired terms (bias+2k) - (bias+2k+1) is -1; an odd tail adds bias+count-1.
        const sum =
          (positiveFirst ? 1 : -1) * (count % 2 === 0 ? -count / 2 : bias + (count - 1) / 2);
        return {
          seed,
          args: [count],
          expected:
            count < 0 ? failure('NEGATIVE', count) : success({ sum: sum || 0, iterations: count }),
        };
      }),
    );
  }
  return suite.build();
}
