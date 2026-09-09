import { sealProgram } from 'clearings/program';

// Constructors emit closed syntax; no selection runs in the host builder.
const string = { kind: 'string' },
  integer = { kind: 'integer' },
  boolean = { kind: 'boolean' };
const list = (element) => ({ kind: 'list', element });
const strings = list(string);
const operation = {
  kind: 'record',
  fields: {
    id: string,
    complete_frame: boolean,
    reads: strings,
    writes: strings,
    evidence_groups: list(strings),
  },
};
const state = { kind: 'record', fields: { id: string, evidence_ids: strings } };
const ref = (name) => ({ kind: 'ref', name });
const literal = (value, type = integer) => ({ kind: 'literal', type, value });
const local = (name, type, value) => ({ kind: 'var', name, type, value });
const assign = (name, value) => ({ kind: 'assign', name, value });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const field = (record, name) => ({ kind: 'field', record, name });
const at = (name, index) => ({ kind: 'index', list: ref(name), index: ref(index) });
const contains = (name, value) => ({ kind: 'contains', list: ref(name), value });
const append = (name, value) => ({ kind: 'append', list: ref(name), value });
const empty = () => ({ kind: 'list', element_type: string, items: [] });
const one = (value) => ({ kind: 'list', element_type: string, items: [value] });
const call = (name, ...args) => ({ kind: 'call', function_id: name, arguments: args });
const ret = (value) => ({ kind: 'return', value });
const branch = (condition, then) => ({ kind: 'if', condition, then, else: [] });
const each = (name, cursor, body) => [
  local(cursor, integer, literal(0)),
  {
    kind: 'while',
    condition: binary('lt', ref(cursor), { kind: 'length', list: ref(name) }),
    body: [...body, assign(cursor, binary('add', ref(cursor), literal(1)))],
  },
];
const union = (target, value) => assign(target, call('union', ref(target), value));

export function createContextSelectionProgram() {
  return sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Context state and source selection',
    entry_function: 'context_selection',
    functions: [
      {
        id: 'context_selection',
        parameters: [
          { name: 'selected_ids', type: strings },
          { name: 'operations', type: list(operation) },
          { name: 'states', type: list(state) },
          { name: 'source_ids', type: strings },
        ],
        returns: { kind: 'record', fields: { state_ids: strings, source_ids: strings } },
        failures: [],
        body: [
          local('complete', boolean, literal(false, boolean)),
          local('accessed', strings, empty()),
          local('evidence', strings, empty()),
          local('selected_states', strings, empty()),
          local('selected_sources', strings, empty()),
          ...each('operations', 'oi', [
            local('op', operation, at('operations', 'oi')),
            branch(contains('selected_ids', field(ref('op'), 'id')), [
              assign('complete', binary('or', ref('complete'), field(ref('op'), 'complete_frame'))),
              union('accessed', field(ref('op'), 'reads')),
              union('accessed', field(ref('op'), 'writes')),
              local('groups', list(strings), field(ref('op'), 'evidence_groups')),
              ...each('groups', 'gi', [union('evidence', at('groups', 'gi'))]),
            ]),
          ]),
          ...each('states', 'si', [
            local('state', state, at('states', 'si')),
            branch(binary('or', ref('complete'), contains('accessed', field(ref('state'), 'id'))), [
              union('selected_states', one(field(ref('state'), 'id'))),
              union('evidence', field(ref('state'), 'evidence_ids')),
            ]),
          ]),
          ...each('source_ids', 'ei', [
            branch(contains('evidence', at('source_ids', 'ei')), [
              union('selected_sources', one(at('source_ids', 'ei'))),
            ]),
          ]),
          ret({
            kind: 'record',
            fields: [
              { name: 'state_ids', value: { kind: 'sort', list: ref('selected_states') } },
              { name: 'source_ids', value: { kind: 'sort', list: ref('selected_sources') } },
            ],
          }),
        ],
      },
      {
        id: 'union',
        parameters: [
          { name: 'left', type: strings },
          { name: 'right', type: strings },
        ],
        returns: strings,
        failures: [],
        body: [
          local('result', strings, ref('left')),
          ...each('right', 'i', [
            branch({ kind: 'not', value: contains('result', at('right', 'i')) }, [
              assign('result', append('result', at('right', 'i'))),
            ]),
          ]),
          ret(ref('result')),
        ],
      },
    ],
  });
}
