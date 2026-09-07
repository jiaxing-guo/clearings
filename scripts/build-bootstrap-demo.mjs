// Continuing-session author bootstrap. Runs Clearings on original fixtures;
// checks authored Hono scenarios without executing Hono. No model call occurs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { assembleContext, serializeOperationContext, sealSpecification, checkOperation, renderSpecification, specificationIdentity } from '../dist/index.js';

const root = new URL('../', import.meta.url);
const output = resolve(process.argv[2] ?? 'benchmarks/results/local/bootstrap-review');
if (existsSync(output)) throw new Error('Use a new output directory.');
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const intended = read('specifications/clearings/context-assembly.json');
const observed = read('specifications/hono/response-selection.json');
const files = {}, assemblyCases = [], honoCases = [], faults = [];
const literal = value => ({ kind: 'literal', value });
function operation(id, required = [], optional = []) {
  return { id, alias: id, name: id, purpose: `Provide ${id}'s own rules. Unicode example: 条件 🌱.`, inputs: {}, output: { kind: 'null' },
    reads: [], writes: [], frame: 'complete', effects: { completeness: 'complete', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
    outcomes: [{ id: `outcome:${id}`, description: 'Return without changing modeled state.', when: literal(true), ensures: [], updates: [], effects: [], transitions: [], evidence_ids: [] }],
    guarantees: [], dependencies: [...required.map(operation_id => ({ operation_id, requirement: 'required' })), ...optional.map(operation_id => ({ operation_id, requirement: 'optional' }))].map(dep => ({ ...dep, kind: 'uses-contract', role: `${id} uses the rules of ${dep.operation_id}.` })),
    implementations: [{ name: `${id}Impl`, responsibility: `Carry out ${id}'s own operation.`, symbol_id: null, evidence_ids: [] }], decisions: [], evidence_ids: [] };
}
const fixture = operations => sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Original dependency fixture', perspective: 'intended',
  provenance: { author: 'Clearings bootstrap author', origin: 'user-directed-design', review: 'proposed', notes: ['Original evaluation input. No target source is executed.'] }, states: [], operations, sources: [] });
