import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sealProgram } from 'clearings/program';
import { evaluateSelectionCandidate } from '../scripts/evaluate-context-selection.mjs';

const program = JSON.parse(
  readFileSync(new URL('../programs/clearings/context-selection.json', import.meta.url), 'utf8'),
);

test('candidate evaluation rejects an incompatible entry before native execution', () => {
  const candidate = structuredClone(program);
  candidate.functions[0].parameters[0].name = 'other';
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.kind === 'ref' && value.name === 'selected_ids') value.name = 'other';
    Object.values(value).forEach(visit);
  };
  visit(candidate.functions[0].body);
  assert.throws(
    () => evaluateSelectionCandidate(sealProgram(candidate)),
    /frozen selection contract/,
  );
});

test('unavailable native preparation is inconclusive, while observed reference violations still reject', () => {
  const previous = process.env.PATH;
  process.env.PATH = '';
  try {
    const unavailable = evaluateSelectionCandidate(program);
    assert.equal(unavailable.verdict, 'inconclusive');
    assert.deepEqual(unavailable.totals, { accepted: 0, rejected: 0, inconclusive: 4632 });
    assert.equal(unavailable.native.status, 'unavailable');
    assert.equal(unavailable.native.code, 'RUST_TOOLCHAIN_UNAVAILABLE');
    const wrong = structuredClone(program);
    wrong.functions[0].body = [
      {
        kind: 'return',
        value: {
          kind: 'record',
          fields: ['state_ids', 'source_ids'].map((name) => ({
            name,
            value: { kind: 'list', element_type: { kind: 'string' }, items: [] },
          })),
        },
      },
    ];
    const rejected = evaluateSelectionCandidate(sealProgram(wrong));
    assert.equal(rejected.verdict, 'rejected');
    assert(rejected.totals.rejected > 0);
    assert(rejected.totals.inconclusive > 0);
    assert.equal(rejected.totals.accepted, 0);
    assert.equal(rejected.native.status, 'unavailable');
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
});
