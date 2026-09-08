import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeProgram } from 'clearings/program';
import { executeRustProgram, writeRustProgram, RUST_TOOLCHAIN } from 'clearings/compiler';
import { renderProgramExecution } from 'clearings/program';
import { languageSuite, preparationSuite } from '../native/language-corpus.mjs';

const fixture = (path) =>
  JSON.parse(readFileSync(new URL(`../../programs/${path}.json`, import.meta.url), 'utf8'));
const cli = new URL('../../dist/cli/main.js', import.meta.url).pathname;
const observed = ({ limits, usage, completion }) => ({ limits, usage, completion });
const temporary = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clearings-compiled-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test(
  'the public native runner preserves values, completions, accounting, and backend identities',
  { timeout: 180_000 },
  () => {
    const identity = fixture('examples/identity'),
      sum = fixture('examples/sum-nonnegative'),
      closure = fixture('clearings/required-dependency-closure');
    const cases = [
      [identity, ['```\nfn main(){}\u001b\ud800\0😀']],
      [sum, [[0, 1, 2, 3]]],
      [sum, [[-1]]],
      [sum, [[Number.MAX_SAFE_INTEGER, 1]]],
      [closure, fixture('clearings/required-dependency-closure.arguments')],
      ...['work', 'allocation_units', 'value_units', 'evaluation_depth'].map((resource) => [
        identity,
        ['abc'],
        { [resource]: 1 },
      ]),
      [identity, ['a'], { work: 25 }],
    ];
    // Record keys, nested values, booleans, aliasing, and operation-order cases traverse the production transport.
    const language = languageSuite();
    for (const index of [0, 17, 18, 30, 35, 45]) {
      const item = language.cases[index];
      cases.push([language.programs[item.program], item.args, item.limits]);
    }
    // Largest admitted arguments exercise binary transport rather than expanded Rust source.
    const preparation = preparationSuite();
    for (const item of preparation.cases.filter((item) => item.expected.kind === 'return'))
      cases.push([preparation.programs[item.program], item.args, item.limits]);
    for (const [program, args, options] of cases) {
      const expected = executeProgram(program, args, options);
      const native = executeRustProgram(program, args, options);
      assert.deepEqual(observed(native), observed(expected));
      assert.equal(native.program_id, program.artifact_id);
      assert.equal(native.backend, 'rust');
      assert(!Object.hasOwn(native, 'interpreter_version'));
      assert.match(native.compiled_artifact_id, /^compiled-program:[a-f0-9]{64}$/);
      assert.match(native.runner.source_id, /^rust-runner:[a-f0-9]{64}$/);
      assert.equal(native.compiler_version, '0.1.1');
      assert.match(renderProgramExecution(native), /compiled_artifact_id/);
    }
  },
);

test(
  'Rust CLI retains completion exit codes, exact reports, and explicit argument paths',
  { timeout: 120_000 },
  (t) => {
    const dir = temporary(t),
      input = join(dir, 'args.json');
    const run = (args) =>
      spawnSync(process.execPath, [cli, 'program', ...args], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 60_000,
      });
    for (const [args, options, status] of [
      [[[2, 3]], [], 0],
      [[[-1]], [], 1],
      [[[Number.MAX_SAFE_INTEGER, 1]], [], 1],
      [[[2, 3]], ['--work', '1'], 3],
    ]) {
      writeFileSync(input, JSON.stringify(args));
      const output = join(dir, `result-${status}-${options.length}-${args[0][0]}.json`);
      const result = run([
        'run',
        'sum',
        input,
        '--backend',
        'rust',
        '--format',
        'json',
        '--out',
        output,
        ...options,
      ]);
      assert.equal(result.status, status, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), result.stdout);
      assert.equal(JSON.parse(result.stdout).backend, 'rust');
    }
    const demo = run(['demo', '--backend', 'rust']);
    assert.equal(demo.status, 0, demo.stderr);
    assert.match(demo.stdout, /fresh compiled Rust execution/);
    assert.match(demo.stdout, /"root",/);
    assert.match(demo.stdout, /rust-runner:/);
  },
);

test(
  'native request decoder rejects malformed streams under the pinned toolchain',
  { timeout: 60_000 },
  (t) => {
    const dir = temporary(t),
      output = join(dir, 'build');
    writeRustProgram(fixture('examples/identity'), output);
    const rustc = (args) =>
      execFileSync(
        'rustup',
        ['run', RUST_TOOLCHAIN, 'rustc', '--edition=2021', '-D', 'warnings', ...args],
        { cwd: output, timeout: 60_000 },
      );
    rustc([
      '--crate-name',
      'clearings_runtime',
      '--crate-type',
      'rlib',
      'runtime/src/lib.rs',
      '-o',
      'libclearings_runtime.rlib',
    ]);
    rustc([
      '--test',
      'protocol.rs',
      '--extern',
      'clearings_runtime=libclearings_runtime.rlib',
      '-o',
      'protocol-tests',
    ]);
    const text = execFileSync(join(output, 'protocol-tests'), [], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.match(text, /2 passed/);
  },
);
