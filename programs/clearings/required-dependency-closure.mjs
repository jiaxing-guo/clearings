import { sealProgram } from 'clearings/program';

// These helpers construct IR syntax only; invocation data is handled by IR.
const integer = { kind: 'integer' };
const string = { kind: 'string' };
const boolean = { kind: 'boolean' };
const list = (element) => ({ kind: 'list', element });
const dependency = { kind: 'record', fields: { target: string, required: boolean } };
const record = { kind: 'record', fields: { id: string, dependencies: list(dependency) } };
const strings = list(string);
const integers = list(integer);
const records = list(record);
const runs = list(integers);
const ref = (name) => ({ kind: 'ref', name });
const literal = (value, type = integer) => ({ kind: 'literal', type, value });
const local = (name, type, value, kind = 'var') => ({ kind, name, type, value });
const assign = (name, value) => ({ kind: 'assign', name, value });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const length = (name) => ({ kind: 'length', list: ref(name) });
const at = (name, index) => ({ kind: 'index', list: ref(name), index });
const index = (name, cursor) => at(name, ref(cursor));
const field = (record, name) => ({ kind: 'field', record, name });
const recordId = (records, position) => field(at(records, position), 'id');
const contains = (name, value) => ({ kind: 'contains', list: ref(name), value });
const append = (name, value) => ({ kind: 'append', list: ref(name), value });
const not = (value) => ({ kind: 'not', value });
const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
const ret = (value) => ({ kind: 'return', value });
const fail = (code, details) => ({ kind: 'fail', code, details });
const branch = (condition, then, otherwise = []) => ({
  kind: 'if',
  condition,
  then,
  else: otherwise,
});
const loop = (condition, body) => ({ kind: 'while', condition, body });
const increment = (name) => assign(name, binary('add', ref(name), literal(1)));
const empty = (element_type = string, items = []) => ({ kind: 'list', element_type, items });
const duplicate = { code: 'DUPLICATE_RECORD_ID', details: string };
const missing = { code: 'MISSING_REQUIRED_DEPENDENCY', details: string };

