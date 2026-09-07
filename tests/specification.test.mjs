import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sealSpecification, validateSpecification, specificationIdentity, assembleContext, serializeOperationContext, validateOperationContext, checkOperation, evaluateExpression, renderSpecification, renderOperationContext, createContractBrief } from '../dist/index.js';

const literal = value => ({ kind: 'literal', value });
const ref = (root, ...path) => ({ kind: 'ref', root, path });
const eq = (left, right) => ({ kind: 'compare', op: 'eq', left, right });
const hash = text => createHash('sha256').update(text).digest('hex');
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const bootstrap = read('../specifications/clearings/context-assembly.json');
const hono = read('../specifications/hono/response-selection.json');
const state = (id, kind) => ({ id, name: id, description: id, scope: 'invocation', type: { kind }, evidence_ids: [] });
const operation = (id, required = [], optional = []) => ({ id, alias: id, name: `${id} operation`, purpose: `Perform ${id} without losing π 中文 or <source> boundaries.`,
  inputs: {}, output: { kind: 'null' }, reads: [], writes: [], frame: 'partial', effects: { completeness: 'complete', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
  outcomes: [{ id: `outcome:${id}`, description: `Complete ${id}.`, when: literal(true), ensures: [], updates: [], effects: [], transitions: [], evidence_ids: [] }],
  guarantees: [], dependencies: [...required.map(operation_id => ({ operation_id, kind: 'uses-contract', requirement: 'required', role: `Required by ${id}.` })), ...optional.map(operation_id => ({ operation_id, kind: 'uses-contract', requirement: 'optional', role: `Optional context for ${id}.` }))],
  implementations: [{ name: `${id}Impl`, responsibility: `Carry out ${id}'s own operation.`, symbol_id: null, evidence_ids: [] }], decisions: [], evidence_ids: [] });
function graph(operations) {
  return sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Original graph fixture', perspective: 'intended',
    provenance: { author: 'Test fixture author', origin: 'user-directed-design', review: 'proposed', notes: [] }, states: [], operations, sources: [] });
}
function mutableFixture() {
  const op = operation('store'); op.inputs = { value: { kind: 'integer' }, fail: { kind: 'boolean' } }; op.output = { kind: 'string' };
  op.reads = ['value', 'finalized']; op.writes = ['value', 'finalized']; op.frame = 'complete';
  op.outcomes = [
    { id: 'stored', description: 'Store the input and finalize.', when: { kind: 'not', value: ref('input', 'fail') }, ensures: [{ id: 'stored-result', description: 'Return stored.', predicate: eq(ref('output'), literal('stored')), evidence_ids: [] }],
      updates: [{ state_id: 'value', value: ref('input', 'value') }, { state_id: 'finalized', value: literal(true) }], effects: [], transitions: [], evidence_ids: [] },
    { id: 'failed', description: 'Preserve existing state when storage fails.', when: ref('input', 'fail'), ensures: ['value', 'finalized'].map(id => ({ id: `preserve-${id}`, description: `Preserve ${id}.`, predicate: eq(ref('before', id), ref('after', id)), evidence_ids: [] })), updates: [], effects: [], transitions: [], evidence_ids: [] },
  ];
  const spec = graph([operation('store')]); spec.operations = [op]; spec.states = [state('value', 'integer'), state('finalized', 'boolean'), state('unrelated', 'integer')]; return sealSpecification(spec);
}
// Independent fixed-point reference uses set expansion, not the production queue.
function referenceIds(spec, root) {
  const ids = new Set([root]); let previous;
  do { previous = ids.size; for (const op of spec.operations) if (ids.has(op.id)) for (const dep of op.dependencies) if (dep.requirement === 'required') ids.add(dep.operation_id); } while (previous !== ids.size);
  return [...ids].sort();
}
function conformanceObservation(spec, pack, maxBytes, beforeDigest = hash(JSON.stringify(spec)), afterDigest = hash(JSON.stringify(spec))) {
  return { input: { root_id: pack.selection.operation_id, available_ids: spec.operations.map(op => op.id), required_edges: spec.operations.flatMap(op => op.dependencies.filter(dep => dep.requirement === 'required').map(dep => ({ from: op.id, to: dep.operation_id }))),
    applicable_decisions: spec.operations.flatMap(op => op.decisions.map(decision => ({ operation_id: op.id, decision_id: decision.id }))), artifact_id: spec.artifact_id, max_bytes: maxBytes },
    before: { 'model-digest': beforeDigest }, after: { 'model-digest': afterDigest }, outcome: 'outcome:ready', effects: [],
    output: { kind: 'ready', included_ids: pack.operations.map(op => op.id), omitted_ids: pack.omissions.operation_ids, decision_ids: pack.operations.flatMap(op => op.decisions.map(decision => decision.id)), artifact_id: pack.artifact_id, used_bytes: Buffer.byteLength(serializeOperationContext(pack)), required_bytes: pack.budget.required_bytes } };
}

