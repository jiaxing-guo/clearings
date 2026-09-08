import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { programIdentity, sealProgram, validateProgram } from 'clearings/program';
import { validateSpecification } from '../dist/index.js';

const integer = { kind: 'integer' }, boolean = { kind: 'boolean' }, string = { kind: 'string' };
const list = element => ({ kind: 'list', element });
const literal = (value, type = integer) => ({ kind: 'literal', type, value });
const ref = name => ({ kind: 'ref', name });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const ret = value => ({ kind: 'return', value });
const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
const read = name => JSON.parse(readFileSync(new URL(`../programs/examples/${name}.json`, import.meta.url), 'utf8'));
const identity = read('identity'), sum = read('sum-nonnegative');
const program = (body, returns = integer, parameters = [], failures = []) => ({
  schema_version: '0.1.0', kind: 'program', name: 'Static validation fixture', entry_function: 'main',
  functions: [{ id: 'main', parameters, returns, failures, body }],
});
const rejected = (value, rule, path) => assert.throws(() => sealProgram(value), error => {
  assert.equal(error.code, 'INVALID_PROGRAM'); assert.equal(error.details.rule, rule);
  if (path !== undefined) assert.equal(error.details.path, path);
  return true;
});
const edit = (original, mutate) => { const value = structuredClone(original); mutate(value); return value; };

test('authored examples validate without execution, mutation, or acceptance metadata', () => {
  for (const value of [identity, sum]) {
    const original = structuredClone(value);
    assert.equal(validateProgram(value), undefined); assert.deepEqual(value, original);
    const sealed = sealProgram(value); assert.deepEqual(sealed, original);
    sealed.functions[0].id = 'caller_change'; assert.deepEqual(value, original);
    assert(!('acceptance' in value)); assert(!('execution' in value));
    assert.throws(() => validateSpecification(value), { code: 'INVALID_SPECIFICATION' });
  }
});

test('content identity ignores object-key order, preserves array order, and rejects stale bytes', () => {
  assert.equal(programIdentity(Object.fromEntries(Object.entries(sum).reverse())), sum.artifact_id);
  const reversed = edit(sum, value => value.functions.reverse());
  assert.notEqual(programIdentity(reversed), sum.artifact_id); sealProgram(reversed);
  const stale = edit(identity, value => { value.name += ' changed'; });
  assert.throws(() => validateProgram(stale), error => error.code === 'INVALID_PROGRAM' && error.details.rule === 'identity');
  assert.notEqual(sealProgram(stale).artifact_id, identity.artifact_id);
});

test('closed syntax rejects unsupported types, operators, versions, and host execution hooks', () => {
  for (const mutate of [
    p => { p.schema_version = '0.2.0'; }, p => { p.imports = ['node:fs']; },
    p => { p.functions[0].body[0].value = { kind: 'host-call', module: 'node:fs' }; },
    p => { p.functions[0].body[0].value = { kind: 'opaque', text: 'return 1' }; },
    p => { p.functions[0].returns = { kind: 'number' }; },
    p => { p.functions[0].body[0].value = binary('mul', literal(2), literal(3)); },
    p => { p.functions[0].body[0].kind = 'break'; },
  ]) rejected(edit(identity, mutate), 'schema');
});

test('function and binding declarations require unique names and a defined entry', () => {
  rejected(edit(sum, p => { p.entry_function = 'absent'; }), 'reference', '/entry_function');
  rejected(edit(sum, p => { p.functions.push(p.functions[0]); }), 'duplicate-function');
  rejected(edit(sum, p => { p.functions[0].parameters.push(p.functions[0].parameters[0]); }), 'duplicate-binding');
  rejected(edit(sum, p => { p.functions[0].failures.push(p.functions[0].failures[0]); }), 'duplicate-failure');
});

test('bindings reject forward references, self references, and shadowing of active names', () => {
  rejected(program([{ kind: 'let', name: 'a', type: integer, value: ref('later') }, ret(literal(0))]), 'scope');
  rejected(program([{ kind: 'var', name: 'a', type: integer, value: ref('a') }, ret(literal(0))]), 'scope');
  rejected(program([{ kind: 'let', name: 'a', type: integer, value: literal(1) }, ret(ref('a'))], integer, [{ name: 'a', type: integer }]), 'duplicate-binding');
  rejected(program([{ kind: 'let', name: 'a', type: integer, value: literal(1) },
    { kind: 'if', condition: literal(true, boolean), then: [{ kind: 'let', name: 'a', type: integer, value: literal(2) }], else: [] }, ret(ref('a'))]), 'duplicate-binding');
});

test('block-local names do not leak from branches or loop iterations', () => {
  const declaration = { kind: 'let', name: 'inside', type: integer, value: literal(1) };
  const branch = { kind: 'if', condition: literal(true, boolean), then: [declaration], else: [declaration] };
  sealProgram(program([branch, ret(literal(0))]));
  rejected(program([branch, ret(ref('inside'))]), 'scope', '/functions/0/body/1/value/name');
  rejected(program([{ kind: 'while', condition: literal(false, boolean), body: [declaration] }, ret(ref('inside'))]), 'scope');
});

