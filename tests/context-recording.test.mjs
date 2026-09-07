import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assembleContext, sealSpecification, specificationIdentity, checkOperation } from '../dist/index.js';
import { canonical } from '../dist/repository/inventory.js';
import { recordContextAssembly, getContextAssemblyContract, mapContextAssemblyObservation, sealExecutionRecord, validateExecutionRecord } from 'clearings/conformance';

const hash = value => createHash('sha256').update(value).digest('hex');
const operation = (id, required = [], optional = []) => ({ id, alias: `alias-${id}`, name: id, purpose: `Preserve 中文 🌱 ${id}.`, inputs: {}, output: { kind: 'null' },
  reads: [], writes: [], frame: 'partial', effects: { completeness: 'partial', allowed: [] }, outcome_policy: 'exclusive', coverage: 'complete',
  outcomes: [{ id: `done-${id}`, description: 'Complete.', when: { kind: 'literal', value: true }, ensures: [], updates: [], effects: [], transitions: [], evidence_ids: [] }],
  guarantees: [], dependencies: [...required.map(operation_id => ({ operation_id, requirement: 'required' })), ...optional.map(operation_id => ({ operation_id, requirement: 'optional' }))].map(item => ({ ...item, kind: 'uses-contract', role: 'Selected dependency.' })),
  implementations: [], decisions: [], evidence_ids: [] });
const spec = sealSpecification({ schema_version: '0.3.0', kind: 'specification', name: 'Recording fixture', perspective: 'intended',
  provenance: { author: 'Recorder tests', origin: 'user-directed-design', review: 'proposed', notes: [] }, states: [], sources: [],
  operations: [operation('root', ['leaf'], ['optional']), operation('leaf', ['root']), operation('optional')] });
const invocation = () => ({ specification: structuredClone(spec), selection: 'alias-root', options: { maxBytes: 65536 } });
const contract = getContextAssemblyContract();
const measurement = (record, id) => record.measurements.find(item => item.id === id);
const checked = record => {
  const mapping = mapContextAssemblyObservation(record);
  assert.equal(mapping.status, 'mapped', JSON.stringify(mapping));
  return checkOperation(contract.specification, mapping.operation_id, mapping.observation);
};

