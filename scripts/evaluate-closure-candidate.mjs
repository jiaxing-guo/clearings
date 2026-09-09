import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRustProgram, prepareRustProgram } from 'clearings/compiler';
import {
  correctnessCases,
  scaleCases,
  observe,
  assess,
  compareNative,
  limits,
} from './lib/closure-evaluation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runDirectory = join(root, 'benchmarks/agent-runs/closure-scale-001');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const options = { backend: 'both' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--candidate', '--out', '--backend'].includes(key) || !process.argv[i + 1])
    throw new Error(
      'Usage: evaluate-closure-candidate.mjs --candidate program.json --out new-report.json [--backend reference|both]',
    );
  options[key.slice(2)] = process.argv[i + 1];
}
if (!options.candidate || !options.out || !['reference', 'both'].includes(options.backend))
  throw new Error('Candidate, new output path, and a supported backend are required.');
const protocolBytes = readFileSync(join(runDirectory, 'protocol.json'));
const protocol = JSON.parse(protocolBytes);
for (const file of protocol.frozen_files)
  if (hash(readFileSync(join(root, file.path))) !== file.sha256)
    throw new Error(`Frozen evaluation input changed: ${file.path}`);
const candidateBytes = readFileSync(resolve(options.candidate));
const candidate = JSON.parse(candidateBytes);
const baseline = JSON.parse(readFileSync(join(runDirectory, 'baseline.program.json')));
const artifact = compileRustProgram(candidate);
let prepared;
let nativeStatus = 'not-run';
let nativeError;
if (options.backend === 'both') {
  try {
    prepared = prepareRustProgram(candidate);
    nativeStatus = 'passed';
  } catch (error) {
    nativeStatus = 'unavailable';
    nativeError = { code: error.code, message: error.message };
  }
}
const rows = [];
try {
  for (const item of [...correctnessCases(), ...scaleCases()]) {
    const previous = observe(baseline, item);
    const current = observe(candidate, item);
    const row = { id: item.id, baseline: previous, candidate: current };
    if (prepared) {
      try {
        const native = prepared.execute(structuredClone(item.args), limits);
        compareNative(current.result, native);
        row.native = { equal: true, usage: native.usage, completion: native.completion };
      } catch (error) {
        row.native = { equal: false, message: error.message };
        nativeStatus = 'failed';
      }
    }
    rows.push(row);
  }
} finally {
  prepared?.dispose();
}
const report = {
  schema_version: '0.1.0',
  protocol_sha256: hash(protocolBytes),
  candidate_sha256: hash(candidateBytes),
  program_id: candidate.artifact_id,
  compiled_artifact_id: artifact.artifact_id,
  limits,
  ...assess(rows, nativeStatus),
  ...(nativeError ? { native_error: nativeError } : {}),
  cases: rows.length,
  observations_sha256: hash(JSON.stringify(rows)),
  scalability: rows
    .filter((row) => !row.id.startsWith('graph-'))
    .map((row) => ({
      id: row.id,
      baseline: {
        matches: row.baseline.matches,
        usage: row.baseline.result.usage,
        completion: row.baseline.result.completion.kind,
      },
      candidate: {
        matches: row.candidate.matches,
        usage: row.candidate.result.usage,
        completion: row.candidate.result.completion.kind,
      },
      ...(row.native ? { native_agreement: row.native.equal } : {}),
    })),
  mismatches: rows.filter(
    (row) => !row.candidate.matches || !row.candidate.unchanged || row.native?.equal === false,
  ),
};
writeFileSync(resolve(options.out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    report: resolve(options.out),
    acceptance: report.acceptance,
    reference: report.reference,
    native: report.native,
    cases: rows.length,
    failures: report.failures,
  }),
);
process.exitCode = report.acceptance === 'accepted' ? 0 : report.acceptance === 'rejected' ? 1 : 3;
