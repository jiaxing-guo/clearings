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
import { PROGRAM_EXECUTION_DEFAULT_LIMITS, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';

const runtimeRoot = new URL('../../runtime/rust/', import.meta.url);
export const runtimeFiles = [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  ...readdirSync(new URL('src/', runtimeRoot))
    .filter((p) => p.endsWith('.rs'))
    .map((p) => `src/${p}`),
].map((path) => ({ path, source: readFileSync(new URL(path, runtimeRoot), 'utf8') }));
export const runtimeIdentity = rustRuntimeIdentity(runtimeFiles);
const units = (text) =>
  `vec![${Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).join(',')}]`;
function owned(value) {
  if (value === null) return 'OwnedValue::Null';
  if (typeof value === 'boolean') return `OwnedValue::Boolean(${value})`;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Test arguments require portable integers.');
    return `OwnedValue::Integer(${value})`;
  }
  if (typeof value === 'string') return `OwnedValue::String(${units(value)})`;
  if (Array.isArray(value)) return `OwnedValue::List(vec![${value.map(owned).join(',')}])`;
  return `OwnedValue::Record(vec![${Object.entries(value)
    .map(([key, v]) => `(${units(key)},${owned(v)})`)
    .join(',')}])`;
}

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
  if (artifacts.reduce((sum, a) => sum + Buffer.byteLength(a.module.source), 0) > 32 * 1024 * 1024)
    throw new Error('Native test modules exceed 32 MiB.');
  let source = 'use clearings_runtime::*;\nmod support;\n';
  artifacts.forEach((_, i) => (source += `mod program_${i};\n`));
  cases.forEach(({ program = 0, args, limits = {} }, i) => {
    if (!Number.isInteger(program) || !artifacts[program])
      throw new Error('Invalid test program index.');
    const resolved = { ...PROGRAM_EXECUTION_DEFAULT_LIMITS, ...limits };
    if (
      Object.keys(resolved).length !== 4 ||
      Object.entries(resolved).some(
        ([key, n]) => !Number.isSafeInteger(n) || n < 1 || n > PROGRAM_EXECUTION_MAX_LIMITS[key],
      )
    )
      throw new Error('Invalid test limits.');
    source += `fn case_${i}() -> (String, u128) {\nlet args = vec![${args.map(owned).join(',')}];\nlet limits = Limits { ${Object.entries(
      resolved,
    )
      .map(([k, v]) => `${k}: ${v}`)
      .join(
        ',',
      )} };\nlet start = std::time::Instant::now();\nlet result = program_${program}::execute(&args, limits);\nlet nanos = start.elapsed().as_nanos();\nlet output = match result {\nOk(result) => support::execution(result.limits, result.usage, &result.completion),\nErr(program_${program}::ExecutionError::Input(error)) => support::input_error(&error),\nErr(error) => panic!("Host failure: {error:?}"),\n};\n(output, nanos)\n}\n`;
    if (Buffer.byteLength(source) > 8 * 1024 * 1024)
      throw new Error('Native test harness exceeds 8 MiB.');
  });
  source += `fn main() {\nlet mut nanos = 0u128;\nfor iteration in 0..${repeat} {\n`;
  cases.forEach(
    (_, i) =>
      (source += `let (output, elapsed) = case_${i}();\nnanos += elapsed;\nif iteration == 0 { println!("{output}"); }\n`),
  );
  source += '}\neprintln!("{nanos}");\n}\n';
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