test('typed specifications separate intent from observations and bind source/content identities', () => {
  validateSpecification(bootstrap); validateSpecification(hono);
  assert.equal(bootstrap.perspective, 'intended'); assert.equal(hono.perspective, 'observed');
  const tampered = structuredClone(hono); tampered.operations[0].purpose = 'A different interpretation';
  assert.throws(() => validateSpecification(tampered), { code: 'INVALID_SPECIFICATION' });
  assert.notEqual(sealSpecification(tampered).artifact_id, hono.artifact_id);
  tampered.perspective = 'intended'; assert.throws(() => sealSpecification(tampered), { code: 'INVALID_SPECIFICATION' });
  const source = structuredClone(hono); source.sources[0].text += '\n'; assert.throws(() => sealSpecification(source), /hash mismatch/);
  const extra = structuredClone(bootstrap); extra.provenance.review = 'accepted'; assert.throws(() => sealSpecification(extra), /schema mismatch/);
});

test('the type checker rejects invalid predicates, state writes, outcome scopes, and transitions', () => {
  const mutations = [
    spec => { spec.operations[0].outcomes[0].when = literal('true'); },
    spec => { spec.operations[0].outcomes[0].when = ref('input', 'absent'); },
    spec => { spec.operations[0].outcomes[0].when = eq(ref('output'), literal('stored')); },
    spec => { spec.operations[0].outcomes[0].updates[0].value = literal('wrong type'); },
    spec => { spec.operations[0].writes = []; },
    spec => { spec.operations[0].outcomes[0].effects = [{ effect_id: 'network', occurrence: 'required' }]; },
    spec => { spec.operations[0].outcomes[0].transitions = [{ operation_id: 'absent', handoff: 'await', description: 'Missing dependency.' }]; },
    spec => { spec.operations[0].outcomes[0].ensures[0].predicate = { kind: 'compare', op: 'gt', left: ref('output'), right: literal(0) }; },
    spec => { spec.operations[0].outcomes[0].ensures[0].predicate = { kind: 'eval', text: 'process.exit()' }; },
  ];
  for (const mutate of mutations) { const spec = mutableFixture(); mutate(spec); assert.throws(() => sealSpecification(spec)); }
  const alias = graph([operation('one'), operation('two')]); alias.operations[0].alias = 'two'; assert.throws(() => sealSpecification(alias), /Ambiguous/);
});

test('the closed interpreter preserves unknowns, short-circuit logic, quantifier scope, and value types', () => {
  const opaque = { kind: 'opaque', text: 'process.exit()', reason: 'External callback behavior is not modeled.' };
  assert.equal(evaluateExpression(opaque, {}).known, false);
  assert.deepEqual(evaluateExpression({ kind: 'all', terms: [opaque, literal(false)] }, {}), { known: true, value: false });
  assert.deepEqual(evaluateExpression({ kind: 'any', terms: [opaque, literal(true)] }, {}), { known: true, value: true });
  assert.equal(evaluateExpression({ kind: 'all', terms: [opaque, literal(true)] }, {}).known, false);
  const quantified = { kind: 'every', collection: literal([1, 2, 3]), variable: 'n', predicate: { kind: 'compare', op: 'gt', left: ref('local', 'n'), right: literal(0) } };
  assert.deepEqual(evaluateExpression(quantified, {}), { known: true, value: true });
  assert.equal(evaluateExpression(quantified, {}, 2).known, false);
  assert.equal(evaluateExpression(ref('input', 'constructor'), { input: {} }).known, false);
  assert.equal(evaluateExpression(eq(literal(0), literal(false)), {}).value, false);
  assert.equal(evaluateExpression(eq(literal(null), literal(false)), {}).value, false);
});

test('state assignments preserve nested integer and enum constraints', () => {
  for (const [from, to] of [
    [{ kind: 'list', element: { kind: 'number' } }, { kind: 'list', element: { kind: 'integer' } }],
    [{ kind: 'record', fields: { status: { kind: 'string' } } }, { kind: 'record', fields: { status: { kind: 'enum', values: ['ready'] } } }],
  ]) {
    const spec = graph([operation('assign')]);
    spec.states = [{ ...state('target', 'null'), type: to }];
    spec.operations[0].inputs = { value: from }; spec.operations[0].writes = ['target'];
    spec.operations[0].outcomes[0].updates = [{ state_id: 'target', value: ref('input', 'value') }];
    assert.throws(() => sealSpecification(spec), { code: 'SPEC_TYPE' });
    spec.operations[0].inputs.value = to;
    validateSpecification(sealSpecification(spec));
  }
});

