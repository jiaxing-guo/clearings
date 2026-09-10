import { prepareContextRuntime } from '../specification/native-closure.js';
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ClearingsError } from '../model/types.js';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { assertOutputOutsideRepository } from '../repository/output.js';
import { assertPortable } from '../specification/validate.js';
import {
  validateContextInvocation,
  getContextAssemblyContract,
} from '../conformance/context-contract.js';
import { createContextAssemblyCases } from '../conformance/context-cases.js';
import { recordContextAssembly } from '../conformance/context-recorder.js';
import { createContextAssemblyEvaluator } from '../conformance/context-evaluator.js';
import { validateExecutionRecord } from '../conformance/validate.js';
import {
  contextSuiteIdentity,
  contextConformanceReportIdentity,
  contextConformanceEntry,
  createContextConformanceReport,
  renderContextConformanceReport,
} from '../conformance/context-report.js';
import type { ContextAssemblyCase } from '../conformance/context-cases.js';
import type {
  ContextConformanceReport,
  ContextConformanceEntry,
  ContextSuiteName,
} from '../conformance/context-report.js';
import type { ExecutionRecord, ContentIdentity } from '../conformance/model.js';

const invalid = (message: string): never => {
  throw new ClearingsError('INVALID_CONFORMANCE', message);
};
function read(path: string, expectedChecksum?: string): unknown {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024)
      return invalid('Expected a regular JSON file of at most 64 MiB.');
    const bytes = readFileSync(path);
    if (expectedChecksum !== undefined && sha256(bytes) !== expectedChecksum)
      return invalid('Recorded file checksum does not match the run manifest.');
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    assertPortable(value);
    return value;
  } catch (error) {
    if (error instanceof ClearingsError) throw error;
    return invalid('Cannot read conformance JSON.');
  }
}
function replayInputs(path: string): {
  records: Iterable<ExecutionRecord>;
  count: number;
  suite: ContextSuiteName;
  source_run_id: string | null;
} {
  const { profile, specification } = getContextAssemblyContract();
  if (!lstatSync(path).isDirectory()) {
    const record = read(path);
    validateExecutionRecord(record, profile, specification);
    return { records: [record], count: 1, suite: 'single', source_run_id: null };
  }
  const input = read(join(path, 'run.json')) as ContextConformanceReport;
  if (
    !input ||
    input.kind !== 'context-conformance-run' ||
    input.schema_version !== '0.1.0' ||
    input.artifact_id !== contextConformanceReportIdentity(input) ||
    input.profile_id !== profile.artifact_id ||
    input.specification_id !== specification.artifact_id ||
    !input.suite ||
    !['smoke', 'full', 'single'].includes(input.suite.name) ||
    !Array.isArray(input.cases) ||
    input.cases.length > 1554
  )
    return invalid('Invalid or stale conformance run manifest.');
  const suite = input.suite.name;
  const expected = suite === 'single' ? null : createContextAssemblyCases(suite);
  const definition = suite === 'single' ? null : contextSuiteIdentity(suite);
  if (
    input.cases.length !== (expected?.length ?? 1) ||
    input.suite.definition_id !== (definition?.artifact_id ?? null) ||
    input.suite.expected_cases !== input.cases.length ||
    input.suite.covered_cases !== input.cases.length
  )
    return invalid('Run manifest has incomplete or stale suite coverage.');
  input.cases.forEach((entry, index) => {
    if (!entry || entry.record_file !== `record-${String(index).padStart(5, '0')}.json`)
      return invalid('Run record path must be its canonical local filename.');
    if (typeof entry.record_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.record_sha256))
      return invalid('Run record checksum must be a SHA-256 digest.');
    if (expected && entry.case_id !== expected[index]!.case_id)
      return invalid('Recorded input differs from its frozen suite case.');
  });
  if (new Set(input.cases.map((entry) => entry.case_id)).size !== input.cases.length)
    return invalid('Duplicate recorded cases.');
  function* records(): Generator<ExecutionRecord> {
    for (const [index, entry] of input.cases.entries()) {
      const record = read(join(path, entry.record_file), entry.record_sha256);
      validateExecutionRecord(record, profile, specification);
      if (record.artifact_id !== entry.record_id || record.case_id !== entry.case_id)
        return invalid('Record identity or case differs from its manifest entry.');
      if (expected && canonical(record.arguments_before) !== canonical(expected[index]!.invocation))
        return invalid('Recorded input differs from its frozen suite case.');
      yield record;
    }
  }
  return { records: records(), count: input.cases.length, suite, source_run_id: input.artifact_id };
}
export async function conformanceCommand(
  positionals: string[],
  values: Record<string, unknown>,
): Promise<void> {
  const action = positionals[1] ?? 'run',
    input = positionals[2];
  const allowed =
    action === 'run'
      ? ['out', 'suite', 'implementation-root', 'timeout-ms', 'native-stages']
      : action === 'replay'
        ? ['out']
        : [];
  if (
    !['run', 'replay'].includes(action) ||
    positionals.length > 3 ||
    Object.keys(values).some((key) => !allowed.includes(key)) ||
    (values.out !== undefined && typeof values.out !== 'string')
  )
    throw new ClearingsError(
      'INVALID_ARGUMENTS',
      'Use conformance [--suite smoke|full], conformance run [invocation.json], or conformance replay record.json|run-directory. Each accepts --out new-directory.',
    );
  if ((action === 'replay' && !input) || (action === 'run' && input && values.suite))
    throw new ClearingsError(
      'INVALID_ARGUMENTS',
      'Replay requires an input; run accepts either an invocation file or a named suite.',
    );
  const timeout = values['timeout-ms'] === undefined ? 10000 : Number(values['timeout-ms']);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
    throw new ClearingsError(
      'INVALID_ARGUMENTS',
      'timeout-ms must be an integer from 1 through 60000.',
    );
  const ownRoot = fileURLToPath(new URL('../../', import.meta.url));
  const target =
    typeof values['implementation-root'] === 'string' ? values['implementation-root'] : ownRoot;
  const destination =
    values.out === undefined
      ? join(
          dirname(realpathSync(ownRoot)),
          'clearings-conformance-runs',
          `${action}-${Date.now()}-${randomUUID()}`,
        )
      : String(values.out);
  const output = assertOutputOutsideRepository(ownRoot, destination);
  if (action === 'run') assertOutputOutsideRepository(target, output);
  if (existsSync(output))
    throw new ClearingsError('OUTPUT_EXISTS', 'Conformance output must be a new directory.');
  if (action === 'replay') {
    const source = realpathSync(input!),
      directory = lstatSync(source).isDirectory() ? source : dirname(source),
      rel = relative(directory, output);
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))
      throw new ClearingsError(
        'OUTPUT_IN_TARGET',
        'Replay output must be outside its input evidence directory.',
      );
  }
  let suite: ContextSuiteName,
    cases: ContextAssemblyCase[] = [],
    records: Iterable<ExecutionRecord> = [],
    count = 0,
    source_run_id: string | null = null;
  if (action === 'replay')
    ({ records, count, suite, source_run_id } = replayInputs(realpathSync(input!)));
  else if (input) {
    const invocation = read(input);
    validateContextInvocation(invocation);
    suite = 'single';
    cases = [{ case_id: 'single-invocation', category: 'targeted', invocation }];
  } else {
    if (values.suite !== undefined && !['smoke', 'full'].includes(String(values.suite)))
      throw new ClearingsError('INVALID_ARGUMENTS', 'suite must be smoke or full.');
    suite = values.suite === 'full' ? 'full' : 'smoke';
    contextSuiteIdentity(suite);
    cases = createContextAssemblyCases(suite);
  }
  // Prepare only this package's implementation, before any bounded worker or output.
  // Replay and explicitly selected candidates never trigger preparation here.
  if (action === 'run' && values['implementation-root'] === undefined) prepareContextRuntime();
  // Validate the first input before creating output, then retain only the current record.
  const iterator = records[Symbol.iterator]();
  let current = iterator.next();
  const evaluateContextAssembly = createContextAssemblyEvaluator();
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  const write = (name: string, value: unknown) =>
    writeFileSync(
      join(output, name),
      typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
      { flag: 'wx' },
    );
  const entries: ContextConformanceEntry[] = [];
  let evaluator: ContentIdentity | undefined;
  const length = action === 'run' ? cases.length : count;
  for (let index = 0; index < length; index++) {
    const record =
      action === 'run'
        ? await recordContextAssembly({
            ...cases[index]!,
            implementation_root: target,
            timeout_ms: timeout,
            ...(values['native-stages'] === true ? { native_recording: 'stages' as const } : {}),
          })
        : current.value!;
    const evaluation = evaluateContextAssembly(record),
      bytes = JSON.stringify(record, null, 2) + '\n';
    const entry = contextConformanceEntry(record, evaluation, index, bytes);
    entries.push(entry);
    evaluator = evaluation.evaluator;
    write(entry.record_file, bytes);
    write(entry.evaluation_file, evaluation);
    if ((index + 1) % 128 === 0)
      process.stderr.write(`${index + 1}/${length} conformance cases evaluated\n`);
    if (action === 'replay') current = iterator.next();
  }
  const report = createContextConformanceReport(
    action === 'run' ? 'execution' : 'replay',
    suite,
    entries,
    evaluator!,
    source_run_id,
  );
  write('report.md', renderContextConformanceReport(report));
  write('run.json', report);
  process.stdout.write(
    JSON.stringify({
      artifact_id: report.artifact_id,
      mode: report.mode,
      acceptance: report.acceptance,
      summary: report.summary,
      output_directory: output,
    }) + '\n',
  );
  process.exitCode =
    report.acceptance === 'accepted' ? 0 : report.acceptance === 'rejected' ? 1 : 3;
}
