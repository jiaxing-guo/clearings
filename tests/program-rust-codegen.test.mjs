import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  compileRust,
  RUST_COMPILATION_LIMITS,
  validateCompilationInput,
  validateRustArtifact,
} from 'clearings/compiler';
import { sealProgram, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';
import { nativeBatch, runtimeIdentity } from './native/harness.mjs';

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

test('a valid source-heavy program reaches the emitter byte bound before its work bound', () => {
  const integer = { kind: 'integer' },
    name = 'x'.repeat(42);
  // Deep blocks lengthen diagnostic paths; many references expand small IR nodes
  // into Rust helpers. Preparation still fits its node, depth, and input-unit bounds.
  let body = [
    {
      kind: 'let',
      name: 'xs',
      type: { kind: 'list', element: integer },
      value: {
        kind: 'list',
        element_type: integer,
        items: Array.from({ length: 16_500 }, () => ({ kind: 'ref', name })),
      },
    },
  ];
  for (let i = 0; i < 26; i++)
    body = [
      {
        kind: 'while',
        condition: { kind: 'literal', type: { kind: 'boolean' }, value: false },
        body,
      },
    ];
  const program = sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Source size boundary',
    entry_function: 'main',
    functions: [
      {
        id: 'main',
        parameters: [{ name, type: integer }],
        returns: integer,
        failures: [],
        body: [...body, { kind: 'return', value: { kind: 'literal', type: integer, value: 0 } }],
      },
    ],
  });
  validateCompilationInput(program);
  assert.throws(
    () => compileRust(program, runtimeIdentity),
    (e) =>
      e.code === 'INVALID_COMPILED_PROGRAM' &&
      e.exitCode === 2 &&
      e.details.path === '/module/source' &&
      e.details.rule === 'source-limit' &&
      // Distinguish the incremental emitter rejection from the later artifact validator.
      e.message === 'Generated Rust exceeds its source byte limit.',
  );
});

test('native test limits reject zero and above-ceiling values before invoking Rust', () => {
  for (const [resource, maximum] of Object.entries(PROGRAM_EXECUTION_MAX_LIMITS)) {
    for (const value of [0, maximum + 1]) {
      assert.throws(
        () => nativeBatch([identity], [{ args: ['text'], limits: { [resource]: value } }]),
        { message: 'Invalid test limits.' },
        `${resource}=${value}`,
      );
    }
  }
});
