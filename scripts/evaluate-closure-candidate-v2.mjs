import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRustProgram } from 'clearings/compiler';
import { correctnessCases, scaleCases, limits } from './lib/closure-evaluation.mjs';
import { evaluateClosureCases } from './lib/closure-evaluation-v2.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runDirectory = join(root, 'benchmarks/agent-runs/closure-scale-001');
const revisionDirectory = join(root, 'benchmarks/agent-runs/closure-scale-001-closeout');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const options = { backend: 'both' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--candidate', '--out', '--backend'].includes(key) || !process.argv[i + 1])
    throw new Error(
      'Usage: evaluate-closure-candidate-v2.mjs --candidate program.json --out new-report.json [--backend reference|both]',
    );
  options[key.slice(2)] = process.argv[i + 1];
}
if (!options.candidate || !options.out || !['reference', 'both'].includes(options.backend))
  throw new Error('Candidate, new output path, and a supported backend are required.');
const baselineProtocolBytes = readFileSync(join(runDirectory, 'protocol.json'));
const protocolBytes = readFileSync(join(revisionDirectory, 'protocol.json'));
const baselineProtocol = JSON.parse(baselineProtocolBytes);
const protocol = JSON.parse(protocolBytes);
if (protocol.baseline_protocol_sha256 !== hash(baselineProtocolBytes))
  throw new Error('The original evaluation protocol changed.');
for (const file of [...baselineProtocol.frozen_files, ...protocol.frozen_files])
  if (hash(readFileSync(join(root, file.path))) !== file.sha256)
    throw new Error(`Frozen evaluation input changed: ${file.path}`);
const candidateBytes = readFileSync(resolve(options.candidate));
const candidate = JSON.parse(candidateBytes);
const baseline = JSON.parse(readFileSync(join(runDirectory, 'baseline.program.json')));
const artifact = compileRustProgram(candidate);
const { rows, ...assessment } = evaluateClosureCases(
  candidate,
  baseline,
  [...correctnessCases(), ...scaleCases()],
  { backend: options.backend },
);
const report = {
  schema_version: '0.2.0',
  protocol_sha256: hash(protocolBytes),
  baseline_protocol_sha256: hash(baselineProtocolBytes),
  candidate_sha256: hash(candidateBytes),
  program_id: candidate.artifact_id,
  compiled_artifact_id: artifact.artifact_id,
  limits,
  ...assessment,
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
    native_errors: report.native_errors,
  }),
);
process.exitCode = report.acceptance === 'accepted' ? 0 : report.acceptance === 'rejected' ? 1 : 3;
