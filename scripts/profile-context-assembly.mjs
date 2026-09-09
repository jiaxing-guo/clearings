import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contextCostCases } from './lib/context-cost-cases.mjs';

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { candidate: harnessRoot, samples: 5, repetitions: 10 };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert(
    ['--candidate', '--baseline', '--out', '--samples', '--repetitions'].includes(key) &&
      process.argv[i + 1],
    'Usage: profile-context-assembly.mjs --baseline built-checkout --out new-directory [--candidate built-checkout] [--samples 3..25] [--repetitions 3..100]',
  );
  options[key.slice(2)] = ['--samples', '--repetitions'].includes(key)
    ? Number(process.argv[i + 1])
    : process.argv[i + 1];
}
assert(
  options.baseline && options.out,
  'A baseline checkout and a new output directory are required.',
);
assert(Number.isInteger(options.samples) && options.samples >= 3 && options.samples <= 25);
assert(
  Number.isInteger(options.repetitions) && options.repetitions >= 3 && options.repetitions <= 100,
);
const output = resolve(options.out);
assert(!existsSync(output), 'Output directory already exists.');
const roots = { baseline: resolve(options.baseline), candidate: resolve(options.candidate) };
assert.notEqual(roots.baseline, roots.candidate);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const harnessFiles = [
  'scripts/profile-context-assembly.mjs',
  'scripts/lib/context-cost-worker.mjs',
  'scripts/lib/context-cost-cases.mjs',
];
const harnessIdentity = () =>
  harnessFiles.map((path) => ({
    path,
    sha256: hash(readFileSync(join(harnessRoot, path))),
  }));
const harness = harnessIdentity();
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const { componentFiles } = await import(
  pathToFileURL(join(harnessRoot, 'dist/conformance/recording-identity.js'))
);
const { referenceContextAssembly } = await import(
  pathToFileURL(join(harnessRoot, 'dist/conformance/context-reference.js'))
);
// The independent reference ignores object-key order. Apply the documented stable
// wire ordering here, without importing the production projection or serializer.
const ordered = (value) =>
  Array.isArray(value)
    ? value.map(ordered)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, ordered(value[key])]),
        )
      : value;
const revisions = Object.fromEntries(
  Object.entries(roots).map(([name, root]) => {
    assert.equal(
      git(
        root,
        'status',
        '--porcelain',
        '--',
        'src',
        'dist',
        'programs',
        'schemas',
        'runtime',
        'package.json',
        'package-lock.json',
      ),
      '',
      'Measured implementation must be unchanged.',
    );
    return [
      name,
      {
        commit: git(root, 'rev-parse', 'HEAD'),
        tree: git(root, 'rev-parse', 'HEAD^{tree}'),
        files: componentFiles(root),
      },
    ];
  }),
);
assert.notEqual(revisions.baseline.commit, revisions.candidate.commit);
const cases = (await contextCostCases(harnessRoot)).map((item) => {
  const expected = referenceContextAssembly(item.invocation);
  assert.equal(expected.completion, 'return', `Invalid workload: ${item.id}`);
  const serialized = JSON.stringify(ordered(expected.context)) + '\n';
  assert.equal(Buffer.byteLength(serialized), expected.context.budget.used_bytes);
  const spec = item.invocation.specification;
  return {
    ...item,
    shape: {
      operations: spec.operations.length,
      states: spec.states.length,
      sources: spec.sources.length,
    },
    expected_bytes: Buffer.byteLength(serialized),
    expected_sha256: hash(serialized),
  };
});
mkdirSync(output);
const inputPath = join(output, 'inputs.json');
writeFileSync(inputPath, JSON.stringify(cases) + '\n', { flag: 'wx' });
const inputsHash = hash(readFileSync(inputPath));
const temporary = mkdtempSync(join(tmpdir(), 'clearings-assembly-cost-'));
const worker = join(harnessRoot, 'scripts/lib/context-cost-worker.mjs');
const cache = Object.fromEntries(Object.keys(roots).map((name) => [name, join(temporary, name)]));
const observations = [],
  audits = {};
