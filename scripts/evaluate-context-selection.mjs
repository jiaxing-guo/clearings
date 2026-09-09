import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { executeProgram, validateProgram } from 'clearings/program';
import { prepareRustProgram } from 'clearings/compiler';
const packet = new URL('../benchmarks/evaluation/context-selection-v1/', import.meta.url);
const reviewPacket = new URL(
  '../benchmarks/evaluation/context-selection-review-v1/',
  import.meta.url,
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const read = (name, root = packet) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const packetIdentities = [
  [packet, '622bb61020189d6e5514e3bf5481f96010547be1b7535d6e1c060c131b1e6a05'],
  [reviewPacket, 'b85c0f05034942e48a41ba028ed03cc8d55882c67e65622641d2c3a05f4f669b'],
];
function verifyPackets() {
  for (const [root, identity] of packetIdentities) {
    const bytes = readFileSync(new URL('manifest.json', root));
    if (digest(bytes) !== identity) throw new Error('Frozen selection manifest identity differs.');
    for (const file of JSON.parse(bytes).files)
      if (digest(readFileSync(new URL(file.path, root))) !== file.sha256)
        throw new Error(`Frozen selection evaluation changed: ${file.path}`);
  }
}
// Verify fixed identities before executing any packet module, and again for each evaluation.
verifyPackets();
const { selectionCases } = await import(new URL('cases.mjs', packet));
const { expectedSelection, evaluateSelection } = await import(new URL('oracle.mjs', packet));
const nativeFailure = (error) => ({
  code: typeof error?.code === 'string' ? error.code : 'NATIVE_ADAPTER_ERROR',
  message: typeof error?.message === 'string' ? error.message : String(error),
});
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
  verifyPackets();
  const contract = read('contract.json');
  const reviewCases = read('cases.json', reviewPacket);
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
      preparationFailure = nativeFailure(error);
    }
    const prepareMs = performance.now() - started;
    const totals = { accepted: 0, rejected: 0, inconclusive: 0 };
    const packetTotals = Object.fromEntries(
      ['context-selection-v1', 'context-selection-review-v1'].map((version) => [
        version,
        { accepted: 0, rejected: 0, inconclusive: 0 },
      ]),
    );
    const nativeCounts = { observed: 0, unavailable: 0 };
    const nativeFailures = new Map();
    const corpus = createHash('sha256'),
      executions = createHash('sha256');
    const failures = [],
      maxUsage = Object.fromEntries(Object.keys(contract.limits).map((key) => [key, 0]));
    let referenceMs = 0,
      nativeMs = 0;
    for (const [version, cases] of [
      ['context-selection-v1', selectionCases()],
      ['context-selection-review-v1', reviewCases],
    ]) {
      for (const item of cases) {
        const before = structuredClone(item.args),
          expected = item.expected ?? expectedSelection(before);
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
          reason: preparationFailure?.message ?? 'Native execution unavailable.',
          ...preparationFailure,
        };
        if (prepared) {
          const nativeStart = performance.now();
          try {
            native = { status: 'observed', ...prepared.execute(item.args, contract.limits) };
          } catch (error) {
            const failure = nativeFailure(error);
            native = { status: 'unavailable', reason: failure.message, ...failure };
          }
          nativeMs += performance.now() - nativeStart;
        }
        nativeCounts[native.status]++;
        if (native.status === 'unavailable') {
          const failure = {
            phase: prepared ? 'execution' : 'preparation',
            code: native.code,
            message: native.message,
          };
          const key = canonical(failure);
          const summary = nativeFailures.get(key) ?? { ...failure, cases: 0, first_case: item.id };
          summary.cases++;
          nativeFailures.set(key, summary);
        }
        const nativeCheck = evaluateSelection(before, native, item.args);
        const mismatch =
          native.status === 'observed' &&
          (!isDeepStrictEqual(native.completion, { kind: 'return', value: expected }) ||
            !isDeepStrictEqual(native.completion, reference.completion) ||
            !isDeepStrictEqual(native.usage, reference.usage) ||
            !isDeepStrictEqual(native.limits, reference.limits));
        const verdict =
          mismatch ||
          !isDeepStrictEqual(reference.completion, { kind: 'return', value: expected }) ||
          [referenceCheck.verdict, nativeCheck.verdict].includes('rejected')
            ? 'rejected'
            : [referenceCheck.verdict, nativeCheck.verdict].includes('inconclusive')
              ? 'inconclusive'
              : 'accepted';
        totals[verdict]++;
        packetTotals[version][verdict]++;
        for (const key of Object.keys(maxUsage))
          maxUsage[key] = Math.max(maxUsage[key], reference.usage[key]);
        executions.update(canonical({ id: item.id, reference, native, verdict }) + '\n');
        if (verdict !== 'accepted' && failures.length < 20)
          failures.push({ id: item.id, verdict, arguments: before, expected, reference, native });
      }
    }
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (
      Object.values(packetTotals['context-selection-v1']).reduce((a, b) => a + b, 0) !==
        contract.domain.total ||
      reviewCases.length !== 10 ||
      total !== contract.domain.total + 10
    )
      throw new Error('Frozen case count differs.');
    return {
      kind: 'context-selection-evaluation',
      schema_version: '0.2.0',
      program_id: program.artifact_id,
      evaluation_version: 'context-selection-v2',
      evaluator_sha256: digest(readFileSync(fileURLToPath(import.meta.url))),
      packet_manifest_sha256: digest(readFileSync(new URL('manifest.json', packet))),
      cases_sha256: corpus.digest('hex'),
      executions_sha256: executions.digest('hex'),
      review_packet_manifest_sha256: packetIdentities[1][1],
      domain: {
        original: contract.domain,
        review: { total: reviewCases.length, provenance: 'post-authoring regression' },
        total,
      },
      packet_totals: packetTotals,
      limits: contract.limits,
      maximum_reference_usage: maxUsage,
      totals,
      verdict: totals.rejected ? 'rejected' : totals.inconclusive ? 'inconclusive' : 'accepted',
      native: {
        status:
          nativeCounts.unavailable === 0
            ? 'observed'
            : nativeCounts.observed
              ? 'partial'
              : 'unavailable',
        observed_cases: nativeCounts.observed,
        unavailable_cases: nativeCounts.unavailable,
        ...(prepared
          ? { build: prepared.native, artifact: prepared.artifact }
          : preparationFailure),
        failures: [...nativeFailures.values()],
      },
      measurements: {
        cold_preparation_ms: prepareMs,
        reference_cases_ms: referenceMs,
        native_cases_ms: nativeMs,
      },
      failure_examples: failures,
      failure_examples_truncated: totals.rejected + totals.inconclusive > failures.length,
      limitations: [
        'Original pre-authoring packet plus separately identified post-authoring regressions; no universal refinement claim.',
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
  if (
    output === resolve(options['--candidate']) ||
    [packet, reviewPacket].some((root) => output.startsWith(fileURLToPath(root)))
  )
    throw new Error('Evaluation output must not replace the candidate or frozen packet.');
  if (lstatSync(output, { throwIfNoEntry: false }))
    throw new Error('Evaluation output already exists.');
  const report = evaluateSelectionCandidate(
    JSON.parse(readFileSync(options['--candidate'], 'utf8')),
  );
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ verdict: report.verdict, totals: report.totals, output }));
  process.exitCode = report.verdict === 'accepted' ? 0 : report.verdict === 'inconclusive' ? 2 : 1;
}
