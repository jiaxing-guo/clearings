import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from '../model/types.js';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { digest, normalized } from '../semantics/identity.js';
import { assertPortable, validateSpecification } from '../specification/validate.js';
import { matchesType } from '../specification/expressions.js';
import type { SemanticSpecification } from '../specification/model.js';
import type { ConformanceProfile, ExecutionRecord } from './model.js';

const ajv = new Ajv({ strict: true, allErrors: false, allowUnionTypes: true });
const compile = (name: string, version = '0.1') =>
  ajv.compile(
    JSON.parse(
      readFileSync(new URL(`../../schemas/${name}.v${version}.json`, import.meta.url), 'utf8'),
    ),
  );
const profileSchema = compile('conformance-profile'),
  recordSchema = compile('execution-record'),
  nativeRecordSchema = compile('execution-record', '0.2'),
  stageRecordSchema = compile('execution-record', '0.3');
const invalid = (message: string): never => {
  throw new ClearingsError('INVALID_CONFORMANCE', message);
};
function identity(kind: string, value: object): string {
  const { artifact_id: _, ...body } = value as { artifact_id?: string };
  return digest(kind, body);
}
export const conformanceProfileIdentity = (
  value: ConformanceProfile | Omit<ConformanceProfile, 'artifact_id'>,
): string => identity('conformance-profile', value);
export const executionRecordIdentity = (
  value: ExecutionRecord | Omit<ExecutionRecord, 'artifact_id'>,
): string => identity('execution-record', value);
function unique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) invalid(`Duplicate ${label}.`);
}

/** Check structure, identities, references, and coverage declarations; never execute code. */
export function validateConformanceProfile(
  value: unknown,
  spec: SemanticSpecification,
): asserts value is ConformanceProfile {
  validateSpecification(spec);
  assertPortable(value);
  if (!profileSchema(value))
    invalid(
      `Profile schema mismatch: ${profileSchema.errors?.[0]?.instancePath} ${profileSchema.errors?.[0]?.message}`,
    );
  const profile = value as ConformanceProfile;
  if (profile.artifact_id !== conformanceProfileIdentity(profile))
    invalid('Profile digest does not match its content.');
  if (profile.specification_id !== spec.artifact_id || spec.perspective !== 'intended')
    invalid('A profile must bind the exact intended specification.');
  const operations = new Map(spec.operations.map((operation) => [operation.id, operation]));
  const selected = Object.values(profile.completion_operations);
  unique(selected, 'completion operation');
  for (const id of selected)
    if (!operations.has(id)) invalid(`Unknown completion operation: ${id}`);
  unique(
    profile.measurements.map((item) => item.id),
    'measurement definition',
  );
  for (const measurement of profile.measurements) {
    if (
      measurement.source !== 'independent' &&
      measurement.source !== 'instrumentation' &&
      !measurement.capture_requirements.includes(measurement.source)
    )
      invalid(`Measurement must require its source capture: ${measurement.id}`);
  }
  unique(
    profile.obligations.map((item) => item.id),
    'obligation',
  );
  const measurements = new Set(profile.measurements.map((item) => item.id));
  const requirements = new Set(profile.scope.requirements);
  if (
    requirements.size !== profile.obligations.length ||
    profile.obligations.some((item) => !requirements.has(item.id))
  )
    invalid('The obligation ledger must cover exactly the declared requirements.');
  const coveredRules = new Set<string>();
  for (const obligation of profile.obligations) {
    const rules = new Map<
      string,
      SemanticSpecification['operations'][number]['guarantees'][number]
    >();
    for (const id of obligation.operation_ids) {
      if (!selected.includes(id))
        invalid(`Obligation references an operation outside the completion mapping: ${id}`);
      const operation = operations.get(id)!;
      for (const rule of [
        ...operation.guarantees,
        ...operation.outcomes.flatMap((outcome) => outcome.ensures),
      ])
        rules.set(rule.id, rule);
    }
    for (const id of obligation.rule_ids) {
      if (!rules.has(id)) invalid(`Unknown obligation rule: ${id}`);
      coveredRules.add(id);
    }
    for (const id of obligation.measurement_ids)
      if (!measurements.has(id)) invalid(`Unknown obligation measurement: ${id}`);
    if (obligation.verification.kind === 'unresolved' && obligation.mandatory)
      invalid('An unresolved obligation cannot be mandatory for scoped acceptance.');
    if (obligation.verification.kind === 'predicate') {
      if (obligation.verification.rule_ids.length !== obligation.rule_ids.length)
        invalid('Predicate verification must cover every rule of its obligation.');
      for (const id of obligation.verification.rule_ids) {
        if (!obligation.rule_ids.includes(id))
          invalid(`Predicate check is outside its obligation: ${id}`);
        const rule = rules.get(id)!;
        const hasOpaque = (node: unknown): boolean =>
          !!node &&
          typeof node === 'object' &&
          (('kind' in node && node.kind === 'opaque') ||
            (!('kind' in node && node.kind === 'literal') && Object.values(node).some(hasOpaque)));
        if (hasOpaque(rule.predicate))
          invalid(`Opaque rule cannot be declared predicate-verifiable: ${id}`);
      }
    }
  }
  for (const id of selected) {
    const operation = operations.get(id)!;
    for (const rule of [
      ...operation.guarantees,
      ...operation.outcomes.flatMap((outcome) => outcome.ensures),
    ])
      if (!coveredRules.has(rule.id)) invalid(`Rule has no obligation accounting: ${rule.id}`);
  }
}