// An independent fixed-point algorithm checks minimal membership. Production
// uses a queue; this reference repeatedly scans the original operation list.
function referenceClosure(spec, rootId) {
  const selected = new Set([rootId]); let size;
  do { size = selected.size; for (const op of spec.operations) if (selected.has(op.id)) for (const dep of op.dependencies) if (dep.requirement === 'required') selected.add(dep.operation_id); } while (size !== selected.size);
  return [...selected].sort();
}
function input(spec, rootId, maxBytes) {
  return { root_id: rootId, available_ids: spec.operations.map(op => op.id), required_edges: spec.operations.flatMap(op => op.dependencies.filter(dep => dep.requirement === 'required').map(dep => ({ from: op.id, to: dep.operation_id }))),
    applicable_decisions: spec.operations.flatMap(op => op.decisions.map(decision => ({ operation_id: op.id, decision_id: decision.id }))), artifact_id: spec.artifact_id, max_bytes: maxBytes };
}
function checked(name, observation, target = intended, operation_id = 'assemble-context') {
  const result = checkOperation(target, operation_id, observation);
  assert.equal(result.verdict, 'pass', `${name}: ${pretty(result)}`);
  return { name, operation_id, observation, result };
}
function runAssembly(name, spec, rootId = 'root', maxBytes = 65536) {
  const before = hash(JSON.stringify(spec));
  const pack = assembleContext(spec, rootId, { maxBytes });
  const bytes = serializeOperationContext(pack);
  assert.equal(before, hash(JSON.stringify(spec)));
  assert.equal(bytes, serializeOperationContext(assembleContext(spec, rootId, { maxBytes })));
  assert.equal(Buffer.byteLength(bytes), pack.budget.used_bytes);
  assert.deepEqual(pack.operations.map(op => op.id).sort(), referenceClosure(spec, rootId));
  for (const op of pack.operations) assert.deepEqual(op, spec.operations.find(item => item.id === op.id));
  const observation = { input: input(spec, rootId, maxBytes), before: { 'model-digest': before }, after: { 'model-digest': hash(JSON.stringify(spec)) }, effects: [], outcome: 'outcome:ready',
    output: { kind: 'ready', included_ids: pack.operations.map(op => op.id), omitted_ids: pack.omissions.operation_ids, decision_ids: pack.operations.flatMap(op => op.decisions.map(decision => decision.id)), artifact_id: pack.artifact_id, used_bytes: Buffer.byteLength(bytes), required_bytes: pack.budget.required_bytes } };
  assemblyCases.push(checked(name, observation));
  return { pack, observation };
}
function runError(name, spec, rootId, maxBytes, code, outcome, kind) {
  const before = hash(JSON.stringify(spec)); let error;
  try { assembleContext(spec, rootId, { maxBytes }); } catch (caught) { error = caught; }
  assert.equal(error?.code, code, name);
  assert.equal(hash(JSON.stringify(spec)), before);
  const required = code === 'CONTEXT_BUDGET' ? Number(error.message.match(/needs (\d+) bytes/)[1]) : 0;
  const observation = { input: input(spec, rootId, maxBytes), before: { 'model-digest': before }, after: { 'model-digest': hash(JSON.stringify(spec)) }, effects: [], outcome,
    output: { kind, included_ids: [], omitted_ids: [], decision_ids: [], artifact_id: spec.artifact_id, used_bytes: 0, required_bytes: required } };
  assemblyCases.push({ ...checked(name, observation), actual_error: { code, message: error.message } });
}
const single = fixture([operation('root')]);
runAssembly('One operation keeps its complete meaning', single);
const diamond = fixture([operation('root', ['left', 'right']), operation('left', ['shared']), operation('right', ['shared']), operation('shared')]);
runAssembly('A shared dependency appears once', diamond);
const cycleOps = [operation('root', ['left', 'right'], ['optional', 'missing-optional']), operation('left', ['shared']), operation('right', ['shared']), operation('shared', ['root']), operation('optional')];
cycleOps[3].decisions.push({ id: 'decision:callback', question: 'Can the callback write external state?', consequence: 'Do not assume purity.', disposition: 'unresolved-requirement', blocking: true, evidence_ids: [] });
const cyclic = fixture(cycleOps);
const cyclicResult = runAssembly('A cycle terminates and retains its blocking decision', cyclic);
assert.equal(cyclicResult.pack.omissions.deferred_dependencies.length, 2);
let exact = assembleContext(single, 'root', { maxBytes: 65536 });
for (let n = 0; n < 6 && exact.budget.max_bytes !== exact.budget.used_bytes; n++) exact = assembleContext(single, 'root', { maxBytes: exact.budget.used_bytes });
assert.equal(exact.budget.max_bytes, exact.budget.used_bytes);
runAssembly('An exact byte budget succeeds, including Unicode and counters', single, 'root', exact.budget.used_bytes);
runError('One byte too little returns an explicit size error', single, 'root', exact.budget.used_bytes - 1, 'CONTEXT_BUDGET', 'outcome:budget', 'budget-exceeded');
runError('An absent root returns an explicit selection error', single, 'absent', 65536, 'INVALID_SELECTION', 'outcome:selection', 'invalid-selection');
runError('An invalid budget returns an explicit budget error', single, 'root', 0, 'INVALID_BUDGET', 'outcome:invalid-budget', 'invalid-budget');
const missing = structuredClone(single); missing.operations[0].dependencies.push({ operation_id: 'absent', requirement: 'required', kind: 'uses-contract', role: 'Required behavior is unavailable.' }); missing.artifact_id = specificationIdentity(missing);
runError('An absent required dependency prevents a partial result', missing, 'root', 65536, 'MISSING_REQUIRED_DEPENDENCY', 'outcome:dependency', 'missing-dependency');
const self = runAssembly('Clearings assembles its own context-assembly specification', intended, 'assemble-context', 131072);

for (const [name, mutate] of [
  ['Dropped required dependency', o => { o.output.included_ids = ['root']; o.output.omitted_ids = ['left', 'right', 'shared', 'optional']; }],
  ['Lost blocking decision', o => { o.output.decision_ids = []; }],
  ['Included an unrelated available operation', o => { o.output.included_ids.push('optional'); o.output.omitted_ids = o.output.omitted_ids.filter(id => id !== 'optional'); }],
  ['Wrong artifact identity', o => { o.output.artifact_id = 'wrong'; }],
  ['Duplicate operation', o => { o.output.included_ids.push('shared'); }],
  ['Claimed success above the budget', o => { o.output.used_bytes = o.input.max_bytes + 1; }],
  ['Changed input model', o => { o.after['model-digest'] = 'changed'; }],
  ['Included operation also listed as omitted', o => { o.output.omitted_ids.push('shared'); }],
]) {
  const observation = structuredClone(cyclicResult.observation); mutate(observation);
  const result = checkOperation(intended, 'assemble-context', observation);
  assert.equal(result.verdict, 'fail', name);
  faults.push({ name, method: 'injected incorrect observation; not a separately compiled faulty implementation', observation, result });
}

