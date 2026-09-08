import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ClearingsError } from '../model/types.js';
import { digest } from '../semantics/identity.js';
import { sha256 } from '../repository/source.js';
import { prepareProgramExecution } from '../program/preparation.js';
import type { ProgramExecutionOptions } from '../program/execution.js';
import { compileRust } from './rust.js';
import { rustRuntimeIdentity, RUST_TOOLCHAIN } from './artifacts.js';
import type { RustCompiledArtifact, RustExecutionResult, RustSourceFile } from './artifacts.js';
import { decodeResponse, encodeRequest, RUST_PROCESS_LIMITS } from './transport.js';

export { RUST_PROCESS_LIMITS } from './transport.js';
export const RUST_RUNNER_VERSION = '0.1.0';
export interface RustRunnerIdentity {
  version: typeof RUST_RUNNER_VERSION;
  source_id: string;
}

const runtimePaths = [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  'src/lib.rs',
  'src/execution.rs',
  'src/values.rs',
  'src/inputs.rs',
];
const runnerPaths = ['main.rs', 'protocol.rs', 'output.rs'];
const rustFlags = ['--edition=2021', '-C', 'opt-level=1', '-C', 'debuginfo=0', '-D', 'warnings'];

function assets() {
  const root = new URL('../../runtime/rust/', import.meta.url);
  const read = (paths: string[], prefix: string): RustSourceFile[] =>
    paths.map((path) => ({ path, source: readFileSync(new URL(prefix + path, root), 'utf8') }));
  try {
    const runtime = read(runtimePaths, '');
    const driver = read(runnerPaths, 'runner/');
    const runner: RustRunnerIdentity = {
      version: RUST_RUNNER_VERSION,
      source_id: digest(
        'rust-runner',
        driver
          .map((file) => ({ path: file.path, sha256: sha256(file.source) }))
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      ),
    };
    return { runtime, driver, runner, identity: rustRuntimeIdentity(runtime) };
  } catch {
    throw new ClearingsError(
      'RUST_ASSETS_UNAVAILABLE',
      'Cannot read the packaged Rust runtime and runner source inventory.',
      1,
    );
  }
}

/** Generate deterministic Rust using the runtime shipped with this package. No process is started. */
export function compileRustProgram(program: unknown): RustCompiledArtifact {
  return compileRust(program, assets().identity);
}

function sources(
  artifact: RustCompiledArtifact,
  packaged: ReturnType<typeof assets>,
): RustSourceFile[] {
  const files = [
    { path: 'program.rs', source: artifact.module.source },
    ...packaged.driver,
    ...packaged.runtime.map((file) => ({ ...file, path: `runtime/${file.path}` })),
  ];
  const manifest = {
    compiled_artifact_id: artifact.artifact_id,
    runner: packaged.runner,
    toolchain: artifact.toolchain,
    rustc_flags: rustFlags,
    files: files
      .map((file) => ({ path: file.path, sha256: sha256(file.source) }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  return [
    ...files,
    { path: 'artifact.json', source: JSON.stringify(artifact, null, 2) + '\n' },
    { path: 'build.json', source: JSON.stringify(manifest, null, 2) + '\n' },
  ];
}
function writeSources(directory: string, files: RustSourceFile[]): void {
  for (const file of files) {
    mkdirSync(dirname(join(directory, file.path)), { recursive: true });
    writeFileSync(join(directory, file.path), file.source, { flag: 'wx' });
  }
}

/** Export inspectable source and metadata to a new directory; existing entries are never replaced. */
export function writeRustProgram(program: unknown, destination: string): RustCompiledArtifact {
  if (typeof destination !== 'string' || !destination.trim())
    throw new ClearingsError(
      'INVALID_OUTPUT',
      'Compilation output requires a new directory path.',
      2,
    );
  const packaged = assets();
  const artifact = compileRust(program, packaged.identity);
  const files = sources(artifact, packaged);
  const directory = resolve(destination);
  let created = false;
  try {
    mkdirSync(dirname(directory), { recursive: true });
    mkdirSync(directory, { mode: 0o700 });
    created = true;
    writeSources(directory, files);
  } catch {
    if (created) rmSync(directory, { recursive: true, force: true });
    throw new ClearingsError(
      'INVALID_OUTPUT',
      'Cannot export compilation; --out must name a new writable directory.',
      2,
    );
  }
  return artifact;
}

function build(directory: string): void {
  for (const args of [
    [
      '--crate-name',
      'clearings_runtime',
      '--crate-type',
      'rlib',
      'runtime/src/lib.rs',
      '-o',
      'libclearings_runtime.rlib',
    ],
    [
      'main.rs',
      '--extern',
      'clearings_runtime=libclearings_runtime.rlib',
      '-o',
      process.platform === 'win32' ? 'native.exe' : 'native',
    ],
  ]) {
    const result = spawnSync('rustup', ['run', RUST_TOOLCHAIN, 'rustc', ...rustFlags, ...args], {
      cwd: directory,
      timeout: RUST_PROCESS_LIMITS.compile_timeout_ms,
      maxBuffer: RUST_PROCESS_LIMITS.output_bytes,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0) {
      const unavailable = result.error && 'code' in result.error && result.error.code === 'ENOENT';
      throw new ClearingsError(
        unavailable ? 'RUST_TOOLCHAIN_UNAVAILABLE' : 'RUST_BUILD_FAILED',
        `Cannot build the generated program. Install rustup and Rust ${RUST_TOOLCHAIN}, with a working host linker.`,
        1,
        {
          stage: 'build',
          status: result.status,
          signal: result.signal,
          cause: result.error?.message ?? result.stderr.toString('utf8').slice(0, 16_384),
        },
      );
    }
  }
}

/** Compile validated IR afresh and execute it in a bounded local process; never accept target source. */
export function executeRustProgram(
  input: unknown,
  arguments_: unknown,
  options: ProgramExecutionOptions = {},
): RustExecutionResult {
  const { program, args, limits } = prepareProgramExecution(input, arguments_, options);
  const packaged = assets();
  const artifact = compileRust(program, packaged.identity);
  const request = encodeRequest(args, limits);
  const directory = mkdtempSync(join(tmpdir(), 'clearings-rust-'));
  try {
    writeSources(directory, sources(artifact, packaged));
    build(directory);
    const executable = join(directory, process.platform === 'win32' ? 'native.exe' : 'native');
    const result = spawnSync(executable, [], {
      cwd: directory,
      env: { PATH: '' },
      input: request,
      timeout: RUST_PROCESS_LIMITS.execution_timeout_ms,
      maxBuffer: RUST_PROCESS_LIMITS.output_bytes,
    });
    if (result.error || result.status !== 0 || result.stderr.length !== 0)
      throw new ClearingsError(
        'RUST_EXECUTION_FAILED',
        'Native execution failed outside the language completion contract.',
        1,
        {
          stage: 'execution',
          status: result.status,
          signal: result.signal,
          cause: result.error?.message ?? result.stderr.toString('utf8').slice(0, 16_384),
        },
      );
    return {
      program_id: artifact.program_id,
      backend: 'rust',
      compiled_artifact_id: artifact.artifact_id,
      compiler_version: artifact.compiler_version,
      runtime: artifact.runtime,
      execution_semantics_version: artifact.execution_semantics_version,
      runner: packaged.runner,
      ...decodeResponse(result.stdout, program, limits),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
