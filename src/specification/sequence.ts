import { canonical } from '../repository/inventory.js';
import { ClearingsError } from '../model/types.js';
import { assertPortable, validateSpecification } from './validate.js';
import { checkOperation } from './check.js';
import type { JsonValue, OperationCheck, OperationObservation, SemanticSpecification, Verdict } from './model.js';

export interface SequenceStep {
  operation: string;
  observation: OperationObservation;
}

export interface SequenceOptions {
  stateIds: readonly string[];
}

export interface ContinuityCheck {
  from_index: number;
  to_index: number;
  state_id: string;
  verdict: Verdict;
  reason: string | null;
}

export interface OperationSequenceCheck {
  schema_version: '0.3.0';
  command: 'check-sequence';
  artifact_id: string;
  perspective: SemanticSpecification['perspective'];
  state_ids: string[];
  steps: { index: number; operation_id: string; result: OperationCheck }[];
  continuity: ContinuityCheck[];
  verdict: Verdict;
  interpretation: 'supplied-observations-only';
  acceptance: 'proposed';
}

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const combine = (verdicts: Verdict[]): Verdict => verdicts.includes('fail') ? 'fail' : verdicts.includes('unknown') ? 'unknown' : 'pass';

function validateSteps(value: unknown): asserts value is readonly SequenceStep[] {
  // Structural validation must happen before any wrapper fields are read.
  assertPortable(value);
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    throw new ClearingsError('INVALID_OBSERVATION', 'Steps must be an array containing 1 to 256 records.');
  }
  for (const step of value) {
    if (!step || typeof step !== 'object' || Array.isArray(step) || Object.keys(step).length !== 2
      || !own(step, 'operation') || !own(step, 'observation')) {
      throw new ClearingsError('INVALID_OBSERVATION', 'Each step must contain exactly operation and observation.');
    }
  }
}

function validateOptions(value: unknown, spec: SemanticSpecification): string[] {
  if (value === undefined) throw new ClearingsError('INVALID_ARGUMENTS', 'Sequence options are required.');
  // assertPortable is intentionally before reading stateIds. Primitive JSON values pass
  // this check and are then rejected as argument-shape errors.
  assertPortable(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1
    || !own(value, 'stateIds') || !Array.isArray((value as { stateIds?: unknown }).stateIds)) {
    throw new ClearingsError('INVALID_ARGUMENTS', 'Options must contain only a stateIds array.');
  }
  const stateIds = (value as { stateIds: unknown[] }).stateIds;
  if (stateIds.some(id => typeof id !== 'string')) throw new ClearingsError('INVALID_ARGUMENTS', 'stateIds must contain strings.');
  const known = new Set(spec.states.map(state => state.id));
  if (stateIds.some(id => !known.has(id as string))) throw new ClearingsError('INVALID_ARGUMENTS', 'stateIds must name known state fields.');
  return [...new Set(stateIds as string[])].sort();
}

function selectedValue(observation: OperationObservation, phase: 'before' | 'after', stateId: string): JsonValue | undefined {
  const map = observation[phase];
  return map !== undefined && own(map, stateId) ? map[stateId] : undefined;
}

export function checkOperationSequence(
  spec: SemanticSpecification,
  steps: readonly SequenceStep[],
  options: SequenceOptions,
): OperationSequenceCheck {
  validateSpecification(spec);
  validateSteps(steps);
  const stateIds = validateOptions(options, spec);

  const checkedSteps: { index: number; operation_id: string; result: OperationCheck }[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (typeof step.operation !== 'string') throw new ClearingsError('INVALID_SELECTION', 'Operation selection must be a string.');
    const result = checkOperation(spec, step.operation, step.observation);
    checkedSteps.push({ index, operation_id: result.operation_id, result });
  }

  const continuity: ContinuityCheck[] = [];
  for (let index = 0; index + 1 < checkedSteps.length; index += 1) {
    const earlier = steps[index]!.observation;
    const later = steps[index + 1]!.observation;
    for (const stateId of stateIds) {
      const before = selectedValue(earlier, 'after', stateId);
      const after = selectedValue(later, 'before', stateId);
      if (before === undefined || after === undefined) {
        continuity.push({ from_index: index, to_index: index + 1, state_id: stateId, verdict: 'unknown', reason: 'Both adjacent state values are required.' });
      } else if (canonical(before) === canonical(after)) {
        continuity.push({ from_index: index, to_index: index + 1, state_id: stateId, verdict: 'pass', reason: null });
      } else {
        continuity.push({ from_index: index, to_index: index + 1, state_id: stateId, verdict: 'fail', reason: 'Adjacent state values differ.' });
      }
    }
  }
  return {
    schema_version: '0.3.0', command: 'check-sequence', artifact_id: spec.artifact_id, perspective: spec.perspective,
    state_ids: [...stateIds], steps: checkedSteps, continuity, verdict: combine([...checkedSteps.map(step => step.result.verdict), ...continuity.map(item => item.verdict)]),
    interpretation: 'supplied-observations-only', acceptance: 'proposed',
  };
}
