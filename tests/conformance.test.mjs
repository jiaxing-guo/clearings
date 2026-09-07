import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { conformanceProfileIdentity, executionRecordIdentity, sealConformanceProfile, sealExecutionRecord,
  validateConformanceProfile, validateExecutionRecord } from 'clearings/conformance';
import { validateSpecification, sealSpecification, checkOperation } from '../dist/index.js';
import { sha256 } from '../dist/repository/source.js';
import { canonical } from '../dist/repository/inventory.js';

const read = name => JSON.parse(readFileSync(new URL(`../specifications/clearings/conformance/${name}.json`, import.meta.url), 'utf8'));
const specification = read('specification'), profile = read('profile');
const examples = ['return', 'throw', 'timeout', 'harness-failure'].map(name => read(`examples/${name}`));
const editProfile = mutate => { const result = structuredClone(profile); mutate(result); result.artifact_id = conformanceProfileIdentity(result); return result; };
const editRecord = mutate => { const result = structuredClone(examples[0]); mutate(result); result.artifact_id = executionRecordIdentity(result); return result; };
const invalidProfile = value => assert.throws(() => validateConformanceProfile(value, specification), { code: 'INVALID_CONFORMANCE' });
const invalidRecord = value => assert.throws(() => validateExecutionRecord(value, profile, specification), { code: 'INVALID_CONFORMANCE' });

test('conformance artifacts validate authored formats without asserting execution or acceptance', () => {
  validateSpecification(specification); validateConformanceProfile(profile, specification);
  assert.equal(profile.obligations.length, 13);
  assert.equal(profile.obligations.filter(item => item.mandatory).length, 12);
  for (const example of examples) {
    const before = JSON.stringify(example);
    validateExecutionRecord(example, profile, specification);
    assert.equal(JSON.stringify(example), before);
    assert.equal(example.origin, 'authored-example');
    assert(example.measurements.every(item => item.status === 'unobserved'));
    assert.equal('verdict' in example, false);
  }
  assert.deepEqual(sealConformanceProfile(profile, specification), profile);
  assert.deepEqual(sealExecutionRecord(examples[0], profile, specification), examples[0]);
  const reordered = Object.fromEntries(Object.entries(profile).reverse());
  assert.equal(conformanceProfileIdentity(reordered), profile.artifact_id);
});

test('profile coverage rejects stale references, missing obligations, and opaque predicate claims', () => {
  const stale = structuredClone(profile); stale.name += ' changed'; invalidProfile(stale);
  for (const mutate of [
    p => { p.specification_id = `specification:${'0'.repeat(64)}`; },
    p => { p.completion_operations.throw = 'missing'; },
    p => { p.completion_operations.throw = p.completion_operations.return; },
    p => { p.measurements.push(p.measurements[0]); },
    p => { delete p.measurements[0].capture_requirements; },
    p => { p.measurements[0].capture_requirements = []; },
    p => { p.measurements[0].capture_requirements = ['arguments-before', 'arguments-before']; },
    p => { p.measurements[0].capture_requirements = ['unknown-capture']; },
    p => { p.obligations.pop(); },
    p => { p.obligations[0].measurement_ids = ['absent']; },
    p => { p.obligations[0].rule_ids = ['missing']; },
    p => { p.obligations[0].operation_ids = ['assembly-throw']; },
    p => { p.obligations[0].verification.rule_ids = ['return-identity']; },
    p => { p.obligations[0].verification.rule_ids.pop(); },
    p => { p.obligations.at(-1).mandatory = true; },
    p => { p.obligations[1].verification = { kind: 'predicate', rule_ids: ['return-order'] }; },
    p => { p.obligations[0].rule_ids.pop(); p.obligations[0].verification.rule_ids.pop(); },
  ]) invalidProfile(editProfile(mutate));
  const observed = structuredClone(specification); observed.perspective = 'observed'; observed.provenance.origin = 'source-interpretation';
  const other = sealSpecification(observed), relabeled = editProfile(p => { p.specification_id = other.artifact_id; });
  assert.throws(() => validateConformanceProfile(relabeled, other), { code: 'INVALID_CONFORMANCE' });
});