test('received context is checked against the exact specification including prose and provenance', () => {
  const original = assembleContext(hono, 'response-selection', { maxBytes: 131072 });
  validateOperationContext(original, hono);
  for (const edit of [
    pack => { pack.operations[0].outcomes.pop(); },
    pack => { pack.operations[0].purpose = 'Always return the context response.'; },
    pack => { pack.provenance.review = 'accepted'; },
    pack => { pack.sources[0].text = 'different source'; },
    pack => { pack.budget.used_bytes--; },
    pack => { pack.operations[0].decisions = []; },
  ]) { const pack = structuredClone(original); edit(pack); assert.throws(() => validateOperationContext(pack, hono), { code: 'INVALID_CONTEXT' }); }
  const revised = structuredClone(hono); revised.operations[0].purpose += ' Revised.';
  assert.throws(() => validateOperationContext(original, sealSpecification(revised)), { code: 'INVALID_CONTEXT' });
});

test('scenario checking catches state/frame violations and effects; absent observations stay unknown', () => {
  const spec = mutableFixture();
  const observation = { input: { value: 8, fail: false }, before: { value: 2, finalized: false, unrelated: 10 }, after: { value: 8, finalized: true, unrelated: 10 }, outcome: 'stored', output: 'stored', effects: [] };
  assert.equal(checkOperation(spec, 'store', observation).verdict, 'pass');
  for (const mutate of [o => { o.after.finalized = false; }, o => { o.after.unrelated = 11; }, o => { o.effects = ['network']; }, o => { o.output = 'wrong'; }]) {
    const bad = structuredClone(observation); mutate(bad); assert.equal(checkOperation(spec, 'store', bad).verdict, 'fail');
  }
  const missing = structuredClone(observation); delete missing.effects; assert.equal(checkOperation(spec, 'store', missing).verdict, 'unknown');
  const prediction = { input: observation.input, before: observation.before }; assert.equal(checkOperation(spec, 'store', prediction).verdict, 'unknown');
  const fail = { ...observation, input: { value: 8, fail: true }, after: observation.before, outcome: 'failed', output: 'failure' }; assert.equal(checkOperation(spec, 'store', fail).verdict, 'pass');
  assert.throws(() => checkOperation(spec, 'store', { ...observation, input: { value: '8', fail: false } }), { code: 'INVALID_OBSERVATION' });
});

test('operation guarantees run without an outcome and retain failures alongside unknowns', () => {
  const observation={input:{},before:{'response-present':false,finalized:false},after:{'response-present':true,finalized:true}};
  const failed=checkOperation(hono,'read-response',observation);
  assert.equal(failed.verdict,'fail');
  assert(failed.checks.some(item=>item.id==='observed-outcome'&&item.verdict==='unknown'));
  const guarantees=hono.operations.find(op=>op.id==='read-response').guarantees;
  assert(guarantees.some(rule=>failed.checks.some(item=>item.id===rule.id&&item.verdict==='fail')));
  observation.after.finalized=false;
  const incomplete=checkOperation(hono,'read-response',observation);
  assert.equal(incomplete.verdict,'unknown');
  for(const rule of guarantees) assert.equal(incomplete.checks.find(item=>item.id===rule.id).verdict,'pass');
  delete observation.after;
  assert.equal(checkOperation(hono,'read-response',observation).verdict,'unknown');
});

