import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sealSpecification, assembleContext, serializeOperationContext } from '../../../../dist/index.js';
const hash = text => createHash('sha256').update(text).digest('hex');
const ref = (root, ...path) => ({ kind: 'ref', root, path });
const literal = value => ({ kind: 'literal', value });
const equal = (left, right) => ({ kind: 'compare', op: 'eq', left, right });
const contains = (collection, value) => ({ kind: 'contains', collection, value });
const every = (collection, variable, predicate) => ({ kind: 'every', collection, variable, predicate });
const not = value => ({ kind: 'not', value });
const any = (...terms) => ({ kind: 'any', terms });
const rule = (id, description, predicate) => ({ id, description, predicate, evidence_ids: ['design:api'] });
const opaque = (id, description, reason) => rule(id, description, { kind: 'opaque', text: description, reason });
const strings = { kind: 'list', element: { kind: 'string' } };
const included = ref('output', 'included_ids'), available = ref('input', 'available_ids');
const api = readFileSync(new URL('API.md', import.meta.url), 'utf8');
const specification = sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Potential dependency impact', perspective: 'intended',
  provenance: { author: 'Clearings experiment orchestrator', origin: 'user-directed-design', review: 'proposed', notes: ['Frozen before the Luna coding run.', 'The user authorized a coding experiment. This precise feature contract is an author proposal.', 'Some requirements are deliberately marked opaque because this version of the expression language cannot check them.'] },
  states: [{ id: 'model_digest', name: 'Input content identity', description: 'Externally measured JSON digest before and after the query.', scope: 'invocation', type: { kind: 'string' }, evidence_ids: ['design:api'] }],
  sources: [{ id: 'design:api', origin: 'design', locator: 'input/API.md', text: api, sha256: hash(api), binding: null }],
  operations: [{ id: 'analyze-impact', alias: 'analyze-impact', name: 'Find operations that may need review after a change', purpose: 'Start with changed operations. Follow incoming declared dependency relationships to find every operation whose contract may depend on the change. Give a shortest explanatory path and retain its open decisions. This is potential review impact, not observed execution or proof of changed behavior.',
    inputs: { root_ids: strings, available_ids: strings, active_edges: { kind: 'list', element: { kind: 'record', fields: { from: { kind: 'string' }, to: { kind: 'string' } } } }, artifact_id: { kind: 'string' } },
    output: { kind: 'record', fields: { included_ids: strings, omitted_ids: strings, reported_root_ids: strings, artifact_id: { kind: 'string' } } },
    reads: ['model_digest'], writes: [], frame: 'complete', effects: { completeness: 'complete', allowed: [] }, outcome_policy: 'exclusive', coverage: 'partial',
    outcomes: [{ id: 'outcome:impact-report', description: 'Return all potentially affected operations, each once, with an explanatory path.',
      when: { kind: 'all', terms: [{ kind: 'compare', op: 'gt', left: { kind: 'length', value: ref('input', 'root_ids') }, right: literal(0) }, every(ref('input', 'root_ids'), 'root', contains(available, ref('local', 'root')))] },
      ensures: [
        rule('rule:include-changes', 'Every changed operation is itself affected, with distance zero and witness containing only its own ID.', every(ref('input', 'root_ids'), 'root', contains(included, ref('local', 'root')))),
        rule('rule:unique-affected', 'Every affected operation appears once.', { kind: 'unique', value: included }),
        rule('rule:known-affected', 'Only operations from the supplied specification are included.', { kind: 'subset', collection: available, value: included }),
        rule('rule:reverse-closure', 'If an active dependency target is affected, its source operation is also affected. Never expand merely because a changed operation depends on another operation.', every(ref('input', 'active_edges'), 'edge', any(not(contains(included, ref('local', 'edge', 'to'))), contains(included, ref('local', 'edge', 'from'))))),
        rule('rule:omission-accounting', 'Every operation is either affected or explicitly omitted.', every(available, 'id', any(contains(included, ref('local', 'id')), contains(ref('output', 'omitted_ids'), ref('local', 'id'))))),
        rule('rule:omissions-disjoint', 'Affected operations never appear in omissions.', every(included, 'id', not(contains(ref('output', 'omitted_ids'), ref('local', 'id'))))),
        rule('rule:artifact-binding', 'The report identifies the exact supplied specification.', equal(ref('output', 'artifact_id'), ref('input', 'artifact_id'))),
        rule('rule:root-binding', 'The report identifies the normalized selected operation IDs.', equal(ref('output', 'reported_root_ids'), ref('input', 'root_ids'))),
        opaque('rule:least-closure', 'Include exactly the changed operations and their transitive dependents under the chosen mode. Exclude every other operation. Cycles and self-links terminate. A changed operation remains distance zero even if another changed operation can reach it.', 'Least-fixed-point reachability is not an operator in this expression language.'),
        opaque('rule:mode', 'Required mode is the default and follows only dependencies with requirement required. All mode follows both required and optional dependencies, regardless of dependency kind. Only existing targets form traversable edges.', 'The public-to-observation adapter chooses active edges; the interpreter does not validate that adapter.'),
        opaque('rule:witness', 'For each affected operation, witness is a shortest path of operation IDs from that operation to any changed operation, following active dependency edges in their original direction. Distance is its number of edges. If several shortest paths exist, select the lexicographically smallest complete ID sequence. Compare strings with JavaScript code-unit ordering (< and >), compare sequence elements from the start, and choose the shorter sequence if one is a prefix. Do not use locale ordering or joined delimiter strings.', 'Path adjacency, global shortest paths, and sequence ordering need external checks in this version.'),
        opaque('rule:stable-order', 'Sort changed_operation_ids, affected entries by operation_id, and omitted_operation_ids in ascending ID order using code-unit comparison. Except for artifact_id (which binds the supplied specification), results do not depend on input operation/dependency order or selection order. Each entry retains the current operation name.', 'Ordering of structured lists is not a primitive in this version.'),
        opaque('rule:decisions', 'Each affected entry retains every OpenDecision from that operation, with all fields, including blocking and all evidence IDs. Preserve decision array order. Returned objects must be independent copies; changing report arrays or nested decisions must not change the input model.', 'The compact observation does not represent object ownership or complete decision fields.'),
        opaque('rule:unavailable', 'Report unavailable optional dependencies belonging to affected operations in unavailable_optional_dependencies, in both modes. Preserve from_id, to_id, kind, and role. Sort by from_id then to_id with code-unit comparison. Do not invent affected entries for missing targets. Omitted operations contribute no such entries.', 'The compact observation does not include unavailable endpoint metadata.'),
        opaque('rule:public-boundary', 'Follow the full public interface and invalid-input rules in input/API.md. Return schema_version 0.3.0, command impact, the input perspective, the resolved mode, interpretation potential-impact-from-declared-dependencies, and acceptance proposed. Do not claim runtime causality or automatic acceptance.', 'Public wrapper types and runtime argument errors are outside this compact observation.'),
        opaque('rule:determinism', 'For the same valid input values, repeated calls serialize identically. Do not mutate the specification, changed list, or options. The query is synchronous and performs no I/O or target-code execution.', 'Deterministic execution and argument ownership require external observations.'),
      ], updates: [], effects: [], transitions: [], evidence_ids: ['design:api'] }], guarantees: [], dependencies: [],
    implementations: [{ name: 'analyzeImpact', responsibility: 'Validate inputs, identify potential dependents, explain them with shortest paths, and return an independent report with honest scope.', symbol_id: null, evidence_ids: ['design:api'] }],
    decisions: [{ id: 'decision:formalization-boundary', question: 'Which requirements can the current expression kernel check?', consequence: 'Several graph and API rules remain opaque. Implement their stated behavior and use external tests. Do not present an unknown kernel verdict as proof of conformance.', disposition: 'analysis-limit', blocking: false, evidence_ids: ['design:api'] }, { id: 'decision:invalid-domain', question: 'How are invalid public arguments reported?', consequence: 'The valid-input observation excludes errors. The API contract specifies their runtime error codes; the evaluator will check those directly.', disposition: 'analysis-limit', blocking: false, evidence_ids: ['design:api'] }], evidence_ids: ['design:api'] }],
});
writeFileSync(new URL('specification.json', import.meta.url), JSON.stringify(specification, null, 2) + '\n');
writeFileSync(new URL('context.json', import.meta.url), serializeOperationContext(assembleContext(specification, 'analyze-impact', { maxBytes: 65536 })));
console.log(specification.artifact_id);
