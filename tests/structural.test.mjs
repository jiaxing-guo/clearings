import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, validateScan, readEvidence } from '../dist/index.js';
import { artifactId, recordId } from '../dist/analysis/identity.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, 'dist/cli/main.js');
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function commit(repo) {
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
}
function fixture(t, name) {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-m1-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, 'repo');
  cpSync(join(root, 'tests/fixtures', name), repo, { recursive: true });
  git(repo, 'init', '-q', '--template='); commit(repo);
  return { repo, directory };
}
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const symbolFor = (result, fact) => result.data.symbols.find((symbol) => symbol.id === fact.target_id);

test('direct calls resolve to implementations and scans remain byte-stable across dirty/copy/bare inputs', (t) => {
  const { repo, directory } = fixture(t, 'direct-calls');
  const first = scan({ repository: repo });
  validateScan(first, { repository: repo });
  const call = first.data.facts.find((fact) => fact.kind === 'call' && fact.name === 'greeting');
  assert.equal(call.resolution, 'resolved');
  assert.equal(symbolFor(first, call).name, 'greeting');
  assert.equal(first.coverage.selected_source_files, 3);
  assert.equal(first.coverage.parsed_source_files, 3);
  assert.equal(first.coverage.semantic_analysis, 'not-run');
  writeFileSync(join(repo, 'index.ts'), 'invalid dirty source'); git(repo, 'add', 'index.ts');
  writeFileSync(join(repo, 'untracked.ts'), 'untracked source');
  const beforeIndex = readFileSync(join(repo, '.git/index'));
  const beforeStatus = git(repo, 'status', '--porcelain');
  assert.equal(JSON.stringify(scan({ repository: repo })), JSON.stringify(first));
  assert.deepEqual(readFileSync(join(repo, '.git/index')), beforeIndex);
  assert.equal(git(repo, 'status', '--porcelain'), beforeStatus);
  const copy = join(directory, 'copy'); cpSync(repo, copy, { recursive: true });
  assert.deepEqual(scan({ repository: copy }), first);
  const bare = join(directory, 'bare.git'); git(directory, 'clone', '--bare', repo, bare);
  assert.deepEqual(scan({ repository: bare }), first);
});

test('empty root projects follow references, inherited aliases, and re-export chains', (t) => {
  const { repo } = fixture(t, 'projects');
  const result = scan({ repository: repo });
  validateScan(result, { repository: repo });
  assert.equal(result.status, 'complete');
  assert.equal(result.coverage.selected_source_files, 3);
  assert.equal(result.coverage.parsed_source_files, 3);
  const rootProject = result.data.projects.find((project) => project.config_path === 'tsconfig.json');
  assert.equal(rootProject.source_files.length, 0);
  assert.equal(rootProject.references.length, 2);
  assert(result.data.reads.some((read) => read.path === 'tsconfig.base.json'));
  for (const name of ['clean', 'decorate', 'library.normalize']) {
    const call = result.data.facts.find((fact) => fact.kind === 'call' && fact.name === name);
    assert.equal(call.resolution, 'resolved', name);
    assert.equal(symbolFor(result, call).name, name === 'decorate' ? 'decorate' : 'normalize');
  }
  const imports = result.data.facts.filter((fact) => fact.kind === 'import');
  assert(imports.some((fact) => fact.name === 'Item' && fact.usage === 'type' && fact.resolution === 'resolved'));
  assert(imports.some((fact) => fact.name === 'Other' && fact.usage === 'type'));
  assert(imports.some((fact) => fact.name === '<import-type>' && fact.usage === 'type' && fact.resolution === 'resolved'));
  assert(imports.some((fact) => fact.name === 'clean' && fact.usage === 'runtime'));
  const exported = result.data.facts.find((fact) => fact.kind === 'export' && fact.name === 'publicClean');
  assert.equal(symbolFor(result, exported).name, 'normalize');
});

