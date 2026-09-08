import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { matchesType } from '../specification/expressions.js';
import { getContextAssemblyContract, validateContextInvocation } from './context-contract.js';
import { validateExecutionRecord } from './validate.js';
import type { JsonValue, OperationObservation } from '../specification/model.js';
import type { ConformanceProfile, ExecutionRecord, Measurement } from './model.js';

const object = (value: JsonValue | undefined): Record<string, JsonValue> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a record.');
  return value;
};
const array = (value: JsonValue | undefined): JsonValue[] => {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  return value;
};
const digest = (value: unknown) => sha256(canonical(value));
const records = (value: JsonValue | undefined): JsonValue =>
  array(value).map((item) => ({ id: object(item).id!, sha256: digest(item) }));
const ids = (value: JsonValue | undefined): JsonValue =>
  array(value).map((item) => object(item).id!);

/** Derive measurements from captures without calling candidate selection/accounting helpers. */
export function measureContextCaptures(
  record: Pick<ExecutionRecord, 'arguments_before' | 'arguments_after' | 'completion'>,
  profile: ConformanceProfile,
): Measurement[] {
  const invocation = record.arguments_before;
  validateContextInvocation(invocation);
  const input = invocation.specification;
  const returned = () => {
    if (record.completion.kind !== 'return' || record.completion.result.status !== 'captured')
      throw new Error('Return unavailable.');
    return record.completion.result.value;
  };
  const compute: Record<string, () => unknown> = {
    invocation: () => ({
      root_id:
        input.operations.find(
          (operation) =>
            operation.id === invocation.selection || operation.alias === invocation.selection,
        )?.id ?? invocation.selection,
      available_ids: input.operations.map((operation) => operation.id),
      required_edges: input.operations.flatMap((operation) =>
        operation.dependencies
          .filter((dependency) => dependency.requirement === 'required')
          .map((dependency) => ({ from: operation.id, to: dependency.operation_id })),
      ),
      max_bytes: invocation.options.maxBytes,
      artifact_id: input.artifact_id,
      applicable_decisions: input.operations.flatMap((operation) =>
        operation.decisions.map((decision) => ({
          operation_id: operation.id,
          decision_id: decision.id,
        })),
      ),
    }),
    'input-records': () =>
      input.operations.map((operation) => ({ id: operation.id, sha256: digest(operation) })),
    'returned-records': () => records(object(returned()).operations),
    'returned-context': () => {
      const result = object(returned()),
        budget = object(result.budget);
      return {
        operation_ids: ids(result.operations),
        omitted_ids: object(result.omissions).operation_ids,
        records: records(result.operations),
        decision_ids: array(result.operations).flatMap((operation) =>
          array(object(operation).decisions).map((decision) => object(decision).id),
        ),
        state_ids: ids(result.states),
        source_ids: ids(result.sources),
        artifact_id: result.artifact_id,
        reported_bytes: budget.used_bytes,
        reported_required_bytes: budget.required_bytes,
      };
    },
    // Measure the captured candidate package, including its unchanged counters and newline.
    'serialized-bytes': () => Buffer.byteLength(JSON.stringify(returned()) + '\n', 'utf8'),
    'arguments-before-digest': () => digest(record.arguments_before),
    'arguments-after-digest': () => {
      if (record.arguments_after.status !== 'captured')
        throw new Error('Resulting arguments unavailable.');
      return digest(record.arguments_after.value);
    },
    exception: () => {
      if (record.completion.kind !== 'throw' || record.completion.thrown.status !== 'captured')
        throw new Error('Exception unavailable.');
      const thrown = object(record.completion.thrown.value);
      const details = Object.hasOwn(thrown, 'details') ? object(thrown.details) : undefined;
      return {
        code: thrown.code,
        required_bytes:
          details && Object.hasOwn(details, 'required_bytes') ? [details.required_bytes] : [],
      };
    },
  };
  return profile.measurements.map((definition) => {
    const procedure = compute[definition.id];
    if (!procedure)
      return {
        id: definition.id,
        status: 'unobserved',
        reason:
          definition.id === 'effects'
            ? 'No effect instrumentation is installed.'
            : 'Independent reference evaluation has not been performed.',
      };
    try {
      const value = procedure();
      if (!matchesType(value, definition.type)) throw new Error('Measurement type mismatch.');
      return { id: definition.id, status: 'observed', value: value as JsonValue };
    } catch {
      return {
        id: definition.id,
        status: 'unobserved',
        reason: 'Required capture or typed projection is unavailable; no value was substituted.',
      };
    }
  });
}

