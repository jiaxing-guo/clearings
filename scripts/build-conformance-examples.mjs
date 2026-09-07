// Deterministic authored examples. This script never invokes the implementation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sealSpecification } from '../dist/index.js';
import { sealConformanceProfile, sealExecutionRecord } from '../dist/conformance/index.js';
import { canonical } from '../dist/repository/inventory.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] === undefined ? join(repositoryRoot, 'specifications/clearings/conformance') : resolve(process.argv[2]);
const lit = value => ({ kind: 'literal', value });
const ref = (root, ...path) => ({ kind: 'ref', root, path });
const compare = (op, left, right) => ({ kind: 'compare', op, left, right });
const eq = (left, right) => compare('eq', left, right);
const all = (...terms) => ({ kind: 'all', terms });
const not = value => ({ kind: 'not', value });
const contains = (collection, value) => ({ kind: 'contains', collection, value });
const every = (collection, variable, predicate) => ({ kind: 'every', collection, variable, predicate });
const list = element => ({ kind: 'list', element });
const string = { kind: 'string' }, integer = { kind: 'integer' }, strings = list(string);
const row = fields => ({ kind: 'record', fields });
const hashes = list(row({ id: string, sha256: string }));
const hash = value => createHash('sha256').update(value).digest('hex');
const rule = (id, description, predicate) => ({ id, description, predicate, evidence_ids: [] });
const opaque = (id, description) => rule(id, description, { kind: 'opaque', text: description, reason: 'Requires the independent conformance evaluator or declared instrumentation.' });
const input = name => ref('input', name), out = name => ref('output', name);
const inputs = { root_id: string, available_ids: strings, required_edges: list(row({ from: string, to: string })), max_bytes: integer };
const rootExists = contains(input('available_ids'), input('root_id'));
const dependenciesExist = every(input('required_edges'), 'edge', contains(input('available_ids'), ref('local', 'edge', 'to')));
const validBudget = all(compare('gte', input('max_bytes'), lit(1)), compare('lte', input('max_bytes'), lit(2097152)));
const valid = all(dependenciesExist, validBudget, rootExists);
const unchanged = id => rule(id, 'Invocation arguments have equal canonical content before and after completion.', eq(ref('before', 'arguments-digest'), ref('after', 'arguments-digest')));
const baseOperation = (id, name) => ({ id, alias: id, name, purpose: name,
  inputs, output: { kind: 'null' }, reads: ['arguments-digest'], writes: [], frame: 'partial',
  effects: { completeness: 'partial', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
  outcomes: [], guarantees: [], dependencies: [], implementations: [], decisions: [], evidence_ids: [] });
const returned = baseOperation('assembly-return', 'Context assembly return conformance');
returned.inputs = { ...inputs, artifact_id: string, records: hashes, applicable_decisions: list(row({ operation_id: string, decision_id: string })) };
returned.output = row({ operation_ids: strings, omitted_ids: strings, records: hashes, decision_ids: strings,
  state_ids: strings, source_ids: strings, artifact_id: string, reported_bytes: integer, reported_required_bytes: integer, measured_bytes: integer });
returned.outcomes = [{ id: 'returned', description: 'Return a complete required context for a valid invocation.', when: valid,
  ensures: [
    rule('return-root', 'The selected root is present.', contains(out('operation_ids'), input('root_id'))),
    rule('return-unique', 'Each selected operation occurs once.', { kind: 'unique', value: out('operation_ids') }),
    rule('return-closure', 'The selected operation set is exactly the least required closure.', all(
      { kind: 'subset', collection: { kind: 'reachable', root: input('root_id'), edges: input('required_edges') }, value: out('operation_ids') },
      { kind: 'subset', collection: out('operation_ids'), value: { kind: 'reachable', root: input('root_id'), edges: input('required_edges') } })),
    rule('return-records', 'Selected operation records retain their complete canonical content.', every(out('records'), 'record', contains(input('records'), ref('local', 'record')))),
    rule('return-decisions', 'All decisions on selected operations remain available.', every(input('applicable_decisions'), 'decision', {
      kind: 'any', terms: [not(contains(out('operation_ids'), ref('local', 'decision', 'operation_id'))), contains(out('decision_ids'), ref('local', 'decision', 'decision_id'))],
    })),
    rule('return-omissions', 'Every available operation is selected or explicitly omitted, and those sets are disjoint.', all(
      every(input('available_ids'), 'id', { kind: 'any', terms: [contains(out('operation_ids'), ref('local', 'id')), contains(out('omitted_ids'), ref('local', 'id'))] }),
      every(out('omitted_ids'), 'id', not(contains(out('operation_ids'), ref('local', 'id')))),
      { kind: 'subset', collection: input('available_ids'), value: out('omitted_ids') }, { kind: 'unique', value: out('omitted_ids') })),
    rule('return-identity', 'The returned context retains the invocation specification identity.', eq(out('artifact_id'), input('artifact_id'))),
    rule('return-bytes', 'Both reported counters equal the independently measured UTF-8 bytes and fit the budget.', all(
      eq(out('reported_bytes'), out('measured_bytes')), eq(out('reported_required_bytes'), out('measured_bytes')),
      compare('lte', out('measured_bytes'), input('max_bytes')))),
    opaque('return-order', 'Operations use stable breadth-first order with sorted required targets; state, source, and omission IDs are sorted.'),
    opaque('return-states', 'Return exactly the state records required by selected read/write sets and complete frames.'),
    opaque('return-evidence', 'Return exactly the sources referenced by schema-defined evidence metadata on selected records.'),
  ], updates: [], effects: [], transitions: [], evidence_ids: [] }];
returned.guarantees = [unchanged('return-input-preservation'), opaque('return-effects', 'No external effects occur during the candidate invocation.')];
const thrown = baseOperation('assembly-throw', 'Context assembly exception conformance');
thrown.output = row({ code: string, required_bytes: list(integer) });
const cases = [
  ['dependency', 'MISSING_REQUIRED_DEPENDENCY', not(dependenciesExist)],
  ['budget-invalid', 'INVALID_BUDGET', all(dependenciesExist, not(validBudget))],
  ['selection', 'INVALID_SELECTION', all(dependenciesExist, validBudget, not(rootExists))],
  ['budget-exceeded', 'CONTEXT_BUDGET', valid],
];
thrown.outcomes = cases.map(([id, code, when]) => ({ id: `thrown-${id}`, description: `Raise ${code} at its declared validation stage.`, when,
  ensures: [rule(`throw-${id}-code`, `The observed error code is ${code}.`, eq(out('code'), lit(code))),
    ...(code === 'CONTEXT_BUDGET' ? [rule('throw-budget-size', 'Expose one required byte count exceeding the requested budget.', all(
      eq({ kind: 'length', value: out('required_bytes') }, lit(1)), every(out('required_bytes'), 'bytes', compare('gt', ref('local', 'bytes'), input('max_bytes'))))),
    opaque('throw-budget-reference', 'The reported required bytes equal the independently constructed complete package size; a fitting invocation must not raise CONTEXT_BUDGET.')] : []),
  ], updates: [], effects: [], transitions: [], evidence_ids: [] }));
thrown.guarantees = [unchanged('throw-input-preservation'), opaque('throw-effects', 'No external effects occur during the candidate invocation.')];
const spec = sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Context assembly executable conformance', perspective: 'intended',
  provenance: { author: 'Clearings conformance design', origin: 'user-directed-design', review: 'proposed', notes: [
    'Return and exception contracts describe two observed completion classes of the same API.',
    'Measurement procedures and residual obligations are defined by the separate conformance profile. No runner or independent evaluator is implemented by these artifacts.',
  ] }, states: [{ id: 'arguments-digest', name: 'Invocation arguments', description: 'Digest of canonical invocation arguments at each completion boundary.', scope: 'invocation', type: string, evidence_ids: [] }],
  operations: [returned, thrown], sources: [] });