test('scoped scans label imported source as support and never extract its entire body', (t) => {
  const { repo } = fixture(t, 'projects');
  const result = scan({ repository: repo, include: ['app/src/index.ts'] });
  validateScan(result, { repository: repo });
  assert.equal(result.coverage.selected_source_files, 1);
  assert.equal(result.coverage.support_source_files, 2);
  const support = result.data.files.filter((file) => file.role === 'support').map((file) => file.id);
  assert(result.data.symbols.some((symbol) => support.includes(symbol.file_id)));
  assert(result.data.facts.every((fact) => {
    const subject = result.data.symbols.find((symbol) => symbol.id === fact.subject_id);
    return !support.includes(subject?.file_id ?? fact.subject_id);
  }));
  const excluded = scan({ repository: repo, include: ['app/src/index.ts'], exclude: ['lib/src'] });
  assert.equal(excluded.coverage.support_source_files, 0);
  assert(excluded.data.facts.some((fact) => fact.kind === 'call' && fact.name === 'clean' && fact.resolution === 'unresolved'));
});

test('parse failures stay in coverage and dynamic or unavailable calls have no fabricated targets', (t) => {
  const { repo } = fixture(t, 'negative');
  mkdirSync(join(repo, 'node_modules/not-installed'), { recursive: true });
  writeFileSync(join(repo, 'node_modules/not-installed/index.d.ts'), 'export declare function absent(value: unknown): string;');
  symlinkSync('/outside/snapshot.ts', join(repo, 'escape.ts'));
  git(repo, 'add', 'escape.ts');
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Symlink');
  const result = scan({ repository: repo });
  validateScan(result, { repository: repo });
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.selected_source_files, 3);
  assert.equal(result.coverage.failed_source_files, 1);
  assert.equal(result.coverage.parsed_source_files, 2);
  assert(result.diagnostics.some((diagnostic) => diagnostic.path === 'broken.ts' && diagnostic.code.startsWith('PARSE_')));
  const calls = result.data.facts.filter((fact) => fact.kind === 'call');
  for (const name of ['fn', 'handlers[key]', 'overloaded', 'mutable', 'rebound', 'ExternalClass', 'absent', 'missing']) {
    const call = calls.find((fact) => fact.name === name);
    assert.equal(call.resolution, 'unresolved', name); assert.equal(call.target_id, null, name);
  }
  assert(calls.some((fact) => fact.reason === 'callback-parameter'));
  assert(calls.some((fact) => fact.reason === 'ambiguous-declarations'));
  assert(result.data.facts.some((fact) => fact.kind === 'dynamic-write'));
  assert(!result.data.reads.some((read) => read.path.startsWith('node_modules/') || read.path === 'escape.ts'));
});

test('source evidence preserves UTF-8 bytes, BOM, CRLF and UTF-16 columns', (t) => {
  const { repo } = fixture(t, 'unicode');
  const result = scan({ repository: repo });
  validateScan(result, { repository: repo });
  const call = result.data.facts.find((fact) => fact.kind === 'call' && fact.name === 'café');
  const span = result.data.evidence.find((item) => item.id === call.evidence_ids[0]);
  assert.equal(readEvidence(result, repo, span.id), "café('旅行')");
  assert.equal(span.start_line, 3);
  const raw = readFileSync(join(repo, 'index.ts'));
  assert.equal(raw.subarray(span.start_byte, span.end_byte).toString(), "café('旅行')");
});

test('artifact validation rejects dangling records and source validation detects forged spans', (t) => {
  const { repo } = fixture(t, 'direct-calls');
  const result = scan({ repository: repo });
  let tampered = structuredClone(result); tampered.data.symbols.pop(); tampered.artifact_id = artifactId(tampered);
  assert.throws(() => validateScan(tampered), { code: 'INVALID_SCAN' });
  tampered = structuredClone(result); tampered.coverage.parsed_source_files++; tampered.artifact_id = artifactId(tampered);
  assert.throws(() => validateScan(tampered), { code: 'INVALID_SCAN' });
  // Rewrite the citation hash and all references, then rehash the artifact. Internal
  // consistency can pass; immutable source revalidation must still reject the lie.
  tampered = structuredClone(result);
  const item = tampered.data.evidence[0]; const oldId = item.id; item.span_sha256 = '0'.repeat(64);
  const { id: _, ...body } = item; item.id = recordId('evidence', body);
  const renamed = new Map();
  for (const symbol of tampered.data.symbols) if (symbol.evidence_id === oldId) {
    symbol.evidence_id = item.id; const old = symbol.id; const { id: _, ...body } = symbol; symbol.id = recordId('symbol', body); renamed.set(old, symbol.id);
  }
  for (const fact of tampered.data.facts) {
    fact.evidence_ids = fact.evidence_ids.map((id) => id === oldId ? item.id : id);
    fact.subject_id = renamed.get(fact.subject_id) ?? fact.subject_id;
    fact.target_id = renamed.get(fact.target_id) ?? fact.target_id;
    const { id: _, ...body } = fact; fact.id = recordId('fact', body);
  }
  for (const key of ['evidence', 'symbols', 'facts']) tampered.data[key].sort((a, b) => a.id < b.id ? -1 : 1);
  tampered.artifact_id = artifactId(tampered);
  validateScan(tampered);
  assert.throws(() => validateScan(tampered, { repository: repo }), { code: 'INVALID_SCAN' });
  // A different snapshot must not supply otherwise plausible file contents.
  const other = join(dirname(repo), 'other'); cpSync(repo, other, { recursive: true });
  rmSync(join(other, '.git'), { recursive: true }); git(other, 'init', '-q', '--template=');
  writeFileSync(join(other, 'index.ts'), 'export const changed = true;'); commit(other);
  assert.throws(() => validateScan(result, { repository: other }));
});

