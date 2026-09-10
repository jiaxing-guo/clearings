import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, delimiter } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('dist/node');
mkdirSync(output, { recursive: true });
const npmCli =
  process.env.npm_execpath ??
  join(
    dirname(process.execPath),
    process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : '../lib/node_modules/npm/bin/npm-cli.js',
  );
function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options });
}
const native = JSON.parse(
  run(process.execPath, [
    npmCli,
    'pack',
    '--workspace',
    '@clearings/native',
    '--pack-destination',
    output,
    '--json',
  ]),
)[0];
const sdk = JSON.parse(
  run(process.execPath, [
    npmCli,
    'pack',
    '--workspace',
    '@clearings/sdk',
    '--pack-destination',
    output,
    '--json',
  ]),
)[0];
assert(native.files.some((f) => f.path === 'clearings.node'));
assert(![...native.files, ...sdk.files].some((f) => /^(src|target)\//.test(f.path)));
const project = mkdtempSync(join(tmpdir(), 'clearings-installed-node-'));
try {
  const path = process.env.PATH.split(delimiter).filter((p) => !/(cargo|rustup)/i.test(p));
  const env = { ...process.env, PATH: [dirname(process.execPath), ...path].join(delimiter) };
  assert.notEqual(spawnSync('rustc', ['--version'], { env }).status, 0);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    process.execPath,
    [
      npmCli,
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(output, native.filename),
      join(output, sdk.filename),
    ],
    { cwd: project, env },
  );
  copyFileSync('tests/sdk/fixtures.mjs', join(project, 'fixtures.mjs'));
  copyFileSync('contracts/execution-cases.json', join(project, 'cases.json'));
  const check = readFileSync('tests/sdk/parity.mjs', 'utf8').replace(
    '../../contracts/execution-cases.json',
    './cases.json',
  );
  writeFileSync(join(project, 'check.mjs'), check);
  writeFileSync(join(output, 'check.mjs'), check);
  copyFileSync('tests/sdk/fixtures.mjs', join(output, 'fixtures.mjs'));
  copyFileSync('contracts/execution-cases.json', join(output, 'cases.json'));
  const records = JSON.parse(run(process.execPath, ['check.mjs'], { cwd: project, env }));
  writeFileSync(join(output, 'results.json'), JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify({ installed_cases: records.length, native: true }));
} finally {
  rmSync(project, { recursive: true, force: true });
}
