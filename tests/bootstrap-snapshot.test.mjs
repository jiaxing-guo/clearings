import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBootstrapSourceSnapshot } from '../scripts/lib/bootstrap-source-snapshot.mjs';

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
