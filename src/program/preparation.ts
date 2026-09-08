import { ClearingsError } from '../model/types.js';
import { normalized } from '../semantics/identity.js';
import { assertPortable } from '../specification/validate.js';
import type { Program, ProgramType, ProgramValue } from './model.js';
import { validateProgram } from './validate.js';
import {
  PROGRAM_EXECUTION_DEFAULT_LIMITS,
  PROGRAM_EXECUTION_INPUT_LIMITS,
  PROGRAM_EXECUTION_MAX_LIMITS,
} from './execution.js';
import type { ProgramExecutionLimits, ProgramExecutionOptions } from './execution.js';

const invalid = (path: string, rule: string, message: string): never => {
  throw new ClearingsError('INVALID_PROGRAM_EXECUTION', `${path}: ${message}`, 2, { path, rule });
};
function portable(value: unknown, path: string, maxNodes: number): void {
  try {
    assertPortable(value, maxNodes);
  } catch (error) {
    if (!(error instanceof ClearingsError)) throw error;
    invalid(path, 'portability', error.message);
  }
}
function limitsFor(options: ProgramExecutionOptions): ProgramExecutionLimits {
  portable(options, '/options', 10);
  if (!options || typeof options !== 'object' || Array.isArray(options))
    invalid('/options', 'limits', 'Expected a limits object.');
  const limits = { ...PROGRAM_EXECUTION_DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(limits, key)) invalid('/options', 'limits', 'Unknown execution limit.');
    const resource = key as keyof ProgramExecutionLimits;
    if (!Number.isSafeInteger(value) || value < 1 || value > PROGRAM_EXECUTION_MAX_LIMITS[resource])
      invalid(
        `/options/${key}`,
        'limits',
        `Expected an integer from 1 through ${PROGRAM_EXECUTION_MAX_LIMITS[resource]}.`,
      );
    limits[resource] = value;
  }
  return limits;
}
/** Bound strings and field names before canonical serialization or identity checking. */
function prepare(value: unknown, path: string): void {
  portable(value, path, PROGRAM_EXECUTION_INPUT_LIMITS.portable_values);
  let units = 0;
  const add = (count: number): void => {
    units += count;
    if (units > PROGRAM_EXECUTION_INPUT_LIMITS.input_units)
      invalid(path, 'input-limit', 'Input exceeds the preparation size limit.');
  };
  const visit = (item: unknown): void => {
    add(1 + (typeof item === 'string' ? item.length : 0));
    if (Array.isArray(item)) item.forEach(visit);
    else if (item !== null && typeof item === 'object')
      for (const [key, child] of Object.entries(item)) {
        add(key.length);
        visit(child);
      }
  };
  visit(value);
}
export function checkArgument(value: ProgramValue, type: ProgramType, path: string): void {
  if (type.kind === 'list' && Array.isArray(value)) {
    value.forEach((item, index) => checkArgument(item, type.element, `${path}/${index}`));
    return;
  }
  if (
    type.kind === 'record' &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const fields = Object.keys(type.fields);
    if (
      fields.length !== Object.keys(value).length ||
      fields.some((key) => !Object.hasOwn(value, key))
    )
      invalid(path, 'type', 'Argument must contain exactly the declared record fields.');
    for (const key of fields) checkArgument(value[key]!, type.fields[key]!, `${path}/${key}`);
    return;
  }
  if (
    (type.kind === 'null' && value === null) ||
    (type.kind === 'boolean' && typeof value === 'boolean') ||
    (type.kind === 'integer' && Number.isSafeInteger(value)) ||
    (type.kind === 'string' && typeof value === 'string')
  )
    return;
  invalid(path, 'type', `Argument does not inhabit the declared ${type.kind} type.`);
}
/** Shared admission only: no program statements or expressions are evaluated. */
export function prepareProgramExecution(
  input: unknown,
  arguments_: unknown,
  options: ProgramExecutionOptions = {},
) {
  const limits = limitsFor(options);
  prepare(input, '/program');
  validateProgram(input);
  prepare(arguments_, '/arguments');
  if (!Array.isArray(arguments_))
    invalid('/arguments', 'arity', 'Expected a positional argument array.');
  const program = normalized(input) as Program;
  const args = normalized(arguments_) as ProgramValue[];
  const entry = program.functions.find((fn) => fn.id === program.entry_function)!;
  if (args.length !== entry.parameters.length)
    invalid('/arguments', 'arity', 'Argument count differs from the entry signature.');
  entry.parameters.forEach((parameter, index) =>
    checkArgument(args[index]!, parameter.type, `/arguments/${index}`),
  );
  return { program, args, limits };
}
