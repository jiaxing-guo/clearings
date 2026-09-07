// Authored design examples. This script does not infer semantics from source.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sealSpecification } from '../dist/specification/validate.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const literal = value => ({ kind: 'literal', value });
const ref = (root, ...path) => ({ kind: 'ref', root, path });
const compare = (op, left, right) => ({ kind: 'compare', op, left, right });
const eq = (left, right) => compare('eq', left, right);
const not = value => ({ kind: 'not', value });
const all = (...terms) => ({ kind: 'all', terms });
const any = (...terms) => ({ kind: 'any', terms });
const contains = (collection, value) => ({ kind: 'contains', collection, value });
const every = (collection, variable, predicate) => ({ kind: 'every', collection, variable, predicate });
const str = { kind: 'string' }, bool = { kind: 'boolean' }, int = { kind: 'integer' };
const list = element => ({ kind: 'list', element });
const record = fields => ({ kind: 'record', fields });
const choice = (...values) => ({ kind: 'enum', values });
const rule = (id, description, predicate, evidence_ids = ['design:context']) => ({ id, description, predicate, evidence_ids });
const outcome = (id, description, when, ensures = [], extra = {}) => ({ id, description, when, ensures, updates: [], effects: [], transitions: [], evidence_ids: [], ...extra });
const implementation = (name, responsibility, evidence_ids = []) => ({ name, responsibility, symbol_id: null, evidence_ids });
const operation = (id, name, purpose, inputs, output, outcomes, extra = {}) => ({ id, alias: id, name, purpose, inputs, output,
  reads: [], writes: [], frame: 'complete', effects: { completeness: 'complete', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
  outcomes, guarantees: [], dependencies: [], implementations: [], decisions: [], evidence_ids: ['design:context'], ...extra });
const dependency = (operation_id, role, requirement = 'required', kind = 'uses-contract') => ({ operation_id, role, requirement, kind });
const decision = (id, question, consequence, disposition = 'analysis-limit', blocking = false) => ({ id, question, consequence, disposition, blocking, evidence_ids: [] });

const design = readFileSync(new URL('../docs/SPECIFICATION_ARCHITECTURE.md', import.meta.url), 'utf8');
const edge = record({ from: str, to: str });
const available = ref('input', 'available_ids'), selected = ref('output', 'included_ids');
const rootExists = contains(available, ref('input', 'root_id'));
const edgesExist = every(ref('input', 'required_edges'), 'edge', contains(available, ref('local', 'edge', 'to')));
const validBudget = all(compare('gte', ref('input', 'max_bytes'), literal(1)), compare('lte', ref('input', 'max_bytes'), literal(2097152)));
const readyInput = all(rootExists, edgesExist, validBudget);
const outputTag = tag => eq(ref('output', 'kind'), literal(tag));
const output = record({ kind: choice('ready', 'invalid-selection', 'missing-dependency', 'invalid-budget', 'budget-exceeded'), included_ids: list(str), omitted_ids: list(str), decision_ids: list(str), artifact_id: str, used_bytes: int, required_bytes: int });
const inputs = { root_id: str, available_ids: list(str), required_edges: list(edge), applicable_decisions: list(record({ operation_id: str, decision_id: str })), artifact_id: str, max_bytes: int };
const closureRule = rule('rule:dependency-closure', 'Every required dependency of an included operation is included.',
  every(ref('input', 'required_edges'), 'edge', any(not(contains(selected, ref('local', 'edge', 'from'))), contains(selected, ref('local', 'edge', 'to')))));
const reachable = { kind: 'reachable', root: ref('input', 'root_id'), edges: ref('input', 'required_edges') };
const minimalRule = rule('rule:minimal-closure', 'Every included operation is reachable from the selected root through required edges.', { kind: 'subset', collection: reachable, value: selected });
const knownDecisions = rule('rule:retain-decisions', 'Every open decision on an included operation remains available.',
  every(ref('input', 'applicable_decisions'), 'decision', any(not(contains(selected, ref('local', 'decision', 'operation_id'))), contains(ref('output', 'decision_ids'), ref('local', 'decision', 'decision_id')))));
const root = operation('assemble-context', 'Assemble context for a coding agent',
  'Give an agent the selected operation and its required rules together. Preserve open decisions and explain deferred lookups. Return an explicit error when the required package cannot be produced.', inputs, output, [
    outcome('outcome:ready', 'Return the complete required context package.', readyInput, [
      rule('rule:ready-tag', 'The result identifies a ready package.', outputTag('ready')),
      rule('rule:root-present', 'The selected operation is present.', contains(selected, ref('input', 'root_id'))),
      rule('rule:no-duplicates', 'Each operation appears once, including in cycles.', { kind: 'unique', value: selected }),
      rule('rule:known-records', 'Every included operation comes from this specification.', { kind: 'subset', collection: available, value: selected }),
      closureRule, minimalRule, knownDecisions,
      rule('rule:omissions', 'Every available operation is included or explicitly omitted.', every(available, 'id', any(contains(selected, ref('local', 'id')), contains(ref('output', 'omitted_ids'), ref('local', 'id'))))),
      rule('rule:disjoint-omissions', 'An included operation is never listed as omitted.', every(selected, 'id', not(contains(ref('output', 'omitted_ids'), ref('local', 'id'))))),
      rule('rule:identity', 'The package identifies the input specification.', eq(ref('output', 'artifact_id'), ref('input', 'artifact_id'))),
      rule('rule:within-budget', 'The exact serialized output fits its byte budget.', compare('lte', ref('output', 'used_bytes'), ref('input', 'max_bytes'))),
      rule('rule:required-size', 'This required-only package reports its full size as required.', eq(ref('output', 'used_bytes'), ref('output', 'required_bytes'))),
    ]),
    outcome('outcome:budget', 'Report the required size without returning truncated context.', readyInput, [
      rule('rule:budget-tag', 'The result identifies insufficient budget.', outputTag('budget-exceeded')),
      rule('rule:budget-reason', 'The measured required size exceeds the requested budget.', compare('gt', ref('output', 'required_bytes'), ref('input', 'max_bytes'))),
      rule('rule:no-partial-return', 'No truncated operation list is returned.', eq({ kind: 'length', value: selected }, literal(0))),
    ]),
    outcome('outcome:selection', 'Reject an unknown operation selection.', not(rootExists), [rule('rule:selection-tag', 'The error identifies an unknown selection.', outputTag('invalid-selection'))]),
    outcome('outcome:dependency', 'Reject a missing required dependency.', not(edgesExist), [rule('rule:dependency-tag', 'The error identifies a missing dependency.', outputTag('missing-dependency'))]),
    outcome('outcome:invalid-budget', 'Reject a budget outside the supported integer range.', not(validBudget), [rule('rule:invalid-budget-tag', 'The error identifies an invalid budget.', outputTag('invalid-budget'))]),
  ], { outcome_policy: 'allowed', reads: ['model-digest'], dependencies: [
    dependency('select-required', 'Find the selected operation and all required dependencies; terminate on cycles.'),
    dependency('project-operation', 'Keep each operation purpose, conditions, outcomes, implementation roles, and unknowns together.'),
    dependency('measure-package', 'Measure serialized bytes including budget accounting before accepting the package.'),
    dependency('render-context', 'Show the same package to a person in reading order.', 'optional'),
  ], implementations: [implementation('assembleContext', 'Validate the specification, select required operations, attach state and evidence, and reject an insufficient budget.')], decisions: [
    decision('decision:bootstrap-coverage', 'Does this context improve a fresh agent coding task?', 'This continuing-session bootstrap checks behavior and counterexamples. It does not establish independent agent benefit.'),
    decision('decision:minimum-closure', 'Does the implementation select the least required closure?', 'Typed rules check required closure and root reachability. A separate reference algorithm also checks exact membership against actual assembler output.'),
    decision('decision:encoding', 'Does used_bytes equal actual UTF-8 serialization?', 'The expression kernel compares supplied values. The conformance adapter measures actual bytes independently.'),
  ] });
const closure = operation('select-required', 'Select required dependencies', 'Traverse required dependency references once per operation. Keep cycles finite and leave optional relationships deferred.',
  { root_id: str, available_ids: list(str), required_edges: list(edge) }, list(str), [outcome('outcome:closure', 'Return required operation IDs beginning with the selected root.', rootExists, [
    rule('rule:closure-root', 'The root belongs to the selected closure.', contains(ref('output'), ref('input', 'root_id'))),
    rule('rule:closure-minimal', 'Every selected ID is reachable from the root through required edges.', { kind: 'subset', collection: reachable, value: ref('output') }),
    rule('rule:closure-unique', 'The closure has no duplicate IDs.', { kind: 'unique', value: ref('output') }),
    rule('rule:closure-edges', 'Every selected required edge stays inside the closure.', every(ref('input', 'required_edges'), 'edge', any(not(contains(ref('output'), ref('local', 'edge', 'from'))), contains(ref('output'), ref('local', 'edge', 'to'))))),
  ])], { coverage: 'partial', implementations: [implementation('requiredClosure', 'Use a queue and visited IDs to expand required references without recursion.')], decisions: [decision('decision:closure-errors', 'How are absent roots or targets reported?', 'The public assembly operation specifies these errors. This local contract covers a valid graph.')] });
const projection = operation('project-operation', 'Project an operation for an agent', 'Keep the operation purpose and every conditional outcome in one record. Each implementation entry explains that function’s own responsibility.',
  { expected_outcome_ids: list(str) }, record({ outcome_ids: list(str), purpose: str, implementation_roles: list(str) }), [outcome('outcome:projection', 'Return all outcomes and explicit implementation responsibilities.', literal(true), [
    rule('rule:all-outcomes', 'No outcome is lost in projection.', eq(ref('output', 'outcome_ids'), ref('input', 'expected_outcome_ids'))),
    rule('rule:purpose-present', 'The purpose is present.', compare('gt', { kind: 'length', value: ref('output', 'purpose') }, literal(0))),
    rule('rule:roles-present', 'Each listed implementation role is nonempty.', every(ref('output', 'implementation_roles'), 'role', compare('gt', { kind: 'length', value: ref('local', 'role') }, literal(0)))),
  ])], { implementations: [implementation('assembleContext', 'Copy canonical operations and resolve dependency names while retaining their individual roles.'), implementation('renderOperationContext', 'Render the same rules as an article and decision table, with source details available in place.')] });
const measurement = operation('measure-package', 'Measure the serialized package', 'Count UTF-8 bytes of compact JSON plus its final newline. Include the counters themselves in the calculation.',
  { measured_bytes: int, maximum_bytes: int }, record({ used_bytes: int, fits: bool }), [outcome('outcome:measurement', 'Return the measured size and whether the package fits.', literal(true), [
    rule('rule:measured-bytes', 'The reported size equals independently measured bytes.', eq(ref('output', 'used_bytes'), ref('input', 'measured_bytes'))),
    rule('rule:measured-fit', 'The fit decision includes the exact boundary.', eq(ref('output', 'fits'), compare('lte', ref('input', 'measured_bytes'), ref('input', 'maximum_bytes')))),
  ])], { implementations: [implementation('accountBytes', 'Recalculate byte counters until their encoded digits no longer change the package size.')] });
const clearings = sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Clearings context assembly', perspective: 'intended',
  provenance: { author: 'Codex continuing implementation session', origin: 'user-directed-design', review: 'proposed', notes: ['The user approved the bootstrap direction. The precise contracts are author proposals for review.', 'Error precedence when several inputs are invalid is intentionally unconstrained.'] },
  states: [{ id: 'model-digest', name: 'Input model content digest', description: 'The digest of the input JSON before and after assembly. The conformance adapter measures it independently.', scope: 'invocation', type: str, evidence_ids: ['design:context'] }],
  operations: [root, closure, projection, measurement], sources: [{ id: 'design:context', origin: 'design', locator: 'docs/SPECIFICATION_ARCHITECTURE.md', text: design, sha256: hash(design), binding: null }] });