const started = new Date().toISOString();
function run(name, caseId, mode, directory, count = 1) {
  return JSON.parse(
    execFileSync(process.execPath, [worker, roots[name], inputPath, caseId, mode, String(count)], {
      cwd: roots[name],
      env: { ...process.env, CLEARINGS_NATIVE_CACHE: directory },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180_000,
    }),
  );
}
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min_ms: sorted[0],
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max_ms: sorted.at(-1),
  };
};
try {
  // Audit separately; timed invocations have no diagnostic subscribers.
  for (const [name] of Object.entries(roots)) {
    audits[name] = cases.map((item) => run(name, item.id, 'audit', cache[name]));
    assert.equal(
      audits[name][0].stages.length,
      name === 'candidate' ? 2 : 1,
      'Expected compiled closure with host selection versus compiled closure plus selection.',
    );
  }
  assert.equal(audits.baseline[0].identity.program_id, audits.candidate[0].identity.program_id);
  assert.equal(
    audits.baseline[0].identity.compiled_artifact_id,
    audits.candidate[0].identity.compiled_artifact_id,
  );
  for (let sample = 0; sample < options.samples; sample++) {
    // Alternate version order and rotate workloads to reduce systematic ordering bias.
    const names = sample % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    const ordered = [
      ...cases.slice(sample % cases.length),
      ...cases.slice(0, sample % cases.length),
    ];
    for (const item of ordered) {
      for (const mode of ['cold', 'cached-first', 'resident']) {
        for (const name of names) {
          const coldCache = join(temporary, `cold-${sample}-${item.id}-${name}`);
          assert(!existsSync(coldCache));
          const result = run(
            name,
            item.id,
            mode,
            mode === 'cold' ? coldCache : cache[name],
            mode === 'resident' ? options.repetitions : 1,
          );
          observations.push({ version: name, sample, ...result });
          if (mode === 'cold') rmSync(coldCache, { recursive: true, force: true });
        }
      }
      console.log(JSON.stringify({ sample: sample + 1, workload: item.id, status: 'verified' }));
    }
  }
  for (const [name, root] of Object.entries(roots))
    assert.deepEqual(
      componentFiles(root),
      revisions[name].files,
      'Measured implementation changed during the run.',
    );
  assert.deepEqual(harnessIdentity(), harness, 'Benchmark harness changed during the run.');
  assert.equal(
    hash(readFileSync(inputPath)),
    inputsHash,
    'Benchmark inputs changed during the run.',
  );
  const results = cases.map((item) => ({
    case_id: item.id,
    shape: item.shape,
    context_bytes: item.expected_bytes,
    modes: Object.fromEntries(
      ['cold', 'cached-first', 'resident'].map((mode) => [
        mode,
        Object.fromEntries(
          Object.keys(roots).map((version) => {
            const rows = observations
              .filter(
                (row) => row.case_id === item.id && row.mode === mode && row.version === version,
              )
              .flatMap((row) => row.measurements);
            return [
              version,
              Object.fromEntries(
                ['assembly_ms', 'final_serialization_ms', 'total_ms'].map((metric) => [
                  metric,
                  summarize(rows.map((row) => row[metric])),
                ]),
              ),
            ];
          }),
        ),
      ]),
    ),
  }));
  const report = {
    kind: 'context-assembly-cost',
    schema_version: '0.1.0',
    started_at: started,
    completed_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      os_release: release(),
      cpu: cpus()[0]?.model,
      logical_cpus: cpus().length,
    },
    design: {
      samples: options.samples,
      resident_repetitions_per_process: options.repetitions,
      resident_warmups_per_process: 3,
      cold: 'Fresh Node process and empty native cache; ordinary call prepares on demand.',
      cached_first:
        'Fresh Node process, existing verified native cache, no explicit preparation before the call.',
      resident:
        'Fresh Node process per sample; explicit preparation and three warmups excluded, then repeated calls.',
      timing:
        'assembleContext plus final serializeOperationContext; includes validation, host adapters, all native preparation/invocations, full projection, and byte accounting executed by that mode.',
      exclusions:
        'Node startup/imports, fixture reads, expected-result checks, hashing, diagnostics, audit capture, and benchmark output.',
      quantiles:
        'Upper-middle median and nearest-rank p95. Resident rows are clustered by process.',
      order: 'Sequential execution; alternating version order; rotated workloads per sample.',
    },
    revisions,
    harness,
    inputs_sha256: inputsHash,
    results,
    audits,
    observations,
    limitations: [
      'Small single-host timing sample; no universal performance guarantee or production latency threshold.',
      'Cold means empty executable cache; operating-system filesystem caches and the installed toolchain are not flushed.',
      'All native processes are included in the outer call; host-adapter or process-startup time is not isolated by subtracting microbenchmarks.',
      'Resident p95 values describe these clustered samples, not independently sampled production requests.',
      'Physical memory, event-loop delay, concurrent load, installation, Node startup, and CLI parsing are not measured.',
      'Workloads are one real contract and four authored cases; inputs beyond native limits are covered by compatibility tests, not successful timing samples.',
      'Audit instrumentation and local build products are trusted; audits are separate from uninstrumented timing calls.',
    ],
  };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      directory: output,
      cases: cases.length,
      verified_calls: observations.reduce((n, row) => n + row.measurements.length, 0),
      status: 'pass',
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
