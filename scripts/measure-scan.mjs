// Evaluator-only harness. No evaluator data is supplied to scan().
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scan, readTarget, validateScan } from '../dist/index.js';

const [repositoryArg, outputArg, child] = process.argv.slice(2);
if (!repositoryArg || !outputArg)
  throw new Error(
    'Usage: node scripts/measure-scan.mjs <pinned-bare-repository> <new-output-directory>',
  );
const repository = realpathSync(repositoryArg);
const output = resolve(outputArg);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = readTarget(join(root, 'benchmarks/targets/hono.json'));
const time = () => process.hrtime.bigint();
const elapsed = (start) => Number(time() - start) / 1e6;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (child) {
  const start = time();
  const result = scan({
    repository,
    ref: target.commit,
    expectedCommit: target.commit,
    expectedTree: target.tree_sha,
    include: [...target.scope.deep_source_files, ...target.scope.supporting_context],
    exclude: target.scope.excluded_roots,
    project: 'tsconfig.build.json',
  });
  const scan_ms = elapsed(start);
  const validationStart = time();
  validateScan(result, { repository });
  const source_validation_ms = elapsed(validationStart);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const measured_ms = elapsed(start);
  const node_peak_rss_kib = process.resourceUsage().maxRSS;
  writeFileSync(join(output, 'scan.json'), json, { flag: 'wx' });
  process.stdout.write(
    JSON.stringify({
      scan_ms,
      source_validation_ms,
      measured_ms,
      node_peak_rss_kib,
      artifact_sha256: sha(json),
      artifact_bytes: Buffer.byteLength(json),
      artifact_id: result.artifact_id,
      snapshot_id: result.snapshot_id,
      coverage: result.coverage,
      records: {
        projects: result.data.projects.length,
        symbols: result.data.symbols.length,
        evidence: result.data.evidence.length,
        facts: result.data.facts.length,
      },
      diagnostics: result.diagnostics,
    }),
  );
} else {
  const rel = relative(repository, output);
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'))
    throw new Error('Benchmark output must be outside target.');
  if (
    execFileSync('git', ['-C', repository, 'rev-parse', '--is-bare-repository'], {
      encoding: 'utf8',
    }).trim() !== 'true'
  )
    throw new Error('Benchmark requires a bare target.');
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  const fingerprint = () => {
    const hash = createHash('sha256');
    const visit = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      )) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (entry.isFile())
          hash.update(relative(repository, full)).update('\0').update(readFileSync(full));
        else throw new Error('Unexpected special entry in target object store.');
      }
    };
    visit(repository);
    return hash.digest('hex');
  };
  const before = fingerprint();
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const directory = join(output, `run-${i + 1}`);
    mkdirSync(directory);
    const data = JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), repository, directory, 'child'],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      ),
    );
    runs.push(data);
  }
  if (new Set(runs.map((run) => run.artifact_sha256)).size !== 1)
    throw new Error('Structural scan output is not byte stable.');
  if (fingerprint() !== before) throw new Error('Target files changed.');
  const summary = {
    schema_version: '0.1.0',
    benchmark: 'scan',
    target_id: target.target_id,
    commit_sha: target.commit,
    tree_sha: target.tree_sha,
    recorded_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
      cpu_model: os.cpus()[0]?.model,
      available_parallelism: os.availableParallelism(),
      process_memory_limit_bytes: process.constrainedMemory(),
    },
    measurement:
      'Three fresh Node processes, warm filesystem caches. scan_ms includes inventory, config/source reads, compiler extraction and canonical artifact hashing. source_validation_ms re-reads Git blobs and verifies all evidence spans. measured_ms also includes JSON serialization, but excludes process startup/imports and artifact writes. Node peak RSS includes extraction, validation and serialization; excludes Git child memory. Hardware differs from the planned 4-vCPU/8-GiB reference, so this is not a claim that its performance gate passed.',
    target_files_unchanged: true,
    byte_identical_runs: runs.length,
    ...Object.fromEntries(
      [
        'snapshot_id',
        'artifact_id',
        'artifact_sha256',
        'artifact_bytes',
        'coverage',
        'records',
        'diagnostics',
      ].map((key) => [key, runs[0][key]]),
    ),
    samples: runs.map(({ scan_ms, source_validation_ms, measured_ms, node_peak_rss_kib }) => ({
      scan_ms,
      source_validation_ms,
      measured_ms,
      node_peak_rss_kib,
    })),
    median_scan_ms: runs.map((run) => run.scan_ms).sort((a, b) => a - b)[1],
    first_artifact: 'run-1/scan.json',
  };
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, {
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
