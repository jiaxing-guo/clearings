import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sealSpecification, validateSpecification } from '../dist/index.js';
import { contextSelectionArguments } from '../dist/specification/selection-input.js';
import { selectionCases } from '../benchmarks/evaluation/context-selection-v1/cases.mjs';
import {
  expectedSelection,
  evaluateSelection,
} from '../benchmarks/evaluation/context-selection-v1/oracle.mjs';
import { selectionControls } from '../benchmarks/evaluation/context-selection-v1/controls.mjs';

const root = new URL('../benchmarks/evaluation/context-selection-v1/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));

test('frozen selection requirements and evaluator retain their exact identities', () => {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('manifest.json', root)))
      .digest('hex'),
    '622bb61020189d6e5514e3bf5481f96010547be1b7535d6e1c060c131b1e6a05',
  );
  const manifest = read('manifest.json');
  for (const file of manifest.files)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(file.path, root)))
        .digest('hex'),
      file.sha256,
      file.path,
    );
  assert.equal([...selectionCases()].length, read('contract.json').domain.total);
});

test('relational oracle agrees with independent bit equations and explicit boundary answers', () => {
  for (const item of selectionCases()) {
    let expected = item.expected;
    if (item.id.startsWith('states/')) {
      const [, selected, frames, reads, writes] = item.id.split('/').map(Number);
      const access =
        (selected & 1 ? reads | writes : 0) | (selected & 2 ? (reads | writes) >> 2 : 0);
      const mask = selected & frames ? 3 : access & 3;
      expected = {
        state_ids: ['x', 'y'].filter((_, i) => mask & (1 << i)),
        source_ids: ['u', 'v'].filter((_, i) => mask & (1 << i)),
      };
    } else if (item.id.startsWith('evidence/')) {
      const [, selected, accessed, mask] = item.id.split('/').map(Number);
      expected = {
        state_ids: selected && accessed ? ['x'] : [],
        source_ids: selected && (mask & 63 || (accessed && mask & 64)) ? ['u'] : [],
      };
    }
    if (expected) assert.deepEqual(expectedSelection(item.args), expected, item.id);
  }
});

test('all predefined selection faults are rejected over the frozen domain', () => {
  const cases = [...selectionCases()];
  for (const control of selectionControls) {
    let detected = false;
    for (const item of cases) {
      const changed = structuredClone(item.args),
        after = structuredClone(item.args);
      control.editArgs?.(changed);
      const output = expectedSelection(changed);
      control.editOutput?.(output);
      control.editAfter?.(after);
      if (
        evaluateSelection(
          item.args,
          { status: 'observed', completion: { kind: 'return', value: output } },
          after,
        ).verdict === 'rejected'
      ) {
        detected = true;
        break;
      }
    }
    assert(detected, control.id);
  }
});

test('unavailable execution is inconclusive and cannot mask observed mutation or failure', () => {
  const args = [[], [], [], []];
  assert.equal(evaluateSelection(args, { status: 'unavailable' }, args).verdict, 'inconclusive');
  assert.equal(
    evaluateSelection(args, { status: 'unavailable' }, [['changed'], [], [], []]).verdict,
    'rejected',
  );
  assert.equal(
    evaluateSelection(
      args,
      { status: 'observed', completion: { kind: 'resource-exhaustion' } },
      args,
    ).verdict,
    'rejected',
  );
  assert.equal(
    evaluateSelection(args, {
      status: 'observed',
      completion: { kind: 'return', value: { state_ids: [], source_ids: [] } },
    }).verdict,
    'inconclusive',
  );
});

test('adapter copies every declared evidence position and all catalogs without semantic selection', () => {
  const record = (id) => ({
    evidence_ids: [id, id],
  });
  const op = {
    id: 'op',
    frame: 'partial',
    reads: ['z', 'a', 'a'],
    writes: ['a'],
    ...record('operation'),
    guarantees: [record('guarantee')],
    implementations: [record('implementation')],
    decisions: [record('decision')],
    outcomes: [{ ...record('outcome'), ensures: [record('ensures')] }],
  };
  const spec = {
    operations: [op, { ...structuredClone(op), id: 'unused', frame: 'complete' }],
    states: [
      { id: 'z', ...record('state') },
      { id: 'a', evidence_ids: [] },
    ],
    sources: [{ id: 'unused' }, { id: 'z' }, { id: 'a' }],
  };
  const selected = ['op', 'op'],
    before = structuredClone(spec);
  const args = contextSelectionArguments(spec, selected);
  assert.deepEqual(args, [
    selected,
    [false, true].map((complete_frame, i) => ({
      id: i ? 'unused' : 'op',
      complete_frame,
      reads: ['z', 'a', 'a'],
      writes: ['a'],
      evidence_groups: [
        'operation',
        'guarantee',
        'implementation',
        'decision',
        'outcome',
        'ensures',
      ].map((id) => [id, id]),
    })),
    [
      { id: 'z', evidence_ids: ['state', 'state'] },
      { id: 'a', evidence_ids: [] },
    ],
    ['unused', 'z', 'a'],
  ]);
  args[0].push('changed');
  args[1][0].reads.push('changed');
  args[1][0].evidence_groups[0].push('changed');
  args[2][0].evidence_ids.push('changed');
  args[3].push('changed');
  assert.deepEqual(spec, before);
  assert.deepEqual(selected, ['op', 'op']);
});

