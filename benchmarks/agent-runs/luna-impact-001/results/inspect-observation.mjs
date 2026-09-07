// Supplementary observation inspection after scoring. Not a frozen test.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const run = fileURLToPath(new URL('..', import.meta.url));
const workspace = resolve(process.argv[2]);
const { analyzeImpact, checkOperation } = await import(pathToFileURL(join(workspace, 'dist/index.js')).href);
const model = JSON.parse(readFileSync(join(run, 'evaluation/hono.json'), 'utf8'));
const specification = JSON.parse(readFileSync(join(run, 'frozen/specification.json'), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const before = digest(model);
const report = analyzeImpact(model, ['store-response']);
const observation = {
  input: {
    root_ids: ['store-response'],
    available_ids: model.operations.map(operation => operation.id),
    active_edges: model.operations.flatMap(operation => operation.dependencies
      .filter(dependency => dependency.requirement === 'required' && model.operations.some(target => target.id === dependency.operation_id))
      .map(dependency => ({ from: operation.id, to: dependency.operation_id }))),
    artifact_id: model.artifact_id,
  },
  before: { model_digest: before }, after: { model_digest: digest(model) },
  outcome: 'outcome:impact-report',
  output: {
    included_ids: report.affected.map(operation => operation.operation_id),
    omitted_ids: report.omitted_operation_ids,
    reported_root_ids: report.changed_operation_ids,
    artifact_id: report.artifact_id,
  },
  effects: [],
};
const check = checkOperation(specification, 'analyze-impact', observation);
const output = join(run, 'results/observation'); mkdirSync(output, { recursive: true });
for (const [name, value] of Object.entries({ report, observation, check })) writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
writeFileSync(join(output, 'scope.json'), JSON.stringify({
  recorded_at: new Date().toISOString(), stage: 'supplementary-after-frozen-score',
  added_to_frozen_score: false, input: 'Frozen authored Hono observed specification; no Hono source execution.',
  actual_candidate_executed: true, input_digest_measured_before_and_after: true,
  effects: 'Empty list supplied from source inspection; no instrumented external-effect trace.',
  adapter: 'Authored projection. The kernel does not verify that this projection is faithful or complete.',
  counts: { pass: check.checks.filter(item => item.verdict === 'pass').length, unknown: check.checks.filter(item => item.verdict === 'unknown').length, fail: check.checks.filter(item => item.verdict === 'fail').length },
  verdict: check.verdict,
}, null, 2) + '\n');
console.log(JSON.stringify({ affected: report.affected.map(item => ({ id: item.operation_id, witness: item.witness })), omitted: report.omitted_operation_ids, verdict: check.verdict, counts: check.checks.reduce((counts, item) => ({ ...counts, [item.verdict]: (counts[item.verdict] ?? 0) + 1 }), {}) }, null, 2));
