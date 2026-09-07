// Evaluator only. The analyzer and replay harness never consume this review.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSemanticModel, validateContractModel } from '../dist/index.js';

/** Check declared review records against an already validated semantic model. */
export function checkClaimReview(model, review) {
  const claims = model.data.proposal.data.claims;
  if (!review || typeof review !== 'object' || review.snapshot_id !== model.snapshot_id || review.request_id !== model.data.request.request_id || review.proposal_id !== model.data.proposal_id) throw new Error('Stale claim review: snapshot/request/proposal digest mismatch.');
  if (typeof review.independent !== 'boolean' || typeof review.human_reviewed !== 'boolean') throw new Error('Review independence and human-review flags must be booleans.');
  if (!Array.isArray(review.cases) || review.reviewed !== claims.length || review.cases.length !== claims.length || new Set(review.cases.map((item) => item?.claim_id)).size !== claims.length) throw new Error('Review denominator mismatch.');
  const allowed = new Set(['supported-within-cited-source', 'contradicted', 'unknown']);
  const counts = {};
  for (const item of review.cases) {
    const claim = claims.find((claim) => claim.id === item?.claim_id);
    if (!claim || typeof item.note !== 'string' || !item.note.trim() || JSON.stringify(claim.evidence_ids) !== JSON.stringify(item.evidence_ids)) throw new Error('Review does not identify the retained claim/evidence.');
    if (!allowed.has(item.assessment)) throw new Error('Unknown claim assessment.');
    counts[item.assessment] = (counts[item.assessment] ?? 0) + 1;
  }
  const established = claims.length > 0 && review.independent && review.human_reviewed && counts['supported-within-cited-source'] === claims.length;
  const supportGate = established ? 'established-with-independent-human-review' : 'not-established-with-independent-human-review';
  if (review.provisional_support_gate !== undefined && review.provisional_support_gate !== supportGate) throw new Error('Claim support gate disagrees with the recorded assessments or review flags.');
  return { reviewed: claims.length, recorded_assessments: counts, independent: review.independent, human_reviewed: review.human_reviewed, support_gate: supportGate,
    note: 'Checks review coverage, citation integrity, and declared review metadata; does not authenticate reviewer identity or score English entailment automatically.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [modelPath, scanPath, repository, reviewPath] = process.argv.slice(2);
  if (!reviewPath) throw new Error('Usage: node scripts/check-claim-review.mjs <semantic.json> <scan.json> <repository> <review.json>');
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const model = read(modelPath);
  const validate = model.schema_version === '0.2.0' ? validateContractModel : validateSemanticModel;
  validate(model, { scan: read(scanPath), repository });
  console.log(JSON.stringify(checkClaimReview(model, read(reviewPath)), null, 2));
}