writeFileSync(new URL('../specifications/clearings/context-assembly.json', import.meta.url), JSON.stringify(clearings, null, 2) + '\n');

const legacy = JSON.parse(readFileSync(new URL('../benchmarks/results/hono-contracts/semantic.json', import.meta.url), 'utf8'));
const sources = legacy.data.request.data.source_request.data.evidence.map(item => ({ id: item.id, origin: 'source', locator: `${item.path}:${item.start_line}-${item.end_line}`, text: item.text, sha256: hash(item.text), binding: { artifact_id: legacy.artifact_id, snapshot_id: legacy.snapshot_id } }));
const license = readFileSync(new URL('../benchmarks/results/hono-contracts/LICENSE-HONO', import.meta.url), 'utf8');
sources.push({ id: 'source:hono-license', origin: 'source', locator: 'Hono MIT license', text: license, sha256: hash(license), binding: { artifact_id: legacy.artifact_id, snapshot_id: legacy.snapshot_id } });
const sourceFor = name => {
  const fn = legacy.data.proposal.data.functions.find(item => item.alias === name);
  const callable = legacy.data.request.data.callables.find(item => item.id === fn?.implementation_id);
  return callable ? [callable.evidence_id] : [];
};
const dispatchEvidence = sourceFor('hono-dispatch'), getterEvidence = sourceFor('context-res-getter'), setterEvidence = sourceFor('context-res-setter'), composeEvidence = sourceFor('middleware-dispatch');
const hrule = (id, description, predicate, evidence = dispatchEvidence) => rule(id, description, predicate, evidence);
const hop = (id, name, purpose, inputs, output, outcomes, extra = {}) => operation(id, name, purpose, inputs, output, outcomes, {
  frame: 'partial', effects: { completeness: 'partial', allowed: [] }, coverage: 'partial', evidence_ids: dispatchEvidence,
  decisions: [decision(`decision:${id}-scope`, 'What happens inside unmodeled callbacks or platform helpers?', 'The model covers the stated decisions. Callback effects, platform failures, and source outside these excerpts remain unknown.')], ...extra });
