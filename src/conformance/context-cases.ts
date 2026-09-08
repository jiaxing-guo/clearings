import { ClearingsError } from '../model/types.js';
import { sealSpecification, specificationIdentity } from '../specification/validate.js';
import { sha256 } from '../repository/source.js';
import { referenceContextAssembly } from './context-reference.js';
import type { SemanticOperation, SemanticSpecification } from '../specification/model.js';
import type { ContextAssemblyInvocation } from './context-contract.js';

export interface ContextAssemblyCase {
  case_id: string;
  category: 'graph' | 'targeted';
  invocation: ContextAssemblyInvocation;
}
const operation = (
  id: string,
  required: string[] = [],
  optional: string[] = [],
): SemanticOperation => ({
  id,
  alias: `alias-${id}`,
  name: id,
  purpose: `Preserve ${id}.`,
  inputs: {},
  output: { kind: 'null' },
  reads: [],
  writes: [],
  frame: 'partial',
  effects: { completeness: 'partial', allowed: [] },
  outcome_policy: 'exclusive',
  coverage: 'complete',
  outcomes: [
    {
      id: `done-${id}`,
      description: 'Complete.',
      when: { kind: 'literal', value: true },
      ensures: [],
      updates: [],
      effects: [],
      transitions: [],
      evidence_ids: [],
    },
  ],
  guarantees: [],
  dependencies: [
    ...required.map((operation_id) => ({ operation_id, requirement: 'required' as const })),
    ...optional.map((operation_id) => ({ operation_id, requirement: 'optional' as const })),
  ].map((edge) => ({ ...edge, kind: 'uses-contract', role: 'Context dependency.' })),
  implementations: [],
  decisions: [],
  evidence_ids: [],
});
const specification = (operations: SemanticOperation[]): SemanticSpecification =>
  sealSpecification({
    schema_version: '0.3.0',
    kind: 'specification',
    name: 'Context conformance case',
    perspective: 'intended',
    provenance: {
      author: 'Clearings conformance suite',
      origin: 'user-directed-design',
      review: 'proposed',
      notes: [],
    },
    operations,
    states: [],
    sources: [],
  });
const invoke = (
  spec: SemanticSpecification,
  selection = spec.operations[0]!.id,
  maxBytes = 65536,
): ContextAssemblyInvocation => ({ specification: spec, selection, options: { maxBytes } });

