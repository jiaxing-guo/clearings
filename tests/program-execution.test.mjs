import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeProgram, sealProgram, PROGRAM_INTERPRETER_VERSION, PROGRAM_EXECUTION_DEFAULT_LIMITS, PROGRAM_EXECUTION_MAX_LIMITS, PROGRAM_EXECUTION_INPUT_LIMITS } from 'clearings/program';

const integer = { kind: 'integer' }, boolean = { kind: 'boolean' }, string = { kind: 'string' }, nil = { kind: 'null' };
const list = element => ({ kind: 'list', element });
const record = fields => ({ kind: 'record', fields });
const literal = (value, type = integer) => ({ kind: 'literal', value, type });
const ref = name => ({ kind: 'ref', name });
const ret = value => ({ kind: 'return', value });
const binary = (op, left, right) => ({ kind: 'binary', op, left, right });
const call = (function_id, ...args) => ({ kind: 'call', function_id, arguments: args });
const param = (name, type = integer) => ({ name, type });
const local = (name, value, type = integer, kind = 'var') => ({ kind, name, value, type });
const assign = (name, value) => ({ kind: 'assign', name, value });
const branch = (condition, then, otherwise = []) => ({ kind: 'if', condition, then, else: otherwise });
const loop = (condition, body) => ({ kind: 'while', condition, body });
const failure = (code, details) => ({ kind: 'fail', code, details });
const fn = (id, body, returns = integer, parameters = [], failures = []) => ({ id, body, returns, parameters, failures });
const program = (body, returns = integer, parameters = [], failures = [], helpers = []) => sealProgram({
  schema_version: '0.1.0', kind: 'program', name: 'Independent interpreter fixture', entry_function: 'main',
  functions: [fn('main', body, returns, parameters, failures), ...helpers],
});
const run = (expr, type = integer, args = [], parameters = []) => executeProgram(program([ret(expr)], type, parameters), args);
const returned = (result, expected) => assert.deepEqual(result.completion, { kind: 'return', value: expected });
const fault = (result, code, path) => {
  assert.equal(result.completion.kind, 'runtime-fault'); assert.equal(result.completion.code, code);
  assert.equal(result.completion.diagnostic.phase, 'execution');
  if (path) assert.equal(result.completion.diagnostic.path, path);
  assert(!('value' in result.completion)); assert(!('details' in result.completion));
};
const exhausted = (result, resource, phase = 'execution') => {
  assert.equal(result.completion.kind, 'resource-exhaustion');
  assert.equal(result.completion.resource, resource); assert.equal(result.completion.limit, result.limits[resource]);
  assert.equal(result.completion.diagnostic.phase, phase);
  for (const key of Object.keys(result.limits)) assert(result.usage[key] <= result.limits[key]);
  assert(!('value' in result.completion)); assert(!('details' in result.completion));
};
const read = name => JSON.parse(readFileSync(new URL(`../programs/examples/${name}.json`, import.meta.url), 'utf8'));
const overflow = binary('add', literal(Number.MAX_SAFE_INTEGER), literal(1));
const signatures = [{ code: 'STOP', details: string }];
const failer = (id, type, label = id) => fn(id, [failure('STOP', literal(label, string))], type, [], signatures);

test('authored programs execute against independently stated return and failure expectations', () => {
  const identity = read('identity'), sum = read('sum-nonnegative');
  for (const text of ['', 'Clearings', '\uD83D\uDE00\u0000\uD800']) returned(executeProgram(identity, [text]), text);
  for (const [input, expected] of [[[], 0], [[2, 0, 3], 5], [[7], 7], [[0, 0], 0]]) returned(executeProgram(sum, [input]), expected);
  const result = executeProgram(sum, [[2, -1, 3]]);
  assert.equal(result.completion.kind, 'application-failure'); assert.equal(result.completion.code, 'NEGATIVE_VALUE');
  assert.equal(result.completion.details, -1);
  assert.deepEqual(result.completion.diagnostic, {
    phase: 'execution', path: '/functions/1/body/0/then/0',
    call_stack: [{ function_id: 'sum', call_path: '/entry_function' }, { function_id: 'nonnegative', call_path: '/functions/0/body/2/body/1/value/right' }],
  });
  fault(executeProgram(sum, [[Number.MAX_SAFE_INTEGER, 1]]), 'INTEGER_OVERFLOW');
});

