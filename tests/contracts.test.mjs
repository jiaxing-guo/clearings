import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, createContractRequest, importContractProposal, validateContractRequest, validateContractProposal, validateContractModel, inspectSemantic, createContextPack, serializeContextPack } from '../dist/index.js';
import { contentId, digest } from '../dist/semantics/identity.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const id = (kind, n) => `${kind}:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-contract-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo'); cpSync(join(root, 'tests/fixtures/contracts'), repository, { recursive: true });
  git(repository, 'init', '-q', '--template='); git(repository, 'add', '.');
  git(repository, '-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
  const structural = scan({ repository });
  const options = { repository, instruction: 'Describe response selection and shared state.' };
  const request = createContractRequest(structural, options);
  const source = request.data.source_request;
  const evidence = source.data.evidence.map(e => e.id);
  const obs = name => request.data.callables.find(c => c.name === name);
  const cap = id('concept', 1), component = id('concept', 2), state = id('concept', 3), external = id('concept', 4);
  const rule = n => id('claim', n);
  const texts = ['run accepts response state and a caller-supplied handler.', 'If the handler rejects, run rejects.', 'If a result is defined, finish writes it through the response setter.', 'If a result is undefined, finish preserves the existing value.', 'The response getter returns the stored value or empty.', 'The setter stores its input and sets finalized to true.', 'run awaits the handler then passes the result to finish.', 'The callback implementation and its effects are outside this source.'];
  const claims = texts.map((text, i) => ({ id: rule(i + 1), text, subject_ids: [cap, component, state, external], evidence_ids: evidence, category: i === 7 ? 'constraint' : 'behavior' }));
  const mkFunction = (n, alias, role, implementation) => ({ id: id('function', n), alias, title: alias, component_id: component, role, implementation_id: implementation?.id ?? null,
    input_claim_ids: [rule(1)], output_claim_ids: [rule(5)], state_access: [{ state_id: state, mode: 'read-write', claim_ids: [rule(3), rule(6)] }],
    effect_claim_ids: [rule(6)], failures: [{ condition: 'The handler rejects.', destination_id: null, claim_ids: [rule(2)] }], dependencies: [], assumption_claim_ids: [], unknown_ids: [] });
  const functions = [mkFunction(1, 'run', 'function', obs('run')), mkFunction(2, 'finish', 'function', obs('finish')),
    mkFunction(3, 'response-getter', 'getter', request.data.callables.find(c => c.role === 'getter')), mkFunction(4, 'response-setter', 'setter', request.data.callables.find(c => c.role === 'setter')), mkFunction(5, 'handler', 'external-callback')];
  functions[0].dependencies = [{ target_id: functions[1].id, claim_ids: [rule(7)] }, { target_id: functions[4].id, claim_ids: [rule(7)] }];
  functions[1].dependencies = [{ target_id: functions[2].id, claim_ids: [rule(5)] }, { target_id: functions[3].id, claim_ids: [rule(3)] }];
  functions[4].component_id = external; functions[4].unknown_ids = [id('unknown', 1)];
  const flow = { id: id('flow', 1), capability_id: cap, entry_symbol_ids: [obs('run').symbol_id], entry_step_ids: [id('step', 1)], steps: [
    { id: id('step', 1), title: 'Check the result', kind: 'branch', claim_ids: [rule(3), rule(4)], evidence_ids: evidence, next: [{ step_id: id('step', 2), condition: 'The result is defined.', evidence_ids: evidence }, { step_id: id('step', 3), condition: 'The result is undefined.', evidence_ids: evidence }] },
    { id: id('step', 2), title: 'Replace the value', kind: 'action', claim_ids: [rule(3), rule(6)], evidence_ids: evidence, next: [] },
    { id: id('step', 3), title: 'Read the previous value', kind: 'action', claim_ids: [rule(4), rule(5)], evidence_ids: evidence, next: [] },
  ] };
  const proposal = { schema_version: '0.2.0', command: 'proposal', snapshot_id: request.snapshot_id, request_id: request.request_id,
    producer: { kind: 'human', name: 'Original fixture data', model: null, input_tokens: null, output_tokens: null },
    data: { concepts: [[cap, 'capability', 'select-response'], [component, 'component', 'runner'], [state, 'state', 'response-state'], [external, 'external', 'user-handler']].map(([id, kind, alias]) => ({ id, kind, alias, title: alias, description: alias, evidence_ids: evidence, symbol_ids: [] })), claims, relations: [], flows: [flow], functions,
      unknowns: [{ id: id('unknown', 1), subject_id: external, question: 'What effects can the supplied handler cause?', critical: true, evidence_ids: [] }, { id: id('unknown', 2), subject_id: state, question: 'Can external code modify this state?', critical: true, evidence_ids: [] }],
      behaviors: [{ id: id('behavior', 1), alias: 'response-selection', title: 'Select a stored or returned response', capability_id: cap, trigger_claim_ids: [rule(1), rule(7)], function_ids: [functions[0].id, functions[1].id], state_ids: [state], flow_id: flow.id, step_ids: flow.steps.map(s => s.id), outcomes: [{ condition: 'A result is defined.', claim_ids: [rule(3), rule(6)] }, { condition: 'A result is undefined.', claim_ids: [rule(4), rule(5)] }], failures: [{ condition: 'The handler rejects.', destination_id: null, claim_ids: [rule(2)] }], constraint_claim_ids: [rule(8)], unknown_ids: [id('unknown', 2)] }] } };
  const model = importContractProposal(request, proposal, { scan: structural, repository, replay: true });
  return { directory, repository, structural, options, request, proposal, model };
}

