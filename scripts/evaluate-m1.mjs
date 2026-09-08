// Evaluator-only source-reviewed examples; never imported by production code.
import { readFileSync } from 'node:fs';
import { validateScan } from '../dist/index.js';

const [artifact, repository] = process.argv.slice(2);
if (!artifact || !repository)
  throw new Error('Usage: node scripts/evaluate-m1.mjs <scan.json> <pinned-repository>');
const result = JSON.parse(readFileSync(artifact, 'utf8'));
validateScan(result, { repository });
const expected = JSON.parse(
  readFileSync(new URL('../benchmarks/rubrics/hono-m1-references.json', import.meta.url), 'utf8'),
);
if (result.data.manifest.data.snapshot.commit_sha !== expected.snapshot)
  throw new Error('Sample snapshot mismatch.');
const files = new Map(result.data.files.map((file) => [file.id, file]));
const evidence = new Map(result.data.evidence.map((item) => [item.id, item]));
const symbols = new Map(result.data.symbols.map((symbol) => [symbol.id, symbol]));
const cases = expected.cases.map((sample) => {
  const candidates = result.data.facts.filter((fact) => {
    const item = evidence.get(fact.evidence_ids[0]);
    return (
      fact.kind === 'call' &&
      fact.name === sample.callee &&
      files.get(item.file_id).path === sample.path &&
      item.start_line === sample.line
    );
  });
  const fact = candidates[0];
  const symbol = fact ? symbols.get(fact.target_id) : undefined;
  const pass =
    candidates.length === 1 &&
    fact.resolution === sample.resolution &&
    (sample.target
      ? !!symbol &&
        symbol.name === sample.target.name &&
        files.get(symbol.file_id).path === sample.target.path
      : fact.target_id === null);
  return { ...sample, passed: pass, evidence_id: fact?.evidence_ids[0] ?? null };
});
const passed = cases.filter((sample) => sample.passed).length;
console.log(
  JSON.stringify(
    {
      schema_version: '0.1.0',
      snapshot: expected.snapshot,
      artifact_id: result.artifact_id,
      review: expected.review,
      checked: cases.length,
      passed,
      failed: cases.length - passed,
      cases,
    },
    null,
    2,
  ),
);
if (passed !== cases.length) process.exitCode = 1;