const measurements = [
  ['invocation', 'arguments-before', row({ ...inputs, artifact_id: string, applicable_decisions: returned.inputs.applicable_decisions }), 'Extract root ID, available IDs, required edges, integer budget, artifact identity, and applicable decisions from the concrete invocation; resolve a valid alias against the input specification.'],
  ['input-records', 'arguments-before', hashes, 'Hash complete canonical input operation records, retaining one entry per operation.'],
  ['returned-records', 'return', hashes, 'Hash every complete returned operation record; record count and IDs must agree with the raw returned operations array.'],
  ['returned-context', 'return', row(Object.fromEntries(Object.entries(returned.output.fields).filter(([key]) => key !== 'measured_bytes'))), 'Project every returned record and reported counter faithfully. Keep independent serialized bytes in the separate serialized-bytes measurement.'],
  ['serialized-bytes', 'independent', integer, 'Encode the entire returned package as compact JSON plus one newline and count UTF-8 bytes without calling production serialization or accounting helpers.', ['return']],
  ['reference-required-bytes', 'independent', integer, 'Independently construct the complete required package and solve the counter fixed point for the requested budget; do not use the candidate package or error to compute this value.', ['arguments-before']],
  ['expected-projection', 'independent', row({ operation_ids: strings, state_ids: strings, source_ids: strings }), 'Compute expected ordering and state/evidence selection from the original invocation using independently implemented reference procedures.', ['arguments-before']],
  ['arguments-before-digest', 'arguments-before', string, 'Hash canonical arguments immediately before invocation.'],
  ['arguments-after-digest', 'arguments-after', string, 'Hash canonical arguments immediately after return or exception; a missing snapshot remains unobserved.'],
  ['exception', 'exception', thrown.output, 'Read the actual exception code and optional structured required_bytes detail. An absent detail becomes an empty list, not a fabricated zero; do not parse the message.'],
  ['effects', 'instrumentation', strings, 'Record effect IDs only if the monitor covers the declared boundary. No monitor is supplied in this PR; mark this measurement unobserved.', []],
].map(([id, source, type, procedure, capture_requirements = [source]]) => ({ id, source, capture_requirements, type, description: procedure, procedure }));
const obligations = [];
function obligation(id, requirement, operations, rules, measurement_ids, verification, limitation, mandatory = true) {
  obligations.push({ id, requirement, operation_ids: operations, rule_ids: rules, measurement_ids, mandatory, verification, limitation });
}
const returnOp = ['assembly-return'], throwOp = ['assembly-throw'];
const predicate = rule_ids => ({ kind: 'predicate', rule_ids });
const native = check_id => ({ kind: 'independent-check', check_id });
const mapped = 'Predicate agreement depends on faithful observation mapping; the adapter must be tested separately.';
obligation('closure', 'Select exactly the least required dependency closure, including the root, without duplicates.', returnOp, ['return-root', 'return-unique', 'return-closure'], ['invocation', 'returned-context'], predicate(['return-root', 'return-unique', 'return-closure']), mapped);
obligation('ordering', 'Preserve the documented traversal and record ordering.', returnOp, ['return-order'], ['invocation', 'returned-context', 'expected-projection'], native('check-ordering'), 'Reference procedure is required; its implementation is deferred.');
obligation('record-preservation', 'Retain complete selected operation records and one digest per selected ID.', returnOp, ['return-records'], ['input-records', 'returned-records', 'returned-context'], native('check-record-preservation'), 'The predicate compares supplied digests. The independent check must establish projection completeness and full raw-record equality.');
obligation('decisions', 'Retain all decisions belonging to selected operations.', returnOp, ['return-decisions'], ['invocation', 'returned-context', 'input-records'], predicate(['return-decisions']), mapped);
obligation('omissions', 'Partition available operations into selected and explicitly omitted IDs.', returnOp, ['return-omissions'], ['invocation', 'returned-context'], predicate(['return-omissions']), mapped);
obligation('state-selection', 'Select and preserve exactly the required state records.', returnOp, ['return-states'], ['invocation', 'returned-context', 'expected-projection'], native('check-state-selection'), 'Independent comparison must inspect full raw records, not only the projected IDs.');
obligation('evidence-selection', 'Select and preserve exactly the sources referenced by selected schema metadata.', returnOp, ['return-evidence'], ['invocation', 'returned-context', 'expected-projection'], native('check-evidence-selection'), 'Literal keys named evidence_ids do not select evidence. Source hashes do not authenticate source provenance.');
obligation('identity', 'Retain the input specification identity in the context.', returnOp, ['return-identity'], ['invocation', 'returned-context'], predicate(['return-identity']), mapped);
obligation('byte-accounting', 'Both counters equal independently measured compact JSON UTF-8 bytes and do not exceed the requested budget.', returnOp, ['return-bytes'], ['returned-context', 'serialized-bytes', 'invocation'], predicate(['return-bytes']), 'The independent encoder must retain the final newline and counter fields; predicate checks do not validate that encoder.');
obligation('input-preservation', 'Preserve invocation argument values at observed completion boundaries.', ['assembly-return', 'assembly-throw'], ['return-input-preservation', 'throw-input-preservation'], ['arguments-before-digest', 'arguments-after-digest'], predicate(['return-input-preservation', 'throw-input-preservation']), 'Boundary equality does not exclude transient writes that are later restored, or prove absence of aliasing.');
const errorRules = cases.map(([id]) => `throw-${id}-code`);
obligation('error-precedence', 'Within the declared domain, validate required references before budget validity, then resolve selection, then check package capacity.', throwOp, errorRules, ['invocation', 'exception'], predicate(errorRules), 'The full specification validator has additional earlier failures outside this profile domain. Outcome mapping must use the observed exception code.');
obligation('budget-failure', 'Reject a non-fitting package with the exact required size; never reject a fitting valid invocation as CONTEXT_BUDGET.', throwOp, ['throw-budget-size', 'throw-budget-reference'], ['invocation', 'exception', 'reference-required-bytes'], native('check-budget-failure'), 'Requires independent package construction and structured exception details, both deferred.');
obligation('external-effects', 'No external effects occur during candidate invocation.', ['assembly-return', 'assembly-throw'], ['return-effects', 'throw-effects'], ['effects'], { kind: 'unresolved', reason: 'No complete effect instrumentation exists.' }, 'Excluded from mandatory scoped acceptance. Contract verdicts retain unknown for this opaque obligation.', false);
const profile = sealConformanceProfile({ schema_version: '0.1.0', kind: 'conformance-profile', name: 'Bounded context assembly conformance', specification_id: spec.artifact_id,
  target: { module: 'src/specification/context.ts', export: 'assembleContext' },
  scope: {
    input_domain: [
      'Portable v0.3 intended or observed invocation specifications with valid structure, identity, types, and references, except that required dependency targets may be absent.',
      'Selection is a nonempty string containing an operation ID, valid alias, or absent selection. Budgets are safe integers, including values outside 1 through 2097152.',
      'Single synchronous invocation over in-memory JSON values. Schema work limits and expression limits remain those of v0.3.',
    ], requirements: obligations.map(item => item.id), exclusions: [
      'Malformed schemas, stale input identities, invalid expression types, noninteger or nonfinite budgets, and non-JSON arguments remain outside this bounded profile.',
      'Concurrency, arbitrary external effects, transient writes restored before capture, post-return aliasing, universal refinement, and agent coding advantage are not established.',
    ],
  }, completion_operations: { return: 'assembly-return', throw: 'assembly-throw' }, measurements, obligations,
}, spec);
const baseline = '9d1fede2a32c9575635e22aa7fabed1158224306';
const module = profile.target.module;
let source;
try {
  source = execFileSync('git', ['show', `${baseline}:${module}`], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (cause) {
  throw new Error(`Cannot read baseline source ${baseline}:${module} from ${repositoryRoot}. Ensure Git is available and this checkout contains the baseline object; for shallow history, run git fetch origin ${baseline} from the repository root before regenerating the examples.`, { cause });
}
const argumentsBefore = { specification: { example: 'Illustrative arguments only; not an executable conformance fixture.' }, selection: 'root', options: { maxBytes: 65536 } };
const absent = reason => ({ status: 'unavailable', reason });
const examples = [
  ['return', { kind: 'return', result: { status: 'captured', value: { example: 'Illustrative return payload; not a valid operation context.' } } }],
  ['throw', { kind: 'throw', thrown: { status: 'captured', value: { name: 'ClearingsError', code: 'CONTEXT_BUDGET', message: 'Illustrative exception.', details: { required_bytes: 70000 } } } }],
  ['timeout', { kind: 'timeout', limit_ms: 1000 }],
  ['harness-failure', { kind: 'harness-failure', phase: 'prepare', message: 'Illustrative preparation failure.' }],
].map(([name, completion]) => [name, sealExecutionRecord({ schema_version: '0.1.0', kind: 'execution-record', origin: 'authored-example',
  profile_id: profile.artifact_id, specification_id: spec.artifact_id, case_id: `example:${name}`,
  identities: { implementation: { repository: 'https://github.com/jiaxing-guo/clearings-semantic', commit: baseline,
    tree: '2a2e2e9aa1f433237edd8bf2fb717dd0dabbf4f8', module, export: profile.target.export, files: [{ path: module, sha256: hash(source) }] },
    adapter: absent('The adapter is not implemented in this PR.'), evaluator: absent('The independent evaluator is not implemented in this PR.'),
    fixture: { name: 'Authored protocol illustration', sha256: hash(canonical(argumentsBefore)) }, runtime: absent('No implementation was executed.'),
  }, arguments_before: argumentsBefore, arguments_after: absent('No invocation was performed.'), completion,
  measurements: measurements.map(item => ({ id: item.id, status: 'unobserved', reason: 'Authored format example; no measurements were performed.' })),
  limitations: ['This authored example demonstrates the record schema only. It is not a conformance case, captured execution, or passing result.'],
}, profile, spec)]);
mkdirSync(join(output, 'examples'), { recursive: true });
const write = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n');
write('specification.json', spec); write('profile.json', profile);
for (const [name, record] of examples) write(`examples/${name}.json`, record);
console.log(JSON.stringify({ specifications: 1, obligations: obligations.length, authored_examples: examples.length, executions: 0 }));