test('all scalar domains return exact values and negative zero has the semantics of zero', () => {
  for (const [value, type] of [[null, nil], [false, boolean], [true, boolean], ['', string], ['\uD800', string], [-7, integer], [Number.MIN_SAFE_INTEGER, integer], [Number.MAX_SAFE_INTEGER, integer]]) returned(run(literal(value, type), type), value);
  returned(run(literal(-0)), 0); returned(run(ref('x'), integer, [-0], [param('x')]), 0);
  returned(run(binary('eq', literal(-0), literal(0)), boolean), true);
});

test('integer arithmetic is exact at both boundaries and reports overflow separately', () => {
  const max = Number.MAX_SAFE_INTEGER, min = Number.MIN_SAFE_INTEGER;
  for (const [op, a, b, expected] of [['add', max, 0, max], ['add', min, 1, min + 1], ['add', max, min, 0], ['sub', min, min, 0], ['sub', max, 1, max - 1], ['sub', 0, max, min]]) returned(run(binary(op, literal(a), literal(b))), expected);
  for (const [op, a, b] of [['add', max, 1], ['add', min, -1], ['sub', min, 1], ['sub', max, -1], ['sub', max, min]]) fault(run(binary(op, literal(a), literal(b))), 'INTEGER_OVERFLOW', '/functions/0/body/0/value');
});

test('numeric and string comparisons implement the documented ordering without coercion or normalization', () => {
  for (const [type, a, b] of [[integer, -2, 3], [string, 'A', 'a'], [string, '\uD83D\uDE00', '\uE000'], [string, 'a', 'aa'], [string, 'e\u0301', '\u00E9']]) {
    for (const [op, expected] of [['lt', true], ['lte', true], ['gt', false], ['gte', false], ['eq', false], ['ne', true]]) returned(run(binary(op, literal(a, type), literal(b, type)), boolean), expected);
    for (const [op, expected] of [['lt', false], ['lte', true], ['gt', false], ['gte', true], ['eq', true], ['ne', false]]) returned(run(binary(op, literal(a, type), literal(a, type)), boolean), expected);
  }
  returned(run({ kind: 'not', value: literal(false, boolean) }, boolean), true);
  returned(run({ kind: 'not', value: literal(true, boolean) }, boolean), false);
});

test('Boolean conjunction and disjunction short-circuit and propagate evaluated failures', () => {
  for (const [op, left, short] of [['and', false, true], ['or', true, true], ['and', true, false], ['or', false, false]]) {
    const p = program([ret(binary(op, literal(left, boolean), call('stop')))], boolean, [], signatures, [failer('stop', boolean)]);
    const result = executeProgram(p, []);
    if (short) returned(result, left); else { assert.equal(result.completion.kind, 'application-failure'); assert.equal(result.completion.details, 'stop'); }
  }
  returned(run(binary('and', literal(true, boolean), literal(false, boolean)), boolean), false);
  returned(run(binary('or', literal(false, boolean), literal(true, boolean)), boolean), true);
});

test('lists construct, append, measure, index and test membership with structural equality', () => {
  const integers = { kind: 'list', element_type: integer, items: [literal(3), literal(1)] };
  returned(run({ kind: 'append', list: integers, value: literal(2) }, list(integer)), [3, 1, 2]);
  returned(run({ kind: 'length', list: integers }), 2);
  returned(run({ kind: 'length', list: literal([], list(integer)) }), 0);
  returned(run({ kind: 'index', list: integers, index: literal(0) }), 3);
  returned(run({ kind: 'index', list: integers, index: literal(1) }), 1);
  returned(run({ kind: 'list', element_type: integer, items: [] }, list(integer)), []);
  const type = record({ a: integer, b: list(string) }), value = { a: 2, b: ['x', 'y'] };
  for (const [needle, expected] of [[{ b: ['x', 'y'], a: 2 }, true], [{ a: 2, b: ['y', 'x'] }, false], [{ a: 3, b: ['x', 'y'] }, false]]) returned(run({ kind: 'contains', list: literal([value], list(type)), value: literal(needle, type) }, boolean), expected);
  returned(run({ kind: 'contains', list: literal([], list(integer)), value: literal(1) }, boolean), false);
});

