import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { digest } from '../dist/semantics/identity.js';
import { sealProgram } from '../dist/program/index.js';
import {
  sealRustArtifact,
  validateRustArtifact,
  rustRuntimeIdentity,
  validateCompilationInput,
  RUST_ARTIFACT_LIMITS,
  RUST_TOOLCHAIN,
} from '../dist/compiler/index.js';

const program = JSON.parse(readFileSync('programs/examples/identity.json', 'utf8'));
const runtimeFiles = [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  ...readdirSync('runtime/rust/src')
    .filter((p) => p.endsWith('.rs'))
    .map((p) => `src/${p}`),
].map((path) => ({ path, source: readFileSync(`runtime/rust/${path}`, 'utf8') }));
const runtime = rustRuntimeIdentity(runtimeFiles);
const source =
  '// Authored artifact-validation fixture, not compiler output.\npub fn identity(value: i64) -> i64 { value }\n';
const artifact = () => sealRustArtifact(program, source, runtime);
const reject = (action, rule) =>
  assert.throws(
    action,
    (error) =>
      error.code === 'INVALID_COMPILED_PROGRAM' &&
      error.exitCode === 2 &&
      (!rule || error.details.rule === rule),
  );
const resign = (value) => {
  const { artifact_id, ...body } = value;
  value.artifact_id = digest('compiled-program', body);
  return value;
};

test('compiled artifacts bind exact bytes, program, runtime inventory, options, and versions', () => {
  const result = artifact();
  validateRustArtifact(result, program, runtime);
  assert.deepEqual(result, artifact());
  assert.deepEqual(rustRuntimeIdentity(runtimeFiles.toReversed()), runtime);
  assert.equal(result.toolchain.channel, RUST_TOOLCHAIN);
  assert.notEqual(
    sealRustArtifact(program, source + '\n', runtime).artifact_id,
    result.artifact_id,
  );
  assert.notEqual(
    rustRuntimeIdentity(
      runtimeFiles.map((file, i) => (i ? file : { ...file, source: file.source + '\n' })),
    ).source_id,
    runtime.source_id,
  );
});

test('artifact construction owns its metadata and never executes source', () => {
  const mutableRuntime = structuredClone(runtime);
  const value = sealRustArtifact(
    program,
    'throw new Error("never execute this source");',
    mutableRuntime,
  );
  mutableRuntime.source_id = 'changed';
  assert.equal(value.runtime.source_id, runtime.source_id);
  // Integrity does not establish Rust syntax, provenance, or compiler correctness.
  validateRustArtifact(value, program, runtime);
});

test('altered module bytes and stale artifact identities are rejected', () => {
  const changed = artifact();
  changed.module.source += '\n';
  reject(() => validateRustArtifact(changed, program, runtime), 'identity');
  const stale = artifact();
  stale.artifact_id = 'compiled-program:' + '0'.repeat(64);
  reject(() => validateRustArtifact(stale, program, runtime), 'identity');
  const differentProgram = sealProgram({ ...program, name: program.name + ' changed' });
  reject(() => validateRustArtifact(artifact(), differentProgram, runtime), 'compatibility');
  reject(
    () =>
      validateRustArtifact(artifact(), program, {
        ...runtime,
        source_id: 'rust-runtime:' + '0'.repeat(64),
      }),
    'compatibility',
  );
});

test('rehashing cannot make unsupported ABI, semantics, target, or options compatible', () => {
  const changes = [
    (v) => (v.backend = 'javascript'),
    (v) => (v.compiler_version = '9.0.0'),
    (v) => (v.compiler_version = '0.1.0'),
    (v) => (v.runtime.abi_version = '2.0.0'),
    (v) => (v.execution_semantics_version = '2.0.0'),
    (v) => (v.toolchain.channel = 'nightly'),
    (v) => (v.options.resource_policy = 'unmetered'),
    (v) => (v.module.path = '../main.rs'),
  ];
  for (const change of changes) {
    const value = artifact();
    change(value);
    reject(() => validateRustArtifact(resign(value), program, runtime), 'compatibility');
  }
  const extra = artifact();
  extra.options.optimize = true;
  reject(() => validateRustArtifact(resign(extra), program, runtime), 'shape');
});

test('source inventory rejects duplicate and traversal paths without opening paths', () => {
  reject(() => rustRuntimeIdentity([...runtimeFiles, runtimeFiles[0]]), 'path');
  for (const path of ['../secret', '/absolute.rs', 'src/../lib.rs', 'C:\\file.rs'])
    reject(() => rustRuntimeIdentity([{ path, source: '' }]), 'path');
  reject(() => rustRuntimeIdentity([{ path: 'src/lib.rs', source: '' }]), 'source');
});

test('source byte bounds and Unicode validity precede hashing', () => {
  for (const source of ['\ud800', '\udc00', 'x\ud800y'])
    reject(() => sealRustArtifact(program, source, runtime), 'source');
  validateRustArtifact(sealRustArtifact(program, '// 😀\n', runtime), program, runtime);
  reject(
    () => sealRustArtifact(program, 'x'.repeat(RUST_ARTIFACT_LIMITS.source_bytes + 1), runtime),
    'source-limit',
  );
  reject(
    () => sealRustArtifact(program, 'é'.repeat(RUST_ARTIFACT_LIMITS.source_bytes / 2 + 1), runtime),
    'source-limit',
  );
});

test('accessors and nonportable data are rejected without evaluation', () => {
  let calls = 0;
  const value = artifact();
  Object.defineProperty(value, 'runtime', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('accessor called');
    },
  });
  reject(() => validateRustArtifact(value, program, runtime), 'portability');
  assert.equal(calls, 0);
  const cycle = {};
  cycle.self = cycle;
  reject(() => validateCompilationInput(cycle), 'portability');
});

test('compiler preparation bounds precede program hashing while language errors retain their code', () => {
  const large = { ...program, name: 'x'.repeat(RUST_ARTIFACT_LIMITS.input_units) };
  reject(() => validateCompilationInput(large), 'input-limit');
  assert.throws(
    () => validateCompilationInput({ ...program, entry_function: 'missing' }),
    (e) => e.code === 'INVALID_PROGRAM',
  );
  validateCompilationInput(program);
});