interface MappingIdentity {
  record_id: string;
  profile_id: string;
  specification_id: string;
  limitations: string[];
}
export type ContextAssemblyMapping = MappingIdentity &
  (
    | { status: 'mapped'; operation_id: string; observation: OperationObservation }
    | { status: 'unmapped'; reason: string; missing_measurement_ids: string[] }
  );

/** Recheck measured projections against captures, then map the observed completion. */
export function mapContextAssemblyObservation(record: ExecutionRecord): ContextAssemblyMapping {
  const { profile, specification } = getContextAssemblyContract();
  validateExecutionRecord(record, profile, specification);
  const identity: MappingIdentity = {
    record_id: record.artifact_id,
    profile_id: profile.artifact_id,
    specification_id: specification.artifact_id,
    limitations: [
      'Mapping does not authenticate execution or establish acceptance.',
      'Independent reference checks and external effects remain unresolved.',
    ],
  };
  const unmapped = (
    reason: string,
    missing_measurement_ids: string[] = [],
  ): ContextAssemblyMapping => ({
    ...identity,
    status: 'unmapped',
    reason,
    missing_measurement_ids,
  });
  if (record.completion.kind === 'timeout' || record.completion.kind === 'harness-failure')
    return unmapped(`No application observation for ${record.completion.kind}.`);
  let recomputed: Measurement[];
  try {
    recomputed = measureContextCaptures(record, profile);
  } catch {
    return unmapped('Invocation is outside the supported context-assembly domain.');
  }
  const measured = new Map(record.measurements.map((measurement) => [measurement.id, measurement]));
  for (const actual of recomputed) {
    const claimed = measured.get(actual.id)!;
    // Unobserved evidence remains missing. Observed supported measurements must match raw captures.
    if (
      claimed.status === 'observed' &&
      ['reference-required-bytes', 'expected-projection', 'effects'].includes(actual.id)
    )
      continue;
    if (
      claimed.status === 'observed' &&
      (actual.status !== 'observed' || canonical(claimed.value) !== canonical(actual.value))
    )
      return unmapped(`Measurement differs from its captured evidence: ${actual.id}`);
  }
  const isReturn = record.completion.kind === 'return';
  const required = [
    'invocation',
    'arguments-before-digest',
    'arguments-after-digest',
    ...(isReturn
      ? ['input-records', 'returned-records', 'returned-context', 'serialized-bytes']
      : ['exception']),
  ];
  const missing = required.filter((id) => measured.get(id)?.status !== 'observed');
  if (missing.length)
    return unmapped('Required observation measurements are unavailable.', missing);
  const value = (id: string): JsonValue =>
    (measured.get(id) as Extract<Measurement, { status: 'observed' }>).value;
  const invocation = object(value('invocation'));
  const input = {
    root_id: invocation.root_id!,
    available_ids: invocation.available_ids!,
    required_edges: invocation.required_edges!,
    max_bytes: invocation.max_bytes!,
  };
  const before = { 'arguments-digest': value('arguments-before-digest') },
    after = { 'arguments-digest': value('arguments-after-digest') };
  let observation: OperationObservation;
  if (isReturn)
    observation = {
      input: {
        ...input,
        artifact_id: invocation.artifact_id!,
        applicable_decisions: invocation.applicable_decisions!,
        records: value('input-records'),
      },
      before,
      after,
      outcome: 'returned',
      output: { ...object(value('returned-context')), measured_bytes: value('serialized-bytes') },
    };
  else {
    const output = object(value('exception'));
    const outcomes: Record<string, string> = {
      MISSING_REQUIRED_DEPENDENCY: 'thrown-dependency',
      INVALID_BUDGET: 'thrown-budget-invalid',
      INVALID_SELECTION: 'thrown-selection',
      CONTEXT_BUDGET: 'thrown-budget-exceeded',
    };
    const outcome =
      typeof output.code === 'string' && Object.hasOwn(outcomes, output.code)
        ? outcomes[output.code]
        : undefined;
    if (!outcome)
      return unmapped(`Unsupported observed exception code: ${JSON.stringify(output.code)}`);
    observation = { input, before, after, outcome, output };
  }
  return {
    ...identity,
    status: 'mapped',
    operation_id: isReturn
      ? profile.completion_operations.return
      : profile.completion_operations.throw,
    observation,
  };
}