const path = name => eq(ref('input', 'path'), literal(name));
const value = name => eq(ref('input', 'value'), literal(name));
const finalized = ref('before', 'finalized');
const selectCases = [
  ['direct-value', 'Use the direct non-nullish result, including a falsy value.', all(path('direct'), not(value('nullish'))), 'handler-result'],
  ['direct-missing', 'Call the not-found handler without consulting finalized.', all(path('direct'), value('nullish')), 'not-found'],
  ['promise-value', 'Use the truthy resolved Promise value.', all(path('promise'), value('truthy')), 'handler-result'],
  ['promise-context', 'Read the context response after a falsy resolution when finalized is true.', all(path('promise'), not(value('truthy')), finalized), 'context-response'],
  ['promise-missing', 'Call not-found after a falsy resolution when finalized is false.', all(path('promise'), not(value('truthy')), not(finalized)), 'not-found'],
  ['composed-context', 'Read the context response after successful composed execution with finalized context.', all(path('composed'), finalized), 'context-response'],
  ['composed-unfinalized', 'Raise the finalization error inside the composed application catch boundary.', all(path('composed'), not(finalized)), 'finalization-error'],
];
const selection = hop('response-selection', 'Select the response after handler execution',
  'Keep the direct, Promise, and composed fallback rules distinct. This operation models the response source selected after the relevant handler phase; it does not execute a callback.',
  { path: choice('direct', 'promise', 'composed'), value: choice('truthy', 'non-nullish-falsy', 'nullish') }, choice('handler-result', 'context-response', 'not-found', 'finalization-error'),
  selectCases.map(([id, description, when, result]) => outcome(`outcome:${id}`, description, when, [hrule(`rule:${id}`, `The selected response source is ${result}.`, eq(ref('output'), literal(result)))], { evidence_ids: dispatchEvidence,
    transitions: result === 'context-response' ? [{ operation_id: 'read-response', handoff: 'invoke', description: 'Read Context.res, which may create response storage.' }] : [] })), {
    reads: ['finalized'], dependencies: [dependency('read-response', 'Read or initialize response storage only when the chosen path uses Context.res.'), dependency('store-response', 'Explain the setter that establishes finalization; it is supporting behavior, not an unconditional next call.'), dependency('middleware-result', 'Explain when composition assigns a handler or error result.')],
    implementations: [implementation('#dispatch', 'Choose the direct or composed path and apply that path’s response and failure rules.', dispatchEvidence),
      implementation('Direct Promise result callback', 'Choose the resolved value, finalized context response, or not-found fallback.', sourceFor('promise-result')),
      implementation('Composed result finalization', 'Require finalized context before returning Context.res; the surrounding catch handles the finalization error.', sourceFor('composed-finalization')),
      implementation('Direct handler next callback', 'Call not-found and assign its awaited result through Context.res.', sourceFor('direct-next')),
      implementation('Direct Promise rejection callback', 'Pass rejection to #handleError.', sourceFor('promise-catch')),
      implementation('#handleError', 'Pass Error instances to the configured error handler and propagate other thrown values.', sourceFor('hono-handle-error'))],
    decisions: [decision('decision:dispatch-boundary', 'What if a handler or fallback throws instead of producing a result?', 'The typed table starts after successful handler execution. The direct not-found call is outside the local handler catch. Promise rejection and composed failures have different boundaries; see the attached source.'),
      decision('decision:promise-classification', 'How is a Promise recognized?', 'The source uses instanceof Promise. The path input represents that classification; this model does not classify arbitrary thenables.'),
      decision('decision:finalized-domain', 'Can external code put a non-boolean value in finalized?', 'The scenarios model the declared boolean state. Arbitrary external mutation is outside this scope.')]
  });