test('only mutable local bindings permit assignment and their types remain invariant', () => {
  const assignment = { kind: 'assign', name: 'value', value: literal(2) };
  rejected(program([assignment, ret(ref('value'))], integer, [{ name: 'value', type: integer }]), 'immutable');
  rejected(program([{ kind: 'let', name: 'value', type: integer, value: literal(1) }, assignment, ret(ref('value'))]), 'immutable');
  sealProgram(program([{ kind: 'var', name: 'value', type: integer, value: literal(1) }, assignment, ret(ref('value'))]));
  rejected(program([{ kind: 'var', name: 'value', type: integer, value: literal(1) }, { ...assignment, value: literal('wrong', string) }, ret(ref('value'))]), 'type');
  rejected(program([{ ...assignment, name: 'absent' }, ret(literal(0))]), 'scope');
});

test('completion analysis checks all branches, treats loops conservatively, and rejects unreachable statements', () => {
  const branch = { kind: 'if', condition: literal(true, boolean), then: [ret(literal(1))], else: [ret(literal(2))] };
  sealProgram(program([branch]));
  rejected(program([{ ...branch, else: [] }]), 'fallthrough');
  rejected(program([branch, ret(literal(3))]), 'unreachable');
  rejected(program([{ kind: 'while', condition: literal(true, boolean), body: [ret(literal(1))] }]), 'fallthrough');
  sealProgram(program([{ kind: 'while', condition: literal(true, boolean), body: [ret(literal(1))] }, ret(literal(0))]));
  rejected(program([{ ...branch, else: [ret(literal('bad', string))] }]), 'type');
  rejected(program([{ ...branch, condition: literal(1) }]), 'type');
});

test('calls resolve forward definitions and check positional argument and return types', () => {
  sealProgram(sum);
  for (const [replacement, rule] of [
    [call('absent', literal(1)), 'reference'], [call('nonnegative'), 'arity'],
    [call('nonnegative', literal('bad', string)), 'type'],
  ]) rejected(edit(sum, p => { p.functions[0].body = [ret(replacement)]; }), rule);
  rejected(edit(sum, p => { p.functions[0].returns = string; }), 'type');
  const pair = program([ret(call('second', literal('text', string), literal(2)))], integer);
  pair.functions.push({ id: 'second', parameters: [{ name: 'number', type: integer }, { name: 'text', type: string }], returns: integer, failures: [], body: [ret(ref('number'))] });
  rejected(pair, 'type');
});

test('application failures are typed and propagate through each caller signature', () => {
  rejected(edit(sum, p => { p.functions[0].failures = []; }), 'failure-propagation');
  rejected(edit(sum, p => { p.functions[0].failures[0].details = string; }), 'type');
  rejected(edit(sum, p => { p.functions[1].failures = []; p.functions[0].failures = []; }), 'failure');
  const failure = { kind: 'fail', code: 'STOP', details: literal(null, { kind: 'null' }) };
  sealProgram(program([failure], integer, [], [{ code: 'STOP', details: { kind: 'null' } }]));
  rejected(program([failure], integer, [], [{ code: 'STOP', details: integer }]), 'type');
  rejected(program([failure, ret(literal(0))], integer, [], [{ code: 'STOP', details: { kind: 'null' } }]), 'unreachable');
});

test('direct, mutual, and disconnected recursive call graphs are rejected', () => {
  rejected(program([ret(call('main'))]), 'recursive-call');
  const mutual = program([ret(call('other'))]);
  mutual.functions.push({ id: 'other', parameters: [], returns: integer, failures: [], body: [ret(call('main'))] });
  rejected(mutual, 'recursive-call');
  mutual.functions[0].body = [ret(literal(0))]; mutual.functions[1].body = [ret(call('other'))];
  rejected(mutual, 'recursive-call');
  mutual.functions[1].body = [ret(literal('bad', string))]; rejected(mutual, 'type');
});

test('record and collection expressions enforce complete structural types, including empty lists', () => {
  const type = { kind: 'record', fields: { names: list(string), count: integer } };
  const names = { kind: 'sort', list: { kind: 'append', list: { kind: 'list', element_type: string, items: [literal('b', string)] }, value: literal('a', string) } };
  const fields = [{ name: 'names', value: names }, { name: 'count', value: { kind: 'length', list: names } }];
  sealProgram(program([ret({ kind: 'record', fields })], type));
  rejected(program([ret({ kind: 'record', fields: fields.slice(0, 1) })], type), 'type');
  rejected(program([ret({ kind: 'record', fields: [...fields, fields[0]] })], type), 'duplicate-field');
  rejected(program([ret({ kind: 'sort', list: literal([true], list(boolean)) })], list(boolean)), 'type');
  rejected(program([ret({ kind: 'contains', list: literal([], list(string)), value: literal(1) })], boolean), 'type');
  rejected(program([ret({ kind: 'list', element_type: string, items: [literal(1)] })], list(string)), 'type');
  rejected(program([ret({ kind: 'index', list: literal([1], list(integer)), index: literal('0', string) })]), 'type');
  rejected(program([ret({ kind: 'length', list: literal('abc', string) })]), 'type');
});

