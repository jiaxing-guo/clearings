import { ClearingsError } from '../model/types.js';
import { assertPortable } from '../specification/validate.js';
import { digest, normalized } from '../semantics/identity.js';
import { sha256 } from '../repository/source.js';
import { validateProgram } from '../program/validate.js';
import type { Program } from '../program/model.js';
import type { ProgramExecutionResult } from '../program/execution.js';

export const RUST_BACKEND_VERSION = '0.1.1';
export const RUST_RUNTIME_ABI_VERSION = '0.1.0';
export const PROGRAM_EXECUTION_SEMANTICS_VERSION = '0.1.0';
export const RUST_TOOLCHAIN = '1.85.1';
export const RUST_ARTIFACT_LIMITS = Object.freeze({
  portable_values: 50_000,
  input_units: 1_000_000,
  source_bytes: 8 * 1024 * 1024,
  runtime_files: 64,
  runtime_bytes: 8 * 1024 * 1024,
});

export interface RustRuntimeIdentity {
  abi_version: typeof RUST_RUNTIME_ABI_VERSION;
  source_id: string;
}
export interface RustCompiledArtifact {
  schema_version: '0.1.0';
  kind: 'compiled-program';
  artifact_id: string;
  program_id: string;
  backend: 'rust';
  compiler_version: typeof RUST_BACKEND_VERSION;
  execution_semantics_version: typeof PROGRAM_EXECUTION_SEMANTICS_VERSION;
  runtime: RustRuntimeIdentity;
  toolchain: { channel: typeof RUST_TOOLCHAIN; edition: '2021' };
  options: { resource_policy: 'reference-v0.1' };
  module: { path: 'program.rs'; source: string; sha256: string };
}
/** Describes the future runner's result; this change does not execute Rust modules. */
export interface RustExecutionResult extends Omit<ProgramExecutionResult, 'interpreter_version'> {
  compiled_artifact_id: string;
  backend: 'rust';
  compiler_version: typeof RUST_BACKEND_VERSION;
  execution_semantics_version: typeof PROGRAM_EXECUTION_SEMANTICS_VERSION;
  runtime: RustRuntimeIdentity;
}
export interface RustSourceFile {
  path: string;
  source: string;
}

function invalid(path: string, rule: string, message: string): never {
  throw new ClearingsError('INVALID_COMPILED_PROGRAM', `${path || '/'}: ${message}`, 2, {
    path,
    rule,
  });
}
function portable(value: unknown): void {
  try {
    assertPortable(value, RUST_ARTIFACT_LIMITS.portable_values);
  } catch (error) {
    if (!(error instanceof ClearingsError)) throw error;
    invalid('', 'portability', error.message);
  }
}
function object(
  value: unknown,
  keys: string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid(path, 'shape', 'Expected exactly the declared fields.');
}
function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) invalid(path, 'compatibility', 'Unsupported value or version.');
}
function sourceBytes(source: unknown, path: string, maximum: number): number {
  if (typeof source !== 'string')
    invalid(path, 'source', 'Source must be well-formed Unicode text.');
  if (source.length > maximum) invalid(path, 'source-limit', 'Source exceeds its byte limit.');
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        invalid(path, 'source', 'Source contains an unpaired surrogate.');
    } else if (code >= 0xdc00 && code <= 0xdfff)
      invalid(path, 'source', 'Source contains an unpaired surrogate.');
  }
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > maximum) invalid(path, 'source-limit', 'Source exceeds its byte limit.');
  return bytes;
}
function runtimeIdentity(value: unknown): asserts value is RustRuntimeIdentity {
  object(value, ['abi_version', 'source_id'], '/runtime');
  exact(value.abi_version, RUST_RUNTIME_ABI_VERSION, '/runtime/abi_version');
  if (typeof value.source_id !== 'string' || !/^rust-runtime:[a-f0-9]{64}$/.test(value.source_id))
    invalid('/runtime/source_id', 'identity', 'Expected a runtime source identity.');
}

/** Pure source inventory digest. No supplied paths are opened or executed. */
export function rustRuntimeIdentity(files: readonly RustSourceFile[]): RustRuntimeIdentity {
  portable(files);
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length > RUST_ARTIFACT_LIMITS.runtime_files
  )
    invalid('/runtime', 'source-limit', 'Expected a bounded, nonempty runtime source inventory.');
  let bytes = 0;
  const paths = new Set<string>();
  const inventory = files
    .map((file, index) => {
      object(file, ['path', 'source'], `/runtime/${index}`);
      if (
        typeof file.path !== 'string' ||
        file.path.length > 256 ||
        !/^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(file.path) ||
        paths.has(file.path)
      )
        invalid(`/runtime/${index}/path`, 'path', 'Expected a unique relative source path.');
      paths.add(file.path);
      bytes += sourceBytes(
        file.source,
        `/runtime/${index}/source`,
        RUST_ARTIFACT_LIMITS.runtime_bytes,
      );
      if (bytes > RUST_ARTIFACT_LIMITS.runtime_bytes)
        invalid('/runtime', 'source-limit', 'Runtime inventory exceeds its byte limit.');
      return { path: file.path, sha256: sha256(file.source as string) };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!paths.has('Cargo.toml') || !paths.has('src/lib.rs'))
    invalid('/runtime', 'source', 'Runtime inventory must include Cargo.toml and src/lib.rs.');
  return { abi_version: RUST_RUNTIME_ABI_VERSION, source_id: digest('rust-runtime', inventory) };
}

