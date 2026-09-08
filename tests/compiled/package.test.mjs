import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
test(
  'packed compiler assets and CLI execute without checkout sources or interpreter execution',
  { timeout: 150_000 },
  (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'clearings-rust-package-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const archive = join(dir, 'archive');
    mkdirSync(archive);
    const [packed] = JSON.parse(
      execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archive], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
      }),
    );
    for (const path of ['main.rs', 'protocol.rs', 'output.rs'])
      assert(packed.files.some((file) => file.path === `runtime/rust/runner/${path}`));
    assert(!packed.files.some((file) => /^(src|tests|website|benchmarks)\//.test(file.path)));
    // Install Clearings and its locked third-party dependencies from local tarballs. This
    // exercises npm's package layout and executable links without depending on registry access.
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    const overrides = {};
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (!path.startsWith('node_modules/') || entry.dev) continue;
      const dependency = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
      assert.equal(dependency.version, entry.version);
      const [local] = JSON.parse(
        execFileSync(
          'npm',
          ['pack', '--json', '--ignore-scripts', '--pack-destination', archive, join(root, path)],
          {
            cwd: dir,
            encoding: 'utf8',
            timeout: 30_000,
          },
        ),
      );
      overrides[dependency.name] = `file:${join(archive, local.filename)}`;
    }
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'clearings-runner-consumer', private: true, overrides }),
    );
    execFileSync(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        join(archive, packed.filename),
      ],
      {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    const installed = join(dir, 'node_modules/clearings');
    const installedCommand = join(dir, 'node_modules/.bin/clearings');
    const linked = JSON.parse(
      execFileSync(
        installedCommand,
        ['program', 'demo', 'identity', '--backend', 'rust', '--format', 'json'],
        {
          cwd: dir,
          encoding: 'utf8',
          timeout: 60_000,
        },
      ),
    );
    assert.deepEqual(linked.completion, { kind: 'return', value: 'Clearings' });
    writeFileSync(
      join(installed, 'dist/program/interpreter.js'),
      'export function executeProgram() { throw new Error("Interpreter execution is forbidden in this package test."); }\n',
    );
    const cli = join(installed, 'dist/cli/main.js');
    const run = (args) =>
      spawnSync(process.execPath, [cli, 'program', ...args], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 60_000,
      });
    for (const [name, expected] of [
      ['closure', ['root', 'a', 'z', 'y', 'b']],
      ['identity', 'Clearings'],
      ['sum', 5],
    ]) {
      const result = run(['demo', name, '--backend', 'rust', '--format', 'json']);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      // Authored fixtures define these application outcomes independently of an execution engine.
      assert.deepEqual(output.completion.value, expected);
      assert.equal(output.backend, 'rust');
    }
    const exported = join(dir, 'export');
    const result = run(['compile', 'closure', '--out', exported, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(join(exported, 'program.rs'), 'utf8'),
      JSON.parse(result.stdout).module.source,
    );
    const script = join(installed, 'consumer.mjs');
    writeFileSync(
      script,
      `import { readFileSync } from 'node:fs';
import { executeRustProgram } from 'clearings/compiler';
const program = JSON.parse(readFileSync(new URL('./programs/examples/identity.json', import.meta.url), 'utf8'));
console.log(JSON.stringify(executeRustProgram(program, ['consumer\\ud800']).completion));\n`,
    );
    assert.deepEqual(
      JSON.parse(
        execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', timeout: 60_000 }),
      ),
      { kind: 'return', value: 'consumer\ud800' },
    );
    // A driver panic is an operational failure, never an interpreter fallback or language failure.
    writeFileSync(
      join(installed, 'runtime/rust/runner/main.rs'),
      'fn main() { panic!("deliberate process failure"); }\n',
    );
    const failed = run(['demo', 'identity', '--backend', 'rust', '--format', 'json']);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).diagnostics[0].code, 'RUST_EXECUTION_FAILED');
  },
);
