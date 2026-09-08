import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileRust, RUST_COMPILATION_LIMITS, validateRustArtifact } from 'clearings/compiler';
import { sealProgram } from 'clearings/program';
import { runtimeIdentity } from './native/harness.mjs';

const identity = JSON.parse(readFileSync('programs/examples/identity.json', 'utf8'));
const closure = JSON.parse(
  readFileSync('programs/clearings/required-dependency-closure.json', 'utf8'),
);
const literalProgram = (text) =>
  sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Emission fixture',
    entry_function: 'match',
    functions: [
      {
        id: 'match',
        parameters: [],
        returns: { kind: 'string' },
        failures: [],
        body: [
          { kind: 'return', value: { kind: 'literal', type: { kind: 'string' }, value: text } },
        ],
      },
    ],
  });
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .toReversed()
        .map(([k, v]) => [k, reverseKeys(v)]),
    );
  return value;
}

test('Rust emission is deterministic under key order and working-directory changes and owns its output', () => {
  const input = structuredClone(closure),
    runtime = structuredClone(runtimeIdentity);
  const before = structuredClone(input);
  const artifact = compileRust(input, runtime);
  validateRustArtifact(artifact, closure, runtimeIdentity);
  assert.deepEqual(artifact, compileRust(reverseKeys(input), runtime));
  const directory = process.cwd();
  try {
    process.chdir(tmpdir());
    assert.deepEqual(artifact, compileRust(input, runtime));
  } finally {
    process.chdir(directory);
  }
  assert.deepEqual(input, before);
  runtime.source_id = 'changed';
  input.functions.length = 0;
  validateRustArtifact(artifact, closure, runtimeIdentity);
  assert(!artifact.module.source.includes(directory));
});

test('Unicode data and code-like strings are emitted as UTF-16 data, never Rust syntax', () => {
  const text = '\ud800\udfff😀\u0000"\\\n; std::process::exit(42);';
  const artifact = compileRust(literalProgram(text), runtimeIdentity);
  assert(!artifact.module.source.includes('std::process::exit'));
  assert(!artifact.module.source.includes('\ud800'));
  assert.match(
    artifact.module.source,
    /OwnedValue::String\(vec!\[55296,57343,55357,56832,0,34,92,10,/,
  );
  assert.match(artifact.module.source, /fn f_0\(/);
  assert.doesNotMatch(artifact.module.source, /fn match\(/);
});

test('compilation rejects invalid source and does not read accessors', () => {
  const invalid = structuredClone(identity);
  invalid.functions[0].body[0].value = { kind: 'ref', name: 'missing' };
  assert.throws(
    () => compileRust(invalid, runtimeIdentity),
    (e) => e.code === 'INVALID_PROGRAM',
  );
  let calls = 0;
  Object.defineProperty(invalid, 'functions', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('accessor invoked');
    },
  });
  assert.throws(
    () => compileRust(invalid, runtimeIdentity),
    (e) => e.code === 'INVALID_COMPILED_PROGRAM' && e.details.rule === 'portability',
  );
  assert.equal(calls, 0);
});

test('a valid large literal fails at the incremental compiler work bound', () => {
  const program = literalProgram('x'.repeat(RUST_COMPILATION_LIMITS.work));
  assert.throws(
    () => compileRust(program, runtimeIdentity),
    (e) =>
      e.code === 'INVALID_COMPILED_PROGRAM' &&
      e.exitCode === 2 &&
      e.details.path === '/module/source' &&
      e.details.rule === 'work-limit',
  );
  const oversized = { ...identity, name: 'x'.repeat(1_000_000) };
  assert.throws(
    () => compileRust(oversized, runtimeIdentity),
    (e) => e.code === 'INVALID_COMPILED_PROGRAM' && e.details.rule === 'input-limit',
  );
});
