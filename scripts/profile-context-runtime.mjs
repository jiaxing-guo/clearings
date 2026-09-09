import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { compileRustProgram, prepareRustProgram } from 'clearings/compiler';
import { executeProgram } from 'clearings/program';
import { prepareProgramExecution } from '../dist/program/preparation.js';
import { encodeRequest } from '../dist/compiler/transport.js';
import { scaleCases, limits, compareNative } from './lib/closure-evaluation.mjs';

const options = { samples: 5, program: 'programs/clearings/required-dependency-closure.json' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--samples', '--program', '--out'].includes(key) || !process.argv[i + 1])
    throw new Error(
      'Usage: profile-context-runtime.mjs --out new-report.json [--samples 3..25] [--program program.json]',
    );
  options[key.slice(2)] = key === '--samples' ? Number(process.argv[i + 1]) : process.argv[i + 1];
}
if (
  !options.out ||
  !Number.isInteger(options.samples) ||
  options.samples < 3 ||
  options.samples > 25
)
  throw new Error('A new output path and between 3 and 25 samples are required.');
const program = JSON.parse(readFileSync(resolve(options.program)));
const samples = (fn) => {
  const milliseconds = [];
  for (let i = 0; i < options.samples; i++) {
    const start = performance.now();
    fn();
    milliseconds.push(performance.now() - start);
  }
  const sorted = [...milliseconds].sort((a, b) => a - b);
  return {
    milliseconds,
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
const cache = mkdtempSync(join(tmpdir(), 'clearings-runtime-profile-'));
let prepared;
try {
  const source = samples(() => compileRustProgram(program));
  const cold = samples(() => {
    const handle = prepareRustProgram(program);
    handle.dispose();
  });
  prepared = prepareRustProgram(program, { cacheDirectory: cache });
  const warm = samples(() => prepareRustProgram(program, { cacheDirectory: cache }).dispose());
  const cases = [];
  for (const item of scaleCases().filter((item) => /^chain-(32|128|256|512)$/.test(item.id))) {
    const reference = executeProgram(program, item.args, limits);
    const admission = samples(() => prepareProgramExecution(program, item.args, limits));
    const admitted = prepareProgramExecution(program, item.args, limits);
    const encoding = samples(() => encodeRequest(admitted.args, admitted.limits));
    const referenceTime = samples(() =>
      assert.deepEqual(executeProgram(program, item.args, limits), reference),
    );
    const nativeTime = samples(() => compareNative(reference, prepared.execute(item.args, limits)));
    cases.push({
      id: item.id,
      completion: reference.completion.kind,
      usage: reference.usage,
      admission,
      encoding,
      reference: referenceTime,
      native: nativeTime,
    });
  }
  const report = {
    schema_version: '0.1.0',
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
    },
    samples: options.samples,
    quantiles: 'nearest rank p95; upper middle median',
    program_id: program.artifact_id,
    compiled_artifact_id: prepared.artifact.artifact_id,
    native: prepared.native,
    source_generation: source,
    cold_preparation_and_disposal: cold,
    warm_preparation_and_disposal: warm,
    cases,
    limitations: [
      'Invocation timings include result comparison overhead. Cold preparation includes disposal.',
      'Admission and encoding are separate microbenchmarks; their durations cannot be subtracted to isolate process startup.',
      'Native invocation includes verification, process startup, execution, and response decoding. Physical memory and event-loop delay are not measured.',
      'A small local timing sample is a feasibility observation, not a performance guarantee or acceptance threshold.',
    ],
  };
  writeFileSync(resolve(options.out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      report: resolve(options.out),
      cold_median_ms: cold.median_ms,
      warm_median_ms: warm.median_ms,
      cases: cases.map((item) => ({
        id: item.id,
        completion: item.completion,
        native_median_ms: item.native.median_ms,
      })),
    }),
  );
} finally {
  prepared?.dispose();
  rmSync(cache, { recursive: true, force: true });
}