test('opaque detection treats expression literal payloads as data', () => {
  const spec = structuredClone(specification);
  const rule = spec.operations[0].outcomes[0].ensures.find(item => item.id === 'return-identity');
  const literal = { kind: 'literal', value: { kind: 'opaque', text: 'Ordinary JSON data' } };
  rule.predicate = { kind: 'compare', op: 'eq', left: literal, right: literal };
  const sealed = sealSpecification(spec), p = editProfile(p => { p.specification_id = sealed.artifact_id; });
  validateConformanceProfile(p, sealed);
  rule.predicate = { kind: 'all', terms: [{ kind: 'opaque', text: 'Unformalized', reason: 'No predicate' }] };
  const opaque = sealSpecification(spec), bad = editProfile(p => { p.specification_id = opaque.artifact_id; });
  assert.throws(() => validateConformanceProfile(bad, opaque), { code: 'INVALID_CONFORMANCE' });
});

test('execution identity binds invocation, profile, entrypoint, and declared components', () => {
  const stale = structuredClone(examples[0]); stale.case_id = 'changed'; invalidRecord(stale);
  for (const mutate of [
    r => { r.profile_id = `conformance-profile:${'0'.repeat(64)}`; },
    r => { r.specification_id = `specification:${'0'.repeat(64)}`; },
    r => { r.arguments_before.options.maxBytes++; },
    r => { r.identities.implementation.module = 'another.ts'; },
    r => { r.identities.implementation.files.push(r.identities.implementation.files[0]); },
    r => { r.identities.implementation.files[0].path = 'another.ts'; },
    r => { r.identities.implementation.files[0].path = '../outside'; },
    r => { r.origin = 'recorded-execution'; },
    r => { r.verdict = 'pass'; },
  ]) invalidRecord(editRecord(mutate));
  // Binding fields are declarations: validating them never authenticates source or execution.
  const declared = editRecord(r => {
    r.origin = 'recorded-execution';
    r.identities.adapter = { status: 'bound', name: 'Synthetic adapter identity', sha256: '1'.repeat(64) };
    r.identities.evaluator = { status: 'bound', name: 'Synthetic evaluator identity', sha256: '2'.repeat(64) };
    r.identities.runtime = { status: 'bound', name: 'node', version: '24.0.0', platform: 'test', architecture: 'test', lockfile_sha256: '3'.repeat(64) };
  });
  validateExecutionRecord(declared, profile, specification);
  declared.identities.evaluator = { status: 'unavailable', reason: 'Captured before independent evaluation.' };
  validateExecutionRecord(sealExecutionRecord(declared, profile, specification), profile, specification);
});

test('measurements preserve missing information and reject incompatible completion claims', () => {
  for (const mutate of [
    r => { r.measurements.pop(); },
    r => { r.measurements[0] = r.measurements[1]; },
    r => { r.measurements[0].id = 'missing'; },
    r => { r.measurements[0].value = null; },
    r => { r.measurements[0] = { id: 'invocation', status: 'observed', value: {} }; },
    r => { r.measurements.find(m => m.id === 'serialized-bytes').status = 'observed'; },
    r => { r.measurements[r.measurements.findIndex(m => m.id === 'exception')] = { id: 'exception', status: 'observed', value: { code: 'X', required_bytes: [] } }; },
    r => { r.measurements[r.measurements.findIndex(m => m.id === 'arguments-after-digest')] = { id: 'arguments-after-digest', status: 'observed', value: 'digest' }; },
    r => { r.completion = { kind: 'timeout', limit_ms: 0 }; },
    r => { r.completion = { kind: 'harness-failure', phase: 'prepare', message: 'Failure', result: null }; },
  ]) invalidRecord(editRecord(mutate));
  const measured = editRecord(r => {
    r.measurements[r.measurements.findIndex(m => m.id === 'serialized-bytes')] = { id: 'serialized-bytes', status: 'observed', value: 0 };
  });
  validateExecutionRecord(measured, profile, specification);
  assert.equal(measured.measurements.find(m => m.id === 'serialized-bytes').value, 0);
  for (const completion of [{ kind: 'throw', thrown: { status: 'captured', value: null } }, { kind: 'return', result: { status: 'unavailable', reason: 'Unsupported value.' } }]) {
    validateExecutionRecord(editRecord(r => { r.completion = completion; }), profile, specification);
  }
});

