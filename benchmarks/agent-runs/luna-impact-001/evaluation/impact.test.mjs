// Frozen before the coding run. No candidate source is read by this evaluator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const candidate = resolve(process.env.CLEARINGS_CANDIDATE ?? '.');
const api = await import(pathToFileURL(resolve(candidate, 'dist/index.js')).href);
const analyze = api.analyzeImpact;
const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const pathCompare = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = compare(a[i], b[i]); if (c) return c; }
  return a.length - b.length;
};
const dependency = (target, requirement = 'required', kind = 'uses-contract') => ({ operation_id: target, requirement, kind, role: `May use ${target}.` });
function operation(id, dependencies = []) {
  return { id, alias: `alias/${id}`, name: `Name for ${id}: 条件 🌱`, purpose: `Original fixture operation ${id}.`, inputs: {}, output: { kind: 'null' }, reads: [], writes: [], frame: 'partial', effects: { completeness: 'partial', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
    outcomes: [{ id: `outcome/${id}`, description: 'Complete the fixture.', when: { kind: 'literal', value: true }, ensures: [], updates: [], effects: [], transitions: [], evidence_ids: [] }], guarantees: [], dependencies, implementations: [], decisions: [], evidence_ids: [] };
}
function spec(operations, perspective = 'intended') {
  return api.sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Independent impact evaluation fixture', perspective,
    provenance: { author: 'Frozen test author; not the coding agent', origin: perspective === 'intended' ? 'user-directed-design' : 'source-interpretation', review: 'proposed', notes: ['Synthetic graph; no target code executes.'] }, operations, states: [], sources: [] });
}
function selectedIds(model, changed) { return [...new Set(changed.map(value => model.operations.find(op => op.id === value || op.alias === value).id))].sort(compare); }

// Reference searches original outgoing paths from each node. It does not build
// a reverse dependency graph. Exhaustive simple-path enumeration is bounded to
// small generated graphs; the deep-chain case uses a direct expected result.
function oracle(model, changed, mode = 'required') {
  const roots = selectedIds(model, changed), rootSet = new Set(roots);
  const byId = new Map(model.operations.map(op => [op.id, op]));
  const affected = [];
  for (const op of model.operations) {
    let best;
    const visit = path => {
      const id = path.at(-1);
      if (rootSet.has(id)) { if (!best || path.length < best.length || (path.length === best.length && pathCompare(path, best) < 0)) best = path; return; }
      if (best && path.length >= best.length) return;
      for (const dep of byId.get(id).dependencies) {
        if ((mode === 'required' && dep.requirement !== 'required') || !byId.has(dep.operation_id) || path.includes(dep.operation_id)) continue;
        visit([...path, dep.operation_id]);
      }
    };
    visit([op.id]);
    if (best) affected.push({ operation_id: op.id, name: op.name, distance: best.length - 1, witness: best, decisions: structuredClone(op.decisions) });
  }
  affected.sort((a, b) => compare(a.operation_id, b.operation_id));
  const ids = new Set(affected.map(item => item.operation_id));
  return { schema_version: '0.3.0', command: 'impact', artifact_id: model.artifact_id, perspective: model.perspective, mode, changed_operation_ids: roots, affected,
    omitted_operation_ids: model.operations.filter(op => !ids.has(op.id)).map(op => op.id).sort(compare),
    unavailable_optional_dependencies: model.operations.filter(op => ids.has(op.id)).flatMap(op => op.dependencies.filter(dep => dep.requirement === 'optional' && !byId.has(dep.operation_id)).map(dep => ({ from_id: op.id, to_id: dep.operation_id, kind: dep.kind, role: dep.role }))).sort((a, b) => compare(a.from_id, b.from_id) || compare(a.to_id, b.to_id)),
    interpretation: 'potential-impact-from-declared-dependencies', acceptance: 'proposed' };
}
function verify(model, changed, options) {
  const before = JSON.stringify({ model, changed, options });
  const actual = analyze(model, changed, options);
  assert.deepEqual(actual, oracle(model, changed, options?.mode ?? 'required'));
  assert.equal(JSON.stringify({ model, changed, options }), before);
  assert.equal(JSON.stringify(actual), JSON.stringify(analyze(model, changed, options)));
  return actual;
}
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }

