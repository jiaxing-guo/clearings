import { sealProgram } from 'clearings/program';

// Test authoring conveniences only: expected outcomes never execute these constructors.
export const integer = { kind: 'integer' };
export const boolean = { kind: 'boolean' };
export const string = { kind: 'string' };
export const nil = { kind: 'null' };
export const list = (element) => ({ kind: 'list', element });
export const record = (fields) => ({ kind: 'record', fields });
export const literal = (value, type = integer) => ({ kind: 'literal', type, value });
export const ref = (name) => ({ kind: 'ref', name });
export const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
export const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
export const returned = (value) => ({ kind: 'return', value });
export const local = (name, value, type = integer, kind = 'var') => ({ kind, name, type, value });
export const assign = (name, value) => ({ kind: 'assign', name, value });
export const branch = (condition, then, otherwise = []) => ({
  kind: 'if',
  condition,
  then,
  else: otherwise,
});
export const loop = (condition, body) => ({ kind: 'while', condition, body });
export const fail = (code, details) => ({ kind: 'fail', code, details });
export const fn = (id, body, returns = integer, parameters = [], failures = []) => ({
  id,
  body,
  returns,
  parameters,
  failures,
});
export const program = (body, returns = integer, parameters = [], failures = [], helpers = []) =>
  sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Compiler conformance fixture',
    entry_function: 'main',
    functions: [fn('main', body, returns, parameters, failures), ...helpers],
  });
export const success = (value) => ({ kind: 'return', value });
export const failure = (code, details) => ({ kind: 'application-failure', code, details });
export const inputError = (path, rule) => ({
  error: { code: 'INVALID_PROGRAM_EXECUTION', path, rule },
});

export function suiteBuilder(name) {
  const programs = [],
    cases = [];
  return {
    add(name, source, entries) {
      const index = programs.push(source) - 1;
      entries.forEach((entry, caseIndex) =>
        cases.push({
          name: `${name}/${caseIndex}`,
          program: index,
          args: [],
          ...entry,
        }),
      );
      return index;
    },
    build: () => ({ name, programs, cases }),
  };
}