test('index faults cover negative, empty, and upper bounds with no missing-value substitution', () => {
  for (const [items, index] of [[[], 0], [[1], -1], [[1], 1], [[1], Number.MAX_SAFE_INTEGER]]) fault(run({ kind: 'index', list: literal(items, list(integer)), index: literal(index) }), 'INDEX_OUT_OF_BOUNDS', '/functions/0/body/0/value');
});

test('sort uses numeric and UTF-16 ordering, preserves duplicates, and covers merge boundaries', () => {
  for (const [input, expected] of [[[], []], [[1], [1]], [[10, 2, -1, 2], [-1, 2, 2, 10]], [[9, 8, 7, 6, 5], [5, 6, 7, 8, 9]], [[0, -0], [0, 0]]]) returned(run({ kind: 'sort', list: literal(input, list(integer)) }, list(integer)), expected);
  returned(run({ kind: 'sort', list: literal(['\uE000', 'a', '\uD83D\uDE00', '', 'A', 'a', '\uD800'], list(string)) }, list(string)), ['', 'A', 'a', 'a', '\uD800', '\uD83D\uDE00', '\uE000']);
});

test('record constructors and field access treat prototype-related names as own data', () => {
  const names = ['__proto__', 'constructor', 'toString'], type = record(Object.fromEntries(names.map(name => [name, integer])));
  const expr = { kind: 'record', fields: names.map((name, index) => ({ name, value: literal(index) })) };
  const expected = Object.fromEntries(names.map((name, index) => [name, index]));
  returned(run(expr, type), expected);
  for (const [index, name] of names.entries()) returned(run({ kind: 'field', record: expr, name }), index);
  returned(run(ref('__proto__'), type, [expected], [param('__proto__', type)]), expected);
  const p = program([ret(call('constructor'))], integer, [], [], [fn('constructor', [ret(literal(4))])]);
  returned(executeProgram(p, []), 4);
});

test('structural equality ignores record field order but preserves nested list order', () => {
  const type = record({ x: list(integer), y: nil });
  for (const [other, expected] of [[{ y: null, x: [1, 2] }, true], [{ y: null, x: [2, 1] }, false], [{ y: null, x: [1] }, false]]) returned(run(binary('eq', literal({ x: [1, 2], y: null }, type), literal(other, type)), boolean), expected);
  returned(run(binary('eq', literal({}, record({})), literal({}, record({}))), boolean), true);
  returned(run(binary('ne', literal([], list(integer)), literal([1], list(integer))), boolean), true);
});

test('nested assignments persist while block locals and loop iterations have separate scopes', () => {
  const p = program([
    local('i', literal(0)), local('sum', literal(0)),
    loop(binary('lt', ref('i'), literal(4)), [
      local('item', binary('add', ref('i'), literal(1)), integer, 'let'),
      branch(binary('lt', ref('i'), literal(2)), [local('temporary', literal(10), integer, 'let'), assign('sum', binary('add', ref('sum'), ref('temporary')))],
        [local('temporary', literal(100), integer, 'let'), assign('sum', binary('add', ref('sum'), ref('item')))]),
      assign('i', binary('add', ref('i'), literal(1))),
    ]),
    branch(literal(true, boolean), [assign('sum', binary('add', ref('sum'), literal(1)))]), ret(ref('sum')),
  ]);
  returned(executeProgram(p, []), 28);
});

test('conditions select one branch, loops may execute zero times, and nested returns unwind', () => {
  const helpers = [failer('stop', integer)];
  for (const flag of [true, false]) {
    const p = program([branch(literal(flag, boolean), [ret(literal(1))], [ret(call('stop'))])], integer, [], signatures, helpers);
    const result = executeProgram(p, []);
    if (flag) returned(result, 1); else assert.equal(result.completion.kind, 'application-failure');
  }
  returned(executeProgram(program([loop(literal(false, boolean), [ret(overflow)]), ret(literal(8))]), []), 8);
  returned(executeProgram(program([loop(literal(true, boolean), [branch(literal(true, boolean), [ret(literal(6))])]), ret(overflow)]), []), 6);
});

