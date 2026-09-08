import { isNativeInterruption } from './native-interruption.js';
import { fileURLToPath } from 'node:url';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { checkOperation } from '../specification/check.js';
import { validateContextInvocation, getContextAssemblyContract } from './context-contract.js';
import { mapContextAssemblyObservation } from './context-adapter.js';
import { referenceContextAssembly } from './context-reference.js';
import { componentDigest } from './recording-identity.js';
import type { OperationCheck, JsonValue } from '../specification/model.js';
import type { ContentIdentity, ExecutionRecord, Measurement } from './model.js';

export type ConformanceCheckStatus = 'pass' | 'fail' | 'unknown' | 'not-applicable';
export interface ConformanceCheck {
  id: string;
  status: ConformanceCheckStatus;
  reason: string;
}
export interface ContextAssemblyEvaluation {
  schema_version: '0.1.0';
  kind: 'context-assembly-evaluation';
  artifact_id: string;
  record_id: string;
  profile_id: string;
  specification_id: string;
  case_id: string;
  evaluator: ContentIdentity;
  acceptance: 'accepted' | 'rejected' | 'inconclusive';
  contract: OperationCheck | null;
  checks: ConformanceCheck[];
  obligations: (ConformanceCheck & { mandatory: boolean })[];
  reference_measurements: Measurement[];
  limitations: string[];
}
const equal = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const object = (value: JsonValue): Record<string, JsonValue> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
const combine = (checks: ConformanceCheck[]): ConformanceCheckStatus =>
  checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'unknown')
      ? 'unknown'
      : 'pass';

/** Re-evaluate evidence without loading any implementation or locator in the record. */
export function evaluateContextAssembly(record: ExecutionRecord): ContextAssemblyEvaluation {
  return createContextAssemblyEvaluator()(record);
}

/** Bind evaluator files once for a run. Those files must remain unchanged during the run. */
export function createContextAssemblyEvaluator(): (
  record: ExecutionRecord,
) => ContextAssemblyEvaluation {
  const identity = {
    name: 'Clearings independent context evaluator; project file-set manifest',
    sha256: componentDigest(fileURLToPath(new URL('../../', import.meta.url))),
  };
  return (record) => evaluate(record, identity);
}