test('independent measurements require their declared captures across completion classes', () => {
  const completions = [
    ...examples.map(example => example.completion),
    { kind: 'return', result: { status: 'unavailable', reason: 'Capture failed.' } },
    { kind: 'throw', thrown: { status: 'unavailable', reason: 'Capture failed.' } },
    { kind: 'return', result: { status: 'captured', value: null } },
    { kind: 'throw', thrown: { status: 'captured', value: null } },
  ];
  for (const completion of completions) {
    const measured = editRecord(r => {
      r.completion = completion;
      r.measurements[r.measurements.findIndex(m => m.id === 'serialized-bytes')] = { id: 'serialized-bytes', status: 'observed', value: 42 };
    });
    if (completion.kind === 'return' && completion.result.status === 'captured') validateExecutionRecord(measured, profile, specification);
    else assert.throws(() => validateExecutionRecord(measured, profile, specification), { code: 'INVALID_CONFORMANCE', message: /captured return: serialized-bytes/ });
    // An independent reference constructed from original arguments needs no candidate return.
    measured.measurements = measured.measurements.map(m => m.id === 'serialized-bytes'
      ? { id: m.id, status: 'unobserved', reason: 'No return measurement.' }
      : m.id === 'reference-required-bytes' ? { id: m.id, status: 'observed', value: 42 } : m);
    validateExecutionRecord(sealExecutionRecord(measured, profile, specification), profile, specification);
  }
  // Multiple prerequisites are conjunctive, including for independent exception measurements.
  const combined = editProfile(p => {
    const measurement = p.measurements.find(m => m.id === 'serialized-bytes');
    measurement.description = measurement.procedure = 'Synthetic independent check of exception and resulting arguments.';
    measurement.capture_requirements = ['exception', 'arguments-after'];
  });
  for (const capturedException of [false, true]) for (const capturedAfter of [false, true]) {
    const record = editRecord(r => {
      r.profile_id = combined.artifact_id;
      r.completion = { kind: 'throw', thrown: capturedException ? { status: 'captured', value: null } : { status: 'unavailable', reason: 'Missing exception.' } };
      r.arguments_after = capturedAfter ? { status: 'captured', value: null } : { status: 'unavailable', reason: 'Missing snapshot.' };
      r.measurements[r.measurements.findIndex(m => m.id === 'serialized-bytes')] = { id: 'serialized-bytes', status: 'observed', value: 42 };
    });
    if (capturedException && capturedAfter) validateExecutionRecord(record, combined, specification);
    else assert.throws(() => validateExecutionRecord(record, combined, specification), { code: 'INVALID_CONFORMANCE' });
  }
});

test('return conformance distinguishes reported byte counts and retains residual unknowns', () => {
  const digest = sha256(canonical({ id: 'root', purpose: 'Retained record' }));
  const record = { id: 'root', sha256: digest };
  const observation = {
    input: { root_id: 'root', available_ids: ['root'], required_edges: [], max_bytes: 1000, artifact_id: 'input-specification', records: [record], applicable_decisions: [] },
    before: { 'arguments-digest': 'same' }, after: { 'arguments-digest': 'same' }, outcome: 'returned',
    output: { operation_ids: ['root'], omitted_ids: [], records: [{ ...record }], decision_ids: [], state_ids: [], source_ids: [], artifact_id: 'input-specification', reported_bytes: 100, reported_required_bytes: 100, measured_bytes: 100 },
  };
  const result = checkOperation(specification, 'assembly-return', observation);
  assert.equal(result.verdict, 'unknown');
  assert.equal(result.checks.filter(check => check.verdict === 'fail').length, 0);
  assert.equal(result.checks.find(check => check.id === 'return-effects').verdict, 'unknown');
  for (const mutate of [
    o => { o.output.reported_bytes = 99; }, o => { o.output.reported_required_bytes = 101; },
    o => { o.output.measured_bytes = 1001; }, o => { o.output.records[0].sha256 = 'altered'; },
    o => { o.output.operation_ids = []; }, o => { o.output.omitted_ids = ['root']; },
    o => { o.after['arguments-digest'] = 'changed'; }, o => { o.input.max_bytes = 0; },
  ]) {
    const changed = structuredClone(observation); mutate(changed);
    assert.equal(checkOperation(specification, 'assembly-return', changed).verdict, 'fail');
  }
});

