import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { executeProgram, validateProgram } from 'clearings/program';
import { prepareRustProgram } from 'clearings/compiler';
import { selectionCases } from '../benchmarks/evaluation/context-selection-v1/cases.mjs';
import {
  expectedSelection,
  evaluateSelection,
} from '../benchmarks/evaluation/context-selection-v1/oracle.mjs';

const packet = new URL('../benchmarks/evaluation/context-selection-v1/', import.meta.url);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const read = (name) => JSON.parse(readFileSync(new URL(name, packet), 'utf8'));
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );

/** Evaluate JSON IR only. The candidate cannot supply an oracle, fixture, or host module. */
export function evaluateSelectionCandidate(program) {
  const manifest = read('manifest.json'),
    contract = read('contract.json');
  for (const file of manifest.files)
    if (digest(readFileSync(new URL(file.path, packet))) !== file.sha256)
      throw new Error(`Frozen selection evaluation changed: ${file.path}`);
  validateProgram(program);
  const entry = program.functions.find((fn) => fn.id === program.entry_function);
  if (
    program.entry_function !== contract.entry_function ||
    !isDeepStrictEqual(entry.parameters, contract.parameters) ||
    !isDeepStrictEqual(entry.returns, contract.returns) ||
    !isDeepStrictEqual(entry.failures, contract.failures)
  )
    throw new Error('Candidate entry does not match the frozen selection contract.');
  const cache = mkdtempSync(join(tmpdir(), 'clearings-selection-evaluation-'));
  let prepared, preparationFailure;
  const started = performance.now();
  try {
    try {
      prepared = prepareRustProgram(program, { cacheDirectory: cache });
    } catch (error) {
      if (!String(error.code).startsWith('RUST_')) throw error;
      preparationFailure = { code: error.code, message: error.message };
    }
    const prepareMs = performance.now() - started;
    const totals = { accepted: 0, rejected: 0, inconclusive: 0 };
    const corpus = createHash('sha256'),
      executions = createHash('sha256');
    const failures = [],
      maxUsage = Object.fromEntries(Object.keys(contract.limits).map((key) => [key, 0]));
    let referenceMs = 0,
      nativeMs = 0;
    for (const item of selectionCases()) {
      const before = structuredClone(item.args),
        expected = expectedSelection(before);
      corpus.update(canonical({ id: item.id, args: before, expected }) + '\n');
      const refStart = performance.now();
      const reference = executeProgram(program, item.args, contract.limits);
      referenceMs += performance.now() - refStart;
      const referenceCheck = evaluateSelection(
        before,
        { status: 'observed', completion: reference.completion },
        item.args,
      );
      let native = {
        status: 'unavailable',
        reason: preparationFailure?.code ?? 'Native execution unavailable.',
      };
      if (prepared) {
        const nativeStart = performance.now();
        try {
          native = { status: 'observed', ...prepared.execute(item.args, contract.limits) };
        } catch (error) {
          if (!String(error.code).startsWith('RUST_')) throw error;
          native = { status: 'unavailable', reason: error.code };
        }
        nativeMs += performance.now() - nativeStart;
      }
      const nativeCheck = evaluateSelection(before, native, item.args);
      const mismatch =
        native.status === 'observed' &&
        (!isDeepStrictEqual(native.completion, reference.completion) ||
          !isDeepStrictEqual(native.usage, reference.usage) ||
          !isDeepStrictEqual(native.limits, reference.limits));
      const verdict =
        mismatch || [referenceCheck.verdict, nativeCheck.verdict].includes('rejected')
          ? 'rejected'
          : [referenceCheck.verdict, nativeCheck.verdict].includes('inconclusive')
            ? 'inconclusive'
            : 'accepted';
      totals[verdict]++;
      for (const key of Object.keys(maxUsage))
        maxUsage[key] = Math.max(maxUsage[key], reference.usage[key]);
      executions.update(canonical({ id: item.id, reference, native, verdict }) + '\n');
      if (verdict !== 'accepted' && failures.length < 20)
        failures.push({ id: item.id, verdict, arguments: before, expected, reference, native });
    }
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total !== contract.domain.total) throw new Error('Frozen case count differs.');
    return {
      kind: 'context-selection-evaluation',
      schema_version: '0.1.0',
      program_id: program.artifact_id,
      evaluation_version: contract.version,
      evaluator_sha256: digest(readFileSync(fileURLToPath(import.meta.url))),
      packet_manifest_sha256: digest(readFileSync(new URL('manifest.json', packet))),
      cases_sha256: corpus.digest('hex'),
      executions_sha256: executions.digest('hex'),
      domain: contract.domain,
      limits: contract.limits,
      maximum_reference_usage: maxUsage,
      totals,
      verdict: totals.rejected ? 'rejected' : totals.inconclusive ? 'inconclusive' : 'accepted',
      native: prepared
        ? { status: 'observed', build: prepared.native, artifact: prepared.artifact }
        : { status: 'unavailable', ...preparationFailure },
      measurements: {
        cold_preparation_ms: prepareMs,
        reference_cases_ms: referenceMs,
        native_cases_ms: nativeMs,
      },
      failure_examples: failures,
      failure_examples_truncated: totals.rejected + totals.inconclusive > failures.length,
      limitations: [
        'Frozen bounded cases; no universal refinement claim.',
        'Continuing-session authoring; no independent coding-agent or efficiency comparison.',
        'Native timing includes one fresh process per case; preparation is measured separately. Build identity is observed, not authenticated.',
      ],
    };
  } finally {
    prepared?.dispose();
    rmSync(cache, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--candidate', '--out'].includes(args[i]) || !args[i + 1] || options[args[i]])
      throw new Error(
        'Usage: evaluate-context-selection.mjs --candidate program.json --out report.json',
      );
    options[args[i]] = args[i + 1];
  }
  if (!options['--candidate'] || !options['--out'])
    throw new Error('Candidate and output paths are required.');
  const output = resolve(options['--out']);
  if (output === resolve(options['--candidate']) || output.startsWith(fileURLToPath(packet)))
    throw new Error('Evaluation output must not replace the candidate or frozen packet.');
  const report = evaluateSelectionCandidate(
    JSON.parse(readFileSync(options['--candidate'], 'utf8')),
  );
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: report.verdict, totals: report.totals, output }));
  process.exitCode = report.verdict === 'accepted' ? 0 : report.verdict === 'inconclusive' ? 2 : 1;
}