test('public function is exported', () => assert.equal(typeof analyze, 'function'));
test('independent oracle agrees with a hand-checked reverse chain and excludes outgoing helpers', () => {
  const model = spec([operation('caller', [dependency('changed')]), operation('changed', [dependency('helper')]), operation('helper'), operation('isolated')]);
  const expected = oracle(model, ['changed']);
  assert.deepEqual(expected.affected.map(item => [item.operation_id, item.witness]), [['caller', ['caller', 'changed']], ['changed', ['changed']]]);
  assert.deepEqual(expected.omitted_operation_ids, ['helper', 'isolated']);
});
test('reverse impact includes callers and excludes a changed operation’s outgoing dependencies', () => {
  verify(spec([operation('top', [dependency('mid')]), operation('mid', [dependency('changed')]), operation('changed', [dependency('helper')]), operation('helper'), operation('island')]), ['changed']);
});
test('isolated roots, repeated IDs, and aliases resolve to one sorted changed set', () => {
  const model = spec([operation('Zulu'), operation('alpha'), operation('middle')]);
  verify(model, ['alias/alpha', 'Zulu', 'alpha', 'alias/Zulu']);
  verify(model, ['middle'], { mode: undefined });
});
test('required/all modes change traversal but every dependency kind can carry impact', () => {
  const model = spec([operation('changed'), operation('required', [dependency('changed', 'required', 'continuation')]), operation('optional', [dependency('changed', 'optional', 'awaits')]), operation('upstream', [dependency('optional', 'required', 'invokes')])]);
  verify(model, ['changed']); verify(model, ['changed'], { mode: 'all' });
});
test('cycles, self-links, and several roots terminate without changing zero-distance roots', () => {
  const model = spec([operation('a', [dependency('b'), dependency('a')]), operation('b', [dependency('c')]), operation('c', [dependency('a')]), operation('outer', [dependency('a')])]);
  verify(model, ['a']); verify(model, ['c', 'a']);
});
test('shorter paths win before lexical path ordering', () => {
  const model = spec([operation('start', [dependency('aa-long'), dependency('zz-short')]), operation('aa-long', [dependency('middle')]), operation('middle', [dependency('root')]), operation('zz-short', [dependency('root')]), operation('root')]);
  const report = verify(model, ['root']);
  assert.deepEqual(report.affected.find(item => item.operation_id === 'start').witness, ['start', 'zz-short', 'root']);
});
test('equal-length ties use complete witness sequences rather than root order or locale', () => {
  const model = spec([operation('top', [dependency('a'), dependency('Z')]), operation('a', [dependency('A-root')]), operation('Z', [dependency('z-root')]), operation('A-root'), operation('z-root')]);
  const result = verify(model, ['A-root', 'z-root']);
  assert.deepEqual(result.affected.find(item => item.operation_id === 'top').witness, ['top', 'Z', 'z-root']);
});
test('prefix-like IDs use element-wise comparison rather than joined delimiter strings', () => {
  const model = spec([operation('top', [dependency('a-b'), dependency('a')]), operation('a-b', [dependency('root')]), operation('a', [dependency('root')]), operation('root')]);
  const result = verify(model, ['root']);
  assert.deepEqual(result.affected.find(item => item.operation_id === 'top').witness, ['top', 'a', 'root']);
});
test('missing optional links are reported for affected operations in both modes', () => {
  const model = spec([operation('caller', [dependency('root'), dependency('outside-z', 'optional', 'invokes'), dependency('outside-a', 'optional')]), operation('root', [dependency('other-missing', 'optional', 'awaits')]), operation('island', [dependency('hidden-missing', 'optional')])]);
  for (const mode of ['required', 'all']) {
    const report = verify(model, ['root'], { mode });
    assert.equal(report.unavailable_optional_dependencies.length, 3);
    assert(!report.affected.some(item => item.operation_id.includes('missing')));
  }
});
test('open decisions and evidence IDs remain exact, ordered, and independently owned', () => {
  const ops = [operation('caller', [dependency('root')]), operation('root')];
  ops[0].decisions = [
    { id: 'decision:z', question: 'Can the callback write?', consequence: 'Do not assume purity.', disposition: 'analysis-limit', blocking: true, evidence_ids: ['design:source'] },
    { id: 'decision:a', question: 'What should rejection return?', consequence: 'Requirement remains open.', disposition: 'unresolved-requirement', blocking: false, evidence_ids: [] },
  ];
  const model = spec([operation('placeholder')]); model.operations = ops;
  model.sources = [{ id: 'design:source', origin: 'design', locator: 'Original test evidence', text: 'Original source fixture.', sha256: hash('Original source fixture.'), binding: null }];
  const sealed = api.sealSpecification(model), before = JSON.stringify(sealed);
  const report = verify(sealed, ['root']);
  report.affected[0].decisions[0].evidence_ids.push('changed'); report.affected[0].decisions[0].question = 'Changed'; report.affected[0].witness.push('changed'); report.changed_operation_ids.push('changed');
  assert.equal(JSON.stringify(sealed), before);
});
test('deeply frozen inputs and options are accepted without mutation', () => {
  const model = deepFreeze(spec([operation('a', [dependency('b')]), operation('b')]));
  verify(model, deepFreeze(['b']), deepFreeze({ mode: 'all' }));
});
test('operation and dependency permutation preserve semantic ordering and selected paths', () => {
  const first = spec([operation('top', [dependency('right'), dependency('left')]), operation('right', [dependency('root')]), operation('left', [dependency('root')]), operation('root')]);
  const permuted = structuredClone(first); permuted.operations.reverse(); permuted.operations.forEach(op => op.dependencies.reverse());
  const second = api.sealSpecification(permuted);
  const a = verify(first, ['root']), b = verify(second, ['alias/root']);
  assert.deepEqual({ ...a, artifact_id: '' }, { ...b, artifact_id: '' });
});
test('prototype-like IDs and distinct observed provenance remain data', () => {
  const model = spec([operation('constructor'), operation('toString', [dependency('constructor')]), operation('valueOf', [dependency('toString')])], 'observed');
  const report = verify(model, ['constructor']); assert.equal(report.perspective, 'observed'); assert.equal(report.acceptance, 'proposed');
});
test('invalid selections retain their specified error code', () => {
  const model = spec([operation('root')]);
  for (const changed of [[], 'root', null, undefined, [null], [1], ['absent'], ['root', 'absent']]) assert.throws(() => analyze(model, changed), { code: 'INVALID_SELECTION' });
});
test('invalid options retain their specified error code', () => {
  const model = spec([operation('root')]);
  for (const options of [null, [], 'required', { mode: '' }, { mode: 'optional' }, { mode: null }, { mode: 1 }, { typo: true }]) assert.throws(() => analyze(model, ['root'], options), { code: 'INVALID_ARGUMENTS' });
});
test('stale identity and missing required targets are rejected anywhere in the specification', () => {
  const model = spec([operation('root'), operation('island')]);
  const stale = structuredClone(model); stale.operations[0].name += ' Changed'; assert.throws(() => analyze(stale, ['root']), { code: 'INVALID_SPECIFICATION' });
  const missing = structuredClone(model); missing.operations[1].dependencies = [dependency('absent')]; missing.artifact_id = api.specificationIdentity(missing);
  assert.throws(() => analyze(missing, ['root']), { code: 'MISSING_REQUIRED_DEPENDENCY' });
});
test('the recorded Hono specification produces only its declared potential dependents', () => {
  const model = JSON.parse(readFileSync(new URL('hono.json', import.meta.url), 'utf8'));
  const report = verify(model, ['store-response']);
  assert.deepEqual(report.affected.map(item => item.operation_id), ['middleware-result', 'response-selection', 'store-response']);
  assert(report.omitted_operation_ids.includes('read-response'));
});
test('160 fixed-seed small graph queries match the independent path oracle', () => {
  let seed = 0x59a6f01d;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let caseNo = 0; caseNo < 80; caseNo++) {
    const ids = Array.from({ length: 2 + Math.floor(random() * 6) }, (_, i) => `node${i}`);
    const ops = ids.map(id => operation(id, ids.filter(() => random() < .31).map(target => dependency(target, random() < .3 ? 'optional' : 'required', ['uses-contract', 'invokes', 'awaits', 'continuation'][Math.floor(random() * 4)]))));
    const model = spec(ops), roots = ids.filter(() => random() < .35); if (!roots.length) roots.push(ids[0]);
    verify(model, roots, { mode: 'required' }); verify(model, roots.reverse(), { mode: 'all' });
  }
});
test('a 350-operation chain returns complete witnesses without recursive graph expansion failure', () => {
  const count = 350, ids = Array.from({ length: count }, (_, i) => `n${String(i).padStart(4, '0')}`);
  const model = spec(ids.map((id, i) => operation(id, i + 1 < count ? [dependency(ids[i + 1])] : [])));
  const report = analyze(model, [ids.at(-1)]);
  assert.equal(report.affected.length, count); assert.deepEqual(report.omitted_operation_ids, []);
  for (let i = 0; i < count; i++) { assert.equal(report.affected[i].operation_id, ids[i]); assert.equal(report.affected[i].distance, count - i - 1); assert.deepEqual(report.affected[i].witness, ids.slice(i)); }
});