test('calls bind positional arguments in fresh environments and resume the caller after return', () => {
  const helper = fn('difference', [local('x', binary('sub', ref('a'), ref('b'))), ret(ref('x'))], integer, [param('a'), param('b')]);
  const p = program([local('x', literal(100)), local('y', call('difference', literal(9), literal(4))), ret(binary('add', ref('x'), ref('y')))], integer, [], [], [helper]);
  returned(executeProgram(p, []), 105);
});

test('left-to-right evaluation stops at the first abrupt operand, including record array order', () => {
  const helpers = [failer('first', integer), failer('second', integer), failer('collection', list(integer)), fn('pair', [ret(ref('a'))], integer, [param('a'), param('b')])];
  for (const [expr, type, expected] of [
    [binary('add', call('first'), overflow), integer, 'first'],
    [{ kind: 'list', element_type: integer, items: [call('first'), call('second')] }, list(integer), 'first'],
    [{ kind: 'record', fields: [{ name: 'z', value: call('first') }, { name: 'a', value: call('second') }] }, record({ a: integer, z: integer }), 'first'],
    [{ kind: 'index', list: call('collection'), index: call('second') }, integer, 'collection'],
    [{ kind: 'append', list: call('collection'), value: call('second') }, list(integer), 'collection'],
    [{ kind: 'contains', list: call('collection'), value: call('second') }, boolean, 'collection'],
    [call('pair', call('first'), call('second')), integer, 'first'],
  ]) {
    const result = executeProgram(program([ret(expr)], type, [], signatures, helpers), []);
    assert.equal(result.completion.kind, 'application-failure'); assert.equal(result.completion.details, expected);
  }
  fault(executeProgram(program([ret(binary('add', overflow, call('first')))], integer, [], signatures, helpers), []), 'INTEGER_OVERFLOW', '/functions/0/body/0/value/left');
});

test('declared failures propagate unchanged through calls, blocks, and loops', () => {
  const type = record({ reason: string, ids: list(integer) }), payload = { reason: 'missing', ids: [2, 3] };
  const failures = [{ code: 'MISSING', details: type }];
  const leaf = fn('leaf', [failure('MISSING', literal(payload, type))], integer, [], failures);
  const middle = fn('middle', [loop(literal(true, boolean), [branch(literal(true, boolean), [ret(call('leaf'))])]), ret(overflow)], integer, [], failures);
  const p = program([local('x', literal(0)), assign('x', call('middle')), ret(overflow)], integer, [], failures, [middle, leaf]);
  const result = executeProgram(p, []);
  assert.equal(result.completion.kind, 'application-failure'); assert.equal(result.completion.code, 'MISSING'); assert.deepEqual(result.completion.details, payload);
  assert.equal(result.completion.diagnostic.path, '/functions/2/body/0');
  assert.deepEqual(result.completion.diagnostic.call_stack.map(frame => frame.function_id), ['main', 'middle', 'leaf']);
});

test('faults in initializers, assignments, call arguments, and failure payloads remain runtime faults', () => {
  const helpers = [fn('id', [ret(ref('x'))], integer, [param('x')])];
  for (const body of [[local('x', overflow), ret(literal(0))], [local('x', literal(1)), assign('x', overflow), ret(ref('x'))], [ret(call('id', overflow))], [failure('OVERFLOW', overflow)]]) fault(executeProgram(program(body, integer, [], [{ code: 'OVERFLOW', details: integer }], helpers), []), 'INTEGER_OVERFLOW');
});

test('assigning collections and sorting preserve earlier values, arguments, and independent result copies', () => {
  const type = list(integer), outputType = record({ before: type, after: type, alias: type });
  const p = program([
    local('saved', ref('input'), type, 'let'), local('current', ref('input'), type),
    assign('current', { kind: 'append', list: ref('current'), value: literal(2) }),
    assign('current', { kind: 'sort', list: ref('current') }),
    ret({ kind: 'record', fields: [{ name: 'before', value: ref('saved') }, { name: 'after', value: ref('current') }, { name: 'alias', value: ref('saved') }] }),
  ], outputType, [param('input', type)]);
  const original = structuredClone(p), input = [3, 1], result = executeProgram(p, [input]);
  returned(result, { before: [3, 1], after: [1, 2, 3], alias: [3, 1] });
  result.completion.value.before.push(99); assert.deepEqual(result.completion.value.alias, [3, 1]);
  assert.deepEqual(input, [3, 1]); assert.deepEqual(p, original);
  input.push(4); assert.deepEqual(result.completion.value.after, [1, 2, 3]);
  returned(executeProgram(p, [[3, 1]]), { before: [3, 1], after: [1, 2, 3], alias: [3, 1] });
});