/** A valid record is not evidence that its claimed execution or measurements occurred. */
export function validateExecutionRecord(
  value: unknown,
  profile: ConformanceProfile,
  spec: SemanticSpecification,
): asserts value is ExecutionRecord {
  validateConformanceProfile(profile, spec);
  assertPortable(value);
  const schema =
    value &&
    typeof value === 'object' &&
    'schema_version' in value &&
    value.schema_version === '0.3.0'
      ? stageRecordSchema
      : value &&
          typeof value === 'object' &&
          'schema_version' in value &&
          value.schema_version === '0.2.0'
        ? nativeRecordSchema
        : recordSchema;
  if (!schema(value))
    invalid(
      `Execution record schema mismatch: ${schema.errors?.[0]?.instancePath} ${schema.errors?.[0]?.message}`,
    );
  const record = value as ExecutionRecord;
  if (record.schema_version === '0.3.0') {
    for (const [index, stage] of (['closure', 'selection'] as const).entries()) {
      const capture = record.native_stages![index]!,
        binding = record.native_programs![index]!;
      if (capture.stage !== stage || binding.stage !== stage)
        invalid('Native stages must occur once each in closure/selection order.');
      if (
        binding.status === 'bound' &&
        binding.path !==
          `programs/clearings/${stage === 'closure' ? 'required-dependency-closure' : 'context-selection'}.json`
      )
        invalid('Native program path differs from its stage.');
      if (
        binding.status === 'bound' &&
        !record.identities.implementation.files.some(
          (file) => file.path === binding.path && file.sha256 === binding.sha256,
        )
      )
        invalid('Native program binding is absent from the implementation manifest.');
      if (capture.status !== 'observed') continue;
      if (capture.result_sha256 !== sha256(canonical(capture.result)))
        invalid('Native stage result digest differs.');
      if (
        !capture.result ||
        typeof capture.result !== 'object' ||
        Array.isArray(capture.result) ||
        capture.result.kind !== capture.completion
      )
        invalid('Native stage completion differs from its result.');
      for (const resource of [
        'work',
        'allocation_units',
        'value_units',
        'evaluation_depth',
      ] as const)
        if (capture.usage[resource] > capture.limits[resource])
          invalid('Native admitted usage exceeds its limit.');
    }
  }
  if (record.native_execution?.status === 'observed') {
    const native = record.native_execution;
    for (const resource of ['work', 'allocation_units', 'value_units', 'evaluation_depth'] as const)
      if (native.usage[resource] > native.limits[resource])
        invalid('Native admitted usage exceeds its limit.');
    if (record.completion.kind === 'return' && native.completion !== 'return')
      invalid('Returned context contradicts native completion.');
  }
  if (record.artifact_id !== executionRecordIdentity(record))
    invalid('Execution record digest does not match its content.');
  if (record.profile_id !== profile.artifact_id || record.specification_id !== spec.artifact_id)
    invalid('Execution record has stale profile or specification bindings.');
  if (
    record.origin === 'recorded-execution' &&
    [record.identities.adapter, record.identities.runtime].some((item) => item.status !== 'bound')
  )
    invalid('A recorded execution requires adapter and runtime identities.');
  if (
    record.identities.implementation.module !== profile.target.module ||
    record.identities.implementation.export !== profile.target.export
  )
    invalid('Implementation entrypoint differs from the profile target.');
  unique(
    record.identities.implementation.files.map((file) => file.path),
    'implementation file',
  );
  if (!record.identities.implementation.files.some((file) => file.path === profile.target.module))
    invalid('Implementation identity must include the entrypoint file.');
  if (record.identities.fixture.sha256 !== sha256(canonical(record.arguments_before)))
    invalid('Fixture digest must bind the canonical invocation arguments.');
  unique(
    record.measurements.map((item) => item.id),
    'recorded measurement',
  );
  const definitions = new Map(profile.measurements.map((item) => [item.id, item]));
  if (record.measurements.length !== definitions.size)
    invalid('Every measurement must be recorded as observed or unobserved.');
  for (const measurement of record.measurements) {
    const definition = definitions.get(measurement.id);
    if (!definition) invalid(`Unknown recorded measurement: ${measurement.id}`);
    if (measurement.status === 'unobserved') continue;
    if (!matchesType(measurement.value, definition!.type))
      invalid(`Measurement has an invalid value type: ${measurement.id}`);
    for (const capture of definition!.capture_requirements) {
      // Original arguments are always present as a portable value in a valid record.
      const available =
        capture === 'arguments-before' ||
        (capture === 'arguments-after' && record.arguments_after.status === 'captured') ||
        (capture === 'return' &&
          record.completion.kind === 'return' &&
          record.completion.result.status === 'captured') ||
        (capture === 'exception' &&
          record.completion.kind === 'throw' &&
          record.completion.thrown.status === 'captured');
      if (!available)
        invalid(`Observed measurement requires a captured ${capture}: ${measurement.id}`);
    }
  }
}

export function sealConformanceProfile(
  value: ConformanceProfile | Omit<ConformanceProfile, 'artifact_id'>,
  spec: SemanticSpecification,
): ConformanceProfile {
  assertPortable(value);
  const profile = normalized({ ...value, artifact_id: conformanceProfileIdentity(value) });
  validateConformanceProfile(profile, spec);
  return profile;
}
export function sealExecutionRecord(
  value: ExecutionRecord | Omit<ExecutionRecord, 'artifact_id'>,
  profile: ConformanceProfile,
  spec: SemanticSpecification,
): ExecutionRecord {
  assertPortable(value);
  const record = normalized({ ...value, artifact_id: executionRecordIdentity(value) });
  validateExecutionRecord(record, profile, spec);
  return record;
}
