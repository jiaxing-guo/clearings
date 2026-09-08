import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRust, rustRuntimeIdentity, RUST_TOOLCHAIN } from 'clearings/compiler';
import { nativeTestSource } from './source.mjs';

const runtimeRoot = new URL('../../runtime/rust/', import.meta.url);
export const runtimeFiles = [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  ...readdirSync(new URL('src/', runtimeRoot))
    .filter((path) => path.endsWith('.rs'))
    .map((path) => `src/${path}`),
].map((path) => ({ path, source: readFileSync(new URL(path, runtimeRoot), 'utf8') }));
export const runtimeIdentity = rustRuntimeIdentity(runtimeFiles);

/** Test-only: compile freshly emitted IR in an isolated directory, with authored fixed inputs.
 * The native process has no interpreter, production closure, AST, JSON parser, or Node dependency.
 * This harness accepts no pre-existing compiled artifact or caller-supplied Rust source.
 */
export function nativeBatch(programs, cases, { repeat = 1, rebuild = false } = {}) {
  if (
    !programs.length ||
    programs.length > 32 ||
    !cases.length ||
    cases.length > 512 ||
    !Number.isInteger(repeat) ||
    repeat < 1 ||
    repeat > 1000
  )
    throw new Error('Native test batch exceeds its bounds.');
  const artifacts = programs.map((program) => compileRust(program, runtimeIdentity));
  if (
    artifacts.reduce((bytes, artifact) => bytes + Buffer.byteLength(artifact.module.source), 0) >
    32 * 1024 * 1024
  )
    throw new Error('Native test modules exceed 32 MiB.');
  const source = nativeTestSource(artifacts.length, cases, repeat);
  const directory = mkdtempSync(join(tmpdir(), 'clearings-native-'));
  const run = (command, args) =>
    execFileSync(command, args, {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const rustc = (args) =>
    run('rustup', [
      'run',
      RUST_TOOLCHAIN,
      'rustc',
      '--edition=2021',
      '-C',
      'opt-level=1',
      '-C',
      'debuginfo=0',
      '-D',
      'warnings',
      ...args,
    ]);
  try {
    mkdirSync(join(directory, 'runtime', 'src'), { recursive: true });
    for (const file of runtimeFiles)
      writeFileSync(join(directory, 'runtime', file.path), file.source);
    artifacts.forEach((artifact, i) =>
      writeFileSync(join(directory, `program_${i}.rs`), artifact.module.source),
    );
    writeFileSync(
      join(directory, 'support.rs'),
      readFileSync(new URL('./support.rs', import.meta.url)),
    );
    writeFileSync(join(directory, 'main.rs'), source);
    const start = performance.now();
    rustc([
      '--crate-name',
      'clearings_runtime',
      '--crate-type',
      'rlib',
      'runtime/src/lib.rs',
      '-o',
      'libclearings_runtime.rlib',
    ]);
    const runtimeMs = performance.now() - start;
    const build = () => {
      const start = performance.now();
      rustc(['main.rs', '--extern', 'clearings_runtime=libclearings_runtime.rlib', '-o', 'native']);
      return performance.now() - start;
    };
    const moduleMs = build();
    const rebuildMs = rebuild ? build() : undefined;
    const executeStart = performance.now();
    const executed = spawnSync(join(directory, 'native'), [], {
      cwd: directory,
      env: { PATH: '' },
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (executed.error) throw executed.error;
    if (executed.status !== 0) throw new Error(`Native test process failed: ${executed.stderr}`);
    const results = executed.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (results.length !== cases.length) throw new Error('Native result count differs.');
    return {
      artifacts,
      results,
      measurements: {
        runtime_compile_ms: runtimeMs,
        module_compile_ms: moduleMs,
        ...(rebuild ? { module_recompile_ms: rebuildMs } : {}),
        executable_bytes: statSync(join(directory, 'native')).size,
        process_ms: performance.now() - executeStart,
        execution_ns: Number(executed.stderr.trim()),
        executions: repeat * cases.length,
      },
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
