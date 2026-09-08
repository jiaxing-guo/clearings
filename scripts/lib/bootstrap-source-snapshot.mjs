import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const paths = [
  'src/analysis/budget.ts',
  'src/analysis/dependencies.ts',
  'src/specification/context.ts',
  'src/specification/render.ts',
];

/** Check archived bytes against the original bindings; never consult mutable production source. */
export function verifyBootstrapSourceSnapshot(snapshot, bindings) {
  const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema_version, '0.1.0');
  assert.equal(manifest.repository, 'https://github.com/jiaxing-guo/clearings');
  assert.equal(manifest.commit, '73f4ef3cc656777ec5368f8590bf9ba9e95c5e70');
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    paths,
  );
  assert.deepEqual([...new Set(bindings.map((binding) => binding.path))].sort(), paths);
  const sources = new Map();
  for (const file of manifest.files) {
    const bytes = readFileSync(join(snapshot, file.path));
    assert.equal(hash('sha256', bytes), file.sha256, file.path);
    assert.equal(
      hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])),
      file.git_blob,
      file.path,
    );
    sources.set(file.path, bytes);
  }
  verifyBindings(sources, bindings);
  return manifest;
}

/** Fresh outputs explicitly bind the current checkout; they do not rewrite historical evidence. */
export function verifyBootstrapWorkingSource(root, bindings) {
  assert.deepEqual([...new Set(bindings.map((binding) => binding.path))].sort(), paths);
  const sources = new Map(paths.map((path) => [path, readFileSync(join(root, path))]));
  verifyBindings(sources, bindings);
}

function verifyBindings(sources, bindings) {
  for (const binding of bindings) {
    const bytes = sources.get(binding.path);
    assert.equal(hash('sha256', bytes), binding.file_sha256, binding.path);
    assert.equal(hash('sha256', binding.text), binding.sha256, binding.function);
    assert(Number.isSafeInteger(binding.start_byte) && Number.isSafeInteger(binding.end_byte));
    assert(
      binding.start_byte >= 0 &&
        binding.end_byte >= binding.start_byte &&
        binding.end_byte <= bytes.length,
    );
    assert.equal(
      bytes.subarray(binding.start_byte, binding.end_byte).toString('utf8'),
      binding.text,
    );
  }
}
