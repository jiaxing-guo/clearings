import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sealProgram } from 'clearings/program';
import {
  correctnessCases,
  scaleCases,
  observe,
  assess,
} from '../scripts/lib/closure-evaluation.mjs';

const baseline = JSON.parse(
  readFileSync(
    new URL('../benchmarks/agent-runs/closure-scale-001/baseline.program.json', import.meta.url),
  ),
);
test('evaluation inputs retain the identities frozen before candidate authoring', () => {
  const protocol = JSON.parse(
    readFileSync(
      new URL('../benchmarks/agent-runs/closure-scale-001/protocol.json', import.meta.url),
    ),
  );
  for (const file of protocol.frozen_files)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`../${file.path}`, import.meta.url)))
        .digest('hex'),
      file.sha256,
      file.path,
    );
});

test('independent expectations detect removed sorting, optional expansion, and missing failures', () => {
  const cases = correctnessCases();
  for (const [caseId, mutate] of [
    [
      'breadth-first',
      (program) => {
        program.functions.find((fn) => fn.id === 'required_targets').body.at(-1).value = {
          kind: 'ref',
          name: 'targets',
        };
      },
    ],
    [
      'optional-and-unreachable',
      (program) => {
        const fn = program.functions.find((fn) => fn.id === 'required_targets');
        fn.body[2].body[1].condition = { kind: 'literal', type: { kind: 'boolean' }, value: true };
      },
    ],
    [
      'missing-root',
      (program) => {
        program.functions[0].body = [
          {
            kind: 'return',
            value: { kind: 'list', element_type: { kind: 'string' }, items: [] },
          },
        ];
      },
    ],
  ]) {
    const program = structuredClone(baseline);
    mutate(program);
    const item = cases.find((entry) => entry.id === caseId);
    assert(observe(baseline, item).matches);
    assert(!observe(sealProgram(program), item).matches, caseId);
  }
});

test('the frozen scalability gate distinguishes baseline exhaustion from a wrong result', () => {
  const item = scaleCases().find((entry) => entry.id === 'chain-512');
  const result = observe(baseline, item);
  assert.equal(result.result.completion.kind, 'resource-exhaustion');
  assert.equal(result.result.completion.resource, 'work');
  assert(result.unchanged);
  assert.equal(
    assess([{ id: item.id, baseline: result, candidate: result }], 'not-run').acceptance,
    'rejected',
  );
});
