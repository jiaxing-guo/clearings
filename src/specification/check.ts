import { canonical } from '../repository/inventory.js';
import { ClearingsError } from '../model/types.js';
import { assertPortable, validateSpecification } from './validate.js';
import { evaluateExpression, matchesType } from './expressions.js';
import type { JsonValue, OperationCheck, OperationObservation, RuleCheck, SemanticOperation, SemanticSpecification, Verdict } from './model.js';

export function resolveOperation(spec: SemanticSpecification, selection: string): SemanticOperation {
  const operation = spec.operations.find(item => item.id === selection || item.alias === selection);
  if (!operation) throw new ClearingsError('INVALID_SELECTION', `Unknown operation: ${selection}`);
  return operation;
}
const combine = (checks: RuleCheck[]): Verdict => checks.some(item => item.verdict === 'fail') ? 'fail' : checks.some(item => item.verdict === 'unknown') ? 'unknown' : 'pass';
const observedState = (values: Record<string, JsonValue> | undefined, id: string): JsonValue | undefined =>
  values && Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined;

/** Check supplied observations against a model. Does not execute or verify source. */
export function checkOperation(spec: SemanticSpecification, selection: string, observation: OperationObservation): OperationCheck {
  validateSpecification(spec); assertPortable(observation);
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)
    || Object.keys(observation).some(key => !['input', 'before', 'outcome', 'output', 'after', 'effects'].includes(key))
    || (observation.outcome !== undefined && typeof observation.outcome !== 'string')) throw new ClearingsError('INVALID_OBSERVATION', 'Unknown observation fields or invalid outcome.');
  const operation = resolveOperation(spec, selection);
  const checks: RuleCheck[] = [];
  const add = (id: string, description: string, verdict: Verdict, reason: string | null = null) => checks.push({ id, description, verdict, reason });
  if (!matchesType(observation.input, { kind: 'record', fields: operation.inputs })) throw new ClearingsError('INVALID_OBSERVATION', 'Input does not match the operation input type.');
  const knownStates = new Map(spec.states.map(item => [item.id, item.type]));
  for (const [phase, values] of [['before', observation.before], ['after', observation.after]] as const) {
    if (values === undefined && phase === 'after') continue;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new ClearingsError('INVALID_OBSERVATION', `${phase} must be a state field map.`);
    for (const [id, value] of Object.entries(values)) if (!knownStates.has(id) || !matchesType(value, knownStates.get(id)!)) throw new ClearingsError('INVALID_OBSERVATION', `Invalid ${phase} state field: ${id}`);
  }
  if (observation.output !== undefined && !matchesType(observation.output, operation.output)) throw new ClearingsError('INVALID_OBSERVATION', 'Output does not match the operation output type.');
  if (observation.effects !== undefined && (!Array.isArray(observation.effects) || observation.effects.some(item => typeof item !== 'string'))) throw new ClearingsError('INVALID_OBSERVATION', 'Effects must be an explicit list of effect IDs.');
  const environment = { input: observation.input, before: observation.before, ...(observation.after === undefined ? {} : { after: observation.after }), ...(observation.output === undefined ? {} : { output: observation.output }) };
  // Operation guarantees apply even when the observed outcome is unknown.
  for (const rule of operation.guarantees) {
    const value = evaluateExpression(rule.predicate, environment);
    add(rule.id, rule.description, !value.known ? 'unknown' : value.value === true ? 'pass' : 'fail', value.known ? null : value.reason);
  }
  const applicable: string[] = [], uncertain: string[] = [];
  const guards = new Map(operation.outcomes.map(outcome => {
    const value = evaluateExpression(outcome.when, environment);
    if (!value.known) uncertain.push(outcome.id); else if (value.value === true) applicable.push(outcome.id);
    return [outcome.id, value];
  }));
  if (operation.outcome_policy === 'exclusive' && applicable.length > 1) add('outcome-exclusivity', 'Exactly one modeled outcome applies.', 'fail', 'Several exclusive guards are true.');
  if (!applicable.length && !uncertain.length) add('outcome-coverage', 'An outcome covers this input.', operation.coverage === 'complete' ? 'fail' : 'unknown', 'No outcome guard is true.');
  if (observation.outcome === undefined && operation.effects.completeness === 'complete' && observation.effects !== undefined) {
    const allowed = new Set(operation.effects.allowed.map(effect => effect.id));
    add('effects:allowed', 'Only effects declared for this operation occur.', observation.effects.every(id => allowed.has(id)) ? 'pass' : 'fail');
  }
  if (observation.outcome === undefined) add('observed-outcome', 'An actual outcome is supplied.', 'unknown', 'The actual outcome was not supplied; outcome-specific rules remain unchecked.');
  else {
    const outcome = operation.outcomes.find(item => item.id === observation.outcome);
    if (!outcome) throw new ClearingsError('INVALID_OBSERVATION', 'Unknown outcome ID.');
    const guard = guards.get(outcome.id)!;
    add('outcome-condition', outcome.description, !guard.known ? 'unknown' : guard.value === true ? 'pass' : 'fail', guard.known ? null : guard.reason);
    if (operation.outcome_policy === 'exclusive' && applicable.length <= 1) {
      if (applicable.some(id => id !== outcome.id)) add('outcome-exclusivity', 'Other exclusive guards are false.', 'fail', 'Another exclusive guard is true for the supplied outcome.');
      else if (uncertain.some(id => id !== outcome.id)) add('outcome-exclusivity', 'Other exclusive guards are false.', 'unknown', 'Another outcome condition is unformalized or lacks observations.');
    }
    for (const rule of outcome.ensures) {
      const value = evaluateExpression(rule.predicate, environment);
      add(rule.id, rule.description, !value.known ? 'unknown' : value.value === true ? 'pass' : 'fail', value.known ? null : value.reason);
    }
    for (const update of outcome.updates) {
      const value = evaluateExpression(update.value, environment);
      const actual = observedState(observation.after, update.state_id);
      add(`update:${update.state_id}`, `Update ${update.state_id} as specified.`, !value.known || actual === undefined ? 'unknown' : canonical(value.value) === canonical(actual) ? 'pass' : 'fail', !value.known ? value.reason : actual === undefined ? 'Missing resulting state.' : null);
    }
    if (operation.effects.completeness === 'complete' || outcome.effects.some(item => item.occurrence === 'required')) {
      if (observation.effects === undefined) add('effects', 'Observed effects satisfy the declared boundary.', 'unknown', 'No effect trace was supplied.');
      else {
        const allowed = new Set(outcome.effects.map(item => item.effect_id));
        if (operation.effects.completeness === 'complete') add('effects:allowed', 'Only effects allowed for this outcome occur.', observation.effects.every(id => allowed.has(id)) ? 'pass' : 'fail');
        for (const effect of outcome.effects.filter(item => item.occurrence === 'required')) add(`effect:${effect.effect_id}`, `Required effect ${effect.effect_id} occurs.`, observation.effects.includes(effect.effect_id) ? 'pass' : 'fail');
      }
    }
  }
  if (operation.frame === 'complete') for (const state of spec.states.filter(item => !operation.writes.includes(item.id))) {
    const before = observedState(observation.before, state.id), after = observedState(observation.after, state.id);
    add(`frame:${state.id}`, `Preserve ${state.name}.`, before === undefined || after === undefined ? 'unknown' : canonical(before) === canonical(after) ? 'pass' : 'fail', before === undefined || after === undefined ? 'Both state observations are required to check preservation.' : null);
  }
  return { artifact_id: spec.artifact_id, operation_id: operation.id, perspective: spec.perspective, verdict: combine(checks), applicable_outcome_ids: applicable, uncertain_outcome_ids: uncertain, checks,
    limitations: ['Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.',
      ...(operation.coverage === 'partial' ? ['Behavior outside the modeled cases remains unspecified.'] : []),
      ...(operation.frame === 'partial' ? ['Unrecorded state changes are not excluded by this partial frame.'] : []),
      ...(operation.effects.completeness === 'partial' ? ['Unrecorded external effects are not excluded.'] : []),
      ...operation.decisions.map(item => `${item.disposition}: ${item.question}`)] };
}
