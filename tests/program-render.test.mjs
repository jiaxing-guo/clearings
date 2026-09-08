import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProgram, renderProgram, renderProgramExecution, sealProgram } from 'clearings/program';

const integer = { kind: 'integer' }, boolean = { kind: 'boolean' }, string = { kind: 'string' };
const literal = (value, type = integer) => ({ kind: 'literal', type, value });
const fn = (id, value, returns = integer) => ({ id, parameters: [], returns, failures: [], body: [{ kind: 'return', value }] });
const program = functions => sealProgram({ schema_version: '0.1.0', kind: 'program', name: 'Inspection fixture', entry_function: functions[0].id, functions });

test('inspection preserves record operand order and distinguishes calls, intrinsics, and literal data', () => {
  const data = { kind: 'call', function_id: 'never_called' };
  const recordType = { kind: 'record', fields: { kind: string, function_id: string } };
  const p = program([
    fn('main', { kind: 'record', fields: [
      { name: 'z', value: { kind: 'call', function_id: 'length', arguments: [] } },
      { name: 'a', value: { kind: 'length', list: { kind: 'list', element_type: integer, items: [] } } },
    ] }, { kind: 'record', fields: { a: integer, z: integer } }),
    fn('length', literal(7)), fn('data', literal(data, recordType), recordType),
  ]);
  const before = JSON.stringify(p), report = renderProgram(p);
  assert.match(report, /record \{ z: call length\(\), a: length\(list<integer>\[\]\) \}/);
  assert(report.includes(`(${JSON.stringify(p.functions[2].body[0].value.value)})`));
  assert(!report.includes('call never_called('));
  assert.match(report, /function data\(\) -> \{ function_id: string, kind: string \}/);
  assert.equal(JSON.stringify(p), before);
});

test('inspection distinguishes every binary operator and keeps grouping explicit', () => {
  const cases = [['add', '+'], ['sub', '-'], ['eq', '=='], ['ne', '!='], ['lt', '<'], ['lte', '<='], ['gt', '>'], ['gte', '>='], ['and', 'and'], ['or', 'or']];
  for (const [op, symbol] of cases) {
    const logical = op === 'and' || op === 'or';
    const left = literal(logical ? true : 4, logical ? boolean : integer), right = literal(logical ? false : 2, logical ? boolean : integer);
    const p = program([fn('main', { kind: 'binary', op, left, right }, op === 'add' || op === 'sub' ? integer : boolean)]);
    assert(renderProgram(p).includes(logical ? `(literal<boolean>(true) ${symbol} literal<boolean>(false))` : `(literal<integer>(4) ${symbol} literal<integer>(2))`));
  }
});

test('untrusted metadata and literal backticks stay in fenced data and retain all content', () => {
  const value = '```\n# outside?\n<script>x</script> ' + '` '.repeat(140_000);
  const p = program([fn('main', literal(value, string), string)]);
  p.name = '```\n# arbitrary name';
  const sealed = sealProgram(p), report = renderProgram(sealed);
  assert(report.includes(JSON.stringify(value)));
  assert(report.includes(JSON.stringify(p.name)));
  assert.match(report, /````text\n/); assert.match(report, /````json\n/);
});

test('inspection rejects invalid identity and types before producing a projection', () => {
  const p = program([fn('main', literal(1))]);
  p.functions[0].body[0].value.value = 'wrong type';
  assert.throws(() => renderProgram(p), error => error.code === 'INVALID_PROGRAM');
});

test('execution rendering retains return data, identity and resource measurements without mutation', () => {
  const p = program([fn('main', literal(3))]), result = executeProgram(p, []), before = JSON.stringify(result);
  const report = renderProgramExecution(result);
  assert(report.includes(p.artifact_id)); assert.match(report, /Returned value:\n\n```json\n3\n```/);
  for (const key of Object.keys(result.limits)) assert(report.includes(`| ${result.usage[key]} | ${result.limits[key]} |`));
  assert.equal(JSON.stringify(result), before);
});
