import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyChanges, changedFiles } from '../scripts/ci-plan.mjs';
import { failedChecks } from '../scripts/ci-gate.mjs';
const full = { runtime: true, workbench: true, packages: true };
const none = { runtime: false, workbench: false, packages: false };

test('documentation and website edits avoid native jobs', () => {
  assert.deepEqual(classifyChanges(['docs/product.md', 'website/app/page.tsx', 'README.md']), none);
});
test('skills, prompts, lockfiles, and unknown paths require native validation', () => {
  for (const file of [
    'plugins/clearings/skills/reuse-work/SKILL.md',
    'crates/clearings/prompts/agent/invocation-hint.txt',
    'Cargo.lock',
    'package-lock.json',
    '.github/workflows/ci.yml',
    'new-area/file.md',
  ]) {
    assert.deepEqual(classifyChanges([file]), full, file);
  }
});
test('packaging code requests artifact verification without unrelated native tests', () => {
  assert.deepEqual(classifyChanges(['scripts/package_sources.py']), { ...none, packages: true });
  assert.deepEqual(classifyChanges(['docs/product.md'], true), full);
});
test('git diff includes removed and renamed inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'clearings-ci-plan-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'CI');
    mkdirSync(join(root, 'plugins'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'plugins', 'skill.md'), 'instructions');
    writeFileSync(join(root, 'docs', 'old.md'), 'documentation');
    git('add', '.');
    git('commit', '-qm', 'initial');
    const base = git('rev-parse', 'HEAD');
    git('mv', 'plugins/skill.md', 'docs/renamed.md');
    git('rm', 'docs/old.md');
    git('commit', '-qm', 'move');
    const files = changedFiles(base, 'HEAD', root);
    assert(files.includes('plugins/skill.md'));
    assert(files.includes('docs/old.md'));
    assert(files.includes('docs/renamed.md'));
    assert.deepEqual(classifyChanges(files), full);
    assert.throws(() => changedFiles('0'.repeat(40), 'HEAD', root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
function needs(required) {
  return {
    plan: {
      result: 'success',
      outputs: Object.fromEntries(Object.keys(full).map((k) => [k, String(required)])),
    },
    quality: { result: 'success' },
    ...Object.fromEntries(
      Object.keys(full).map((k) => [k, { result: required ? 'success' : 'skipped' }]),
    ),
  };
}
test('gate accepts only planned successful jobs or intentional skips', () => {
  assert.deepEqual(failedChecks(needs(true)), []);
  assert.deepEqual(failedChecks(needs(false)), []);
  for (const state of ['failure', 'cancelled', 'skipped', undefined]) {
    const n = needs(true);
    n.runtime.result = state;
    assert(failedChecks(n).includes('runtime'));
  }
  const n = needs(false);
  n.plan.result = 'failure';
  assert(failedChecks(n).includes('plan'));
  delete n.plan.outputs.workbench;
  assert(failedChecks(n).includes('workbench: missing plan'));
});