for (const [name, path, value, finalized, outcome, result] of [
  ['A direct missing result calls not-found even after finalization', 'direct', 'nullish', true, 'direct-missing', 'not-found'],
  ['A direct non-nullish falsy value is returned', 'direct', 'non-nullish-falsy', true, 'direct-value', 'handler-result'],
  ['A Promise with a falsy value can use the finalized context', 'promise', 'nullish', true, 'promise-context', 'context-response'],
  ['A Promise without a value or finalized context calls not-found', 'promise', 'nullish', false, 'promise-missing', 'not-found'],
  ['A truthy Promise value wins', 'promise', 'truthy', false, 'promise-value', 'handler-result'],
  ['Composed execution needs finalization', 'composed', 'truthy', false, 'composed-unfinalized', 'finalization-error'],
]) honoCases.push(checked(name, { input: { path, value }, before: { finalized }, outcome: `outcome:${outcome}`, output: result }, observed, 'response-selection'));
honoCases.push(checked('Reading missing response storage does not finalize the context', { input: {}, before: { finalized: false, 'response-present': false }, after: { finalized: false, 'response-present': true }, outcome: 'outcome:get-create', output: 'created-response' }, observed, 'read-response'));
honoCases.push(checked('An undefined setter assignment can finalize without response storage', { input: { assigned: 'undefined', merge_succeeds: true }, before: { finalized: false, 'response-present': false }, after: { finalized: true, 'response-present': false }, outcome: 'outcome:set-success', output: 'stored' }, observed, 'store-response'));
honoCases.push(checked('An error-handler result can replace a finalized response', { input: { truthy_result: true, error_result: true }, before: { finalized: true }, outcome: 'outcome:middleware-assign', output: 'assign' }, observed, 'middleware-result'));

// Explicit author mappings. Syntax supplies exact spans, not proof of meaning.
const mappings = [
  ['assemble-context', 'src/specification/context.ts', 'assembleContext'],
  ['select-required', 'src/analysis/dependencies.ts', 'requiredClosure'],
  ['project-operation', 'src/specification/context.ts', 'assembleContext'],
  ['project-operation', 'src/specification/render.ts', 'renderOperationContext'],
  ['measure-package', 'src/analysis/budget.ts', 'accountBytes'],
];
const bindings = mappings.map(([operation_id, path, name]) => {
  const source = readFileSync(new URL(path, root), 'utf8'), file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert(declaration, `${path}: ${name}`);
  const start = declaration.getStart(file), end = declaration.end, text = source.slice(start, end);
  return { operation_id, function: name, path, file_sha256: hash(source), start_byte: Buffer.byteLength(source.slice(0, start)), end_byte: Buffer.byteLength(source.slice(0, end)), start_line: file.getLineAndCharacterOfPosition(start).line + 1, end_line: file.getLineAndCharacterOfPosition(end - 1).line + 1, text, sha256: hash(text), support: 'author-mapped; conformance checked only for the recorded cases' };
});
files['clearings.specification.json'] = pretty(intended);
files['clearings.context.json'] = serializeOperationContext(self.pack);
files['hono.specification.json'] = pretty(observed);
files['hono.context.json'] = serializeOperationContext(assembleContext(observed, 'response-selection', { maxBytes: 131072 }));
files['clearings.scenarios.json'] = pretty(assemblyCases);
files['hono.scenarios.json'] = pretty(honoCases);
files['counterexamples.json'] = pretty(faults);
files['implementation-bindings.json'] = pretty({ artifact_id: intended.artifact_id, snapshot_kind: 'working-file-content-hashes', source_inference: false, bindings });
for (const [name, spec, selection, scenarios] of [['clearings', intended, 'assemble-context', assemblyCases], ['hono', observed, 'response-selection', honoCases]]) {
  for (const format of ['html', 'markdown']) {
    const result = renderSpecification(spec, selection, { format, maxBytes: 131072, scenarios });
    assert.equal(result, renderSpecification(spec, selection, { format, maxBytes: 131072, scenarios }));
    files[`${name}.${format === 'html' ? 'html' : 'md'}`] = result;
  }
}
files['LICENSE-HONO'] = readFileSync(new URL('benchmarks/results/hono-contracts/LICENSE-HONO', root), 'utf8');
files['author-development-record.json'] = pretty({ experiment: 'continuing-session author bootstrap', model_called_by_replay: false, independent: false, prior_source_exposure: true,
  intended_artifact_id: intended.artifact_id, observed_hono_artifact_id: observed.artifact_id,
  process: [
    { action: 'Define requirements before the context refactor.', artifact: 'docs/SPECIFICATION_ARCHITECTURE.md' },
    { action: 'Encode conditions, outcomes, frame rules, effects, and decisions.', artifact: 'clearings.specification.json' },
    { action: 'Implement the closed checker and required-context assembler.', artifact: 'implementation-bindings.json' },
    { action: 'Run the assembler on original fixtures and its own intended specification.', artifact: 'clearings.scenarios.json' },
    { action: 'Inject incorrect outputs and require failed checks.', artifact: 'counterexamples.json' },
    { action: 'Keep source interpretation separate and check Hono decision cases.', artifact: 'hono.scenarios.json' },
  ], limitations: ['This record describes the active author session; it is not a saved fresh-agent conversation or an independent experiment.', 'The program is handwritten TypeScript guided by the contract, not generated by a compiler.', 'The observation adapter is trusted test code. No formal refinement proof or effect instrumentation is provided.', 'No agent speed, token savings, or complete behavior coverage is established.'] });
