import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { RUST_TOOLCHAIN } from 'clearings/compiler';
import { nativeBatch } from '../tests/native/harness.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const program = read('../programs/clearings/required-dependency-closure.json');
const args = read('../programs/clearings/required-dependency-closure.arguments.json');
const result = nativeBatch([program], [{ args }], { repeat: 100, rebuild: true });
assert.deepEqual(result.results[0].completion, {
  kind: 'return',
  value: ['root', 'a', 'z', 'y', 'b'],
});
console.log(
  JSON.stringify(
    {
      platform: platform(),
      architecture: arch(),
      toolchain: execFileSync('rustup', ['run', RUST_TOOLCHAIN, 'rustc', '-vV'], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 4096,
      }).trim(),
      program_id: program.artifact_id,
      compiled_artifact_id: result.artifacts[0].artifact_id,
      runtime: result.artifacts[0].runtime,
      source_bytes: Buffer.byteLength(result.artifacts[0].module.source),
      ...result.measurements,
      usage: result.results[0].usage,
    },
    null,
    2,
  ),
);