test('contract exchange preserves distinct accessor implementations, mutable state, and callback uncertainty', t => {
  const d = setup(t);
  assert.deepEqual(createContractRequest(d.structural, d.options), d.request);
  const accessors = d.request.data.callables.filter(c => ['getter', 'setter'].includes(c.role));
  assert.equal(accessors.length, 2); assert.notEqual(accessors[0].id, accessors[1].id); assert.notEqual(accessors[0].start_byte, accessors[1].start_byte);
  validateContractModel(d.model, { scan: d.structural, repository: d.repository });
  assert(d.model.data.claim_checks.every(c => c.verification === 'unknown' && c.acceptance === 'proposed'));
  assert.equal(d.model.status, 'partial');
  assert.deepEqual(d.model, importContractProposal(d.request, d.proposal, { scan: d.structural, repository: d.repository, replay: true }));
  const revision = structuredClone(d.proposal); revision.data.claims[0].text += ' The declared type is not a runtime check.';
  const revised = importContractProposal(d.request, revision, { scan: d.structural, repository: d.repository });
  assert.equal(revised.data.proposal.data.claims[0].id, d.model.data.proposal.data.claims[0].id);
  assert.notEqual(revised.artifact_id, d.model.artifact_id);
});

test('contract validation rejects invalid endpoints, anchors, assertions, unknowns, and self-certification', t => {
  const d = setup(t);
  const mutations = [
    p => { p.request_id = 'request:' + '0'.repeat(64); },
    p => { p.data.functions[0].acceptance = 'accepted'; },
    p => { p.data.functions[0].input_claim_ids = [id('claim', 99)]; },
    p => { p.data.functions[0].state_access[0].state_id = id('concept', 1); },
    p => { p.data.functions[0].dependencies[0].target_id = id('concept', 3); },
    p => { p.data.functions[0].failures[0].destination_id = id('concept', 1); },
    p => { p.data.functions[2].implementation_id = p.data.functions[3].implementation_id; },
    p => { p.data.functions[4].unknown_ids = []; },
    p => { p.data.behaviors[0].step_ids = [id('step', 99)]; },
    p => { p.data.behaviors[0].function_ids = [id('concept', 2)]; },
    p => { p.data.behaviors[0].unknown_ids = [id('unknown', 99)]; },
    p => { p.data.unknowns[0].subject_id = id('behavior', 99); },
  ];
  for (const mutate of mutations) { const p = structuredClone(d.proposal); mutate(p); assert.throws(() => validateContractProposal(p, d.request), { code: 'INVALID_SEMANTICS' }); }
  const forged = structuredClone(d.request); forged.data.callables[0].role = 'constructor';
  const { id: _, ...body } = forged.data.callables[0]; forged.data.callables[0].id = digest('callable', body); forged.request_id = contentId(forged);
  validateContractRequest(forged); // JSON consistency does not authenticate syntax.
  assert.throws(() => validateContractRequest(forged, { scan: d.structural, repository: d.repository }), { code: 'INVALID_SEMANTICS' });
  const stale = structuredClone(d.request); stale.data.callables[0].start_byte++; stale.request_id = contentId(stale);
  assert.throws(() => validateContractRequest(stale), { code: 'INVALID_SEMANTICS' });
  const accepted = structuredClone(d.model); accepted.data.claim_checks[0].verification = 'supported'; accepted.artifact_id = contentId(accepted);
  assert.throws(() => validateContractModel(accepted), { code: 'INVALID_SEMANTICS' });
});

