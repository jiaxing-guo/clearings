// Evaluate authored examples at build time with the public checker. The browser only selects a case.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkOperation, formatExpression } from '../dist/index.js';
const source = 'specifications/hono/response-selection.json';
const bytes = readFileSync(new URL('../' + source, import.meta.url), 'utf8');
const specification = JSON.parse(bytes);
const operation = specification.operations.find((item) => item.id === 'response-selection');
const observation = {
  input: { path: 'direct', value: 'nullish' },
  before: { finalized: true },
  outcome: 'outcome:direct-missing',
  output: 'not-found',
};
const { output, ...incomplete } = observation;
const cases = [
  {
    id: 'matching-output',
    name: 'Matching output',
    expected: 'pass',
    observation,
    explanation: 'The direct nullish branch applies, and the supplied output is not-found.',
  },
  {
    id: 'different-output',
    name: 'Different output',
    expected: 'fail',
    observation: { ...observation, output: 'context-response' },
    explanation:
      'The branch applies, but context-response contradicts the selected outcome’s postcondition. Finalized state does not change this direct branch.',
  },
  {
    id: 'missing-output',
    name: 'Missing output',
    expected: 'unknown',
    observation: incomplete,
    explanation:
      'The branch applies, but its output equality cannot be evaluated because no output was supplied.',
  },
].map((item) => {
  const result = checkOperation(specification, operation.id, item.observation);
  assert.equal(result.verdict, item.expected, `Documentation example changed: ${item.id}`);
  return { ...item, result };
});
const selectedOutcome = operation.outcomes.find((item) => item.id === observation.outcome);
const data = {
  source,
  source_sha256: createHash('sha256').update(bytes).digest('hex'),
  artifact_id: specification.artifact_id,
  perspective: specification.perspective,
  operation,
  states: specification.states.filter(
    (state) => operation.reads.includes(state.id) || operation.writes.includes(state.id),
  ),
  selected_outcome: selectedOutcome,
  guard: formatExpression(selectedOutcome.when),
  predicates: Object.fromEntries(
    selectedOutcome.ensures.map((rule) => [rule.id, formatExpression(rule.predicate)]),
  ),
  cases,
};
writeFileSync(
  new URL('../website/public/operation-explorer.json', import.meta.url),
  JSON.stringify(data, null, 2) + '\n',
);
console.log('Prepared three operation observations using the public checker.');
