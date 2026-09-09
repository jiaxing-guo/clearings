import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import type { ContextAssemblyInvocation } from './context-contract.js';
import type { ContextReference } from './context-reference.js';
import type { ExecutionRecord } from './model.js';
import type { ConformanceCheck } from './context-evaluator.js';

export interface NativeEvidenceEvaluation {
  verdict: 'accepted' | 'rejected' | 'inconclusive';
  checks: ConformanceCheck[];
}

/** Check saved stage evidence against original inputs and independent context expectations. */
export function evaluateNativeStages(
  record: ExecutionRecord,
  reference: ContextReference,
): NativeEvidenceEvaluation {
  const checks: ConformanceCheck[] = [];
  const add = (id: string, status: ConformanceCheck['status'], reason: string) =>
    checks.push({ id: `native-${id}`, status, reason });
  if (record.schema_version !== '0.3.0') {
    add('stages', 'unknown', 'Historical record does not declare the two-stage evidence contract.');
    return { verdict: 'inconclusive', checks };
  }
  add(
    'protocol',
    record.native_stage_errors!.length ? 'fail' : 'pass',
    record.native_stage_errors!.join('; ') ||
      'Ordered stage lifecycle was captured without protocol errors.',
  );
  const invocation = record.arguments_before as unknown as ContextAssemblyInvocation;
  const spec = invocation.specification,
    context = reference.context;
  const selected = context?.operations.map((operation) => operation.id);
  // Enumerate the frozen schema positions independently of the production adapter.
  const selectionArgs = selected
    ? [
        selected,
        spec.operations.map((operation) => ({
          id: operation.id,
          complete_frame: operation.frame === 'complete',
          reads: operation.reads,
          writes: operation.writes,
          evidence_groups: [
            operation.evidence_ids,
            ...[operation.guarantees, operation.implementations, operation.decisions].flatMap(
              (records) => records.map((item) => item.evidence_ids),
            ),
            ...operation.outcomes.flatMap((outcome) => [
              outcome.evidence_ids,
              ...outcome.ensures.map((item) => item.evidence_ids),
            ]),
          ],
        })),
        spec.states.map((state) => ({ id: state.id, evidence_ids: state.evidence_ids })),
        spec.sources.map((source) => source.id),
      ]
    : undefined;
  const root = context?.selection.operation_id;
  const closureArgs = root
    ? [
        [root],
        spec.operations.map((operation) => ({
          id: operation.id,
          dependencies: operation.dependencies.map((edge) => ({
            target: edge.operation_id,
            required: edge.requirement === 'required',
          })),
        })),
      ]
    : undefined;
  const expected = [
    selected,
    context
      ? {
          state_ids: context.states.map((state) => state.id),
          source_ids: context.sources.map((source) => source.id),
        }
      : undefined,
  ];
  const limits = {
    work: 10_000_000,
    allocation_units: 10_000_000,
    value_units: 1_000_000,
    evaluation_depth: 256,
  };
  for (const [index, capture] of record.native_stages!.entries()) {
    const binding = record.native_programs![index]!;
    if (capture.status === 'not-run') {
      add(
        `${capture.stage}-execution`,
        context ? (record.completion.kind === 'return' ? 'fail' : 'unknown') : 'not-applicable',
        context
          ? 'Required native stage did not execute.'
          : 'Validation or selection stopped before native execution was applicable.',
      );
      continue;
    }
    if (capture.status === 'unavailable') {
      add(`${capture.stage}-execution`, 'unknown', capture.reason);
      continue;
    }
    add(
      `${capture.stage}-program`,
      binding.status !== 'bound'
        ? 'unknown'
        : binding.program_id === capture.program_id
          ? 'pass'
          : 'fail',
      'Observed program identity must match the validated program bytes bound before invocation.',
    );
    add(
      `${capture.stage}-policy`,
      canonical(capture.limits) === canonical(limits) ? 'pass' : 'fail',
      'Each context-native-v2 stage has its own frozen logical limits.',
    );
    const args = index === 0 ? closureArgs : selectionArgs;
    add(
      `${capture.stage}-arguments`,
      args === undefined
        ? 'fail'
        : sha256(canonical(args)) === capture.arguments_sha256
          ? 'pass'
          : 'fail',
      args === undefined
        ? 'Native execution preceded a required validation failure.'
        : 'Argument digest must match the independent projection of the original invocation.',
    );
    add(
      `${capture.stage}-result`,
      capture.completion === 'resource-exhaustion'
        ? 'unknown'
        : expected[index] !== undefined &&
            canonical(capture.result) === canonical({ kind: 'return', value: expected[index] })
          ? 'pass'
          : 'fail',
      capture.completion === 'resource-exhaustion'
        ? 'Finite execution limits prevented a result; other observed violations still reject.'
        : 'The complete stage result must match independent closure or selection expectations.',
    );
  }
  return {
    verdict: checks.some((check) => check.status === 'fail')
      ? 'rejected'
      : checks.some((check) => check.status === 'unknown')
        ? 'inconclusive'
        : 'accepted',
    checks,
  };
}