test('inspection reports direct links and source-check scope; context preserves required conditions and critical unknowns', t => {
  const d = setup(t);
  const catalog = inspectSemantic(d.model); assert.equal(catalog.catalog.functions.length, 5); assert.equal(catalog.records.functions.length, 0);
  const view = inspectSemantic(d.model, { id: id('function', 1) });
  assert.equal(view.checks.source_rechecked, false); assert(view.records.functions.some(f => f.id === id('function', 5)));
  assert.equal(inspectSemantic(d.model, { behavior: 'response-selection' }, { scan: d.structural, repository: d.repository }).checks.source_rechecked, true);
  const selection = { capability: 'select-response', behavior: 'response-selection' };
  const pack = createContextPack(d.model, selection, { maxBytes: 65536, includeNeighbors: false });
  assert.equal(Buffer.byteLength(serializeContextPack(pack)), pack.budget.used_bytes);
  assert.equal(pack.records.behaviors[0].outcomes.length, 2);
  assert.equal(pack.records.flows[0].steps[0].next.length, 2);
  assert.deepEqual(pack.records.unknowns.map(u => u.id), [id('unknown', 1), id('unknown', 2)]);
  assert.equal(pack.records.functions.length, 5); assert.equal(pack.checks.claim_support, 'not-reviewed');
  assert.equal(pack.records.behaviors[0].failures[0].condition, 'The handler rejects.');
  assert.deepEqual(pack, createContextPack(d.model, selection, { maxBytes: 65536, includeNeighbors: false }));
  assert.throws(() => createContextPack(d.model, selection, { maxBytes: 100 }), { code: 'CONTEXT_BUDGET' });
  assert.throws(() => createContextPack(d.model, {}, { maxBytes: 65536 }), { code: 'INVALID_SELECTION' });
  assert.throws(() => inspectSemantic(d.model, { capability: 'missing' }), { code: 'INVALID_SELECTION' });
  const changed = structuredClone(d.model); changed.data.proposal.data.claims[0].text = 'tampered';
  assert.throws(() => inspectSemantic(changed), { code: 'INVALID_SEMANTICS' });
});

test('CLI contract import, inspect, context, and validate retain source/output protection', t => {
  const d = setup(t); const cli = join(root, 'dist/cli/main.js');
  for (const [name, value] of Object.entries({ scan: d.structural, request: d.request, proposal: d.proposal, model: d.model })) writeFileSync(join(d.directory, name + '.json'), JSON.stringify(value));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const path = name => join(d.directory, name + '.json');
  const proposed = run('propose', path('scan'), '--repository', d.repository, '--instruction', d.options.instruction, '--schema-version', '0.2.0');
  assert.equal(proposed.status, 0, proposed.stderr); assert.deepEqual(JSON.parse(proposed.stdout), d.request);
  const imported = run('replay', path('proposal'), '--scan', path('scan'), '--request', path('request'), '--repository', d.repository);
  assert.equal(imported.status, 0, imported.stderr); assert.deepEqual(JSON.parse(imported.stdout), d.model);
  for (const name of ['model', 'request', 'proposal']) {
    const args = name === 'proposal' ? ['--request', path('request')] : [];
    const checked = run('validate', path(name), '--scan', path('scan'), '--repository', d.repository, ...args);
    assert.equal(checked.status, 0, checked.stderr);
  }
  assert.equal(JSON.parse(run('inspect', path('model')).stdout).checks.source_rechecked, false);
  assert.equal(JSON.parse(run('inspect', path('model'), '--scan', path('scan'), '--repository', d.repository).stdout).checks.source_rechecked, true);
  const context = run('context', path('model'), '--capability', 'select-response', '--max-bytes', '65536', '--repository', d.repository, '--out', path('context'));
  assert.equal(context.status, 0, context.stderr); assert.equal(context.stdout, readFileSync(path('context'), 'utf8'));
  assert.equal(Buffer.byteLength(context.stdout), JSON.parse(context.stdout).budget.used_bytes);
  assert.equal(JSON.parse(context.stdout).checks.source_rechecked, false);
  const inside = join(d.repository, 'context.json');
  assert.equal(run('context', path('model'), '--capability', 'select-response', '--max-bytes', '65536', '--repository', d.repository, '--out', inside).status, 2); assert(!existsSync(inside));
  assert.equal(run('context', path('model'), '--capability', 'select-response', '--max-bytes', '1', '--repository', d.repository, '--out', path('too-small')).status, 2); assert(!existsSync(path('too-small')));
  assert.equal(git(d.repository, 'status', '--porcelain'), '');
});