test('exception conformance encodes validation precedence without manufacturing return values', () => {
  const alternatives = [
    ['thrown-dependency', 'MISSING_REQUIRED_DEPENDENCY'], ['thrown-budget-invalid', 'INVALID_BUDGET'],
    ['thrown-selection', 'INVALID_SELECTION'], ['thrown-budget-exceeded', 'CONTEXT_BUDGET'],
  ];
  for (const hasDependency of [false, true]) for (const validBudget of [false, true]) for (const hasRoot of [false, true]) {
    const expected = !hasDependency ? 0 : !validBudget ? 1 : !hasRoot ? 2 : 3;
    for (let selected = 0; selected < alternatives.length; selected++) {
      const [outcome, code] = alternatives[selected];
      const observation = { input: { root_id: hasRoot ? 'root' : 'absent', available_ids: ['root'], required_edges: hasDependency ? [] : [{ from: 'root', to: 'missing' }], max_bytes: validBudget ? 100 : 0 },
        before: { 'arguments-digest': 'same' }, after: { 'arguments-digest': 'same' }, outcome,
        output: { code, required_bytes: selected === 3 ? [101] : [] } };
      assert.equal(checkOperation(specification, 'assembly-throw', observation).verdict, selected === expected ? 'unknown' : 'fail');
    }
  }
});

test('schema and authored artifact generation reproduce committed files', t => {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-conformance-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'schemas')); mkdirSync(join(directory, 'scripts'));
  cpSync('scripts/generate-conformance-schemas.py', join(directory, 'scripts/generate-conformance-schemas.py'));
  cpSync('schemas/specification.v0.3.json', join(directory, 'schemas/specification.v0.3.json'));
  execFileSync('python3', [join(directory, 'scripts/generate-conformance-schemas.py')]);
  for (const file of ['conformance-profile.v0.1.json', 'execution-record.v0.1.json']) assert.deepEqual(readFileSync(join(directory, 'schemas', file)), readFileSync(join('schemas', file)));
  const output = join(directory, 'authored');
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-conformance-examples.mjs', import.meta.url)), output], { cwd: directory });
  for (const file of ['specification.json', 'profile.json', ...readdirSync(join(output, 'examples')).map(name => `examples/${name}`)]) {
    assert.deepEqual(readFileSync(join(output, file)), readFileSync(join('specifications/clearings/conformance', file)));
  }
});

test('authored artifact generation diagnoses missing baseline history before writing output', t => {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-conformance-no-history-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'scripts'));
  cpSync('scripts/build-conformance-examples.mjs', join(directory, 'scripts/build-conformance-examples.mjs'));
  symlinkSync(fileURLToPath(new URL('../dist', import.meta.url)), join(directory, 'dist'), 'dir');
  execFileSync('git', ['init', '--quiet', directory]);
  const result = spawnSync(process.execPath, [join(directory, 'scripts/build-conformance-examples.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot read baseline source 9d1fede2a32c9575635e22aa7fabed1158224306:src\/specification\/context.ts/);
  assert.match(result.stderr, /git fetch origin 9d1fede2a32c9575635e22aa7fabed1158224306/);
  assert.equal(existsSync(join(directory, 'specifications')), false);
});