function candidate(t, source) {
  const root = mkdtempSync(join(tmpdir(), 'clearings-recorder-candidate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['src/specification', 'dist/specification']) mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'recorder-test-candidate', type: 'module' }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ name: 'recorder-test-candidate', lockfileVersion: 3, packages: {} }));
  writeFileSync(join(root, 'src/specification/context.ts'), source);
  writeFileSync(join(root, 'dist/specification/context.js'), source);
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Recorder test', '-c', 'user.email=recorder@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test fixture'], { cwd: root });
  return root;
}
const fromCandidate = (t, source, options = {}) => recordContextAssembly({ case_id: 'candidate-case', invocation: invocation(), implementation_root: candidate(t, source), ...options });
const packageSource = JSON.stringify(assembleContext(spec, 'root', { maxBytes: 65536 }));

test('recorder captures an actual return, owned arguments, measured bytes, and component identities', async () => {
  const input = invocation(), original = structuredClone(input);
  const record = await recordContextAssembly({ case_id: 'actual-return', invocation: input });
  validateExecutionRecord(record, contract.profile, contract.specification);
  assert.equal(record.origin, 'recorded-execution'); assert.equal(record.completion.kind, 'return');
  assert.deepEqual(record.completion.result.value, assembleContext(spec, 'root', input.options));
  assert.deepEqual(record.arguments_before, original); assert.deepEqual(record.arguments_after.value, original); assert.deepEqual(input, original);
  assert.equal(measurement(record, 'invocation').value.root_id, 'root');
  assert.deepEqual(measurement(record, 'returned-context').value.operation_ids, ['root', 'leaf']);
  assert.equal(measurement(record, 'serialized-bytes').value, Buffer.byteLength(JSON.stringify(record.completion.result.value) + '\n'));
  assert.equal(record.identities.fixture.sha256, hash(canonical(original)));
  for (const path of ['src/specification/context.ts', 'dist/specification/context.js', 'package-lock.json']) assert.equal(record.identities.implementation.files.find(file => file.path === path).sha256, hash(readFileSync(path)));
  assert.equal(record.identities.runtime.version, process.version); assert.equal(record.identities.adapter.status, 'bound');
  for (const id of ['reference-required-bytes', 'expected-projection', 'effects']) assert.equal(measurement(record, id).status, 'unobserved');
  const result = checked(record); assert.equal(result.verdict, 'unknown'); assert(!result.checks.some(check => check.verdict === 'fail'));
  input.specification.name = 'Caller mutation after recording'; assert.deepEqual(record.arguments_before, original);
});

test('actual exceptions preserve structured details and observed validation precedence', async () => {
  const missing = invocation(); missing.specification.operations[0].dependencies[0].operation_id = 'absent';
  missing.specification.artifact_id = specificationIdentity(missing.specification); missing.selection = 'absent'; missing.options.maxBytes = 0;
  for (const [input, code, outcome] of [
    [missing, 'MISSING_REQUIRED_DEPENDENCY', 'thrown-dependency'],
    [{ ...invocation(), selection: 'absent', options: { maxBytes: 0 } }, 'INVALID_BUDGET', 'thrown-budget-invalid'],
    [{ ...invocation(), selection: 'absent' }, 'INVALID_SELECTION', 'thrown-selection'],
    [{ ...invocation(), options: { maxBytes: 1 } }, 'CONTEXT_BUDGET', 'thrown-budget-exceeded'],
  ]) {
    const record = await recordContextAssembly({ case_id: `actual-${code}`, invocation: input });
    assert.equal(record.completion.kind, 'throw'); assert.equal(record.completion.thrown.status, 'captured');
    assert.equal(record.completion.thrown.value.code, code);
    assert.deepEqual(record.arguments_before, record.arguments_after.value);
    assert.equal(measurement(record, 'serialized-bytes').status, 'unobserved');
    assert.equal(mapContextAssemblyObservation(record).observation.outcome, outcome);
    assert(!checked(record).checks.some(check => check.verdict === 'fail'));
    if (code === 'CONTEXT_BUDGET') {
      assert.equal(record.completion.thrown.value.details.max_bytes, 1);
      assert(record.completion.thrown.value.details.required_bytes > 1);
      assert.equal(measurement(record, 'exception').value.required_bytes[0], record.completion.thrown.value.details.required_bytes);
      assert.throws(() => assembleContext(input.specification, input.selection, input.options), error => {
        assert.deepEqual(error.details, record.completion.thrown.value.details); assert.equal(error.exitCode, 2); return true;
      });
    } else assert.deepEqual(measurement(record, 'exception').value.required_bytes, []);
  }
});

test('missing required targets retain dependency records used by transitions', async () => {
  const input = invocation();
  input.specification.operations[0].dependencies[0].operation_id = 'absent';
  input.specification.operations[0].outcomes[0].transitions.push({ operation_id: 'absent', handoff: 'invoke', description: 'Invoke the required dependency.' });
  input.specification.artifact_id = specificationIdentity(input.specification);
  const original = structuredClone(input);
  const record = await recordContextAssembly({ case_id: 'missing-transition-target', invocation: input });
  assert.equal(record.completion.kind, 'throw');
  assert.equal(record.completion.thrown.value.code, 'MISSING_REQUIRED_DEPENDENCY');
  assert.deepEqual(record.arguments_before, original); assert.deepEqual(record.arguments_after.value, original); assert.deepEqual(input, original);
  assert.equal(mapContextAssemblyObservation(record).observation.outcome, 'thrown-dependency');
  assert(!checked(record).checks.some(check => check.verdict === 'fail'));
});

test('missing required targets do not conceal other invalid specification references', async () => {
  for (const defect of ['duplicate-dependency', 'undeclared-transition', 'missing-evidence']) {
    const input = invocation(), root = input.specification.operations[0];
    root.dependencies[0].operation_id = 'absent';
    if (defect === 'duplicate-dependency') root.dependencies.push(structuredClone(root.dependencies[0]));
    if (defect === 'undeclared-transition') root.outcomes[0].transitions.push({ operation_id: 'undeclared', handoff: 'invoke', description: 'Invalid transition.' });
    if (defect === 'missing-evidence') root.outcomes[0].evidence_ids.push('missing-source');
    input.specification.artifact_id = specificationIdentity(input.specification);
    await assert.rejects(recordContextAssembly({ case_id: defect, invocation: input }), { code: 'INVALID_SPECIFICATION' });
  }
});

test('reported byte counters are retained independently of serialized-byte measurement', async t => {
  const record = await fromCandidate(t, `export function assembleContext() { const result = ${packageSource}; result.budget.used_bytes = 0; return result; }`);
  assert.equal(measurement(record, 'returned-context').value.reported_bytes, 0);
  assert.equal(measurement(record, 'serialized-bytes').value, Buffer.byteLength(JSON.stringify(record.completion.result.value) + '\n'));
  assert.equal(checked(record).checks.find(check => check.id === 'return-bytes').verdict, 'fail');
});

test('candidate argument mutations are captured without mutating caller-owned inputs', async t => {
  const input = invocation();
  const record = await fromCandidate(t, `export function assembleContext(spec) { spec.name = 'Mutated'; return ${packageSource}; }`, { invocation: input });
  assert.equal(input.specification.name, spec.name); assert.equal(record.arguments_before.specification.name, spec.name);
  assert.equal(record.arguments_after.value.specification.name, 'Mutated');
  assert.equal(checked(record).checks.find(check => check.id === 'return-input-preservation').verdict, 'fail');
});

test('native errors preserve absent and zero details without parsing their messages', async t => {
  for (const [details, expected] of [['', []], [', details: { required_bytes: 0 }', [0]]]) {
    const record = await fromCandidate(t, `export function assembleContext() { throw Object.assign(new Error('Required bytes: 999999'), { code: 'CONTEXT_BUDGET' ${details} }); }`);
    assert.deepEqual(measurement(record, 'exception').value.required_bytes, expected);
    assert.equal(checked(record).checks.find(check => check.id === 'throw-budget-size').verdict, 'fail');
  }
  const unsupported = await fromCandidate(t, `export function assembleContext() { throw {code:'UNEXPECTED'}; }`);
  assert.equal(unsupported.completion.thrown.value.code, 'UNEXPECTED');
  assert.match(mapContextAssemblyObservation(unsupported).reason, /Unsupported observed exception code/);
  const malformed = await fromCandidate(t, `export function assembleContext() { throw {code:'CONTEXT_BUDGET', details:{required_bytes:null}}; }`);
  assert.equal(measurement(malformed, 'exception').status, 'unobserved');
  assert.equal(mapContextAssemblyObservation(malformed).status, 'unmapped');
});

test('malformed returns retain raw evidence and explicit mapping failures', async t => {
  const record = await fromCandidate(t, `export function assembleContext() { return {budget:{used_bytes:0}}; }`);
  assert.equal(record.completion.result.status, 'captured');
  assert.equal(measurement(record, 'serialized-bytes').status, 'observed');
  const mapping = mapContextAssemblyObservation(record);
  assert.equal(mapping.status, 'unmapped'); assert(mapping.missing_measurement_ids.includes('returned-context'));
  assert.equal('observation' in mapping, false);
});

test('nonportable and null completions preserve completion class and unavailable captures', async t => {
  for (const body of ['return undefined;', 'return 1n;', 'const value = {}; value.self = value; return value;', 'return Promise.resolve(null);']) {
    const record = await fromCandidate(t, `export function assembleContext() { ${body} }`);
    assert.equal(record.completion.kind, 'return'); assert.equal(record.completion.result.status, 'unavailable');
    assert.equal(measurement(record, 'serialized-bytes').status, 'unobserved'); assert.equal(mapContextAssemblyObservation(record).status, 'unmapped');
  }
  for (const keyword of ['return', 'throw']) {
    const record = await fromCandidate(t, `export function assembleContext() { ${keyword} null; }`);
    assert.equal(record.completion.kind, keyword);
    const captured = keyword === 'return' ? record.completion.result : record.completion.thrown;
    assert.deepEqual(captured, { status: 'captured', value: null }); assert.equal(mapContextAssemblyObservation(record).status, 'unmapped');
  }
});

test('unavailable resulting arguments remain unmapped instead of acquiring a default digest', async t => {
  const record = await fromCandidate(t, `export function assembleContext(spec) { spec.self = spec; return ${packageSource}; }`);
  assert.equal(record.completion.kind, 'return'); assert.equal(record.arguments_after.status, 'unavailable');
  assert.equal(measurement(record, 'arguments-after-digest').status, 'unobserved');
  assert(mapContextAssemblyObservation(record).missing_measurement_ids.includes('arguments-after-digest'));
});

test('worker timeouts and harness failures remain distinct from application outcomes', async t => {
  const timedOut = await fromCandidate(t, 'export function assembleContext() { while (true) {} }', { timeout_ms: 1500 });
  assert.deepEqual(timedOut.completion, { kind: 'timeout', limit_ms: 1500 });
  assert.equal(mapContextAssemblyObservation(timedOut).status, 'unmapped');
  for (const [source, phase] of [['export const unrelated = 1;', 'prepare'], ['export function assembleContext() { process.exit(0); }', 'invoke']]) {
    const record = await fromCandidate(t, source);
    assert.equal(record.completion.kind, 'harness-failure'); assert.equal(record.completion.phase, phase);
    assert.equal(measurement(record, 'serialized-bytes').status, 'unobserved'); assert.equal(mapContextAssemblyObservation(record).status, 'unmapped');
  }
});

test('a known application completion survives a capture timeout', async t => {
  const record = await fromCandidate(t, 'export function assembleContext() { return new Proxy({}, {ownKeys() {while (true) {}}}); }', { timeout_ms: 2000 });
  assert.equal(record.completion.kind, 'return'); assert.equal(record.completion.result.status, 'unavailable');
  assert.equal(record.arguments_after.status, 'captured');
  assert.equal(measurement(record, 'serialized-bytes').status, 'unobserved');
});

test('mapping rejects measurement claims that disagree with captured evidence', async t => {
  const record = await fromCandidate(t, `export function assembleContext() { return ${packageSource}; }`);
  measurement(record, 'serialized-bytes').value++;
  const changed = sealExecutionRecord(record, contract.profile, contract.specification);
  assert.match(mapContextAssemblyObservation(changed).reason, /Measurement differs from its captured evidence: serialized-bytes/);
});

test('invalid recording requests and out-of-domain inputs fail before invocation', async () => {
  for (const options of [{ case_id: undefined }, { case_id: 'invalid id' }, { fixture_name: 1 }, { repository: null }, { timeout_ms: 0 }, { timeout_ms: 60001 }, { invocation: { ...invocation(), options: { maxBytes: 1.5 } } }]) {
    await assert.rejects(recordContextAssembly({ case_id: 'invalid-request', invocation: invocation(), ...options }), { code: 'INVALID_CONFORMANCE' });
  }
  const invalid = invocation(); invalid.specification.name = 'Stale identity';
  await assert.rejects(recordContextAssembly({ case_id: 'stale-input', invocation: invalid }), { code: 'INVALID_SPECIFICATION' });
  await assert.rejects(recordContextAssembly({ case_id: 'missing-checkout', invocation: invocation(), implementation_root: '/does-not-exist-clearings' }), { code: 'CONFORMANCE_PREPARATION' });
});

test('non-object recording requests use the conformance error contract', async () => {
  for (const value of [null, undefined, true, 1, 'request', [], () => {}]) {
    await assert.rejects(recordContextAssembly(value), { code: 'INVALID_CONFORMANCE' });
  }
});

test('component bindings reject symlinked and non-directory manifest ancestors', async t => {
  for (const path of ['src', 'dist', 'schemas', 'specifications', 'specifications/clearings', 'specifications/clearings/conformance']) {
    const root = candidate(t, 'export function assembleContext() { return null; }');
    mkdirSync(join(root, 'schemas'));
    mkdirSync(join(root, 'specifications/clearings/conformance'), { recursive: true });
    writeFileSync(join(root, 'specifications/clearings/conformance/profile.json'), '{}');
    const outside = mkdtempSync(join(tmpdir(), 'clearings-recorder-external-'));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    renameSync(join(root, path), join(outside, 'component'));
    symlinkSync(join(outside, 'component'), join(root, path), 'dir');
    await assert.rejects(recordContextAssembly({ case_id: 'symlinked-component', invocation: invocation(), implementation_root: root }), { code: 'CONFORMANCE_PREPARATION' });
  }
  for (const kind of ['file', 'dangling-symlink']) {
    const root = candidate(t, 'export function assembleContext() { return null; }');
    if (kind === 'file') writeFileSync(join(root, 'schemas'), '{}');
    else symlinkSync(join(root, 'absent'), join(root, 'schemas'), 'dir');
    await assert.rejects(recordContextAssembly({ case_id: kind, invocation: invocation(), implementation_root: root }), { code: 'CONFORMANCE_PREPARATION' });
  }
});