test('source byte budgets and unavailable tsconfig extends produce explicit partial output', (t) => {
  const { repo } = fixture(t, 'direct-calls');
  const limited = scan({ repository: repo, limits: { max_file_bytes: 100 } });
  validateScan(limited);
  assert.equal(limited.status, 'partial');
  assert(limited.coverage.failed_source_files > 0);
  assert.equal(limited.coverage.selected_source_files, 3);
  writeFileSync(join(repo, 'tsconfig.json'), '{"extends":"missing-config-package","include":["*.ts"]}'); commit(repo);
  const missing = scan({ repository: repo });
  validateScan(missing);
  assert.equal(missing.status, 'partial');
  assert(missing.diagnostics.some((diagnostic) => diagnostic.code.startsWith('TSCONFIG_')));
  assert.equal(missing.coverage.parsed_source_files, 3);
});

test('JavaScript source participates without installed dependencies', (t) => {
  const { repo } = fixture(t, 'js'); const result = scan({ repository: repo });
  validateScan(result, { repository: repo });
  assert.equal(result.coverage.parsed_source_files, 2);
  const call = result.data.facts.find((fact) => fact.kind === 'call' && fact.name === 'hello');
  assert.equal(call.resolution, 'resolved');
});

test('failed dependency reads remain explicit supporting units within resource limits', (t) => {
  const { repo } = fixture(t, 'direct-calls');
  const result = scan({ repository: repo, include: ['index.ts'], limits: { max_source_files: 1 } });
  validateScan(result);
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.parsed_source_files, 1);
  assert.equal(result.coverage.failed_support_files, 1);
  assert.equal(result.data.files.find((file) => file.path === 'format.ts').status, 'failed');
});

test('default, anonymous and star exports retain source links; shadowed require is a normal call', (t) => {
  const { repo } = fixture(t, 'exports'); const result = scan({ repository: repo });
  validateScan(result, { repository: repo });
  for (const path of ['anonymous.ts', 'arrow.ts']) {
    const file = result.data.files.find((file) => file.path === path);
    assert(result.data.facts.some((fact) => fact.kind === 'export' && fact.name === 'default' && fact.subject_id === file.id && fact.resolution === 'resolved'));
  }
  assert(result.data.facts.some((fact) => fact.kind === 'export' && fact.name === '*' && fact.resolution === 'resolved'));
  assert(result.data.facts.some((fact) => fact.kind === 'call' && fact.name === 'anonymous' && fact.resolution === 'resolved'));
  assert(!result.data.facts.some((fact) => fact.kind === 'import' && fact.specifier === 'not-a-module'));
});

test('scan and validate CLI report JSON, strict incompleteness, and protect target writes', (t) => {
  const { repo, directory } = fixture(t, 'negative');
  const output = join(directory, 'scan.json');
  const first = run('scan', repo, '--out', output);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).status, 'partial');
  assert.equal(first.stdout, readFileSync(output, 'utf8'));
  assert.equal(run('scan', repo, '--strict').status, 3);
  const validated = run('validate', output, '--repository', repo);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).data.source_rechecked, true);
  assert.equal(run('scan', repo, '--out', join(repo, 'bad.json')).status, 2);
  assert.equal(existsSync(join(repo, 'bad.json')), false);
  assert.equal(run('scan', repo, '--mode', 'full').status, 2);
});