const getter = hop('read-response', 'Read or initialize response storage', 'Return stored response state. If storage is absent, initialize it. Reading this accessor does not set finalized.', {}, choice('stored-response', 'created-response'), [
  outcome('outcome:get-existing', 'Return existing storage.', ref('before', 'response-present'), [hrule('rule:get-existing', 'Select the stored response.', eq(ref('output'), literal('stored-response')), getterEvidence)]),
  outcome('outcome:get-create', 'Initialize response storage and return it.', not(ref('before', 'response-present')), [hrule('rule:get-create', 'Select the created response.', eq(ref('output'), literal('created-response')), getterEvidence)], { updates: [{ state_id: 'response-present', value: literal(true) }] }),
], { reads: ['response-present', 'finalized'], writes: ['response-present'], guarantees: [hrule('rule:get-finalized', 'The getter leaves finalized unchanged.', eq(ref('after', 'finalized'), ref('before', 'finalized')), getterEvidence), hrule('rule:get-storage', 'Successful reading leaves response storage present.', eq(ref('after', 'response-present'), literal(true)), getterEvidence)], implementations: [implementation('Context.res getter', 'Lazily create response storage and prepared headers without finalizing the context.', getterEvidence)], evidence_ids: getterEvidence });
const setter = hop('store-response', 'Store a response and finalize context', 'After any required header merge succeeds, store the assigned response and set finalized to true. An undefined assignment can finalize context without storing a response.',
  { assigned: choice('response', 'undefined'), merge_succeeds: bool }, choice('stored', 'propagated-error'), [
    outcome('outcome:set-success', 'Store the assignment and finalize.', ref('input', 'merge_succeeds'), [hrule('rule:set-result', 'The setter completes.', eq(ref('output'), literal('stored')), setterEvidence)], { updates: [{ state_id: 'finalized', value: literal(true) }, { state_id: 'response-present', value: eq(ref('input', 'assigned'), literal('response')) }] }),
    outcome('outcome:set-failure', 'Propagate the merge failure before storage and finalization updates.', not(ref('input', 'merge_succeeds')), [hrule('rule:set-failure', 'The error propagates.', eq(ref('output'), literal('propagated-error')), setterEvidence), hrule('rule:set-no-finalize', 'The finalization assignment has not run.', eq(ref('after', 'finalized'), ref('before', 'finalized')), setterEvidence), hrule('rule:set-no-replace', 'The storage assignment has not run.', eq(ref('after', 'response-present'), ref('before', 'response-present')), setterEvidence)]),
  ], { reads: ['response-present', 'finalized'], writes: ['response-present', 'finalized'], implementations: [implementation('Context.res setter', 'Merge headers when old and new responses exist, then replace storage and set finalized.', setterEvidence)], evidence_ids: setterEvidence,
    decisions: [decision('decision:setter-headers', 'What changes during header merging?', 'Header copying, content-type, and set-cookie rules are retained in source. This small model represents merge success as an input and does not claim to model intermediate mutations.')] });
