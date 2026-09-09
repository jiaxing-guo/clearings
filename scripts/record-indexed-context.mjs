import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { prepareContextRuntime } from 'clearings';
import { recordContextAssembly, evaluateContextAssembly } from 'clearings/conformance';

if (process.argv.length !== 3)
  throw new Error('Usage: record-indexed-context.mjs <new-output-directory>');
const directory = resolve(process.argv[2]);
const specificationPath = 'specifications/clearings/context-assembly.json';
const source = readFileSync(specificationPath);
const native = prepareContextRuntime();
const accepted = JSON.parse(
  readFileSync('benchmarks/agent-runs/closure-scale-001/candidate-evaluation.json'),
);
assert.equal(accepted.acceptance, 'accepted');
assert.equal(native.program_id, accepted.program_id);
const record = await recordContextAssembly({
  case_id: 'indexed-closure-followup',
  fixture_name: 'Review complete-context and byte-budget behavior after IR integration',
  invocation: {
    specification: JSON.parse(source),
    selection: 'assemble-context',
    options: { maxBytes: 131072 },
  },
});
const evaluation = evaluateContextAssembly(record);
assert.equal(evaluation.acceptance, 'accepted');
assert.equal(record.native_execution.program_id, accepted.program_id);
assert.equal(record.completion.kind, 'return');
const context = record.completion.result.value;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const recordBytes = JSON.stringify(record) + '\n';
const evaluationBytes = JSON.stringify(evaluation) + '\n';
const summary = {
  task: 'Use the revised Clearings implementation to assemble its own context contract for integration review.',
  specification: {
    path: specificationPath,
    sha256: hash(source),
    artifact_id: context.artifact_id,
  },
  program_id: accepted.program_id,
  native_execution: record.native_execution,
  operations: context.operations.map((operation) => ({
    id: operation.id,
    purpose: operation.purpose,
  })),
  context_bytes: context.budget.used_bytes,
  acceptance: evaluation.acceptance,
  record_sha256: hash(recordBytes),
  evaluation_sha256: hash(evaluationBytes),
  limitation:
    'A subsequent context-assembly and integration-review task, not a second independent agent trial or compiler self-hosting.',
};
mkdirSync(directory);
writeFileSync(join(directory, 'record.json'), recordBytes, { flag: 'wx' });
writeFileSync(join(directory, 'evaluation.json'), evaluationBytes, { flag: 'wx' });
writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    directory,
    program_id: summary.program_id,
    acceptance: summary.acceptance,
    operations: summary.operations.map((operation) => operation.id),
  }),
);