/** Reproduce the implementation artifact, without executing a closure. */
export function createRequiredDependencyClosureProgram() {
  return sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Ordered required dependency closure',
    entry_function: 'required_dependency_closure',
    functions: [
      {
        id: 'required_dependency_closure',
        parameters: [
          { name: 'roots', type: strings },
          { name: 'records', type: records },
        ],
        returns: strings,
        failures: [duplicate, missing],
        body: [
          // The stable index also validates all declarations, including unreachable ones.
          local('s', integers, call('record_index', ref('records')), 'let'),
          // Binary lifting needs only addition, subtraction, and list indexing.
          local('p', integers, empty(integer)),
          local('d', integer, literal(1)),
          loop(binary('lt', ref('d'), length('s')), [
            assign('p', append('p', ref('d'))),
            assign('d', binary('add', ref('d'), ref('d'))),
          ]),
          assign('p', append('p', ref('d'))),
          // Mark IDs at enqueue time. q is both the unique FIFO and the final order.
          local('q', strings, empty()),
          local('i', integer, literal(0)),
          loop(binary('lt', ref('i'), length('roots')), [
            local('x', string, index('roots', 'i'), 'let'),
            branch(not(contains('q', ref('x'))), [assign('q', append('q', ref('x')))]),
            increment('i'),
          ]),
          assign('i', literal(0)),
          loop(binary('lt', ref('i'), length('q')), [
            local('x', string, index('q', 'i'), 'let'),
            // Lookup failures are deliberately delayed until the ID reaches the front.
            local('r', record, call('lookup', ref('records'), ref('s'), ref('p'), ref('x')), 'let'),
            local('t', strings, call('targets', field(ref('r'), 'dependencies')), 'let'),
            local('j', integer, literal(0)),
            loop(binary('lt', ref('j'), length('t')), [
              local('y', string, index('t', 'j'), 'let'),
              branch(not(contains('q', ref('y'))), [assign('q', append('q', ref('y')))]),
              increment('j'),
            ]),
            increment('i'),
          ]),
          ret(ref('q')),
        ],
      },
      {
        id: 'record_index',
        parameters: [{ name: 'r', type: records }],
        returns: integers,
        failures: [duplicate],
        body: [
          // Sort positions, not records: dependency payloads never enter constructed lists.
          local('a', runs, empty(integers)),
          local('i', integer, literal(0)),
          loop(binary('lt', ref('i'), length('r')), [
            assign('a', append('a', call('block', ref('r'), ref('i')))),
            assign('i', binary('add', ref('i'), literal(16))),
          ]),
          branch(binary('eq', length('a'), literal(0)), [ret(empty(integer))]),
          loop(binary('gt', length('a'), literal(1)), [
            local('b', runs, empty(integers)),
            assign('i', literal(0)),
            loop(binary('lt', ref('i'), length('a')), [
              local('v', integers, index('a', 'i')),
              increment('i'),
              branch(binary('lt', ref('i'), length('a')), [
                assign('v', call('merge', ref('r'), ref('v'), index('a', 'i'))),
                increment('i'),
              ]),
              assign('b', append('b', ref('v'))),
            ]),
            assign('a', ref('b')),
          ]),
          local('s', integers, at('a', literal(0)), 'let'),
          // Stability keeps equal-ID positions in declaration order. The minimum
          // position that equals its predecessor is exactly the first repeated ID.
          local('d', integer, length('r')),
          assign('i', literal(1)),
          loop(binary('lt', ref('i'), length('s')), [
            local('v', integer, index('s', 'i'), 'let'),
            branch(
              binary(
                'and',
                binary('lt', ref('v'), ref('d')),
                binary(
                  'eq',
                  recordId('r', ref('v')),
                  recordId('r', at('s', binary('sub', ref('i'), literal(1)))),
                ),
              ),
              [assign('d', ref('v'))],
            ),
            increment('i'),
          ]),
          branch(binary('lt', ref('d'), length('r')), [
            fail('DUPLICATE_RECORD_ID', recordId('r', ref('d'))),
          ]),
          ret(ref('s')),
        ],
      },
      {
        id: 'block',
        parameters: [
          { name: 'r', type: records },
          { name: 'i', type: integer },
        ],
        returns: integers,
        failures: [],
        body: [
          // Bound the initial run inventory: appending a list reserves its full
          // expanded size even when its children are immutable shared values.
          local('a', runs, empty(integers)),
          local('j', integer, ref('i')),
          local('n', integer, length('r'), 'let'),
          local('e', integer, binary('add', ref('i'), literal(16)), 'let'),
          loop(binary('and', binary('lt', ref('j'), ref('n')), binary('lt', ref('j'), ref('e'))), [
            assign('a', append('a', empty(integer, [ref('j')]))),
            increment('j'),
          ]),
          loop(binary('gt', length('a'), literal(1)), [
            local('b', runs, empty(integers)),
            assign('j', literal(0)),
            loop(binary('lt', ref('j'), length('a')), [
              local('v', integers, index('a', 'j')),
              increment('j'),
              branch(binary('lt', ref('j'), length('a')), [
                assign('v', call('merge', ref('r'), ref('v'), index('a', 'j'))),
                increment('j'),
              ]),
              assign('b', append('b', ref('v'))),
            ]),
            assign('a', ref('b')),
          ]),
          ret(at('a', literal(0))),
        ],
      },
      {
        id: 'merge',
        parameters: [
          { name: 'r', type: records },
          { name: 'a', type: integers },
          { name: 'b', type: integers },
        ],
        returns: integers,
        failures: [],
        body: [
          local('s', integers, empty(integer)),
          local('i', integer, literal(0)),
          local('j', integer, literal(0)),
          local('n', integer, length('a'), 'let'),
          local('m', integer, length('b'), 'let'),
          loop(binary('and', binary('lt', ref('i'), ref('n')), binary('lt', ref('j'), ref('m'))), [
            local('x', integer, index('a', 'i'), 'let'),
            local('y', integer, index('b', 'j'), 'let'),
            branch(
              binary('lte', recordId('r', ref('x')), recordId('r', ref('y'))),
              [assign('s', append('s', ref('x'))), increment('i')],
              [assign('s', append('s', ref('y'))), increment('j')],
            ),
          ]),
          loop(binary('lt', ref('i'), ref('n')), [
            assign('s', append('s', index('a', 'i'))),
            increment('i'),
          ]),
          loop(binary('lt', ref('j'), ref('m')), [
            assign('s', append('s', index('b', 'j'))),
            increment('j'),
          ]),
          ret(ref('s')),
        ],
      },
      {
        id: 'lookup',
        parameters: [
          { name: 'r', type: records },
          { name: 's', type: integers },
          { name: 'p', type: integers },
          { name: 'x', type: string },
        ],
        returns: record,
        failures: [missing],
        body: [
          local('n', integer, length('s'), 'let'),
          local('i', integer, binary('sub', length('p'), literal(1))),
          local('k', integer, literal(-1)),
          // k tracks the last position whose record ID is strictly smaller than x.
          loop(binary('gte', ref('i'), literal(0)), [
            local('j', integer, binary('add', ref('k'), index('p', 'i')), 'let'),
            branch(
              binary(
                'and',
                binary('lt', ref('j'), ref('n')),
                binary('lt', recordId('r', index('s', 'j')), ref('x')),
              ),
              [assign('k', ref('j'))],
            ),
            assign('i', binary('sub', ref('i'), literal(1))),
          ]),
          increment('k'),
          branch(binary('lt', ref('k'), ref('n')), [
            local('v', record, at('r', index('s', 'k')), 'let'),
            branch(binary('eq', field(ref('v'), 'id'), ref('x')), [ret(ref('v'))]),
          ]),
          fail('MISSING_REQUIRED_DEPENDENCY', ref('x')),
        ],
      },
      {
        id: 'targets',
        parameters: [{ name: 'd', type: list(dependency) }],
        returns: strings,
        failures: [],
        body: [
          local('t', strings, empty()),
          local('i', integer, literal(0)),
          loop(binary('lt', ref('i'), length('d')), [
            local('v', dependency, index('d', 'i'), 'let'),
            branch(field(ref('v'), 'required'), [
              local('x', string, field(ref('v'), 'target'), 'let'),
              branch(not(contains('t', ref('x'))), [assign('t', append('t', ref('x')))]),
            ]),
            increment('i'),
          ]),
          ret({ kind: 'sort', list: ref('t') }),
        ],
      },
    ],
  });
}
