import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const source = process.cwd();
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clearings-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, HUSKY: '1' };
  // Git exports repository variables inside hooks; do not redirect fixture Git calls.
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  git('init', '-q');
  git('config', 'user.email', 'hook-test@example.invalid');
  git('config', 'user.name', 'Hook test');
  for (const file of [
    'scripts/pre-commit.mjs',
    'scripts/checks.mjs',
    '.husky/pre-commit',
    '.prettierrc.json',
    '.prettierignore',
    'eslint.config.mjs',
    'ruff.toml',
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(source, file), path.join(root, file));
  }
  writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.venv-tools\n');
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'));
  symlinkSync(path.join(source, '.venv-tools'), path.join(root, '.venv-tools'));
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  const installed = spawnSync(process.execPath, ['node_modules/husky/bin.js'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(installed.status, 0, installed.stderr);
  function commit() {
    return spawnSync('git', ['commit', '--allow-empty', '-qm', 'check'], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
  }
  return {
    root,
    env,
    git,
    commit,
    write: (file, text) => writeFileSync(path.join(root, file), text),
  };
}

test('formats staged files with spaces, preserving partial and unrelated edits', (t) => {
  const f = fixture(t);
  f.write('space name.json', '{\n  "first": 1,\n  "second": 2\n}\n');
  f.write('other.json', '{"ok":true}\n');
  f.git('add', 'space name.json', 'other.json');
  assert.equal(f.commit().status, 0);
  f.write('space name.json', '{\n  "first":3,\n  "second": 2\n}\n');
  f.git('add', 'space name.json');
  f.write('space name.json', '{\n  "first":3,\n  "second": 4\n}\n');
  const unrelated = '{"unfinished":\n';
  f.write('other.json', unrelated);
  const started = performance.now();
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr);
  t.diagnostic(`Formatting commit: ${Math.round(performance.now() - started)} ms`);
  assert.equal(f.git('show', 'HEAD:space name.json'), '{\n  "first": 3,\n  "second": 2\n}\n');
  assert.match(readFileSync(path.join(f.root, 'space name.json'), 'utf8'), /"second": 4/);
  assert.equal(readFileSync(path.join(f.root, 'other.json'), 'utf8'), unrelated);
});

test('lint failures block the commit and restore staged and working files', (t) => {
  const f = fixture(t);
  f.write('bad.mjs', 'export function bad(){return 1;return 2;}\n');
  f.git('add', 'bad.mjs');
  const before = f.git('diff', '--cached');
  const result = f.commit();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /unreachable|lint failed/);
  assert.equal(f.git('diff', '--cached'), before);
  assert.equal(
    readFileSync(path.join(f.root, 'bad.mjs'), 'utf8'),
    'export function bad(){return 1;return 2;}\n',
  );
});

test('deletion-only commits run each Rust check once; empty commits work', (t) => {
  const f = fixture(t);
  f.write('old.rs', 'fn main() {}\n');
  f.git('add', 'old.rs');
  f.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Rust fixture');
  mkdirSync(path.join(f.root, 'fake-bin'));
  writeFileSync(
    path.join(f.root, 'fake-bin/cargo'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOOK_LOG"\n',
    { mode: 0o755 },
  );
  f.env.PATH = path.join(f.root, 'fake-bin') + path.delimiter + f.env.PATH;
  f.env.HOOK_LOG = path.join(f.root, 'cargo.log');
  f.git('rm', 'old.rs');
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(f.env.HOOK_LOG, 'utf8').trim().split('\n');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^fmt --all --check$/);
  assert.match(calls[1], /^clippy --locked --offline --workspace --all-targets -- -D warnings$/);
  assert.equal(f.commit().status, 0);
  assert.equal(readFileSync(f.env.HOOK_LOG, 'utf8').trim().split('\n').length, 2);
});

test('Python formatting works and missing tools have a setup message', (t) => {
  const f = fixture(t);
  f.write('sample.py', 'answer= 42\n');
  f.git('add', 'sample.py');
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('show', 'HEAD:sample.py'), 'answer = 42\n');
  rmSync(path.join(f.root, '.venv-tools'));
  f.write('sample.py', 'answer = 43\n');
  f.git('add', 'sample.py');
  const missing = f.commit();
  assert.notEqual(missing.status, 0, missing.stdout + missing.stderr);
  assert.match(missing.stdout + missing.stderr, /npm run dev:setup/);
});

test('shell syntax errors block commits and prompt text stays exact', (t) => {
  const f = fixture(t);
  f.write('prompt.txt', 'Literal {field} prompt without trailing newline');
  f.git('add', 'prompt.txt');
  assert.equal(f.commit().status, 0);
  assert.equal(f.git('show', 'HEAD:prompt.txt'), 'Literal {field} prompt without trailing newline');
  f.write('broken.sh', '#!/bin/sh\nif then\n');
  f.git('add', 'broken.sh');
  assert.notEqual(f.commit().status, 0);
});

test('SDK typecheck failures block TypeScript commits', (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, 'sdk'));
  mkdirSync(path.join(f.root, 'fake-bin'));
  writeFileSync(
    path.join(f.root, 'fake-bin/npm'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOOK_LOG"\nexit 1\n',
    { mode: 0o755 },
  );
  f.env.PATH = path.join(f.root, 'fake-bin') + path.delimiter + f.env.PATH;
  f.env.HOOK_LOG = path.join(f.root, 'npm.log');
  f.write('sdk/input.ts', 'export const input: string = 42;\n');
  f.git('add', 'sdk/input.ts');
  assert.notEqual(f.commit().status, 0);
  assert.equal(readFileSync(f.env.HOOK_LOG, 'utf8'), 'run sdk:check\n');
});