test('literal and failure results are owned data even when they resemble executable nodes', () => {
  const type = record({ kind: string, function_id: string, arguments: list(string) });
  const data = { kind: 'call', function_id: 'process_exit', arguments: ['process.exit()'] };
  const p = program([ret(literal(data, type))], type), result = executeProgram(p, []), before = structuredClone(p);
  returned(result, data); result.completion.value.arguments.push('change'); assert.deepEqual(p, before);
  returned(executeProgram(p, []), data);
  const failed = program([failure('DATA', literal(data, type))], nil, [], [{ code: 'DATA', details: type }]);
  const first = executeProgram(failed, []); first.completion.details.arguments.push('change');
  assert.deepEqual(executeProgram(failed, []).completion.details, data);
});

test('execution rejects invalid programs and checks all entry arguments before evaluating a body', () => {
  const p = program([ret(overflow)], integer, [param('x', record({ values: list(integer), flag: boolean, label: string, empty: nil }))]);
  for (const args of [null, [], [{ values: [], flag: true, label: 'a' }], [{ values: [1.5], flag: true, label: '', empty: null }], [{ values: [Number.MAX_SAFE_INTEGER + 1], flag: true, label: '', empty: null }], [{ values: [], flag: 1, label: '', empty: null }], [{ values: [], flag: true, label: 2, empty: null }], [{ values: [], flag: true, label: '', empty: 0 }], [{ values: [], flag: true, label: '', empty: null, extra: null }]]) assert.throws(() => executeProgram(p, args), { code: 'INVALID_PROGRAM_EXECUTION' });
  fault(executeProgram(p, [{ values: [], flag: true, label: '', empty: null }]), 'INTEGER_OVERFLOW');
  const stale = structuredClone(p); stale.name += ' changed';
  assert.throws(() => executeProgram(stale, []), error => error.code === 'INVALID_PROGRAM' && error.details.rule === 'identity');
});

test('input boundaries reject accessors and nonportable values without invoking getters', () => {
  const p = program([ret(ref('x'))], integer, [param('x')]);
  let reads = 0;
  const getter = value => Object.defineProperty(value, Array.isArray(value) ? '0' : 'work', { enumerable: true, get() { reads++; return 1; } });
  for (const args of [getter([0]), [undefined], [NaN], [Infinity], [() => 1], [new Date()], new Array(1), Object.assign([1], { extra: 2 })]) assert.throws(() => executeProgram(p, args), { code: 'INVALID_PROGRAM_EXECUTION' });
  assert.throws(() => executeProgram(p, [1], getter({})), { code: 'INVALID_PROGRAM_EXECUTION' });
  const invalid = structuredClone(p); Object.defineProperty(invalid, 'name', { enumerable: true, get() { reads++; return 'name'; } });
  assert.throws(() => executeProgram(invalid, [1]), { code: 'INVALID_PROGRAM_EXECUTION' });
  const cycle = []; cycle.push(cycle); assert.throws(() => executeProgram(p, cycle), { code: 'INVALID_PROGRAM_EXECUTION' });
  assert.equal(reads, 0);
});