const reviewRoot = new URL(
  '../benchmarks/evaluation/context-selection-review-v1/',
  import.meta.url,
);
const reviewCases = JSON.parse(readFileSync(new URL('cases.json', reviewRoot), 'utf8'));

test('post-authoring regressions retain their identity and detect bounded evidence scans', () => {
  const manifestBytes = readFileSync(new URL('manifest.json', reviewRoot));
  assert.equal(
    createHash('sha256').update(manifestBytes).digest('hex'),
    'b85c0f05034942e48a41ba028ed03cc8d55882c67e65622641d2c3a05f4f669b',
  );
  for (const file of JSON.parse(manifestBytes).files)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(file.path, reviewRoot)))
        .digest('hex'),
      file.sha256,
    );
  assert.equal(reviewCases.length, 10);
  for (const item of reviewCases)
    assert.deepEqual(expectedSelection(item.args), item.expected, item.id);
  for (const truncate of [
    (args) => {
      for (const op of args[1]) op.evidence_groups = op.evidence_groups.slice(0, 6);
    },
    (args) => {
      for (const op of args[1])
        op.evidence_groups = op.evidence_groups.map((ids) => ids.slice(0, 1));
    },
    (args) => {
      for (const state of args[2]) state.evidence_ids = state.evidence_ids.slice(0, 1);
    },
  ]) {
    assert(
      reviewCases.some((item) => {
        const args = structuredClone(item.args);
        truncate(args);
        return (
          evaluateSelection(
            item.args,
            { status: 'observed', completion: { kind: 'return', value: expectedSelection(args) } },
            item.args,
          ).verdict === 'rejected'
        );
      }),
    );
  }
});

test('schema-valid expression literals never contribute declared evidence', () => {
  const literal = (value) => ({ kind: 'literal', value });
  const data = { evidence_ids: ['literal-only'] };
  const predicate = { kind: 'compare', op: 'eq', left: literal(data), right: literal(data) };
  const spec = sealSpecification({
    schema_version: '0.3.0',
    kind: 'specification',
    name: 'Literal evidence fixture',
    perspective: 'intended',
    provenance: {
      author: 'Test fixture author',
      origin: 'user-directed-design',
      review: 'proposed',
      notes: [],
    },
    sources: [],
    states: [
      {
        id: 'state',
        name: 'State',
        description: 'Literal record state.',
        scope: 'invocation',
        type: {
          kind: 'record',
          fields: { evidence_ids: { kind: 'list', element: { kind: 'string' } } },
        },
        evidence_ids: [],
      },
    ],
    operations: [
      {
        id: 'op',
        alias: 'op',
        name: 'Operation',
        purpose: 'Store literal data.',
        inputs: {},
        output: { kind: 'null' },
        reads: [],
        writes: ['state'],
        frame: 'partial',
        effects: { completeness: 'complete', allowed: [] },
        outcome_policy: 'exclusive',
        coverage: 'complete',
        guarantees: [
          { id: 'guarantee', description: 'Compare literal records.', predicate, evidence_ids: [] },
        ],
        outcomes: [
          {
            id: 'outcome',
            description: 'Store data.',
            when: predicate,
            ensures: [
              {
                id: 'ensure',
                description: 'Compare literal records.',
                predicate,
                evidence_ids: [],
              },
            ],
            updates: [{ state_id: 'state', value: literal(data) }],
            effects: [],
            transitions: [],
            evidence_ids: [],
          },
        ],
        dependencies: [],
        implementations: [],
        decisions: [],
        evidence_ids: [],
      },
    ],
  });
  validateSpecification(spec);
  const args = contextSelectionArguments(spec, ['op']);
  assert.deepEqual(args[1][0].evidence_groups, [[], [], [], []]);
  assert(!JSON.stringify(args).includes('literal-only'));
  assert.deepEqual(expectedSelection(args), { state_ids: ['state'], source_ids: [] });
});
