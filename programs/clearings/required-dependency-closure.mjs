import { sealProgram } from 'clearings/program';

// Authoring helpers construct syntax only. No helper accepts invocation data.
const integer = { kind: 'integer' },
  string = { kind: 'string' },
  boolean = { kind: 'boolean' },
  nil = { kind: 'null' };
const list = (element) => ({ kind: 'list', element });
const dependency = { kind: 'record', fields: { target: string, required: boolean } };
const record = { kind: 'record', fields: { id: string, dependencies: list(dependency) } };
const strings = list(string),
  records = list(record);
const ref = (name) => ({ kind: 'ref', name });
const literal = (value, type = integer) => ({ kind: 'literal', type, value });
const local = (name, type, value, kind = 'var') => ({ kind, name, type, value });
const assign = (name, value) => ({ kind: 'assign', name, value });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const length = (name) => ({ kind: 'length', list: ref(name) });
const index = (name, cursor) => ({ kind: 'index', list: ref(name), index: ref(cursor) });
const field = (name, key) => ({ kind: 'field', record: ref(name), name: key });
const contains = (name, value) => ({ kind: 'contains', list: ref(name), value });
const append = (name, value) => ({ kind: 'append', list: ref(name), value });
const not = (value) => ({ kind: 'not', value });
const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
const ret = (value) => ({ kind: 'return', value });
const fail = (code, details) => ({ kind: 'fail', code, details });
const branch = (condition, then) => ({ kind: 'if', condition, then, else: [] });
const loop = (condition, body) => ({ kind: 'while', condition, body });
const increment = (name) => assign(name, binary('add', ref(name), literal(1)));
const empty = () => ({ kind: 'list', element_type: string, items: [] });
const duplicate = { code: 'DUPLICATE_RECORD_ID', details: string };
const missing = { code: 'MISSING_REQUIRED_DEPENDENCY', details: string };

/** Reproduce the authored implementation artifact, without executing an algorithm. */
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
          local('validated', nil, call('validate_records', ref('records')), 'let'),
          local('selected', strings, empty()),
          local('pending', strings, ref('roots')),
          local('cursor', integer, literal(0)),
          loop(binary('lt', ref('cursor'), length('pending')), [
            local('id', string, index('pending', 'cursor'), 'let'),
            branch(not(contains('selected', ref('id'))), [
              local('record', record, call('lookup_record', ref('records'), ref('id')), 'let'),
              assign('selected', append('selected', ref('id'))),
              local(
                'targets',
                strings,
                call('required_targets', field('record', 'dependencies')),
                'let',
              ),
              local('target_cursor', integer, literal(0)),
              loop(binary('lt', ref('target_cursor'), length('targets')), [
                local('target', string, index('targets', 'target_cursor'), 'let'),
                branch(not(contains('selected', ref('target'))), [
                  assign('pending', append('pending', ref('target'))),
                ]),
                increment('target_cursor'),
              ]),
            ]),
            increment('cursor'),
          ]),
          ret(ref('selected')),
        ],
      },
      {
        id: 'validate_records',
        parameters: [{ name: 'records', type: records }],
        returns: nil,
        failures: [duplicate],
        body: [
          local('seen', strings, empty()),
          local('cursor', integer, literal(0)),
          loop(binary('lt', ref('cursor'), length('records')), [
            local('record', record, index('records', 'cursor'), 'let'),
            local('id', string, field('record', 'id'), 'let'),
            branch(contains('seen', ref('id')), [fail('DUPLICATE_RECORD_ID', ref('id'))]),
            assign('seen', append('seen', ref('id'))),
            increment('cursor'),
          ]),
          ret(literal(null, nil)),
        ],
      },
      {
        id: 'lookup_record',
        parameters: [
          { name: 'records', type: records },
          { name: 'id', type: string },
        ],
        returns: record,
        failures: [missing],
        body: [
          local('cursor', integer, literal(0)),
          loop(binary('lt', ref('cursor'), length('records')), [
            local('record', record, index('records', 'cursor'), 'let'),
            branch(binary('eq', field('record', 'id'), ref('id')), [ret(ref('record'))]),
            increment('cursor'),
          ]),
          fail('MISSING_REQUIRED_DEPENDENCY', ref('id')),
        ],
      },
      {
        id: 'required_targets',
        parameters: [{ name: 'dependencies', type: list(dependency) }],
        returns: strings,
        failures: [],
        body: [
          local('targets', strings, empty()),
          local('cursor', integer, literal(0)),
          loop(binary('lt', ref('cursor'), length('dependencies')), [
            local('dependency', dependency, index('dependencies', 'cursor'), 'let'),
            branch(field('dependency', 'required'), [
              assign('targets', append('targets', field('dependency', 'target'))),
            ]),
            increment('cursor'),
          ]),
          ret({ kind: 'sort', list: ref('targets') }),
        ],
      },
    ],
  });
}
