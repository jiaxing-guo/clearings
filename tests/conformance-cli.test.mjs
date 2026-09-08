import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createContextAssemblyCases, contextConformanceReportIdentity, sealExecutionRecord, getContextAssemblyContract } from 'clearings/conformance';
import { candidateCheckout, controlSource, faults, faultSource } from './helpers/conformance.mjs';

const cli = resolve('dist/cli/main.js'), cases = createContextAssemblyCases();
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const invoke = (...args) => spawnSync(process.execPath, [cli, 'conformance', ...args], { encoding: 'utf8', timeout: 60000 });
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'clearings-conformance-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}

test('CLI records and replays saved evidence after candidate removal', t => {
  const root = workspace(t), candidate = candidateCheckout(controlSource); t.after(candidate.dispose);
  const input = join(root, 'input.json'); write(input, cases.find(item => item.case_id === 'optional-edges').invocation);
  const run = join(root, 'run'), replay = join(root, 'replay');
  const recorded = invoke('run', input, '--implementation-root', candidate.root, '--out', run);
  assert.equal(recorded.status, 0, recorded.stderr);
  const original = read(join(run, 'run.json')), recordBytes = readFileSync(join(run, 'record-00000.json'), 'utf8');
  assert.equal(original.mode, 'execution'); assert.equal(original.acceptance, 'accepted');
  assert.equal(original.summary.contract_unknown, 1); assert.match(readFileSync(join(run, 'report.md'), 'utf8'), /broader contract verdict remains unknown/);
  candidate.dispose(); rmSync(join(run, 'evaluation-00000.json'));
  const result = invoke('replay', run, '--out', replay);
  assert.equal(result.status, 0, result.stderr);
  const report = read(join(replay, 'run.json'));
  assert.equal(report.mode, 'replay'); assert.equal(report.source_run_id, original.artifact_id);
  assert.equal(report.cases[0].evaluation_id, original.cases[0].evaluation_id);
  assert.equal(readFileSync(join(replay, 'record-00000.json'), 'utf8'), recordBytes);
  assert.equal(invoke('replay', join(run, 'record-00000.json'), '--out', join(root, 'single')).status, 0);
  const linkedRecord = join(root, 'record-link.json'), linkedDirectory = join(root, 'run-link');
  symlinkSync(join(run, 'record-00000.json'), linkedRecord); symlinkSync(run, linkedDirectory, 'dir');
  for (const [source, output] of [
    [join(run, 'record-00000.json'), join(run, 'sibling-output')],
    [join(run, 'record-00000.json'), join(run, 'nested', 'output')],
    [linkedRecord, join(run, 'linked-source-output')],
    [join(run, 'record-00000.json'), join(linkedDirectory, 'linked-output')],
  ]) {
    const protectedResult = invoke('replay', source, '--out', output);
    assert.equal(protectedResult.status, 2, protectedResult.stderr);
    assert.match(protectedResult.stderr, /outside its input evidence directory/); assert(!existsSync(output));
  }
  assert.equal(readFileSync(join(run, 'record-00000.json'), 'utf8'), recordBytes);
});

test('CLI distinguishes rejected executions from inconclusive authored replay', t => {
  const root = workspace(t), fault = faults.find(item => item.id === 'mutate-arguments'), candidate = candidateCheckout(faultSource(fault)); t.after(candidate.dispose);
  const input = join(root, 'input.json'); write(input, cases.find(item => item.case_id === fault.case_id).invocation);
  const run = join(root, 'run'), result = invoke('run', input, '--implementation-root', candidate.root, '--out', run);
  assert.equal(result.status, 1, result.stderr); assert.equal(read(join(run, 'run.json')).acceptance, 'rejected');
  const record = read(join(run, 'record-00000.json')); record.origin = 'authored-example';
  record.arguments_after = { status: 'unavailable', reason: 'Edited checker fixture.' };
  record.completion = { kind: 'timeout', limit_ms: 10000 };
  record.measurements = record.measurements.map(item => ({ id: item.id, status: 'unobserved', reason: 'Edited checker fixture.' }));
  const contract = getContextAssemblyContract(); write(join(run, 'authored.json'), sealExecutionRecord(record, contract.profile, contract.specification));
  const replay = invoke('replay', join(run, 'authored.json'), '--out', join(root, 'inconclusive'));
  assert.equal(replay.status, 3, replay.stderr);
});

