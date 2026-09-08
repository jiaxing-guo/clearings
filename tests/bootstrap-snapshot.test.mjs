import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyBootstrapSourceSnapshot,
  verifyBootstrapWorkingSource,
} from '../scripts/lib/bootstrap-source-snapshot.mjs';

const source = new URL('../benchmarks/sources/clearings-bootstrap/', import.meta.url);
const bindings = JSON.parse(
  readFileSync(
    new URL(
      '../benchmarks/results/clearings-bootstrap/implementation-bindings.json',
      import.meta.url,
    ),
  ),
).bindings;

test('historical source verification is independent of the working tree and rejects corrupted evidence', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'clearings-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(source, root, { recursive: true });
  assert.equal(
    verifyBootstrapSourceSnapshot(root, bindings).commit,
    '73f4ef3cc656777ec5368f8590bf9ba9e95c5e70',
  );
  const altered = structuredClone(bindings);
  altered[0].start_byte++;
  assert.throws(() => verifyBootstrapSourceSnapshot(root, altered));
  const file = join(root, 'src/analysis/dependencies.ts');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n');
  assert.throws(() => verifyBootstrapSourceSnapshot(root, bindings));
});

test('fresh source bindings verify evolved working files without changing historical bindings', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'clearings-working-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(source, root, { recursive: true });
  const current = structuredClone(bindings);
  const path = 'src/analysis/dependencies.ts';
  const file = join(root, path);
  writeFileSync(file, readFileSync(file, 'utf8') + '\n// Later production revision.\n');
  for (const binding of current.filter((item) => item.path === path))
    binding.file_sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  verifyBootstrapWorkingSource(root, current);
  assert.throws(() => verifyBootstrapSourceSnapshot(fileURLToPath(source), current));
  const altered = structuredClone(current);
  altered[0].start_byte++;
  assert.throws(() => verifyBootstrapWorkingSource(root, altered));
  writeFileSync(file, readFileSync(file, 'utf8') + '// Another revision.\n');
  assert.throws(() => verifyBootstrapWorkingSource(root, current));
  verifyBootstrapSourceSnapshot(fileURLToPath(source), bindings);
});

test('the documented fresh bootstrap build and verification agree on their source scope', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'clearings-fresh-bootstrap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'review');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const options = { cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 };
  execFileSync(process.execPath, ['scripts/build-bootstrap-demo.mjs', output], options);
  const bindings = JSON.parse(readFileSync(join(output, 'implementation-bindings.json'), 'utf8'));
  assert.equal(bindings.source_scope, 'working-tree');
  const verification = JSON.parse(
    execFileSync(process.execPath, ['scripts/check-bootstrap-demo.mjs', output], options),
  );
  assert.equal(verification.working_source_bindings, 'valid');
  assert(!('historical_source_bindings' in verification));
});
