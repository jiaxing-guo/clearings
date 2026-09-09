import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sealProgram } from 'clearings/program';
import { evaluateSelectionCandidate } from '../scripts/evaluate-context-selection.mjs';

const program = JSON.parse(
  readFileSync(new URL('../programs/clearings/context-selection.json', import.meta.url), 'utf8'),
);

test('candidate evaluation rejects an incompatible entry before native execution', () => {
  const candidate = structuredClone(program);
  candidate.functions[0].parameters[0].name = 'other';
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.kind === 'ref' && value.name === 'selected_ids') value.name = 'other';
    Object.values(value).forEach(visit);
  };
  visit(candidate.functions[0].body);
  assert.throws(
    () => evaluateSelectionCandidate(sealProgram(candidate)),
    /frozen selection contract/,
  );
});

test('unavailable native preparation is inconclusive, while observed reference violations still reject', () => {
  const previous = process.env.PATH;
  process.env.PATH = '';
  try {
    const unavailable = evaluateSelectionCandidate(program);
    assert.equal(unavailable.verdict, 'inconclusive');
    assert.deepEqual(unavailable.totals, { accepted: 0, rejected: 0, inconclusive: 4642 });
    assert.equal(unavailable.native.status, 'unavailable');
    assert.equal(unavailable.native.code, 'RUST_TOOLCHAIN_UNAVAILABLE');
    const wrong = structuredClone(program);
    wrong.functions[0].body = [
      {
        kind: 'return',
        value: {
          kind: 'record',
          fields: ['state_ids', 'source_ids'].map((name) => ({
            name,
            value: { kind: 'list', element_type: { kind: 'string' }, items: [] },
          })),
        },
      },
    ];
    const rejected = evaluateSelectionCandidate(sealProgram(wrong));
    assert.equal(rejected.verdict, 'rejected');
    assert(rejected.totals.rejected > 0);
    assert(rejected.totals.inconclusive > 0);
    assert.equal(rejected.totals.accepted, 0);
    assert.equal(rejected.native.status, 'unavailable');
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
});

// Exercise the real CLI in an isolated packet copy. Only host-side native faults are injected.
function isolatedEvaluation(run) {
  const root = mkdtempSync(join(tmpdir(), 'clearings-selection-evaluator-test-'));
  const source = fileURLToPath(new URL('../', import.meta.url));
  try {
    for (const path of ['scripts', 'benchmarks/evaluation'])
      mkdirSync(join(root, path), { recursive: true });
    for (const version of ['context-selection-v1', 'context-selection-review-v1'])
      cpSync(
        join(source, 'benchmarks/evaluation', version),
        join(root, 'benchmarks/evaluation', version),
        { recursive: true },
      );
    cpSync(
      join(source, 'scripts/evaluate-context-selection.mjs'),
      join(root, 'scripts/evaluate-context-selection.mjs'),
    );
    cpSync(join(source, 'package.json'), join(root, 'package.json'));
    symlinkSync(join(source, 'dist'), join(root, 'dist'), 'dir');
    symlinkSync(join(source, 'node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'candidate.json'), JSON.stringify(program));
    const execute = (mode, out = 'report.json') =>
      spawnSync(
        process.execPath,
        [
          ...(mode ? ['--import', join(source, 'tests/helpers/selection-native-faults.mjs')] : []),
          join(root, 'scripts/evaluate-context-selection.mjs'),
          '--candidate',
          join(root, 'candidate.json'),
          '--out',
          join(root, out),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, CLEARINGS_SELECTION_NATIVE_FAULT: mode ?? '' },
        },
      );
    return run({
      root,
      execute,
      report: () => JSON.parse(readFileSync(join(root, 'report.json'), 'utf8')),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('native adapter exceptions retain phase, codes, messages, and case counts', () => {
  for (const [mode, phase, code, message] of [
    ['preparation', 'preparation', 'EACCES', 'cache denied'],
    ['uncoded-preparation', 'preparation', 'NATIVE_ADAPTER_ERROR', 'preparation interrupted'],
    ['unavailable', 'execution', 'EPERM', 'execution denied'],
  ])
    isolatedEvaluation(({ execute, report }) => {
      const result = execute(mode);
      assert.equal(result.status, 2, result.stderr);
      const value = report();
      assert.equal(value.native.status, 'unavailable');
      assert.equal(value.native.observed_cases, 0);
      assert.equal(value.native.unavailable_cases, 4642);
      assert.deepEqual(value.native.failures, [
        { phase, code, message, cases: 4642, first_case: 'states/0/0/0/0' },
      ]);
      assert.deepEqual(value.packet_totals['context-selection-v1'], {
        accepted: 0,
        rejected: 0,
        inconclusive: 4632,
      });
      assert.deepEqual(value.packet_totals['context-selection-review-v1'], {
        accepted: 0,
        rejected: 0,
        inconclusive: 10,
      });
    });
});

test('partial native evidence retains failures beyond examples and observed rejection dominates unknowns', () => {
  isolatedEvaluation(({ execute, report }) => {
    const result = execute('partial');
    assert.equal(result.status, 1, result.stderr);
    const value = report();
    assert.equal(value.native.status, 'partial');
    assert.equal(value.native.observed_cases, 4639);
    assert.equal(value.native.unavailable_cases, 3);
    assert.equal(value.totals.rejected, 21);
    assert.equal(value.totals.inconclusive, 3);
    assert.equal(value.failure_examples.length, 20);
    assert(value.failure_examples.every((item) => item.native.status === 'observed'));
    assert.equal(value.failure_examples_truncated, true);
    assert.deepEqual(
      value.native.failures.map(({ phase, code, cases }) => ({ phase, code, cases })),
      [
        { phase: 'execution', code: 'RUST_EXECUTION_FAILED', cases: 1 },
        { phase: 'execution', code: 'EPERM', cases: 1 },
        { phase: 'execution', code: 'NATIVE_ADAPTER_ERROR', cases: 1 },
      ],
    );
  });
});

test('rewriting a packet and recomputing its manifest cannot reuse a frozen identity or execute packet code', () => {
  for (const version of ['context-selection-v1', 'context-selection-review-v1'])
    isolatedEvaluation(({ root, execute }) => {
      const packet = join(root, 'benchmarks/evaluation', version);
      const path = version === 'context-selection-v1' ? 'cases.mjs' : 'cases.json';
      const bytes =
        version === 'context-selection-v1'
          ? "throw new Error('UNTRUSTED_PACKET_EXECUTED');\n"
          : '[]\n';
      writeFileSync(join(packet, path), bytes);
      const manifestPath = join(packet, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.files.find((file) => file.path === path).sha256 = createHash('sha256')
        .update(bytes)
        .digest('hex');
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const result = execute();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Frozen selection manifest identity differs/);
      assert(!result.stderr.includes('UNTRUSTED_PACKET_EXECUTED'));
      assert(!existsSync(join(root, 'report.json')));
    });
});

test('CLI refuses existing reports and candidate aliases including dangling symlinks', () => {
  isolatedEvaluation(({ root, execute }) => {
    const before = readFileSync(join(root, 'candidate.json'));
    writeFileSync(join(root, 'existing.json'), 'historical report\n');
    symlinkSync(join(root, 'candidate.json'), join(root, 'alias.json'));
    symlinkSync(join(root, 'missing.json'), join(root, 'dangling.json'));
    for (const output of ['candidate.json', 'existing.json', 'alias.json', 'dangling.json']) {
      const result = execute(undefined, output);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /must not replace|already exists/);
    }
    assert.deepEqual(readFileSync(join(root, 'candidate.json')), before);
    assert.equal(readFileSync(join(root, 'existing.json'), 'utf8'), 'historical report\n');
    assert(!existsSync(join(root, 'missing.json')));
  });
});