test('CLI selected inspection accepts a valid operation above 128 KiB and enforces the supported maximum', t => {
  const directory=mkdtempSync(join(tmpdir(),'clearings-inspect-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const spec=graph([operation('large')]);spec.operations[0].purpose='x'.repeat(150000);
  const path=join(directory,'spec.json');writeFileSync(path,JSON.stringify(sealSpecification(spec)));
  const cli=new URL('../dist/cli/main.js',import.meta.url).pathname;
  const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',maxBuffer:8388608});
  const inspection=run('inspect',path,'--operation','large');
  assert.equal(inspection.status,0,inspection.stderr);
  assert.equal(JSON.parse(inspection.stdout).operations[0].purpose.length,150000);
  assert.equal(run('context',path,'--operation','large').status,2);
  spec.operations[0].purpose='x'.repeat(2097152);writeFileSync(path,JSON.stringify(sealSpecification(spec)));
  assert.equal(run('inspect',path,'--operation','large').status,2);
});

test('exclusive overlap and unformalized alternatives cannot produce a clean check', () => {
  const spec = graph([operation('choose')]);
  spec.operations[0].outcomes.push({ ...structuredClone(spec.operations[0].outcomes[0]), id: 'other' });
  const overlapping = sealSpecification(spec);
  const observation = { input: {}, before: {}, after: {}, outcome: 'outcome:choose', output: null, effects: [] };
  assert.equal(checkOperation(overlapping, 'choose', observation).verdict, 'fail');
  spec.operations[0].outcomes[1].when = { kind: 'opaque', text: 'Unknown branch.', reason: 'Unavailable callback.' };
  assert.equal(checkOperation(sealSpecification(spec), 'choose', observation).verdict, 'unknown');
});

test('required context handles diamonds/cycles and preserves roles, decisions, and deferred links', () => {
  const ops = [operation('root', ['left', 'right'], ['optional', 'unavailable']), operation('left', ['shared']), operation('right', ['shared']), operation('shared', ['root']), operation('optional')];
  ops[3].decisions = [{ id: 'decision:shared', question: 'What does the callback do?', consequence: 'Do not assume purity.', disposition: 'analysis-limit', blocking: true, evidence_ids: [] }];
  const spec = graph(ops), before = JSON.stringify(spec);
  const pack = assembleContext(spec, 'root', { maxBytes: 65536 });
  assert.deepEqual(pack.operations.map(op => op.id), ['root', 'left', 'right', 'shared']);
  assert.deepEqual([...pack.operations.map(op => op.id)].sort(), referenceIds(spec, 'root'));
  assert.deepEqual(pack.omissions.operation_ids, ['optional']);
  assert.equal(pack.omissions.deferred_dependencies.length, 2);
  assert(pack.omissions.deferred_dependencies.some(dep => dep.to_id === 'unavailable' && !dep.available));
  assert(pack.operations.some(op => op.decisions.some(decision => decision.blocking)));
  assert.equal(pack.links.find(link => link.to_id === 'left').role, 'Required by root.');
  assert.equal(pack.checks.acceptance, 'proposed');
  assert.equal(JSON.stringify(spec), before);
  assert.equal(serializeOperationContext(pack), serializeOperationContext(assembleContext(spec, 'root', { maxBytes: 65536 })));
  const observed = conformanceObservation(spec, pack, 65536); assert.equal(checkOperation(bootstrap, 'assemble-context', observed).verdict, 'pass');
});

test('byte budgets include Unicode, metadata, and their own counters at the exact boundary', () => {
  const spec = graph([operation('root')]); let pack = assembleContext(spec, 'root', { maxBytes: 65536 });
  // Re-evaluate when changing the decimal width of max_bytes changes the encoding.
  for (let i = 0; i < 4 && pack.budget.max_bytes !== pack.budget.used_bytes; i++) pack = assembleContext(spec, 'root', { maxBytes: pack.budget.used_bytes });
  assert.equal(pack.budget.max_bytes, pack.budget.used_bytes);
  assert.equal(Buffer.byteLength(serializeOperationContext(pack)), pack.budget.used_bytes);
  assert.throws(() => assembleContext(spec, 'root', { maxBytes: pack.budget.used_bytes - 1 }), { code: 'CONTEXT_BUDGET' });
  for (const maxBytes of [0, -1, 1.5, NaN, Infinity, 2097153]) assert.throws(() => assembleContext(spec, 'root', { maxBytes }), { code: 'INVALID_BUDGET' });
  assert.throws(() => assembleContext(spec, 'absent', { maxBytes: 65536 }), { code: 'INVALID_SELECTION' });
  const missing = structuredClone(spec); missing.operations[0].dependencies = [{ operation_id: 'lost', kind: 'uses-contract', requirement: 'required', role: 'Required rule.' }]; missing.artifact_id = specificationIdentity(missing);
  assert.throws(() => assembleContext(missing, 'root', { maxBytes: 65536 }), { code: 'MISSING_REQUIRED_DEPENDENCY' });
});

test('bootstrap contract rejects plausible incorrect outputs independently of the implementation', () => {
  const ops = [operation('root', ['child']), operation('child')]; ops[1].decisions = [{ id: 'open:child', question: 'Will the callback reject?', consequence: 'Failure handling remains unresolved.', disposition: 'unresolved-requirement', blocking: true, evidence_ids: [] }];
  const spec = graph(ops), pack = assembleContext(spec, 'root', { maxBytes: 65536 });
  const observation = conformanceObservation(spec, pack, 65536);
  const mutations = [
    o => { o.output.included_ids = ['root']; o.output.omitted_ids = ['child']; },
    o => { o.output.decision_ids = []; },
    o => { o.output.artifact_id = 'wrong'; },
    o => { o.output.included_ids.push('child'); },
    o => { o.output.used_bytes = 70000; },
    o => { o.after['model-digest'] = 'changed'; },
    o => { o.output.omitted_ids = ['child']; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(observation); mutate(bad); const result = checkOperation(bootstrap, 'assemble-context', bad); assert.equal(result.verdict, 'fail', JSON.stringify(result)); }
});

test('Hono typed decisions distinguish direct nullish, Promise falsy, and composed finalization', () => {
  const cases = [
    ['direct', 'nullish', true, 'outcome:direct-missing', 'not-found'],
    ['direct', 'non-nullish-falsy', true, 'outcome:direct-value', 'handler-result'],
    ['promise', 'non-nullish-falsy', true, 'outcome:promise-context', 'context-response'],
    ['promise', 'nullish', false, 'outcome:promise-missing', 'not-found'],
    ['promise', 'truthy', false, 'outcome:promise-value', 'handler-result'],
    ['composed', 'truthy', false, 'outcome:composed-unfinalized', 'finalization-error'],
    ['composed', 'nullish', true, 'outcome:composed-context', 'context-response'],
  ];
  for (const [path, value, finalized, outcome, output] of cases) assert.equal(checkOperation(hono, 'response-selection', { input: { path, value }, before: { finalized }, outcome, output }).verdict, 'pass');
  const getter = { input: {}, before: { 'response-present': false, finalized: false }, after: { 'response-present': true, finalized: false }, outcome: 'outcome:get-create', output: 'created-response' };
  assert.equal(checkOperation(hono, 'read-response', getter).verdict, 'pass');
  getter.after.finalized = true; assert.equal(checkOperation(hono, 'read-response', getter).verdict, 'fail');
  const stored = { input: {}, before: { 'response-present': true, finalized: false }, after: { 'response-present': false, finalized: false }, outcome: 'outcome:get-existing', output: 'stored-response' };
  assert.equal(checkOperation(hono, 'read-response', stored).verdict, 'fail');
  const failedStore = { input: { assigned: 'response', merge_succeeds: false }, before: { finalized: false, 'response-present': false }, after: { finalized: false, 'response-present': false }, outcome: 'outcome:set-failure', output: 'propagated-error' };
  assert.equal(checkOperation(hono, 'store-response', failedStore).verdict, 'pass');
  failedStore.after['response-present'] = true; assert.equal(checkOperation(hono, 'store-response', failedStore).verdict, 'fail');
  assert.equal(checkOperation(hono, 'store-response', { input: { assigned: 'undefined', merge_succeeds: true }, before: { finalized: false, 'response-present': false }, after: { finalized: true, 'response-present': false }, outcome: 'outcome:set-success', output: 'stored' }).verdict, 'pass');
  assert.equal(checkOperation(hono, 'middleware-result', { input: { truthy_result: true, error_result: true }, before: { finalized: true }, outcome: 'outcome:middleware-assign', output: 'assign' }).verdict, 'pass');
});

test('reports expose distinct responsibilities and exact source with safe local links', () => {
  const html = renderSpecification(hono, 'response-selection', { format: 'html' });
  assert(html.includes('Lazily create response storage and prepared headers without finalizing the context.'));
  assert(html.includes('Direct Promise result callback')); assert(html.includes('Rules and outcomes'));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert(ids.has(match[1]), match[1]);
  assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/.test(html));
  const malicious = graph([operation('root')]); malicious.operations[0].purpose = '</p><script>alert(1)</script>';
  const page = renderSpecification(sealSpecification(malicious), 'root', { format: 'html' }); assert(!page.includes('<script>alert'));
  const markdown = renderSpecification(sealSpecification(malicious), 'root'); assert(!markdown.includes('\n</p><script>')); assert(markdown.includes('&lt;/p&gt;&lt;script&gt;'));
  assert(html.includes('State used by these rules')); assert(html.includes(hono.states[0].description));
  assert(renderSpecification(hono, 'response-selection').includes('Responsibility'));
});

test('legacy brief resolves assertions while preserving their unformalized status', () => {
  const model = read('../benchmarks/results/hono-contracts/semantic.json');
  const brief = createContractBrief(model, { id: model.data.proposal.data.functions.find(fn => fn.alias === 'context-res-getter').id }, { maxBytes: 131072 });
  assert.equal(brief.formalization, 'legacy-prose-only');
  const getter = brief.functions.find(fn => fn.name === 'Context.res getter'); assert(getter.outputs.some(claim => claim.text.includes('does not set finalized')));
  assert.equal(brief.budget.used_bytes, Buffer.byteLength(JSON.stringify(brief) + '\n'));
});

test('malformed cyclic, sparse, accessor, and excessively nested JSON fails before interpretation', () => {
  const circular = {}; circular.self = circular; assert.throws(() => sealSpecification(circular));
  const accessor = {}; Object.defineProperty(accessor, 'oops', { enumerable: true, get() { throw new Error('must not run'); } }); assert.throws(() => sealSpecification(accessor), /Accessor/);
  const sparse = graph([operation('root')]); sparse.operations = new Array(2); assert.throws(() => sealSpecification(sparse), /dense/);
  const deep = graph([operation('root')]); let expr = literal(true); for (let n = 0; n < 100; n++) expr = { kind: 'not', value: expr }; deep.operations[0].outcomes[0].when = expr; assert.throws(() => sealSpecification(deep), /work limit/);
});

test('CLI reads, renders, checks and exports specifications while protecting the target', t => {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-spec-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo'); execFileSync('git', ['init', '-q', '--template=', repository]);
  const path = join(directory, 'spec.json'); writeFileSync(path, JSON.stringify(hono));
  const cli = new URL('../dist/cli/main.js', import.meta.url).pathname;
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(run('validate', path).status, 0);
  assert.equal(JSON.parse(run('inspect', path).stdout).operations.length, 4);
  const output = join(directory, 'context.json'); const context = run('context', path, '--operation', 'response-selection', '--max-bytes', '131072', '--repository', repository, '--out', output);
  assert.equal(context.status, 0, context.stderr); assert.equal(readFileSync(output, 'utf8'), context.stdout);
  assert.equal(run('explain', path, '--operation', 'response-selection', '--format', 'html').status, 0);
  const protectedPath = join(repository, 'context.json'); assert.equal(run('context', path, '--operation', 'response-selection', '--repository', repository, '--out', protectedPath).status, 2); assert(!existsSync(protectedPath));
  assert.equal(run('inspect', path, '--operation', 'response-selection', '--scan', path, '--repository', repository).status, 2);
  const casePath = join(directory, 'case.json'); const obs = { input: { path: 'direct', value: 'nullish' }, before: { finalized: true }, outcome: 'outcome:direct-missing', output: 'not-found' }; writeFileSync(casePath, JSON.stringify(obs));
  assert.equal(run('check', path, '--operation', 'response-selection', '--observation', casePath).status, 0);
  obs.output = 'context-response'; writeFileSync(casePath, JSON.stringify(obs)); assert.equal(run('check', path, '--operation', 'response-selection', '--observation', casePath).status, 1);
  delete obs.output; writeFileSync(casePath, JSON.stringify(obs)); assert.equal(run('check', path, '--operation', 'response-selection', '--observation', casePath).status, 3);
});

test('enum equality rejects impossible literals and disjoint domains without rejecting overlap',()=>{
 const make=predicate=>{const op=operation('enum-check');op.inputs={mode:{kind:'enum',values:['ready','failed']},other:{kind:'enum',values:['ready','waiting']},disjoint:{kind:'enum',values:['missing']},nested:{kind:'record',fields:{mode:{kind:'enum',values:['ready']}}}};op.outcomes[0].when=predicate;return graph([op]);};
 for(const predicate of [eq(ref('input','mode'),literal('raedy')),eq(literal('raedy'),ref('input','mode')),{kind:'compare',op:'ne',left:ref('input','mode'),right:literal('absent')},eq(ref('input','mode'),ref('input','disjoint')),eq(ref('input','nested'),literal({mode:'bad'}))])assert.throws(()=>make(predicate),{code:'SPEC_TYPE'});
 assert.doesNotThrow(()=>make(eq(ref('input','mode'),ref('input','other'))));assert.doesNotThrow(()=>make(eq(ref('input','mode'),literal('ready'))));
});

test('bounded reachability handles cycles, disconnected components, order, and unknown input',()=>{
 const expr={kind:'reachable',root:ref('input','root'),edges:ref('input','edges')};
 const edges=[{from:'c',to:'a'},{from:'b',to:'c'},{from:'a',to:'b'},{from:'unrelated',to:'itself'},{from:'a',to:'b'}];
 assert.deepEqual(evaluateExpression(expr,{input:{root:'a',edges}}),{known:true,value:['a','b','c']});
 assert.deepEqual(evaluateExpression(expr,{input:{root:'a',edges:edges.toReversed()}}),{known:true,value:['a','b','c']});
 assert.deepEqual(evaluateExpression(expr,{input:{root:'alone',edges:[]}}),{known:true,value:['alone']});
 assert.equal(evaluateExpression(expr,{input:{root:'a',edges}},4).known,false);
 assert.equal(evaluateExpression(expr,{input:{root:'a'}}).known,false);
 assert.equal(evaluateExpression(expr,{input:{root:'a',edges:[{from:1,to:'b'}]}}).known,false);
});

test('reachability typing validates edges and checks nested outcome-guard references',()=>{
 const make=(root,edges)=>{const op=operation('reach');op.output={kind:'string'};op.outcomes[0].when={kind:'contains',collection:{kind:'reachable',root,edges},value:literal('root')};return graph([op]);};
 assert.doesNotThrow(()=>make(literal('root'),literal([])));
 assert.throws(()=>make(literal(1),literal([])),{code:'SPEC_TYPE'});
 assert.throws(()=>make(literal('root'),literal([{from:'root',to:5}])),{code:'SPEC_TYPE'});
 assert.throws(()=>make(literal('root'),literal([{source:'root',to:'next'}])),{code:'SPEC_TYPE'});
 assert.throws(()=>make(ref('output'),literal([])),{code:'INVALID_SPECIFICATION'});
});

test('typed context rules reject unrelated records even when closure and omissions agree',()=>{
 const spec=graph([operation('root',['dep']),operation('dep'),operation('unrelated',['other']),operation('other',['unrelated'])]);
 const pack=assembleContext(spec,'root',{maxBytes:65536});const observed=conformanceObservation(spec,pack,65536);
 assert.equal(checkOperation(bootstrap,'assemble-context',observed).verdict,'pass');
 observed.output.included_ids.push('unrelated','other');observed.output.omitted_ids=[];
 const result=checkOperation(bootstrap,'assemble-context',observed);
 assert.equal(result.verdict,'fail');assert.equal(result.checks.find(x=>x.id==='rule:minimal-closure').verdict,'fail');
 assert.equal(result.checks.find(x=>x.id==='rule:dependency-closure').verdict,'pass');assert.equal(result.checks.find(x=>x.id==='rule:disjoint-omissions').verdict,'pass');
});


test('collection predicates reject literals outside declared enum element domains',()=>{
 const make=predicate=>{const op=operation('enum-collection');op.inputs={values:{kind:'list',element:{kind:'enum',values:['ready']}}};op.outcomes[0].when=predicate;return graph([op]);};
 const collection=ref('input','values');
 for(const expr of [{kind:'contains',collection,value:literal('raedy')},{kind:'subset',collection,value:literal(['ready','raedy'])}])assert.throws(()=>make(expr),{code:'SPEC_TYPE'});
 for(const expr of [{kind:'contains',collection,value:literal('ready')},{kind:'subset',collection,value:literal(['ready'])},{kind:'subset',collection,value:literal([])}])assert.doesNotThrow(()=>make(expr));
});

test('context scenario reports recheck changed observations and reject an unbound specification',()=>{
 const spec=graph([operation('scenario')]);const op=spec.operations[0];op.output={kind:'string'};op.outcomes[0].ensures=[{id:'scenario-result',description:'Return ready.',predicate:eq(ref('output'),literal('ready')),evidence_ids:[]}];const sealed=sealSpecification(spec);
 const pack=assembleContext(sealed,'scenario',{maxBytes:65536});const observation={input:{},before:{},outcome:'outcome:scenario',output:'ready',effects:[]};const scenario={name:'changed',operation_id:'scenario',observation,result:checkOperation(sealed,'scenario',observation)};
 assert.equal(scenario.result.verdict,'pass');scenario.observation.output='wrong';
 assert.throws(()=>renderOperationContext(pack,{scenarios:[scenario]}),{code:'INVALID_ARGUMENTS'});
 for(const format of ['html','markdown']) {
  const output=renderOperationContext(pack,{format,scenarios:[scenario],specification:sealed});
  assert(output.includes(format==='html'?'>fail</span>':'**fail**'));
  assert.equal(scenario.result.verdict,'pass');
 }
 const changed=structuredClone(pack);changed.operations[0].purpose+=' forged';assert.throws(()=>renderOperationContext(changed,{scenarios:[scenario],specification:sealed}),{code:'INVALID_CONTEXT'});
 const bad=structuredClone(scenario);bad.observation.output=3;assert.throws(()=>renderOperationContext(pack,{scenarios:[bad],specification:sealed}),{code:'INVALID_OBSERVATION'});
 assert(renderSpecification(sealed,'scenario',{scenarios:[scenario]}).includes('**fail**'));
});

test('local references require a scope and nested quantifiers retain outer bindings', () => {
  const make = predicate => { const op = operation('scoped'); op.outcomes[0].when = predicate; return graph([op]); };
  for (const predicate of [eq(ref('local'), literal({})), eq(ref('local', 'x'), literal(1))]) {
    assert.throws(() => make(predicate), { code: 'SPEC_TYPE' });
  }
  const every = (variable, collection, predicate) => ({ kind: 'every', variable, collection, predicate });
  const nested = every('outer', literal([1]), every('inner', literal([1]), eq(ref('local', 'inner'), ref('local', 'outer'))));
  const whole = every('item', literal([1]), eq(ref('local'), literal({ item: 1 })));
  for (const predicate of [nested, whole]) {
    const spec = make(predicate);
    assert.equal(checkOperation(spec, 'scoped', { input: {}, before: {}, after: {}, outcome: 'outcome:scoped', output: null, effects: [] }).verdict, 'pass');
  }
  // A binding is unavailable in its collection and after its predicate ends.
  assert.throws(() => make(every('x', ref('local', 'x'), literal(true))), { code: 'SPEC_TYPE' });
  assert.throws(() => make({ kind: 'all', terms: [whole, eq(ref('local'), literal({ item: 1 }))] }), { code: 'SPEC_TYPE' });
});

test('literal collections respect enum domains in scalar and nested value operands', () => {
  const enumType = { kind: 'enum', values: ['ready'] };
  const make = (valueType, kind, collection) => {
    const op = operation('literal-collection'); op.inputs = { value: valueType };
    op.outcomes[0].when = { kind, collection: literal(collection), value: ref('input', 'value') };
    return graph([op]);
  };
  for (const [type, kind, good, bad] of [
    [enumType, 'contains', ['ready'], ['raedy']],
    [{ kind: 'list', element: enumType }, 'subset', ['ready'], ['ready', 'raedy']],
    [{ kind: 'record', fields: { mode: enumType } }, 'contains', [{ mode: 'ready' }], [{ mode: 'raedy' }]],
    [{ kind: 'list', element: enumType }, 'contains', [['ready']], [['raedy']]],
  ]) {
    assert.throws(() => make(type, kind, bad), { code: 'SPEC_TYPE' });
    assert.doesNotThrow(() => make(type, kind, good));
    assert.doesNotThrow(() => make(type, kind, []));
  }
});

test('integer domains reject impossible literals but preserve numeric ordering and number values', () => {
  const make = (type, predicate) => { const op = operation('numeric'); op.inputs = { value: type }; op.outcomes[0].when = predicate; return graph([op]); };
  const value = ref('input', 'value'), integer = { kind: 'integer' };
  for (const bad of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const predicate of [eq(value, literal(bad)), eq(literal(bad), value), { kind: 'contains', collection: literal([bad]), value }]) {
      assert.throws(() => make(integer, predicate), { code: 'SPEC_TYPE' });
    }
    for (const [type, predicate] of [
      [{ kind: 'record', fields: { n: integer } }, eq(value, literal({ n: bad }))],
      [{ kind: 'list', element: integer }, eq(literal([bad]), value)],
      [{ kind: 'list', element: integer }, { kind: 'contains', collection: value, value: literal(bad) }],
      [{ kind: 'list', element: integer }, { kind: 'subset', collection: literal([bad]), value }],
    ]) assert.throws(() => make(type, predicate), { code: 'SPEC_TYPE' });
  }
  assert.doesNotThrow(() => make(integer, { kind: 'compare', op: 'lt', left: value, right: literal(1.5) }));
  assert.doesNotThrow(() => make({ kind: 'number' }, eq(value, literal(1.5))));
  assert.doesNotThrow(() => make(integer, eq(value, literal(Number.MAX_SAFE_INTEGER))));
});

test('complete effect boundaries reject undeclared traces even without an outcome', () => {
  const op = operation('effects'); op.effects.allowed = [{ id: 'disk', description: 'Write a record.' }];
  op.outcomes[0].effects = [{ effect_id: 'disk', occurrence: 'permitted' }];
  const spec = graph([op]), observation = { input: {}, before: {}, effects: ['network'] };
  const result = checkOperation(spec, 'effects', observation);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.checks.find(c => c.id === 'effects:allowed').verdict, 'fail');
  assert.equal(result.checks.find(c => c.id === 'observed-outcome').verdict, 'unknown');
  for (const effects of [undefined, [], ['disk']]) assert.equal(checkOperation(spec, 'effects', { input: {}, before: {}, ...(effects === undefined ? {} : { effects }) }).verdict, 'unknown');
  const partial = structuredClone(spec); partial.operations[0].effects.completeness = 'partial';
  assert.equal(checkOperation(sealSpecification(partial), 'effects', observation).verdict, 'unknown');
  const quiet = graph([operation('quiet')]);
  assert.equal(checkOperation(quiet, 'quiet', observation).verdict, 'fail');
  // A known outcome still applies its more specific effect boundary.
  const restricted = structuredClone(spec); restricted.operations[0].outcomes[0].effects = [];
  assert.equal(checkOperation(sealSpecification(restricted), 'effects', { ...observation, effects: ['disk'], outcome: 'outcome:effects', output: null }).verdict, 'fail');
});

test('schema regeneration reproduces the committed schema including reachability', t => {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-schema-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'scripts')); mkdirSync(join(directory, 'schemas'));
  const script = join(directory, 'scripts/generate-specification-schema.py');
  writeFileSync(script, readFileSync(new URL('../scripts/generate-specification-schema.py', import.meta.url)));
  execFileSync('python3', [script], { stdio: 'pipe' });
  assert.deepEqual(readFileSync(join(directory, 'schemas/specification.v0.3.json')), readFileSync(new URL('../schemas/specification.v0.3.json', import.meta.url)));
  validateSpecification(bootstrap);
});
