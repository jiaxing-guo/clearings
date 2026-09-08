import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareRustProgram } from 'clearings/compiler';
import { executeProgram } from 'clearings/program';

const program = JSON.parse(
  readFileSync(new URL('../../programs/examples/sum-nonnegative.json', import.meta.url)),
);
test('prepared programs reuse native code with fresh execution state and immutable identities', (t) => {
  const cache = mkdtempSync(join(tmpdir(), 'clearings-preparation-'));
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  const input = structuredClone(program);
  const prepared = prepareRustProgram(input, { cacheDirectory: cache });
  t.after(() => prepared.dispose());
  input.functions.length = 0;
  const identity = prepared.native;
  identity.executable_sha256 = 'changed';
  assert.notEqual(prepared.native.executable_sha256, identity.executable_sha256);
  for (const [args, limits] of [
    [[[2, 3]], {}],
    [[[-1]], {}],
    [[[10]], { work: 1 }],
    [[[7]], {}],
  ]) {
    const result = prepared.execute(args, limits);
    const expected = executeProgram(program, args, limits);
    for (const key of ['completion', 'usage', 'limits'])
      assert.deepEqual(result[key], expected[key]);
  }
  // A separate consumer can prepare the same cache with the toolchain unavailable.
  const script = `import {prepareRustProgram} from 'clearings/compiler';
    const p=prepareRustProgram(${JSON.stringify(program)}, {cacheDirectory:${JSON.stringify(cache)}});
    console.log(JSON.stringify(p.execute([[8,9]]).completion)); p.dispose();`;
  const warm = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, PATH: '' },
    encoding: 'utf8',
  });
  assert.equal(warm.status, 0, warm.stderr);
  assert.deepEqual(JSON.parse(warm.stdout), { kind: 'return', value: 17 });
  assert.equal(readdirSync(cache).filter((name) => name.startsWith('.build-')).length, 0);
  const entry = join(cache, prepared.native.build_id.split(':')[1]);
  writeFileSync(join(entry, process.platform === 'win32' ? 'native.exe' : 'native'), 'damaged');
  assert.throws(() => prepared.execute([[1]]), { code: 'RUST_BUILD_INVALID' });
  assert.throws(() => prepareRustProgram(program, { cacheDirectory: cache }), {
    code: 'RUST_BUILD_INVALID',
  });
  prepared.dispose();
  assert.throws(() => prepared.execute([[1]]), { code: 'RUST_PROGRAM_DISPOSED' });
});

test('failed preparation removes its temporary build products', (t) => {
  const cache = mkdtempSync(join(tmpdir(), 'clearings-preparation-failure-'));
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  const script = `import {prepareRustProgram} from 'clearings/compiler';
    try { prepareRustProgram(${JSON.stringify(program)}, {cacheDirectory:${JSON.stringify(cache)}}); }
    catch(e) { console.log(e.code); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, PATH: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'RUST_TOOLCHAIN_UNAVAILABLE');
  assert.deepEqual(readdirSync(cache), []);
});