test('limits are finite positive integers with fixed ceilings and reject unknown options', () => {
  const p = program([ret(literal(7))]);
  for (const options of [null, [], { work: 0 }, { work: -1 }, { work: 1.5 }, { work: Infinity }, { work: NaN }, { work: undefined }, { work: PROGRAM_EXECUTION_MAX_LIMITS.work + 1 }, { evaluation_depth: 257 }, { fuel: 10 }]) assert.throws(() => executeProgram(p, [], options), { code: 'INVALID_PROGRAM_EXECUTION' });
  for (const constant of [PROGRAM_EXECUTION_DEFAULT_LIMITS, PROGRAM_EXECUTION_MAX_LIMITS, PROGRAM_EXECUTION_INPUT_LIMITS]) assert(Object.isFrozen(constant));
  const options = { work: 20 }, result = executeProgram(p, [], options); result.limits.work = 1;
  assert.deepEqual(options, { work: 20 }); assert.equal(PROGRAM_EXECUTION_DEFAULT_LIMITS.work, 1_000_000);
});

test('preparation bounds oversized strings, field names, and structures before execution', () => {
  const p = program([ret(ref('x'))], string, [param('x', string)]), large = 'x'.repeat(PROGRAM_EXECUTION_INPUT_LIMITS.input_units);
  assert.throws(() => executeProgram(p, [large]), error => error.code === 'INVALID_PROGRAM_EXECUTION' && error.details.rule === 'input-limit');
  const hugeProgram = { ...p, name: large };
  assert.throws(() => executeProgram(hugeProgram, ['']), error => error.code === 'INVALID_PROGRAM_EXECUTION' && error.details.rule === 'input-limit');
  assert.throws(() => executeProgram(p, [{ [large]: 0 }]), error => error.details.rule === 'input-limit');
  assert.throws(() => executeProgram(p, new Array(50_000).fill('')), error => error.details.rule === 'portability');
});

test('minimal return has exact work, allocation, value-size and depth boundaries', () => {
  // Function entry + four ID units + block + return + literal + scalar + output = 10 work.
  // Literal and owned output each allocate one unit; function/block/expression depth is three.
  const p = program([ret(literal(7))]), limits = { work: 10, allocation_units: 2, value_units: 1, evaluation_depth: 3 };
  const result = executeProgram(p, [], limits); returned(result, 7); assert.deepEqual(result.usage, limits);
  assert.equal(result.program_id, p.artifact_id); assert.equal(result.interpreter_version, PROGRAM_INTERPRETER_VERSION);
  exhausted(executeProgram(p, [], { ...limits, work: 9 }), 'work', 'result');
  exhausted(executeProgram(p, [], { ...limits, allocation_units: 1 }), 'allocation_units', 'result');
  exhausted(executeProgram(p, [], { ...limits, evaluation_depth: 2 }), 'evaluation_depth');
  const text = program([ret(literal('aa', string))], string);
  exhausted(executeProgram(text, [], { value_units: 2 }), 'value_units'); returned(executeProgram(text, [], { value_units: 3 }), 'aa');
});

test('call arguments and bodies execute once under a manually derived work budget', () => {
  const p = program([ret(call('id', literal(7)))], integer, [], [], [fn('id', [ret(ref('x'))], integer, [param('x')])]);
  // Main entry/block/return/call: 8; argument: 2; callee entry/ID/binding: 5;
  // callee block/return/ref/name/two scope probes: 6; output: 1.
  const result = executeProgram(p, [], { work: 22 }); returned(result, 7);
  assert.deepEqual(result.usage, { work: 22, allocation_units: 2, value_units: 1, evaluation_depth: 6 });
  exhausted(executeProgram(p, [], { work: 21 }), 'work', 'result');
});

test('argument import and result copying are metered and never expose partial values or failures', () => {
  const p = program([ret(ref('x'))], list(integer), [param('x', list(integer))]);
  exhausted(executeProgram(p, [[1, 2, 3]], { value_units: 3 }), 'value_units', 'arguments');
  exhausted(executeProgram(p, [[1, 2, 3]], { work: 2 }), 'work', 'arguments');
  // Three scalar imports + four-unit list = 7 allocation units before the output copy.
  exhausted(executeProgram(p, [[1, 2, 3]], { allocation_units: 7 }), 'allocation_units', 'result');
  const failed = program([failure('STOP', literal(1))], nil, [], [{ code: 'STOP', details: integer }]);
  exhausted(executeProgram(failed, [], { allocation_units: 1 }), 'allocation_units', 'result');
  exhausted(executeProgram(failed, [], { work: 9 }), 'work', 'result');
});