test('CLI rejects invalid options and protects existing files and target checkouts', t => {
  const root = workspace(t), candidate = candidateCheckout(controlSource); t.after(candidate.dispose);
  const input = join(root, 'input.json'); write(input, cases[0].invocation);
  for (const args of [
    ['run', '--suite', 'absent'], ['run', input, '--suite', 'smoke'], ['replay', input, '--implementation-root', candidate.root],
    ['run', input, '--timeout-ms', '0'], ['run', input, '--timeout-ms', 'Infinity'], ['run', input, '--unexpected'],
  ]) assert.equal(invoke(...args, '--out', join(root, 'invalid')).status, 2, args.join(' '));
  assert(!existsSync(join(root, 'invalid')));
  const existing = readFileSync(input, 'utf8');
  assert.equal(invoke('run', input, '--out', input).status, 2); assert.equal(readFileSync(input, 'utf8'), existing);
  for (const output of [join(candidate.root, 'results'), resolve('conformance-test-output')]) {
    assert.equal(invoke('run', input, '--implementation-root', candidate.root, '--out', output).status, 2);
    assert(!existsSync(output));
  }
});

test('CLI replay rejects altered checksums, path traversal, stale bindings, and false coverage', t => {
  const root = workspace(t), input = join(root, 'input.json'), run = join(root, 'run'); write(input, cases[0].invocation);
  assert.equal(invoke('run', input, '--out', run).status, 0);
  const original = read(join(run, 'run.json'));
  for (const defect of ['checksum', 'path', 'coverage', 'profile', 'duplicate']) {
    const report = structuredClone(original);
    if (defect === 'checksum') report.cases[0].record_sha256 = '0'.repeat(64);
    if (defect === 'path') report.cases[0].record_file = '../input.json';
    if (defect === 'coverage') report.suite.expected_cases = 2;
    if (defect === 'profile') report.profile_id = 'conformance-profile:' + '0'.repeat(64);
    if (defect === 'duplicate') report.cases.push(structuredClone(report.cases[0]));
    report.artifact_id = contextConformanceReportIdentity(report); write(join(run, 'run.json'), report);
    const output = join(root, defect), result = invoke('replay', run, '--out', output);
    assert.equal(result.status, 2, `${defect}: ${result.stderr}`); assert(!existsSync(output));
  }
});

test('named-suite replay binds every recorded input to its frozen case position', t => {
  const root = workspace(t), run = join(root, 'run');
  const result = invoke('run', '--suite', 'smoke', '--out', run);
  assert.equal(result.status, 0, result.stderr);
  const report = read(join(run, 'run.json'));
  assert.equal(report.suite.covered_cases, 36); assert.equal(report.summary.accepted, 36);
  assert.equal(invoke('replay', run, '--out', join(root, 'valid-replay')).status, 0);
  const first = readFileSync(join(run, 'record-00000.json')), second = readFileSync(join(run, 'record-00001.json'));
  writeFileSync(join(run, 'record-00001.json'), second.toString() + ' ');
  const partial = join(root, 'partial-replay'), interrupted = invoke('replay', run, '--out', partial);
  assert.equal(interrupted.status, 2, interrupted.stderr); assert.match(interrupted.stderr, /checksum/);
  assert.equal(readFileSync(join(partial, 'record-00000.json'), 'utf8'), first.toString());
  assert(existsSync(join(partial, 'evaluation-00000.json')), 'Replay evaluates and persists each record before loading the next');
  assert(!existsSync(join(partial, 'record-00001.json'))); assert(!existsSync(join(partial, 'run.json')));
  writeFileSync(join(run, 'record-00000.json'), second); writeFileSync(join(run, 'record-00001.json'), first);
  [report.cases[0], report.cases[1]] = [report.cases[1], report.cases[0]];
  report.cases[0].record_file = 'record-00000.json'; report.cases[1].record_file = 'record-00001.json';
  report.artifact_id = contextConformanceReportIdentity(report); write(join(run, 'run.json'), report);
  const replay = invoke('replay', run, '--out', join(root, 'invalid-replay'));
  assert.equal(replay.status, 2, replay.stderr); assert.match(replay.stderr, /frozen suite case/);
});

test('CLI defaults to smoke and allocates distinct output directories for runs and replay', t => {
  const outputs = [];
  t.after(() => outputs.forEach(path => rmSync(path, { recursive: true, force: true })));
  const invokeDefault = (...args) => {
    const result = invoke(...args);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout).output_directory; outputs.push(output);
    assert.equal(dirname(output), resolve('..', 'clearings-conformance-runs'));
    assert(existsSync(join(output, 'report.md'))); return output;
  };
  const first = invokeDefault(), report = read(join(first, 'run.json'));
  assert.equal(report.mode, 'execution'); assert.equal(report.suite.name, 'smoke'); assert.equal(report.summary.accepted, 36);
  const root = workspace(t), input = join(root, 'input.json'); write(input, cases[0].invocation);
  const second = invokeDefault('run', input);
  assert.equal(read(join(second, 'run.json')).suite.name, 'single');
  const replay = invokeDefault('replay', second);
  assert.equal(read(join(replay, 'run.json')).mode, 'replay');
  assert.equal(new Set(outputs).size, 3);
});
