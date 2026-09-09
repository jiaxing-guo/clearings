import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeProgram, sealProgram, PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'dist/cli/main.js');
const paths = {
  closure: 'clearings/required-dependency-closure',
  identity: 'examples/identity',
  sum: 'examples/sum-nonnegative',
};
const fixture = (name, suffix = '') =>
  JSON.parse(readFileSync(join(root, 'programs', paths[name] + suffix + '.json'), 'utf8'));
const run = (args, options = {}) =>
  spawnSync(process.execPath, [cli, 'program', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
const parsed = (result, status = 0) => {
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stderr + result.stdout);
  return JSON.parse(result.stdout);
};
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clearings-program-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const write = (dir, name, value) => {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
};
const invalid = (args, code = 'INVALID_ARGUMENTS', options) => {
  const result = parsed(run(args, options), 2);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics[0].code, code);
  return result.diagnostics[0];
};

test('program help and catalog expose short commands and all bundled entry points', () => {
  for (const args of [[], ['--help'], ['help']]) {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /npm run program -- demo/);
  }
  const catalog = parsed(run(['list', '--format', 'json']));
  assert.deepEqual(
    catalog.map((entry) => entry.name),
    ['closure', 'identity', 'sum'],
  );
  for (const entry of catalog) {
    assert.equal(entry.program_id, fixture(entry.name).artifact_id);
    assert.equal(entry.entry_function, fixture(entry.name).entry_function);
  }
  assert.match(run(['list']).stdout, /Ordered required dependency closure/);
});

test('each demo executes the packaged arguments freshly and returns the exact library result', () => {
  for (const name of Object.keys(paths)) {
    const result = run(['demo', name, '--format', 'json']);
    assert.deepEqual(parsed(result), executeProgram(fixture(name), fixture(name, '.arguments')));
    assert.match(result.stderr, /Authored example: .*fresh interpreter execution/);
  }
  const result = parsed(run(['demo', '--format', 'json']));
  assert.deepEqual(result.completion, { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] });
  const human = run(['demo']);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /Authored example: closure/);
  assert.match(human.stdout, /Completion: \*\*return\*\*/);
  assert.match(human.stdout, /\| work \| Cumulative \|/);
});