test('nonterminating loops exhaust work, and repeated scopes do not accumulate evaluation depth', () => {
  const p = program([loop(ref('flag'), []), ret(literal(0))], integer, [param('flag', boolean)]);
  const result = executeProgram(p, [true], { work: 200, evaluation_depth: 3 }); exhausted(result, 'work');
  assert.equal(result.usage.evaluation_depth, 3); assert.equal(result.completion.diagnostic.call_stack[0].function_id, 'main');
  returned(executeProgram(p, [false], { work: 200, evaluation_depth: 3 }), 0);
});

test('discarded values consume cumulative allocation and bounded sharing cannot hide expanded size', () => {
  const p = program([loop(literal(true, boolean), [local('discarded', literal([1, 2, 3], list(integer)), list(integer), 'let')]), ret(literal(0))]);
  exhausted(executeProgram(p, [], { allocation_units: 100 }), 'allocation_units');
  let type = integer; const body = [local('v0', literal(1), type, 'let')];
  for (let i = 1; i <= 16; i++) {
    const next = list(type); body.push(local(`v${i}`, { kind: 'list', element_type: type, items: [ref(`v${i - 1}`), ref(`v${i - 1}`)] }, next, 'let')); type = next;
  }
  const doubled = program([...body, ret(ref('v16'))], type), result = executeProgram(doubled, [], { value_units: 1000 });
  exhausted(result, 'value_units'); assert.equal(result.usage.value_units, 511);
  assert.equal(result.completion.diagnostic.path, '/functions/0/body/9/value');
});

test('collection primitives charge scanning, deep string comparisons, sorting, and temporary storage', () => {
  const contains = program([ret({ kind: 'contains', list: ref('xs'), value: ref('needle') })], boolean, [param('xs', list(string)), param('needle', string)]);
  const result = executeProgram(contains, [new Array(200).fill('x'.repeat(80)), 'x'.repeat(79) + 'z'], { work: 17_000 });
  exhausted(result, 'work'); assert.equal(result.completion.diagnostic.path, '/functions/0/body/0/value');
  const sorted = program([ret({ kind: 'sort', list: ref('x') })], list(integer), [param('x', list(integer))]);
  const input = Array.from({ length: 200 }, (_, i) => 200 - i);
  const sorting = executeProgram(sorted, [input], { work: 900 }); exhausted(sorting, 'work'); assert.equal(sorting.completion.diagnostic.path, '/functions/0/body/0/value');
  // Import costs 401 allocation units; sorted result reserves 201; scratch needs 200 more.
  exhausted(executeProgram(sorted, [input], { allocation_units: 602 }), 'allocation_units');
  returned(executeProgram(sorted, [input]), Array.from({ length: 200 }, (_, i) => i + 1));
});

test('deep acyclic calls exhaust interpreter depth before the host stack and retain source diagnostics', () => {
  const functions = Array.from({ length: 128 }, (_, i) => fn(`f${i}`, [ret(i === 127 ? literal(1) : call(`f${i + 1}`))]));
  const p = sealProgram({ schema_version: '0.1.0', kind: 'program', name: 'Acyclic depth fixture', entry_function: 'f0', functions });
  const result = executeProgram(p, [], { evaluation_depth: 256 }); exhausted(result, 'evaluation_depth');
  assert.equal(result.usage.evaluation_depth, 256); assert(result.completion.diagnostic.call_stack.length > 80);
  assert(result.completion.diagnostic.path.startsWith('/functions/85/'));
});

test('execution results and exhaustion locations are deterministic under canonical object-key reordering', () => {
  const p = program([ret({ kind: 'sort', list: ref('x') })], list(string), [param('x', list(string))]);
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  for (const options of [{}, { work: 50 }]) assert.deepEqual(executeProgram(p, [['z', 'a', 'a']], options), executeProgram(reorder(p), [['z', 'a', 'a']], options));
  const type = record({ a: string, b: list(integer) }), equality = program([ret(binary('eq', ref('left'), ref('right')))], boolean, [param('left', type), param('right', type)]);
  const args = [{ a: 'first', b: [1, 2] }, { a: 'other', b: [1, 2] }];
  assert.deepEqual(executeProgram(equality, args), executeProgram(equality, reorder(args)));
});
