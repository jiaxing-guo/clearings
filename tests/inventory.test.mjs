import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, readTarget, validateInventory } from '../dist/index.js';
import { snapshotId } from '../dist/repository/inventory.js';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = resolve(project, 'dist/cli/main.js');
const runGit = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(t, name = 'direct-calls', objectFormat = 'sha1') {
  const dir = mkdtempSync(join(tmpdir(), 'clearings-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  cpSync(join(project, 'tests/fixtures', name), repo, { recursive: true });
  runGit(repo, 'init', '-q', '--template=', `--object-format=${objectFormat}`);
  runGit(repo, 'add', '.');
  runGit(repo, '-c', 'user.name=Clearings fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Original fixture');
  return { dir, repo };
}

function invoke(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('cross-file and dynamic-dispatch fixtures are inventoried without semantic claims', async (t) => {
  for (const name of ['direct-calls', 'dynamic-dispatch']) await t.test(name, (t) => {
    const { repo } = fixture(t, name);
    const result = inventory({ repository: repo });
    validateInventory(result);
    assert.equal(result.coverage.inventoried_files, name === 'direct-calls' ? 5 : 3);
    assert.equal(result.coverage.parsed_files, 0);
    assert.equal(result.coverage.semantic_analysis, 'not-run');
    assert.equal(result.data.snapshot.commit_sha, runGit(repo, 'rev-parse', 'HEAD'));
    assert.equal(result.data.files.find((file) => file.path === 'index.ts').object_id, runGit(repo, 'rev-parse', 'HEAD:index.ts'));
  });
});

test('immutable reads ignore dirty, staged, untracked, and replacement objects; target stays unchanged', (t) => {
  const { repo, dir } = fixture(t);
  const baseline = inventory({ repository: repo });
  writeFileSync(join(repo, 'index.ts'), 'BROKEN WORKTREE CONTENT');
  runGit(repo, 'add', 'index.ts');
  writeFileSync(join(repo, 'format.ts'), 'UNSTAGED');
  writeFileSync(join(repo, 'untracked.ts'), 'UNTRACKED');
  const indexBefore = readFileSync(join(repo, '.git/index'));
  const statusBefore = runGit(repo, 'status', '--porcelain');
  const snapshot = inventory({ repository: repo });
  assert.deepEqual(snapshot, baseline);
  assert.deepEqual(readFileSync(join(repo, '.git/index')), indexBefore);
  assert.equal(runGit(repo, 'status', '--porcelain'), statusBefore);
  assert.equal(readFileSync(join(repo, 'index.ts'), 'utf8'), 'BROKEN WORKTREE CONTENT');
  const clone = join(dir, 'copy');
  cpSync(repo, clone, { recursive: true });
  assert.deepEqual(inventory({ repository: clone }), baseline);
  // A replacement blob must not alter reported sizes or object identity.
  const original = runGit(repo, 'rev-parse', 'HEAD:index.ts');
  const replacement = runGit(repo, 'hash-object', '-w', 'index.ts');
  runGit(repo, 'replace', original, replacement);
  assert.deepEqual(inventory({ repository: repo }), baseline);
});

test('all entries remain in coverage; unusual names, symlinks, and submodules are explicit', (t) => {
  const { repo } = fixture(t);
  mkdirSync(join(repo, 'nested'));
  for (const name of ['space name.ts', 'tab\tname.ts', 'line\nname.ts']) writeFileSync(join(repo, 'nested', name), 'export const x = 1;\n');
  symlinkSync('/outside/not-readable', join(repo, 'escape.ts'));
  runGit(repo, 'add', '.');
  runGit(repo, 'update-index', '--add', '--cacheinfo', `160000,${runGit(repo, 'rev-parse', 'HEAD')},submodule`);
  runGit(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Special entries');
  const result = inventory({ repository: repo, include: ['nested/', 'nested'], exclude: ['nested/space name.ts'] });
  validateInventory(result);
  assert.equal(result.coverage.tracked_entries, 10);
  assert.equal(result.coverage.inventoried_files, 2);
  assert.equal(result.coverage.excluded_entries, 8);
  assert.equal(result.data.files.find((file) => file.path === 'escape.ts').reason, 'symlink');
  assert.equal(result.data.files.find((file) => file.path === 'submodule').reason, 'submodule');
  assert.equal(result.data.files.find((file) => file.path === 'nested/space name.ts').reason, 'explicit-exclusion');
  assert(result.data.files.some((file) => file.path === 'nested/line\nname.ts'));
});

test('refs normalize, pins are enforced, and invalid scope is rejected', (t) => {
  const { repo } = fixture(t);
  runGit(repo, 'tag', 'fixture-v1');
  assert.deepEqual(inventory({ repository: repo, ref: 'fixture-v1' }), inventory({ repository: repo }));
  assert.throws(() => inventory({ repository: repo, expectedTree: '0'.repeat(40) }), { code: 'PIN_MISMATCH' });
  assert.throws(() => inventory({ repository: repo, include: ['../escape'] }), { code: 'INVALID_SCOPE' });
  assert.throws(() => inventory({ repository: repo, include: ['missing'] }), { code: 'MISSING_SCOPE' });
  assert.throws(() => inventory({ repository: repo, include: [] }), { code: 'EMPTY_SCOPE' });
  assert.throws(() => inventory({ repository: repo, ref: '--output=owned' }), { code: 'INVALID_REF' });
  assert.throws(() => inventory({ repository: repo, ref: 'HEAD;touch owned' }), { code: 'GIT_FAILED' });
  assert.equal(existsSync(join(repo, 'owned')), false);
});

test('SHA-256 object stores and empty commits are supported', (t) => {
  const { repo } = fixture(t, 'direct-calls', 'sha256');
  const result = inventory({ repository: repo });
  validateInventory(result);
  assert.equal(result.data.snapshot.object_format, 'sha256');
  assert.equal(result.data.snapshot.commit_sha.length, 64);
  runGit(repo, 'rm', '-r', '.');
  runGit(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Empty tree');
  const empty = inventory({ repository: repo });
  validateInventory(empty);
  assert.equal(empty.coverage.tracked_entries, 0);
});

test('validation rejects tampering, inconsistent coverage, and invalid modes despite recomputed digests', (t) => {
  const { repo } = fixture(t);
  const result = inventory({ repository: repo });
  const mutated = () => structuredClone(result);
  let value = mutated(); value.data.files[0].size_bytes += 1;
  assert.throws(() => validateInventory(value), { code: 'INVALID_INVENTORY' });
  value = mutated(); value.coverage.parsed_files = 1;
  assert.throws(() => validateInventory(value), { code: 'INVALID_SCHEMA' });
  value = mutated(); value.coverage.inventoried_files += 1;
  assert.throws(() => validateInventory(value), { code: 'INVALID_INVENTORY' });
  value = mutated(); value.data.files.reverse(); value.snapshot_id = snapshotId(value.data);
  assert.throws(() => validateInventory(value), { code: 'INVALID_INVENTORY' });
  value = mutated(); value.data.files[0].mode = '120000'; value.snapshot_id = snapshotId(value.data);
  assert.throws(() => validateInventory(value), { code: 'INVALID_INVENTORY' });
  value = mutated(); value.data.surprise = true;
  assert.throws(() => validateInventory(value), { code: 'INVALID_SCHEMA' });
});

test('CLI emits stable JSON, validates artifacts, and does not overwrite or write into its target', (t) => {
  const { repo, dir } = fixture(t);
  const out = join(dir, 'inventory.json');
  const first = invoke('inventory', repo, '--out', out);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, '');
  assert.equal(first.stdout, readFileSync(out, 'utf8'));
  assert.equal(first.stdout, invoke('inventory', repo).stdout);
  assert.equal(JSON.parse(first.stdout).data.analysis_level, 'inventory');
  const validated = invoke('validate', out);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).data.source_rechecked, false);
  assert.equal(invoke('inventory', repo, '--out', out).status, 2);
  const nested = invoke('inventory', repo, '--out', join(repo, 'new/inventory.json'));
  assert.equal(nested.status, 2);
  assert.equal(existsSync(join(repo, 'new')), false);
  symlinkSync(repo, join(dir, 'alias'));
  assert.equal(invoke('inventory', repo, '--out', join(dir, 'alias', 'via-link.json')).status, 2);
  assert.equal(existsSync(join(repo, 'via-link.json')), false);
});

test('CLI errors use documented envelopes and exit codes', (t) => {
  const { repo, dir } = fixture(t);
  for (const args of [['unknown'], ['inventory', repo, '--scope', 'deep'], ['inventory', repo, '--surprise'], ['inventory', repo, '--ref']]) {
    const result = invoke(...args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'failed');
    assert(result.stderr.length > 0);
  }
  assert.equal(invoke('inventory', dir).status, 1);
  assert.equal(invoke('--help').status, 0);
  assert.match(invoke('--version').stdout, /^0\.0\.1\n$/);
});

test('target reader strips evaluation metadata and CLI enforces manifest scope', (t) => {
  const { repo, dir } = fixture(t);
  const path = join(dir, 'target.json');
  const input = {
    schema_version: '0.1.0',
    target_id: 'fixture', repository: 'https://example.invalid/fixture.git',
    commit: runGit(repo, 'rev-parse', 'HEAD'), tree_sha: runGit(repo, 'rev-parse', 'HEAD^{tree}'),
    scope: { inventory_roots: ['.'], deep_source_files: ['index.ts'], supporting_context: ['package.json'], excluded_roots: [] },
    evaluation: { secret_answer: 'must not enter inventory' },
  };
  writeFileSync(path, JSON.stringify(input));
  assert.equal('evaluation' in readTarget(path), false);
  const result = invoke('inventory', repo, '--target', path, '--scope', 'deep');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).coverage.inventoried_files, 2);
  assert.equal(result.stdout.includes('secret_answer'), false);
  assert.equal(invoke('inventory', repo, '--target', path, '--include', '.').status, 2);
  assert.equal(invoke('benchmark-fetch', '--target', path, '--out', repo).status, 2);
  assert.equal(runGit(repo, 'status', '--porcelain'), '');
  input.repository = 'https://user:secret@example.invalid/fixture.git';
  writeFileSync(path, JSON.stringify(input));
  assert.throws(() => readTarget(path), { code: 'INVALID_TARGET' });
});