/** Shared compiler preparation boundary, before canonical hashing or validation. */
export function validateCompilationInput(value: unknown): asserts value is Program {
  portable(value);
  let units = 0;
  const add = (count: number) => {
    units += count;
    if (units > RUST_ARTIFACT_LIMITS.input_units)
      invalid('/program', 'input-limit', 'Program exceeds the compilation preparation limit.');
  };
  const visit = (value: unknown): void => {
    add(1 + (typeof value === 'string' ? value.length : 0));
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        add(key.length);
        visit(child);
      }
  };
  visit(value);
  // Static language diagnostics retain their existing INVALID_PROGRAM identity.
  validateProgram(value);
}

function checkArtifact(value: unknown): asserts value is RustCompiledArtifact {
  portable(value);
  object(
    value,
    [
      'schema_version',
      'kind',
      'artifact_id',
      'program_id',
      'backend',
      'compiler_version',
      'execution_semantics_version',
      'runtime',
      'toolchain',
      'options',
      'module',
    ],
    '',
  );
  exact(value.schema_version, '0.1.0', '/schema_version');
  exact(value.kind, 'compiled-program', '/kind');
  exact(value.backend, 'rust', '/backend');
  exact(value.compiler_version, RUST_BACKEND_VERSION, '/compiler_version');
  exact(
    value.execution_semantics_version,
    PROGRAM_EXECUTION_SEMANTICS_VERSION,
    '/execution_semantics_version',
  );
  runtimeIdentity(value.runtime);
  object(value.toolchain, ['channel', 'edition'], '/toolchain');
  exact(value.toolchain.channel, RUST_TOOLCHAIN, '/toolchain/channel');
  exact(value.toolchain.edition, '2021', '/toolchain/edition');
  object(value.options, ['resource_policy'], '/options');
  exact(value.options.resource_policy, 'reference-v0.1', '/options/resource_policy');
  object(value.module, ['path', 'source', 'sha256'], '/module');
  exact(value.module.path, 'program.rs', '/module/path');
  sourceBytes(value.module.source, '/module/source', RUST_ARTIFACT_LIMITS.source_bytes);
  if (value.module.sha256 !== sha256(value.module.source as string))
    invalid('/module/sha256', 'identity', 'Module bytes differ from their digest.');
  if (typeof value.program_id !== 'string' || !/^program:[a-f0-9]{64}$/.test(value.program_id))
    invalid('/program_id', 'identity', 'Expected a program identity.');
  const { artifact_id, ...body } = value;
  if (artifact_id !== digest('compiled-program', body))
    invalid('/artifact_id', 'identity', 'Compiled artifact content identity differs.');
}

/** Checks integrity and expected source/runtime binding, not compiler correctness or code safety. */
export function validateRustArtifact(
  value: unknown,
  program: unknown,
  expectedRuntime: RustRuntimeIdentity,
): asserts value is RustCompiledArtifact {
  checkArtifact(value);
  validateCompilationInput(program);
  portable(expectedRuntime);
  runtimeIdentity(expectedRuntime);
  exact(value.program_id, program.artifact_id, '/program_id');
  exact(value.runtime.source_id, expectedRuntime.source_id, '/runtime/source_id');
}

/** Seal caller-supplied target source. This is an artifact constructor, not a compiler. */
export function sealRustArtifact(
  program: unknown,
  source: string,
  runtime: RustRuntimeIdentity,
): RustCompiledArtifact {
  validateCompilationInput(program);
  portable(runtime);
  runtimeIdentity(runtime);
  sourceBytes(source, '/module/source', RUST_ARTIFACT_LIMITS.source_bytes);
  const body = {
    schema_version: '0.1.0',
    kind: 'compiled-program',
    program_id: program.artifact_id,
    backend: 'rust',
    compiler_version: RUST_BACKEND_VERSION,
    execution_semantics_version: PROGRAM_EXECUTION_SEMANTICS_VERSION,
    runtime,
    toolchain: { channel: RUST_TOOLCHAIN, edition: '2021' },
    options: { resource_policy: 'reference-v0.1' },
    module: { path: 'program.rs', source, sha256: sha256(source) },
  };
  const artifact = normalized({ ...body, artifact_id: digest('compiled-program', body) });
  validateRustArtifact(artifact, program, runtime);
  return artifact;
}
