// Evaluator only. The analyzer and replay harness never consume this review.
import { readFileSync } from 'node:fs';
import { validateSemanticModel } from '../dist/index.js';
const [modelPath, scanPath, repository, reviewPath] = process.argv.slice(2);
if (!reviewPath) throw new Error('Usage: node scripts/check-claim-review.mjs <semantic.json> <scan.json> <repository> <review.json>');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const model = read(modelPath); validateSemanticModel(model, { scan: read(scanPath), repository });
const review = read(reviewPath); const claims = model.data.proposal.data.claims;
if (review.snapshot_id !== model.snapshot_id || review.request_id !== model.data.request.request_id || review.proposal_id !== model.data.proposal_id) throw new Error('Stale claim review: snapshot/request/proposal digest mismatch.');
if (review.reviewed !== claims.length || review.cases.length !== claims.length || new Set(review.cases.map((item) => item.claim_id)).size !== claims.length) throw new Error('Review denominator mismatch.');
for (const item of review.cases) {
  const claim = claims.find((claim) => claim.id === item.claim_id);
  if (!claim || !item.note || JSON.stringify(claim.evidence_ids) !== JSON.stringify(item.evidence_ids)) throw new Error('Review does not identify the retained claim/evidence.');
}
console.log(JSON.stringify({ reviewed: claims.length, recorded_assessments: review.cases.reduce((counts, item) => ({ ...counts, [item.assessment]: (counts[item.assessment] ?? 0) + 1 }), {}), independent: review.independent, human_reviewed: review.human_reviewed, support_gate: review.provisional_support_gate, note: 'Checks review coverage and citation integrity; does not score English entailment automatically.' }, null, 2));
