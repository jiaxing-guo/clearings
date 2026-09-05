import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkClaimReview } from '../scripts/check-claim-review.mjs';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const model = read('../benchmarks/results/hono-audiences/semantic.json');
const original = read('../benchmarks/results/hono-semantics/claim-review.json');
const pending = 'not-established-with-independent-human-review';
const established = 'established-with-independent-human-review';

test('claim support requires every recorded assessment and both review qualifications', () => {
  assert.equal(checkClaimReview(model, original).support_gate, pending);
  for (const independent of [false, true]) {
    for (const human_reviewed of [false, true]) {
      for (const assessment of ['supported-within-cited-source', 'contradicted', 'unknown']) {
        const review = structuredClone(original);
        Object.assign(review, { independent, human_reviewed });
        delete review.provisional_support_gate;
        review.cases[0].assessment = assessment;
        const expected = independent && human_reviewed && assessment === 'supported-within-cited-source' ? established : pending;
        assert.equal(checkClaimReview(model, review).support_gate, expected);
        review.provisional_support_gate = expected === established ? pending : established;
        assert.throws(() => checkClaimReview(model, review), /gate disagrees/);
      }
    }
  }
});

test('claim review rejects malformed assessments, flags, coverage, and source bindings', () => {
  const mutations = [
    review => { review.cases[0].assessment = 'approved'; },
    review => { review.cases[0].assessment = '__proto__'; },
    review => { review.independent = 'false'; },
    review => { delete review.human_reviewed; },
    review => { review.cases[0].note = ' '; },
    review => { review.cases[0].evidence_ids = []; },
    review => { review.cases[0] = review.cases[1]; },
    review => { review.cases[0] = null; },
    review => { review.cases.pop(); },
    review => { review.proposal_id = 'proposal:stale'; },
    review => { review.provisional_support_gate = 'passed'; },
  ];
  for (const mutate of mutations) {
    const review = structuredClone(original); mutate(review);
    assert.throws(() => checkClaimReview(model, review));
  }
});