test('record field access uses declared own fields even for prototype-related names', () => {
  const fields = Object.fromEntries(['__proto__', 'constructor', 'toString'].map(name => [name, integer]));
  const type = { kind: 'record', fields }, value = Object.fromEntries(Object.keys(fields).map(name => [name, 1]));
  for (const name of Object.keys(fields)) sealProgram(program([ret({ kind: 'field', record: literal(value, type), name })]));
  sealProgram(program([ret({ kind: 'record', fields: Object.keys(fields).map(name => ({ name, value: literal(1) })) })], type));
  rejected(program([ret({ kind: 'field', record: literal({}, { kind: 'record', fields: {} }), name: 'constructor' })]), 'field');
  rejected(program([ret(literal({}, type))], type), 'literal');
});

test('literal payloads remain data, even when shaped like executable expressions', () => {
  const type = { kind: 'record', fields: { kind: string, function_id: string, arguments: list(string) } };
  const value = { kind: 'call', function_id: 'not_a_function', arguments: ['process.exit()'] };
  sealProgram(program([ret(literal(value, type))], type));
});

test('numeric and Boolean operators use exact types while runtime faults remain outside static validation', () => {
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1]) rejected(program([ret(literal(value))]), 'schema');
  rejected(program([ret(binary('add', literal('a', string), literal('b', string)))], string), 'type');
  rejected(program([ret(binary('eq', literal(1), literal('1', string)))], boolean), 'type');
  rejected(program([ret(binary('lt', literal([], list(integer)), literal([], list(integer))))], boolean), 'type');
  rejected(program([ret(binary('and', literal(false, boolean), ref('unknown')))], boolean), 'scope');
  sealProgram(program([ret({ kind: 'not', value: binary('or', literal(false, boolean), literal(true, boolean)) })], boolean));
  sealProgram(program([ret(binary('add', literal(Number.MAX_SAFE_INTEGER), literal(1)))]));
  sealProgram(program([ret({ kind: 'index', list: literal([], list(integer)), index: literal(-1) })]));
});

test('all public input boundaries reject getters without invoking them', () => {
  for (const action of [programIdentity, sealProgram, validateProgram]) {
    let reads = 0;
    const value = structuredClone(identity);
    Object.defineProperty(value, 'name', { enumerable: true, get() { reads++; return 'side effect'; } });
    assert.throws(() => action(value), error => error.code === 'INVALID_PROGRAM' && error.details.rule === 'portability');
    assert.equal(reads, 0);
  }
});

test('portability rejects cycles, sparse arrays, nonfinite values, and hidden data', () => {
  for (const value of [NaN, Infinity, new Date(), [,,1], Object.defineProperty({}, 'hidden', { value: 1 })]) {
    rejected(program([ret(literal(value))]), 'portability');
  }
  const cyclic = program([ret(literal(0))]); cyclic.loop = cyclic; rejected(cyclic, 'portability');
  const normalized = sealProgram(program([ret(literal(-0))]));
  assert(!Object.is(normalized.functions[0].body[0].value.value, -0));
});

test('validation bounds type nesting, program size, and cumulative structural type comparisons', () => {
  let nested = integer;
  for (let depth = 0; depth < 16; depth++) nested = list(nested);
  sealProgram(program([ret(ref('value'))], nested, [{ name: 'value', type: nested }]));
  rejected(program([ret(ref('value'))], list(nested), [{ name: 'value', type: list(nested) }]), 'type-depth');
  const tooMany = program([ret(literal(0))]);
  tooMany.functions = Array.from({ length: 129 }, (_, index) => ({ ...tooMany.functions[0], id: `fn_${index}` })); tooMany.entry_function = 'fn_0';
  rejected(tooMany, 'schema');
  const largeType = { kind: 'record', fields: Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`field_${i}`, integer])) };
  const body = Array.from({ length: 150 }, (_, i) => ({ kind: 'let', name: `check_${i}`, type: boolean, value: binary('eq', ref('left'), ref('right')) }));
  rejected(program([...body, ret(literal(true, boolean))], boolean, [{ name: 'left', type: largeType }, { name: 'right', type: largeType }]), 'work-limit');
});

test('the schema generator reproduces the committed public schema', t => {
  const root = mkdtempSync(join(tmpdir(), 'clearings-program-schema-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'schemas'));
  cpSync('scripts/generate-program-schema.py', join(root, 'scripts/generate-program-schema.py'));
  execFileSync('python3', [join(root, 'scripts/generate-program-schema.py')]);
  assert.deepEqual(readFileSync(join(root, 'schemas/program.v0.1.json')), readFileSync(new URL('../schemas/program.v0.1.json', import.meta.url)));
});