function evaluate(record: ExecutionRecord, identity: ContentIdentity): ContextAssemblyEvaluation {
  const { profile, specification } = getContextAssemblyContract();
  const mapping = mapContextAssemblyObservation(record); // Includes record/binding validation.
  validateContextInvocation(record.arguments_before);
  const reference = referenceContextAssembly(record.arguments_before);
  const expected = reference.context;
  const checks: ConformanceCheck[] = [];
  const add = (id: string, status: ConformanceCheckStatus, reason: string) => {
    const check = { id, status, reason };
    checks.push(check);
    return check;
  };
  add(
    'execution-origin',
    record.origin === 'recorded-execution' ? 'pass' : 'unknown',
    record.origin === 'recorded-execution'
      ? 'Record declares a captured execution; this is not independent authentication.'
      : 'Authored examples cannot establish execution acceptance.',
  );
  add(
    'observation-mapping',
    mapping.status === 'mapped'
      ? 'pass'
      : mapping.reason.startsWith('Measurement differs')
        ? 'fail'
        : 'unknown',
    mapping.status === 'mapped'
      ? 'Supported measurement projections agree with captured evidence.'
      : mapping.reason,
  );
  const interrupted = isNativeInterruption(record);
  const completed =
    !interrupted && (record.completion.kind === 'return' || record.completion.kind === 'throw');
  if (interrupted)
    add(
      'interrupted-input-preservation',
      record.arguments_after.status !== 'captured'
        ? 'unknown'
        : equal(record.arguments_before, record.arguments_after.value)
          ? 'pass'
          : 'fail',
      'An operational interruption does not excuse observed input mutation.',
    );
  const completionValue =
    record.completion.kind === 'return'
      ? record.completion.result
      : record.completion.kind === 'throw'
        ? record.completion.thrown
        : undefined;
  const actual = completionValue?.status === 'captured' ? object(completionValue.value) : undefined;
  add(
    'completion',
    !completed
      ? 'unknown'
      : record.completion.kind !== reference.completion
        ? 'fail'
        : record.completion.kind === 'throw' && completionValue?.status !== 'captured'
          ? 'unknown'
          : record.completion.kind === 'throw' && actual?.code !== reference.code
            ? 'fail'
            : 'pass',
    `Expected ${reference.completion}${reference.code ? ` ${reference.code}` : ''}; recorded ${record.completion.kind}${record.completion.kind === 'throw' && actual ? ` ${JSON.stringify(actual.code)}` : ''}.`,
  );
  let contract: OperationCheck | null = null;
  if (mapping.status === 'mapped')
    contract = checkOperation(specification, mapping.operation_id, mapping.observation);
  const predicate = new Map(contract?.checks.map((check) => [check.id, check]) ?? []);
  const opaqueRules = new Set(
    specification.operations
      .flatMap((operation) => [
        ...operation.guarantees,
        ...operation.outcomes.flatMap((outcome) => outcome.ensures),
      ])
      .filter((rule) => rule.predicate.kind === 'opaque')
      .map((rule) => rule.id),
  );
  for (const check of contract?.checks.filter(
    (check) => !profile.obligations.some((obligation) => obligation.rule_ids.includes(check.id)),
  ) ?? [])
    add(`contract:${check.id}`, check.verdict, check.reason ?? check.description);

  const reference_measurements: Measurement[] = [
    'reference-required-bytes',
    'expected-projection',
  ].map((id) =>
    expected
      ? {
          id,
          status: 'observed',
          value:
            id === 'reference-required-bytes'
              ? expected.budget.required_bytes
              : {
                  operation_ids: expected.operations.map((item) => item.id),
                  state_ids: expected.states.map((item) => item.id),
                  source_ids: expected.sources.map((item) => item.id),
                },
        }
      : {
          id,
          status: 'unobserved',
          reason:
            'Package construction is inapplicable because reference validation fails earlier.',
        },
  );
  for (const computed of reference_measurements) {
    const claim = record.measurements.find((item) => item.id === computed.id)!;
    if (claim.status === 'observed')
      add(
        `reference-claim:${claim.id}`,
        computed.status === 'observed' && equal(claim.value, computed.value) ? 'pass' : 'fail',
        'Recorded reference claims must agree with fresh independent computation.',
      );
  }
  const native = (id: string): ConformanceCheck => {
    if (id === 'check-budget-failure') {
      if (!expected || record.completion.kind !== 'throw')
        return {
          id,
          status: 'unknown',
          reason: 'No applicable reference package and exception pair.',
        };
      const details = actual?.details === undefined ? undefined : object(actual.details);
      return {
        id,
        status:
          completionValue?.status !== 'captured'
            ? 'unknown'
            : reference.code === 'CONTEXT_BUDGET' &&
                details?.required_bytes === expected.budget.required_bytes
              ? 'pass'
              : 'fail',
        reason: 'Capacity failure must report the exact independently computed required bytes.',
      };
    }
    if (record.completion.kind !== 'return' || !expected)
      return { id, status: 'unknown', reason: 'No return/reference package pair is available.' };
    if (completionValue?.status !== 'captured')
      return { id, status: 'unknown', reason: 'Returned value is unavailable.' };
    let matches = false;
    if (id === 'check-ordering')
      matches =
        Array.isArray(actual?.operations) &&
        equal(
          actual.operations.map((item) => object(item)?.id ?? null),
          expected.operations.map((item) => item.id),
        );
    else if (id === 'check-record-preservation')
      matches = actual?.operations !== undefined && equal(actual.operations, expected.operations);
    else if (id === 'check-state-selection')
      matches = actual?.states !== undefined && equal(actual.states, expected.states);
    else if (id === 'check-evidence-selection')
      matches = actual?.sources !== undefined && equal(actual.sources, expected.sources);
    else
      return {
        id,
        status: 'unknown',
        reason: 'No independent procedure is implemented for this check.',
      };
    return {
      id,
      status: matches ? 'pass' : 'fail',
      reason: 'Compare complete captured records and order against the independent reference.',
    };
  };
  // Exact projection also covers links, omissions metadata, selection, provenance,
  // retrieval text, and budget metadata that are stronger than ID predicates alone.
  if (record.completion.kind === 'return' && expected)
    add(
      'complete-projection',
      completionValue?.status !== 'captured'
        ? 'unknown'
        : equal(completionValue.value, expected)
          ? 'pass'
          : 'fail',
      'The entire returned package must match the independent projection.',
    );
  const obligations = profile.obligations.map((obligation) => {
    if (obligation.verification.kind === 'unresolved')
      return {
        id: obligation.id,
        mandatory: obligation.mandatory,
        status: 'unknown' as const,
        reason: obligation.verification.reason,
      };
    const applies =
      mapping.status === 'mapped' && obligation.operation_ids.includes(mapping.operation_id);
    const rules = obligation.rule_ids.flatMap((id) =>
      predicate.has(id) ? [predicate.get(id)!] : [],
    );
    if (mapping.status === 'mapped' && (!applies || !rules.length))
      return {
        id: obligation.id,
        mandatory: obligation.mandatory,
        status: 'not-applicable' as const,
        reason: 'No rule of this obligation applies to the observed completion.',
      };
    if (!applies)
      return {
        id: obligation.id,
        mandatory: obligation.mandatory,
        status: 'unknown' as const,
        reason: 'Application observation is unavailable.',
      };
    const ruleChecks: ConformanceCheck[] = rules.map((rule) => ({
      id: rule.id,
      status: rule.verdict,
      reason: rule.reason ?? rule.description,
    }));
    if (obligation.verification.kind === 'independent-check') {
      const result = native(obligation.verification.check_id);
      // The ledger assigns these opaque rules to the independent procedure. Keep
      // the original contract verdict unchanged, including all residual unknowns.
      const concrete = ruleChecks.filter((rule) => !opaqueRules.has(rule.id));
      return {
        id: obligation.id,
        mandatory: obligation.mandatory,
        status: combine([...concrete, result]),
        reason: result.reason,
      };
    }
    return {
      id: obligation.id,
      mandatory: obligation.mandatory,
      status: combine(ruleChecks),
      reason:
        ruleChecks
          .filter((rule) => rule.status !== 'pass')
          .map((rule) => `${rule.id}: ${rule.reason}`)
          .join('; ') || 'All applicable declared predicates pass.',
    };
  });
  const status = combine([...checks, ...obligations.filter((obligation) => obligation.mandatory)]);
  const body = {
    schema_version: '0.1.0' as const,
    kind: 'context-assembly-evaluation' as const,
    record_id: record.artifact_id,
    profile_id: record.profile_id,
    specification_id: record.specification_id,
    case_id: record.case_id,
    evaluator: { ...identity },
    acceptance:
      status === 'pass'
        ? ('accepted' as const)
        : status === 'fail'
          ? ('rejected' as const)
          : ('inconclusive' as const),
    contract,
    checks,
    obligations,
    reference_measurements,
    limitations: [
      ...record.limitations,
      'Scoped acceptance concerns this captured invocation and the current profile. It is not universal refinement or execution authentication.',
      'External effects remain unobserved. Independent checks do not rewrite the broader contract verdict or the original execution record.',
    ],
  };
  return { ...body, artifact_id: `context-assembly-evaluation:${sha256(canonical(body))}` };
}
