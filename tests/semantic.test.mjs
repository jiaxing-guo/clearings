import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scan, createProposalRequest, importProposal, validateRequest, validateProposal, validateSemanticModel, renderCapability, createEvidenceReader, createPresentationPlan } from '../dist/index.js';
import { contentId, digest } from '../dist/semantics/identity.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'dist/cli/main.js');
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function setup(t, fixture = 'direct-calls') {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-semantics-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo'); cpSync(join(root, 'tests/fixtures', fixture), repository, { recursive: true });
  git(repository, 'init', '-q', '--template='); git(repository, 'add', '.');
  git(repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
  const result = scan({ repository });
  const request = createProposalRequest(result, { repository, instruction: 'Explain the public greeting behavior.' });
  return { directory, repository, result, request };
}
const id = (kind, n) => `${kind}:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function proposalFor(request) {
  const anchor = request.data.evidence.find((item) => item.path === 'index.ts');
  const symbol = request.data.symbols.find((item) => item.name === 'welcome');
  return {
    schema_version: '0.1.0', command: 'proposal', request_id: request.request_id, snapshot_id: request.snapshot_id,
    producer: { kind: 'human', name: 'Original test fixture author', model: null, input_tokens: null, output_tokens: null },
    data: {
      concepts: [{ id: id('concept', 1), kind: 'capability', alias: 'greet', title: 'Greet a caller', description: 'Produce a greeting through a helper.', evidence_ids: [anchor.id], symbol_ids: [symbol.id] }],
      claims: [{ id: id('claim', 1), text: 'welcome delegates to greeting.', subject_ids: [id('concept', 1)], evidence_ids: [anchor.id], category: 'behavior' }],
      relations: [], unknowns: [], flows: [{ id: id('flow', 1), capability_id: id('concept', 1), entry_symbol_ids: [symbol.id], entry_step_ids: [id('step', 1)],
        steps: [{ id: id('step', 1), title: 'Call the helper', kind: 'action', claim_ids: [id('claim', 1)], evidence_ids: [anchor.id], next: [] }] }],
    },
  };
}
const options = (data, replay = false) => ({ scan: data.result, repository: data.repository, replay });

test('requests are bounded, source-verified, portable, and deterministic; readers capture immutable evidence', (t) => {
  const data = setup(t); const { request, result, repository } = data;
  validateRequest(request, { scan: result, repository });
  assert.equal(JSON.stringify(createProposalRequest(result, { repository, instruction: 'Explain the public greeting behavior.' })), JSON.stringify(request));
  assert(!JSON.stringify(request).includes(repository));
  assert(request.coverage.omitted_scope_evidence > 0);
  assert.throws(() => createProposalRequest(result, { repository, instruction: 'Explain', maxBytes: 100 }), { code: 'REQUEST_BUDGET' });
  assert.throws(() => createProposalRequest(result, { repository, instruction: 'Explain', paths: ['outside.ts'] }), { code: 'INVALID_SCOPE' });
  const selected = createProposalRequest(result, { repository, instruction: 'Explain one declaration', paths: ['index.ts'], evidenceIds: [request.data.evidence.find((item) => item.path === 'index.ts').id] });
  assert.equal(selected.data.evidence.length, 1);
  const item = result.data.evidence[0]; const reader = createEvidenceReader(result, repository); const expected = reader.read(item.id); const evidenceId = item.id;
  item.start_byte = item.end_byte; item.span_sha256 = '0'.repeat(64);
  assert.equal(reader.read(evidenceId), expected);
});

test('file exchange and replay preserve IDs while citation integrity never certifies claim meaning', (t) => {
  const data = setup(t); const proposal = proposalFor(data.request);
  const model = importProposal(data.request, proposal, options(data));
  validateSemanticModel(model, { scan: data.result, repository: data.repository });
  assert.equal(model.data.transport, 'file-exchange');
  assert(model.data.claim_checks.every((item) => item.verification === 'unknown' && item.acceptance === 'proposed'));
  const replay = importProposal(data.request, proposal, options(data, true));
  assert.equal(replay.data.transport, 'recorded-replay');
  assert.equal(JSON.stringify(replay), JSON.stringify(importProposal(data.request, proposal, options(data, true))));
  assert.deepEqual(replay.data.proposal.data, model.data.proposal.data);
  proposal.data.claims[0].text = 'welcome writes a database and sends an email.';
  const unsupported = importProposal(data.request, proposal, options(data));
  assert.equal(unsupported.data.claim_checks[0].verification, 'unknown');
  assert.equal(unsupported.coverage.claim_support, 'not-reviewed');
  assert.equal(unsupported.data.proposal.data.claims[0].id, model.data.proposal.data.claims[0].id);
});

test('proposal validation rejects dangling, stale, self-certified, and contradictory record structure', (t) => {
  const { request } = setup(t); const original = proposalFor(request);
  const mutations = [
    (p) => { p.request_id = 'request:' + '0'.repeat(64); },
    (p) => { p.data.claims[0].verification = 'supported'; },
    (p) => { p.data.claims[0].evidence_ids = ['evidence:' + '0'.repeat(64)]; },
    (p) => { p.data.claims[0].subject_ids = [id('concept', 2)]; },
    (p) => { p.data.concepts.push(structuredClone(p.data.concepts[0])); },
    (p) => { p.data.flows[0].steps[0].next.push({ step_id: id('step', 2), condition: null, evidence_ids: p.data.claims[0].evidence_ids }); },
    (p) => { p.data.flows[0].steps[0].kind = 'branch'; },
    (p) => { p.data.relations.push({ id: id('relation', 1), kind: 'writes', from_id: id('concept', 1), to_id: id('concept', 1), evidence_ids: p.data.claims[0].evidence_ids }); },
  ];
  for (const mutate of mutations) { const p = structuredClone(original); mutate(p); assert.throws(() => validateProposal(p, request), { code: 'INVALID_SEMANTICS' }); }
  const cyclic = structuredClone(original); cyclic.data.flows[0].steps[0].kind = 'repeat';
  cyclic.data.flows[0].steps[0].next = [{ step_id: id('step', 1), condition: 'another invocation', evidence_ids: cyclic.data.claims[0].evidence_ids }];
  validateProposal(cyclic, request);
});

test('every step with multiple outgoing edges requires nonblank labels', (t) => {
  const { request } = setup(t);
  for (const kind of ['action', 'branch', 'repeat', 'failure', 'unresolved']) {
    const proposal = proposalFor(request);
    const flow = proposal.data.flows[0]; const step = flow.steps[0];
    flow.steps.push({ ...structuredClone(step), id: id('step', 2) });
    step.kind = kind;
    step.next = [
      { step_id: step.id, condition: 'retry', evidence_ids: step.evidence_ids },
      { step_id: id('step', 2), condition: 'finish', evidence_ids: step.evidence_ids },
    ];
    validateProposal(proposal, request);
    for (const condition of [null, ' ', '\t\n']) {
      for (const index of [0, 1]) {
        const invalid = structuredClone(proposal);
        invalid.data.flows[0].steps[0].next[index].condition = condition;
        assert.throws(() => validateProposal(invalid, request), { code: 'INVALID_SEMANTICS' });
      }
    }
  }
  const single = proposalFor(request); const step = single.data.flows[0].steps[0];
  step.next = [{ step_id: step.id, condition: null, evidence_ids: step.evidence_ids }];
  validateProposal(single, request);
});

test('request and model tampering cannot reuse source evidence from another scan', (t) => {
  const data = setup(t); const request = structuredClone(data.request);
  const excerpt = request.data.evidence[0]; excerpt.text = excerpt.text.replace(/[a-z]/, 'Z');
  excerpt.span_sha256 = createHash('sha256').update(excerpt.text).digest('hex');
  const { id: _, path: __, text: ___, ...anchor } = excerpt; excerpt.id = digest('evidence', anchor);
  request.request_id = contentId(request);
  validateRequest(request); // Self-consistent forgery still must fail against the scan.
  assert.throws(() => validateRequest(request, { scan: data.result, repository: data.repository }), { code: 'INVALID_SEMANTICS' });
  const model = importProposal(data.request, proposalFor(data.request), options(data));
  model.data.claim_checks[0].acceptance = 'accepted'; model.artifact_id = contentId(model);
  assert.throws(() => validateSemanticModel(model), { code: 'INVALID_SEMANTICS' });
  writeFileSync(join(data.repository, 'index.ts'), 'export function welcome() { return "changed"; }');
  git(data.repository, 'add', '.'); git(data.repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Changed behavior');
  const changed = scan({ repository: data.repository });
  assert.throws(() => validateRequest(data.request, { scan: changed, repository: data.repository }), { code: 'INVALID_SEMANTICS' });
  validateRequest(data.request, { scan: data.result, repository: data.repository });
});

test('human pages expose provenance, unknowns, branches and evidence while escaping proposal HTML', (t) => {
  const data = setup(t); const p = proposalFor(data.request);
  p.data.claims[0].text += '\n<script>alert(1)</script> [link](https://invalid.example)';
  p.data.unknowns.push({ subject_id: id('concept', 1), question: 'Caller input guarantees are outside this scope.', critical: true, evidence_ids: [] });
  p.data.concepts.push({ ...structuredClone(p.data.concepts[0]), id: id('concept', 2), kind: 'state', alias: 'shared-state' });
  p.data.unknowns.push({ subject_id: id('concept', 2), question: 'Critical uncertainty about shared state.', critical: true, evidence_ids: [] });
  const page = renderCapability(importProposal(data.request, p, options(data, true)), 'greet');
  assert(page.includes('Critical uncertainty about shared state'));
  assert(page.includes('recorded-replay')); assert(page.includes('unreviewed')); assert(page.includes('**Critical:**'));
  assert(page.includes('UTF-8 bytes')); assert(page.includes('welcome')); assert(page.includes('## Evidence'));
  assert(!page.includes('<script>')); assert(!page.includes('[link](https://invalid.example)'));
});

test('partial source scans keep failures visible in evidence requests', (t) => {
  const data = setup(t, 'negative');
  assert.equal(data.request.status, 'partial');
  assert.equal(data.request.data.scan_coverage.failed_source_files, 1);
  assert(data.request.data.files.some((file) => file.status === 'failed'));
  validateRequest(data.request, { scan: data.result, repository: data.repository });
});

test('CLI exports, imports, replays, validates and renders without target writes or implicit execution', (t) => {
  const data = setup(t); const { directory, repository, result } = data;
  const scanPath = join(directory, 'scan.json'); writeFileSync(scanPath, JSON.stringify(result));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const requestPath = join(directory, 'request.json');
  const before = git(repository, 'status', '--porcelain');
  const exported = run('propose', scanPath, '--repository', repository, '--instruction', 'Explain greeting', '--out', requestPath);
  assert.equal(exported.status, 0, exported.stderr); assert.equal(exported.stdout, readFileSync(requestPath, 'utf8'));
  const request = JSON.parse(exported.stdout); const proposalPath = join(directory, 'proposal.json'); writeFileSync(proposalPath, JSON.stringify(proposalFor(request)));
  const invalidPath = join(directory, 'invalid-proposal.json'); const invalid = proposalFor(request); invalid.data.claims[0].verification = 'supported';
  const invalidBytes = JSON.stringify(invalid); writeFileSync(invalidPath, invalidBytes);
  const rejectedOut = join(directory, 'rejected-model.json');
  assert.equal(run('import', invalidPath, '--request', requestPath, '--scan', scanPath, '--repository', repository, '--out', rejectedOut).status, 2);
  assert.equal(readFileSync(invalidPath, 'utf8'), invalidBytes); assert(!existsSync(rejectedOut));
  const modelPath = join(directory, 'semantic.json');
  const args = [proposalPath, '--request', requestPath, '--scan', scanPath, '--repository', repository];
  assert.equal(run('import', ...args, '--out', modelPath).status, 0);
  const one = run('replay', ...args); const two = run('replay', ...args);
  assert.equal(one.status, 0, one.stderr); assert.equal(one.stdout, two.stdout);
  assert.equal(run('validate', modelPath, '--scan', scanPath, '--repository', repository).status, 0);
  assert.equal(run('validate', proposalPath, '--request', requestPath, '--scan', scanPath, '--repository', repository).status, 0);
  const page = run('explain', modelPath, '--scan', scanPath, '--repository', repository, '--capability', 'greet');
  assert.equal(page.status, 0, page.stderr); assert(page.stdout.startsWith('# Greet'));
  const planPath = join(directory, 'presentation.json');
  const presentation = createPresentationPlan(JSON.parse(readFileSync(modelPath, 'utf8')), 'greet');
  writeFileSync(planPath, JSON.stringify(presentation));
  const htmlPath = join(directory, 'guide.html');
  const html = run('explain', modelPath, '--scan', scanPath, '--repository', repository, '--capability', 'greet', '--presentation', planPath, '--format', 'html', '--out', htmlPath);
  assert.equal(html.status, 0, html.stderr); assert.equal(html.stdout, readFileSync(htmlPath, 'utf8')); assert(html.stdout.startsWith('<!doctype html>'));
  assert.equal(run('explain', modelPath, '--scan', scanPath, '--repository', repository, '--capability', 'greet', '--format', 'pdf').status, 2);
  presentation.semantic_artifact_id = 'semantic:' + '0'.repeat(64); writeFileSync(planPath, JSON.stringify(presentation));
  const rejectedPage = join(directory, 'stale.html');
  const stale = run('explain', modelPath, '--scan', scanPath, '--repository', repository, '--capability', 'greet', '--presentation', planPath, '--format', 'html', '--out', rejectedPage);
  assert.equal(stale.status, 2); assert(!existsSync(rejectedPage));
  const lookup = run('evidence', scanPath, '--repository', repository, '--id', request.data.evidence[0].id);
  assert.equal(lookup.status, 0); assert.equal(JSON.parse(lookup.stdout).data.text, request.data.evidence[0].text);
  assert.equal(run('import', ...args, '--out', modelPath).status, 2);
  assert.equal(run('replay', ...args, '--out', join(repository, 'forbidden.json')).status, 2);
  assert(!existsSync(join(repository, 'forbidden.json')));
  assert.equal(git(repository, 'status', '--porcelain'), before);
});

test('report CLI encodes terminal controls while preserving exact files and redirected output', (t) => {
  const data = setup(t); const { repository, directory } = data;
  const payload = '\u001b[31mred\u001b[0m \u001b]0;title\u0007 \u009b2J \u009d0;title\u009c';
  const sourcePath = join(repository, 'index.ts');
  writeFileSync(sourcePath, readFileSync(sourcePath, 'utf8').replace('  return ', `  // ${payload}\n  return `));
  git(repository, 'add', 'index.ts');
  git(repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Add source controls');
  const structural = scan({ repository });
  const request = createProposalRequest(structural, { repository, instruction: 'Explain greeting.' });
  assert(request.data.evidence.some(item => item.text.includes(payload)));
  const proposal = proposalFor(request); proposal.data.claims[0].text += ` ${payload}\r\b`;
  const model = importProposal(request, proposal, { scan: structural, repository, replay: true });
  const scanPath = join(directory, 'scan.json'); const modelPath = join(directory, 'semantic.json');
  writeFileSync(scanPath, JSON.stringify(structural)); writeFileSync(modelPath, JSON.stringify(model));
  const cliArgs = ['explain', modelPath, '--scan', scanPath, '--repository', repository, '--capability', 'greet'];
  for (const format of ['markdown', 'html']) {
    const exact = renderCapability(model, 'greet', { format });
    assert(exact.includes(payload));
    const pipe = spawnSync(process.execPath, [cli, ...cliArgs, '--format', format], { encoding: 'utf8' });
    assert.equal(pipe.status, 0, pipe.stderr); assert.equal(pipe.stdout, exact);
    for (const save of [false, true]) {
      const outputPath = join(directory, `report-${format}.${format === 'html' ? 'html' : 'md'}`);
      const args = [...cliArgs, '--format', format, ...(save ? ['--out', outputPath] : [])];
      const bootstrap = `Object.defineProperty(process.stdout, 'isTTY', { value: true }); process.argv = [process.execPath, ${JSON.stringify(cli)}, ...${JSON.stringify(args)}]; await import(${JSON.stringify(pathToFileURL(cli).href)});`;
      const tty = spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], { encoding: 'utf8' });
      assert.equal(tty.status, 0, tty.stderr);
      assert(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(tty.stdout));
      assert(tty.stdout.includes('\\u001b[31mred\\u001b[0m'));
      assert(tty.stdout.includes('\\u009b2J'));
      if (save) assert.equal(readFileSync(outputPath, 'utf8'), exact);
    }
  }
});