files['index.html'] = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clearings · Typed specification review</title><style>body{font:17px/1.65 system-ui;max-width:800px;margin:auto;padding:28px;color:#24382e;background:#fafaf6}a{color:#256242}li{margin:12px 0}code{overflow-wrap:anywhere}</style></head><body><main><h1>Internal representation for AI coding</h1><p>An operation keeps its conditions, results, state changes, and open decisions together. Agents receive JSON. These pages render the same records for people.</p><ol><li><a href="clearings.html">See Clearings specify its own context assembler</a>. Start with the cycle case, then inspect the rules it checks.</li><li><a href="hono.html">Inspect the Hono response decisions</a>. Compare direct and Promise results, then inspect the response getter.</li><li><a href="clearings.context.json">Open the actual agent context</a>. Every selected operation has its own purpose and implementation responsibilities.</li></ol><p><a href="counterexamples.json">Eight rejected output faults</a> · <a href="implementation-bindings.json">Implementation source bindings</a> · <a href="README.md">Reproduce and review</a></p><p>The Clearings specification expresses proposed intent. The Hono specification records a proposed source interpretation. They are separate artifacts. This is a continuing-session author bootstrap; independent review remains open.</p></main></body></html>\n`;
files['README.md'] = `# Review the typed specification core\n\nOpen index.html. The pages and Markdown copies come from the same operation records as the context JSON. HTML is a human view; agents receive clearings.context.json or hono.context.json.\n\nStart with the cycle case in clearings.html. Does the requirement explain why shared dependencies and blocking decisions must remain? In hono.html, compare direct and Promise fallbacks, then inspect the getter. Each function has its own responsibility.\n\nThe Clearings contract expresses intended behavior. Hono is a separately authored source interpretation over a bounded decision domain. These are proposed records. Scenario checks establish agreement with supplied observations, not source equivalence or complete execution behavior. Hono is not executed.\n\n## Reproduce\n\nFrom the Clearings repository, after npm ci --ignore-scripts:\n\n\`\`\`bash\nnpm run bootstrap:demo -- benchmarks/results/local/new-bootstrap\nnode scripts/check-bootstrap-demo.mjs benchmarks/results/local/new-bootstrap\npython3 scripts/package-shared-demo.py benchmarks/results/local/new-bootstrap\n\`\`\`\n\nUse a new output directory. The author-development-record.json describes the continuing-session process and its limits. implementation-bindings.json contains exact working-source spans and file hashes. It is an explicit author mapping, not proof that code implements the specification.\n\nThe runner checks actual Clearings outputs, byte counts, nonmutation, deterministic serialization, and closure membership against a separate fixed-point algorithm. Effects are recorded from the known pure test path and author source review; the runner does not instrument arbitrary I/O. Counterexamples inject faulty output observations, not compiled implementation variants. Hono cases are authored examples checked against its model, not runtime traces.\n\nThe observation adapter summarizes full packages as IDs and counters. Separate equality checks compare complete included operation records with the input. Source hashes establish content integrity; independent support review remains pending. No fresh-agent benefit or performance claim is made.\n\nBrowser interaction has not been tested in this pass. Local links, escaped text, keyboard scroll controls, viewport metadata, and self-contained assets are checked statically.\n`;
const verification = { format: 'clearings-bootstrap-review.v1', intended_artifact_id: intended.artifact_id, observed_artifact_id: observed.artifact_id,
  actual_clearings_cases: assemblyCases.length, authored_hono_cases: honoCases.length, rejected_output_faults: faults.length, required_closure_reference: 'independent fixed-point set expansion', deterministic: true, input_unchanged: true,
  target_code_executed: false, automatic_source_inference: false, independent_review: false, fresh_agent_trial: false, formal_implementation_proof: false, browser_interaction: 'not-run',
  files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, { bytes: Buffer.byteLength(text), sha256: hash(text) }])) };
files['verification.json'] = pretty(verification);
files['SHA256SUMS'] = Object.entries(files).sort(([a], [b]) => a < b ? -1 : 1).map(([path, text]) => `${hash(text)}  ${path}`).join('\n') + '\n';
for (const [path, text] of Object.entries(files)) { const file = join(output, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text, { flag: 'wx' }); }
console.log(pretty({ output, ...verification, files: Object.keys(files).length }));
