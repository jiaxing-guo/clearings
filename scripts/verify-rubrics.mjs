// Evaluator-only: do not import this module from the analyzer.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repository = process.argv[2];
if (!repository) throw new Error('Usage: node scripts/verify-rubrics.mjs <pinned-repository>');
const rubric = JSON.parse(readFileSync(new URL('../benchmarks/rubrics/hono-m0.json', import.meta.url), 'utf8'));
let checked = 0;
for (const evidence of Object.values(rubric.evidence)) {
  const blob = execFileSync('git', ['-C', repository, 'rev-parse', `${rubric.snapshot}:${evidence.path}`], { encoding: 'utf8' }).trim();
  if (blob !== evidence.blob_sha) throw new Error(`Stale blob: ${evidence.path}`);
  const content = execFileSync('git', ['-C', repository, 'cat-file', 'blob', blob]);
  const lines = content.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (evidence.start_line < 1 || evidence.end_line > lines.length || evidence.start_line > evidence.end_line) throw new Error(`Invalid span: ${evidence.path}`);
  const span = lines.slice(evidence.start_line - 1, evidence.end_line).join('');
  if (createHash('sha256').update(span).digest('hex') !== evidence.span_sha256) throw new Error(`Stale span: ${evidence.path}`);
  checked++;
}
for (const question of rubric.rubrics) {
  for (const claim of question.required_claims) {
    if (!claim.evidence_ids.length || claim.evidence_ids.some((id) => !(id in rubric.evidence))) throw new Error(`Dangling evidence in ${question.question_id}`);
  }
}
console.log(JSON.stringify({ questions: rubric.rubrics.length, citations_verified: checked, human_reviewed: false, entailment_checked_automatically: false }, null, 2));
