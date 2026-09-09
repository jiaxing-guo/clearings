// Evaluator-only harness. The analyzer never imports benchmarks or this script.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, readTarget, validateInventory } from '../dist/index.js';

const [repositoryArg, destinationArg, mode] = process.argv.slice(2);
if (!repositoryArg || !destinationArg)
  throw new Error(
    'Usage: node scripts/measure-inventory.mjs <pinned-bare-repo> <new-output-directory>',
  );
const repository = resolve(repositoryArg);
const output = resolve(destinationArg);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = readTarget(join(root, 'benchmarks/targets/hono.json'));
const rawTarget = JSON.parse(readFileSync(join(root, 'benchmarks/targets/hono.json'), 'utf8'));

if (mode) {
  const started = process.hrtime.bigint();
  const result = inventory({
    repository,
    ref: target.commit,
    expectedCommit: target.commit,
    expectedTree: target.tree_sha,
    include: [
      ...(mode === 'deep' ? target.scope.deep_source_files : target.scope.inventory_roots),
      ...target.scope.supporting_context,
    ],
    exclude: target.scope.excluded_roots,
  });
  validateInventory(result);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const duration_ms = Number(process.hrtime.bigint() - started) / 1e6;
  const artifact = join(output, `${mode}.json`);
  writeFileSync(artifact, json, { flag: 'wx' });
  process.stdout.write(
    JSON.stringify({
      snapshot_id: result.snapshot_id,
      coverage: result.coverage,
      duration_ms,
      node_peak_rss_kib: process.resourceUsage().maxRSS,
      artifact_sha256: createHash('sha256').update(json).digest('hex'),
    }),
  );
} else {
  // Require a bare target and a new sibling output tree. Hash every target file
  // before/after scans to detect writes beyond just source or refs.
  const isBare = execFileSync('git', ['-C', repository, 'rev-parse', '--is-bare-repository'], {
    encoding: 'utf8',
  }).trim();
  if (isBare !== 'true' || output === repository || output.startsWith(`${repository}/`))
    throw new Error('Use a bare benchmark and output outside it.');
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  function fingerprint(directory) {
    const hash = createHash('sha256');
    function visit(path) {
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      )) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (entry.isFile())
          hash.update(full.slice(directory.length)).update('\0').update(readFileSync(full));
        else throw new Error('Unexpected special file in benchmark object store');
      }
    }
    visit(directory);
    return hash.digest('hex');
  }
  const before = fingerprint(repository);
  const scopes = {};
  for (const scope of ['inventory', 'deep']) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const runOutput = join(output, `${scope}-${i + 1}`);
      mkdirSync(runOutput);
      const run = execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), repository, runOutput, scope],
        { encoding: 'utf8' },
      );
      runs.push(JSON.parse(run));
    }
    if (new Set(runs.map((run) => run.artifact_sha256)).size !== 1)
      throw new Error('Inventory output is not byte stable');
    scopes[scope] = {
      snapshot_id: runs[0].snapshot_id,
      coverage: runs[0].coverage,
      byte_identical_runs: runs.length,
      artifact_sha256: runs[0].artifact_sha256,
      duration_ms: runs.map((run) => run.duration_ms),
      median_duration_ms: runs.map((run) => run.duration_ms).sort((a, b) => a - b)[1],
      node_peak_rss_kib: runs.map((run) => run.node_peak_rss_kib),
      first_artifact: `${scope}-1/${scope}.json`,
    };
  }
  const after = fingerprint(repository);
  if (before !== after) throw new Error('Target object store changed during inventory');
  const full = JSON.parse(readFileSync(join(output, 'inventory-1/inventory.json'), 'utf8'));
  const src = full.data.files.filter(
    (file) => file.path.startsWith('src/') && /\.tsx?$/.test(file.path),
  );
  const observed_counts = {
    tracked_files: full.data.files.filter((file) => file.object_type === 'blob').length,
    src_ts_tsx_files: src.length,
    colocated_test_named_files: src.filter((file) => file.test_named).length,
    non_test_named_src_files: src.filter((file) => !file.test_named).length,
  };
  for (const key of Object.keys(observed_counts))
    if (observed_counts[key] !== rawTarget.counts[key])
      throw new Error(`Pinned count mismatch: ${key}`);
  const summary = {
    schema_version: '0.1.0',
    benchmark: 'inventory',
    target_id: target.target_id,
    commit_sha: target.commit,
    tree_sha: target.tree_sha,
    recorded_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
    },
    measurement:
      'Three fresh Node processes per scope. Wall time covers inventory, schema/integrity validation, and JSON serialization; excludes process startup/imports and artifact writes. maxRSS is the Node process only, in KiB; excludes Git child memory. Filesystem caches were not flushed. These measurements cover inventory only; TypeScript extraction is excluded.',
    observed_counts,
    target_files_unchanged: before === after,
    scopes,
  };
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, {
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