/** Deterministic bounded inputs; no candidate behavior is consulted during generation. */
export function createContextAssemblyCases(
  suite: 'smoke' | 'full' = 'smoke',
): ContextAssemblyCase[] {
  if (!['smoke', 'full'].includes(suite))
    throw new ClearingsError('INVALID_CONFORMANCE', 'Expected smoke or full conformance suite.');
  const cases: ContextAssemblyCase[] = [],
    labels = ['a', 'b', 'c'];
  const masks =
    suite === 'full' ? Array.from({ length: 512 }, (_, index) => index) : [0, 1, 7, 73, 170, 511];
  for (const mask of masks) {
    // Deliberately reverse declaration and edge order; traversal must sort edges.
    const spec = specification(
      [...labels].reverse().map((id) =>
        operation(
          id,
          [...labels]
            .reverse()
            .filter((target) => mask & (1 << (labels.indexOf(id) * 3 + labels.indexOf(target)))),
        ),
      ),
    );
    for (const root of labels)
      cases.push({
        case_id: `graph-${mask}-${root}`,
        category: 'graph',
        invocation: invoke(spec, root),
      });
  }
  const add = (case_id: string, invocation: ContextAssemblyInvocation) =>
    cases.push({ case_id, category: 'targeted', invocation });
  const mixed = specification([
    operation('root', ['branch'], ['optional', 'absent']),
    operation('optional'),
    operation('branch', ['leaf']),
    operation('leaf'),
  ]);
  add('optional-edges', invoke(mixed));
  add('alias-selection', invoke(mixed, 'alias-root'));
  const ordering = specification([
    operation('root', ['z', 'a']),
    operation('z', ['b']),
    operation('a', ['y']),
    operation('y'),
    operation('b'),
  ]);
  add('breadth-first-order', invoke(ordering));
  const rich = structuredClone(mixed);
  rich.sources = [
    'unused',
    'decoy',
    'state-z',
    'state-a',
    'operation',
    'guarantee',
    'outcome',
    'ensure',
    'decision',
    'implementation',
  ].map((id) => ({
    id: `source-${id}`,
    origin: 'design',
    locator: `fixture:${id}`,
    text: `Evidence ${id}: 中文 🌱 é.`,
    sha256: sha256(`Evidence ${id}: 中文 🌱 é.`),
    binding: null,
  }));
  rich.states = ['z', 'a'].map((id) => ({
    id: `state-${id}`,
    name: id,
    description: `State ${id}`,
    scope: 'invocation',
    type: { kind: 'string' },
    evidence_ids: [`source-state-${id}`],
  }));
  const root = rich.operations[0]!;
  root.purpose = 'Unicode 中文 🌱 é and complete metadata.';
  root.reads = ['state-z'];
  root.evidence_ids = ['source-operation'];
  const literal = { kind: 'literal' as const, value: { evidence_ids: ['source-decoy'] } };
  root.guarantees = [
    {
      id: 'guarantee-root',
      description: 'Literal data does not select source evidence.',
      predicate: { kind: 'compare', op: 'eq', left: literal, right: literal },
      evidence_ids: ['source-guarantee'],
    },
  ];
  root.outcomes[0]!.evidence_ids = ['source-outcome'];
  root.outcomes[0]!.ensures = [
    {
      id: 'ensure-root',
      description: 'Preserve attached requirement.',
      predicate: { kind: 'literal', value: true },
      evidence_ids: ['source-ensure'],
    },
  ];
  root.decisions = [
    {
      id: 'decision-root',
      question: 'Retain this decision?',
      consequence: 'Retain full operation records.',
      disposition: 'implementation-choice',
      blocking: false,
      evidence_ids: ['source-decision'],
    },
  ];
  root.implementations = [
    {
      name: 'implementation-root',
      responsibility: 'Preserve metadata.',
      symbol_id: null,
      evidence_ids: ['source-implementation'],
    },
  ];
  add('partial-frame-evidence', invoke(sealSpecification(rich)));
  root.frame = 'complete';
  add('complete-frame-evidence', invoke(sealSpecification(rich)));
  root.frame = 'partial';
  rich.operations[2]!.frame = 'complete';
  add('dependency-complete-frame', invoke(sealSpecification(rich)));
  const small = specification([operation('root')]);
  const unicode = structuredClone(small);
  unicode.operations[0]!.purpose = '中文 🌱 é'.repeat(100);
  add('unicode-bytes', invoke(sealSpecification(unicode)));
  add('invalid-budget-zero', invoke(small, 'root', 0));
  add('invalid-budget-negative', invoke(small, 'root', -1));
  add('invalid-budget-upper', invoke(small, 'root', 2097153));
  add('maximum-budget', invoke(small, 'root', 2097152));
  add('missing-selection', invoke(small, 'absent'));
  add('budget-before-selection', invoke(small, 'absent', 0));
  const missing = structuredClone(mixed);
  missing.operations[1]!.dependencies.push({
    operation_id: 'absent',
    kind: 'invokes',
    requirement: 'required',
    role: 'Missing target in an unselected operation.',
  });
  missing.operations[1]!.outcomes[0]!.transitions.push({
    operation_id: 'absent',
    handoff: 'invoke',
    description: 'Required missing dependency.',
  });
  missing.artifact_id = specificationIdentity(missing);
  add('missing-required-unselected', invoke(missing));
  add('dependency-before-budget-and-selection', invoke(missing, 'absent', 0));
  const boundary = invoke(small);
  for (let i = 0; i < 16; i++) {
    const bytes = referenceContextAssembly(boundary).context!.budget.required_bytes;
    if (bytes === boundary.options.maxBytes) break;
    boundary.options.maxBytes = bytes;
  }
  for (const offset of [-1, 0, 1])
    add(`byte-boundary-${offset + 1}`, {
      ...structuredClone(boundary),
      options: { maxBytes: boundary.options.maxBytes + offset },
    });
  return cases;
}