const assign = all(ref('input', 'truthy_result'), any(not(finalized), ref('input', 'error_result')));
const middleware = hop('middleware-result', 'Decide whether middleware replaces the response', 'Assign a truthy result when finalized is exactly false or when it came from the error handler. A falsy result skips assignment.',
  { truthy_result: bool, error_result: bool }, choice('assign', 'preserve'), [
    outcome('outcome:middleware-assign', 'Assign the result through Context.res.', assign, [hrule('rule:middleware-assign', 'Choose assignment.', eq(ref('output'), literal('assign')), composeEvidence)], { transitions: [{ operation_id: 'store-response', handoff: 'invoke', description: 'Pass the selected result to the response setter.' }] }),
    outcome('outcome:middleware-preserve', 'Skip result assignment.', not(assign), [hrule('rule:middleware-preserve', 'Choose preservation.', eq(ref('output'), literal('preserve')), composeEvidence)]),
  ], { reads: ['finalized'], dependencies: [dependency('store-response', 'Apply an accepted result and establish finalization.')], implementations: [implementation('Nested middleware dispatch', 'Apply the exact result condition after awaiting the handler or processing an error.', composeEvidence)], evidence_ids: composeEvidence });
for (const op of [selection, getter, setter, middleware]) op.evidence_ids = [...op.evidence_ids, 'source:hono-license'];
const hono = sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Hono response selection', perspective: 'observed',
  provenance: { author: 'Codex authored interpretation of pinned Hono excerpts', origin: 'source-interpretation', review: 'proposed', notes: ['This is an abstract decision model, not a runtime simulator or intended Hono requirement.', `Source model: ${legacy.artifact_id}.`, 'Functions and precise source remain available. Independent claim-support review is pending.'] },
  states: [{ id: 'response-present', name: 'Response storage exists', description: 'Whether Context private response storage contains a response.', scope: 'request', type: bool, evidence_ids: getterEvidence }, { id: 'finalized', name: 'Context finalized flag', description: 'A separate boolean from response storage. Getter initialization does not establish finalization.', scope: 'request', type: bool, evidence_ids: setterEvidence }],
  operations: [selection, getter, setter, middleware], sources });
writeFileSync(new URL('../specifications/hono/response-selection.json', import.meta.url), JSON.stringify(hono, null, 2) + '\n');
console.log(JSON.stringify({ clearings: clearings.artifact_id, hono: hono.artifact_id }));
