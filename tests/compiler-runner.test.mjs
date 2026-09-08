import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileRustProgram, executeRustProgram, writeRustProgram } from 'clearings/compiler';
import { executeProgram } from 'clearings/program';
import { decodeResponse, encodeRequest } from '../dist/compiler/transport.js';

const fixture = (path = 'examples/identity') =>
  JSON.parse(readFileSync(new URL(`../programs/${path}.json`, import.meta.url), 'utf8'));
const cli = new URL('../dist/cli/main.js', import.meta.url).pathname;
const temp = (t) => {
  const path = mkdtempSync(join(tmpdir(), 'clearings-runner-unit-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
};
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('source export is deterministic, binds every build source, and requires no Rust toolchain', (t) => {
  const dir = temp(t),
    program = fixture();
  const a = join(dir, 'first'),
    b = join(dir, 'second');
  const artifact = writeRustProgram(program, a);
  assert.deepEqual(artifact, compileRustProgram(program));
  assert.deepEqual(writeRustProgram(program, b), artifact);
  assert.deepEqual(read(join(a, 'artifact.json')), artifact);
  const manifest = read(join(a, 'build.json'));
  assert.equal(manifest.compiled_artifact_id, artifact.artifact_id);
  assert.match(manifest.runner.source_id, /^rust-runner:[a-f0-9]{64}$/);
  for (const { path, sha256 } of manifest.files) {
    const bytes = readFileSync(join(a, path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
    assert.deepEqual(bytes, readFileSync(join(b, path)));
  }
  assert.equal(readFileSync(join(a, 'program.rs'), 'utf8'), artifact.module.source);
  const result = spawnSync(
    process.execPath,
    [cli, 'program', 'compile', 'identity', '--out', join(dir, 'cli'), '--format', 'json'],
    { env: { ...process.env, PATH: '' }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), artifact);
  assert.deepEqual(readdirSync(a).sort(), readdirSync(join(dir, 'cli')).sort());
});

test('compilation output rejects existing directories, files, and symlinks without replacing data', (t) => {
  const dir = temp(t),
    file = join(dir, 'keep'),
    link = join(dir, 'link'),
    dangling = join(dir, 'dangling');
  writeFileSync(file, 'preserve');
  symlinkSync(file, link);
  symlinkSync(join(dir, 'absent'), dangling);
  for (const path of [dir, file, link, dangling, ''])
    assert.throws(
      () => writeRustProgram(fixture(), path),
      (error) => error.code === 'INVALID_OUTPUT',
    );
  assert.equal(readFileSync(file, 'utf8'), 'preserve');
  assert.deepEqual(readdirSync(dir).sort(), ['dangling', 'keep', 'link']);
});

test('native admission preserves reference errors without reading accessors or starting Rust', () => {
  let accessed = false;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error('must not read');
    },
  });
  const cycle = [];
  cycle.push(cycle);
  for (const args of [
    undefined,
    {},
    [],
    [1.5],
    [Number.MAX_SAFE_INTEGER + 1],
    ['ok', 2],
    [accessor],
    [cycle],
    [new Array(2)],
    ['x'.repeat(1_000_000)],
  ]) {
    let reference;
    try {
      executeProgram(fixture(), args);
    } catch (error) {
      reference = error;
    }
    assert(reference);
    assert.throws(
      () => executeRustProgram(fixture(), args),
      (error) =>
        error.code === reference.code &&
        error.details.path === reference.details.path &&
        error.details.rule === reference.details.rule,
    );
  }
  assert.equal(accessed, false);
  assert.throws(
    () => executeRustProgram(fixture(), ['x'], { work: 0 }),
    (error) => error.details.path === '/options/work',
  );
  assert.throws(
    () => executeRustProgram(compileRustProgram(fixture()), ['x']),
    (error) => error.code === 'INVALID_PROGRAM',
  );
});

test('missing native tools fail explicitly and temporary compilation files are removed', (t) => {
  const dir = temp(t);
  const result = spawnSync(
    process.execPath,
    [cli, 'program', 'demo', 'identity', '--backend', 'rust', '--format', 'json'],
    {
      env: { ...process.env, PATH: '', TMPDIR: dir, TEMP: dir, TMP: dir },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'RUST_TOOLCHAIN_UNAVAILABLE');
  assert.deepEqual(readdirSync(dir), []);
});

test('transport frames exact code units and rejects malformed or incompatible observations', () => {
  const program = fixture(),
    result = executeProgram(program, ['\ud800\0😀']);
  const request = encodeRequest(['\ud800\0😀'], result.limits);
  assert.equal(request.subarray(0, 4).toString(), 'CLR1');
  assert.equal(request.readUInt32LE(42), 4);
  assert.deepEqual([...request.subarray(46)], [0, 216, 0, 0, 61, 216, 0, 222]);
  const { limits, usage, completion } = result;
  const observation = { limits, usage, completion };
  assert.deepEqual(
    decodeResponse(Buffer.from(JSON.stringify(observation)), program, limits),
    observation,
  );
  for (const edit of [
    (value) => (value.extra = true),
    (value) => value.limits.work++,
    (value) => (value.usage.work = -1),
    (value) => (value.usage.value_units = limits.value_units + 1),
    (value) => (value.usage.value_units = 1),
    (value) => (value.completion.value = 1),
    (value) => (value.completion = { kind: 'unknown' }),
    (value) =>
      (value.completion = {
        kind: 'application-failure',
        code: 'UNDECLARED',
        details: null,
        diagnostic: {},
      }),
    (value) =>
      (value.completion = {
        kind: 'resource-exhaustion',
        resource: 'work',
        limit: 2,
        diagnostic: {},
      }),
    (value) =>
      (value.completion = {
        kind: 'runtime-fault',
        code: ['INTEGER_OVERFLOW'],
        message: 'bad type',
        diagnostic: { phase: 'execution', path: '/functions/0', call_stack: [] },
      }),
    (value) =>
      (value.completion = {
        kind: 'runtime-fault',
        code: 'INTEGER_OVERFLOW',
        message: 'bad phase type',
        diagnostic: { phase: ['execution'], path: '/functions/0', call_stack: [] },
      }),
  ]) {
    const changed = structuredClone(observation);
    edit(changed);
    assert.throws(
      () => decodeResponse(Buffer.from(JSON.stringify(changed)), program, limits),
      (error) => error.code === 'RUST_EXECUTION_FAILED',
    );
  }
  for (const bytes of [Buffer.from('{'), Buffer.from([0xff]), Buffer.from('{}\n{}')])
    assert.throws(
      () => decodeResponse(bytes, program, limits),
      (error) => error.code === 'RUST_EXECUTION_FAILED',
    );
});