test('validation and inspection preserve canonical JSON and identify static scope', () => {
  for (const name of Object.keys(paths)) {
    assert.deepEqual(parsed(run(['inspect', name, '--format', 'json'])), fixture(name));
    assert.deepEqual(parsed(run(['validate', name, '--format', 'json'])), {
      program_id: fixture(name).artifact_id,
      valid: true,
      executed: false,
    });
  }
  const report = run(['inspect', 'closure']);
  assert.equal(report.status, 0);
  assert.match(report.stdout, /function required_dependency_closure\(/);
  assert.match(report.stdout, /function lookup\(/);
  assert.match(report.stdout, /fail MISSING_REQUIRED_DEPENDENCY\(x\)/);
  assert.match(report.stdout, /\/functions\/5/);
});

test('custom runs require explicit positional arguments and resolve paths from the working directory', (t) => {
  const cwd = temp(t);
  write(cwd, 'custom.json', fixture('identity'));
  write(cwd, 'input.json', ['own input']);
  const result = parsed(run(['run', 'custom.json', 'input.json', '--format', 'json'], { cwd }));
  assert.deepEqual(result.completion, { kind: 'return', value: 'own input' });
  assert.deepEqual(
    parsed(run(['run', 'identity', 'input.json', '--format', 'json'], { cwd })),
    result,
  );
  // A relative path disambiguates a file from a built-in name.
  write(cwd, 'sum', fixture('identity'));
  assert.deepEqual(
    parsed(run(['run', './sum', 'input.json', '--format', 'json'], { cwd })),
    result,
  );
  invalid(['run', 'identity']);
  invalid(['demo', 'custom.json'], 'INVALID_ARGUMENTS', { cwd });
});

test('static inspection does not evaluate loops, indexing, or other runtime operations', (t) => {
  const cwd = temp(t);
  const program = sealProgram({
    schema_version: '0.1.0',
    kind: 'program',
    name: 'Nonterminating inspection fixture',
    entry_function: 'main',
    functions: [
      {
        id: 'main',
        parameters: [],
        returns: { kind: 'integer' },
        failures: [],
        body: [
          {
            kind: 'while',
            condition: { kind: 'literal', type: { kind: 'boolean' }, value: true },
            body: [],
          },
          {
            kind: 'return',
            value: {
              kind: 'index',
              list: { kind: 'list', element_type: { kind: 'integer' }, items: [] },
              index: { kind: 'literal', type: { kind: 'integer' }, value: 0 },
            },
          },
        ],
      },
    ],
  });
  const path = write(cwd, 'loop.json', program),
    args = write(cwd, 'arguments.json', []);
  assert.equal(run(['validate', path]).status, 0);
  assert.match(run(['inspect', path]).stdout, /while literal<boolean>\(true\)/);
  assert.equal(
    parsed(run(['run', path, args, '--work', '10', '--format', 'json']), 3).completion.kind,
    'resource-exhaustion',
  );
});

test('application failures and runtime faults retain distinct completions and source diagnostics', (t) => {
  const dir = temp(t);
  for (const [values, kind, code] of [
    [[2, -1, 3], 'application-failure', 'NEGATIVE_VALUE'],
    [[Number.MAX_SAFE_INTEGER, 1], 'runtime-fault', 'INTEGER_OVERFLOW'],
  ]) {
    const path = write(dir, `${kind}.json`, [values]);
    const result = parsed(run(['run', 'sum', path, '--format', 'json']), 1);
    assert.deepEqual(result, executeProgram(fixture('sum'), [values]));
    assert.equal(result.completion.kind, kind);
    assert.equal(result.completion.code, code);
    assert.match(result.completion.diagnostic.path, /^\/functions\//);
    assert.equal(result.completion.diagnostic.call_stack[0].function_id, 'sum');
    const human = run(['run', 'sum', path]);
    assert.equal(human.status, 1);
    assert(human.stdout.includes(`Completion: **${kind}**`));
    assert(human.stdout.includes(code));
  }
});

test('each CLI resource limit maps to the interpreter and exhaustion exits with status three', () => {
  const limits = {
    work: 'work',
    'allocation-units': 'allocation_units',
    'value-units': 'value_units',
    'evaluation-depth': 'evaluation_depth',
  };
  for (const [flag, resource] of Object.entries(limits)) {
    const result = parsed(run(['demo', '--format', 'json', `--${flag}`, '1']), 3);
    assert.deepEqual(
      result,
      executeProgram(fixture('closure'), fixture('closure', '.arguments'), { [resource]: 1 }),
    );
    assert.equal(result.completion.resource, resource);
    invalid(['demo', `--${flag}`, String(PROGRAM_EXECUTION_MAX_LIMITS[resource] + 1)]);
  }
  const result = run(['demo', '--work', '1']);
  assert.equal(result.status, 3);
  assert.match(result.stdout, /Completion: \*\*resource-exhaustion\*\*/);
});

test('unsupported actions, incompatible options, and malformed limits fail before execution', () => {
  for (const args of [
    ['replay'],
    ['demo', '--backend', 'javascript'],
    ['inspect', 'closure', '--backend', 'rust'],
    ['compile', 'closure'],
    ['compile', 'closure', '--backend', 'interpreter', '--out', 'unused'],
    ['compile', 'closure', '--out', 'unused', '--work', '1'],
    ['list', 'extra'],
    ['inspect'],
    ['validate', 'identity', 'extra'],
    ['demo', 'identity', 'extra'],
    ['demo', '--format', 'html'],
    ['inspect', 'identity', '--work', '1'],
    ['demo', '--suite', 'smoke'],
    ['demo', '--unknown'],
    ['demo', '--out', ''],
    ['demo', '--work', '0'],
    ['demo', '--work=-1'],
    ['demo', '--work', '1.5'],
    ['demo', '--work', '1e3'],
    ['demo', '--work', '+2'],
    ['demo', '--work', ' 2'],
    ['demo', '--work', 'Infinity'],
    ['demo', '--work', '9007199254740992'],
  ])
    invalid(args);
});

test('invalid programs and arguments retain validation details and create no report', (t) => {
  const dir = temp(t),
    out = join(dir, 'absent', 'report.json');
  const damaged = fixture('identity');
  damaged.artifact_id = 'program:' + '0'.repeat(64);
  const path = write(dir, 'damaged.json', damaged);
  const programDiagnostic = invalid(['validate', path, '--out', out], 'INVALID_PROGRAM');
  assert.equal(typeof programDiagnostic.details.path, 'string');
  assert.equal(typeof programDiagnostic.details.rule, 'string');
  for (const value of [
    { value: 'wrong shape' },
    [1],
    [],
    ['ok', 'extra'],
    ['x'.repeat(1_000_001)],
  ]) {
    const args = write(dir, 'arguments.json', value);
    const diagnostic = invalid(
      ['run', 'identity', args, '--out', out],
      'INVALID_PROGRAM_EXECUTION',
    );
    assert.equal(typeof diagnostic.details.path, 'string');
    assert.equal(typeof diagnostic.details.rule, 'string');
  }
  assert.equal(existsSync(join(dir, 'absent')), false);
});

test('input files are bounded, regular, strict UTF-8 JSON', (t) => {
  const dir = temp(t),
    path = join(dir, 'input.json');
  invalid(['inspect', join(dir, 'missing')], 'INVALID_JSON');
  invalid(['inspect', dir], 'INVALID_JSON');
  for (const bytes of [
    '{',
    Buffer.from([0x22, 0xc3, 0x28, 0x22]),
    ' '.repeat(8 * 1024 * 1024 + 1),
  ]) {
    writeFileSync(path, bytes);
    invalid(['inspect', path], 'INVALID_JSON');
  }
  const fifo = join(dir, 'fifo');
  execFileSync('mkfifo', [fifo]);
  invalid(['inspect', fifo], 'INVALID_JSON');
});

test('reports save exact stdout bytes to new files for every output format and completion', (t) => {
  const dir = temp(t),
    args = write(dir, 'failure.json', [[-1]]);
  for (const format of ['markdown', 'json']) {
    for (const [name, command, status] of [
      ['list', ['list'], 0],
      ['validate', ['validate', 'sum'], 0],
      ['inspect', ['inspect', 'closure'], 0],
      ['return', ['demo'], 0],
      ['failure', ['run', 'sum', args], 1],
      ['exhaustion', ['demo', '--work', '1'], 3],
    ]) {
      const out = join(dir, format, `${name}.txt`);
      const result = run([...command, '--format', format, '--out', out]);
      assert.equal(result.status, status, result.stderr);
      assert.equal(readFileSync(out, 'utf8'), result.stdout);
      assert(result.stdout.endsWith('\n'));
    }
  }
});

test('output protection preserves existing files, inputs, and symlink targets', (t) => {
  const dir = temp(t),
    input = write(dir, 'input.json', ['hello']),
    old = readFileSync(input, 'utf8');
  invalid(['run', 'identity', input, '--out', input], 'INVALID_OUTPUT');
  const link = join(dir, 'link.json');
  symlinkSync(input, link);
  invalid(['demo', '--out', link], 'INVALID_OUTPUT');
  assert.equal(readFileSync(input, 'utf8'), old);
  const target = join(dir, 'missing.json'),
    dangling = join(dir, 'dangling.json');
  symlinkSync(target, dangling);
  invalid(['demo', '--out', dangling], 'INVALID_OUTPUT');
  assert.equal(existsSync(target), false);
});

test('literal strings remain data in machine output and reports', (t) => {
  const dir = temp(t),
    text = '```\n<script>never execute</script>\u001b[31m\u009b\uD800';
  const path = write(dir, 'arguments.json', [text]);
  assert.equal(parsed(run(['run', 'identity', path, '--format', 'json'])).completion.value, text);
  const report = run(['run', 'identity', path]);
  assert.equal(report.status, 0);
  assert.match(report.stdout, /````json\n/);
  assert(report.stdout.includes(JSON.stringify(text)));
});

test('packed CLI resolves all authored program assets independently of the source checkout and cwd', (t) => {
  const dir = temp(t),
    archiveDir = join(dir, 'archive');
  mkdirSync(archiveDir);
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archiveDir], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    }),
  )[0];
  for (const path of Object.values(paths)) {
    for (const suffix of ['', '.arguments'])
      assert(packed.files.some((file) => file.path === `programs/${path}${suffix}.json`));
  }
  assert(!packed.files.some((file) => file.path.endsWith('required-dependency-closure.mjs')));
  execFileSync('tar', ['-xzf', join(archiveDir, packed.filename), '-C', archiveDir]);
  const installed = join(archiveDir, 'package');
  // Reuse dependencies only. The executable, schemas and JSON assets come from the tarball.
  symlinkSync(join(root, 'node_modules'), join(installed, 'node_modules'), 'dir');
  for (const name of Object.keys(paths)) {
    const result = spawnSync(
      process.execPath,
      [join(installed, 'dist/cli/main.js'), 'program', 'demo', name, '--format', 'json'],
      { cwd: dir, encoding: 'utf8', timeout: 10_000 },
    );
    assert.deepEqual(parsed(result), executeProgram(fixture(name), fixture(name, '.arguments')));
  }
});