test('context omits optional neighbors explicitly and does not expand attribution into unrelated behavior', t => {
  const d = setup(t); const proposal = structuredClone(d.proposal);
  const extraCap = { ...structuredClone(proposal.data.concepts[0]), id: id('concept', 20), alias: 'diagnostic-view' };
  const extraClaim = { ...structuredClone(proposal.data.claims[0]), id: id('claim', 20), subject_ids: [extraCap.id], category: 'constraint', text: 'The diagnostic view needs a separate caller constraint: π 中文.' };
  const extraFlow = { ...structuredClone(proposal.data.flows[0]), id: id('flow', 20), capability_id: extraCap.id, entry_step_ids: [id('step', 20)], steps: [{ ...structuredClone(proposal.data.flows[0].steps[1]), id: id('step', 20), claim_ids: [extraClaim.id], next: [] }] };
  const extraBehavior = { ...structuredClone(proposal.data.behaviors[0]), id: id('behavior', 20), alias: 'diagnostic-state', capability_id: extraCap.id, trigger_claim_ids: [extraClaim.id], flow_id: extraFlow.id, step_ids: [id('step', 20)] };
  proposal.data.concepts.push(extraCap); proposal.data.claims.push(extraClaim); proposal.data.flows.push(extraFlow); proposal.data.behaviors.push(extraBehavior);
  proposal.data.unknowns.push({ id: id('unknown', 20), subject_id: extraCap.id, critical: true, question: 'What restrictions does the diagnostic caller impose?', evidence_ids: [] });
  // Shared assertion attribution alone must not select the diagnostic capability.
  proposal.data.claims[0].subject_ids.push(extraCap.id);
  const model = importContractProposal(d.request, proposal, { scan: d.structural, repository: d.repository });
  const selection = { capability: 'select-response' };
  const pack = createContextPack(model, selection, { maxBytes: 65536, includeNeighbors: false });
  assert(pack.omissions.record_ids.includes(extraBehavior.id));
  assert(pack.omissions.record_ids.includes(extraClaim.id));
  assert(pack.omissions.record_ids.includes(id('unknown', 20)));
  const expanded = createContextPack(model, selection, { maxBytes: 65536 });
  assert(expanded.records.behaviors.some(b => b.id === extraBehavior.id));
  assert(expanded.records.unknowns.some(u => u.id === id('unknown', 20)));
  assert(expanded.records.claims.some(c => c.id === extraClaim.id));
  assert.equal(Buffer.byteLength(serializeContextPack(expanded)), expanded.budget.used_bytes);
  assert(expanded.budget.required_bytes < expanded.budget.used_bytes);
  const tight = createContextPack(model, selection, { maxBytes: pack.budget.used_bytes + 100 });
  assert(tight.omissions.record_ids.includes(extraBehavior.id));
  assert.deepEqual(tight.records.behaviors[0].outcomes, pack.records.behaviors[0].outcomes);
  assert.throws(() => createContextPack(model, selection, { maxBytes: pack.budget.used_bytes - 100 }), { code: 'CONTEXT_BUDGET' });
});

test('narrative text that resembles record IDs does not create query dependencies', t => {
  const d = setup(t); const p = structuredClone(d.proposal);
  p.data.functions[0].title = 'claim: this is a title, not an assertion reference';
  p.data.functions[0].failures[0].condition = 'evidence: this is a condition, not a source reference';
  const model = importContractProposal(d.request, p, { scan: d.structural, repository: d.repository });
  const pack = createContextPack(model, { capability: 'select-response' }, { maxBytes: 65536 });
  assert.equal(pack.records.functions[0].title, p.data.functions[0].title);
  assert(!pack.deferred_evidence_ids.some(id => id.includes('this is')));
});
