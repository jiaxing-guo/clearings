import { isDeepStrictEqual } from 'node:util';
import { ClearingsError } from '../model/types.js';
import { assertPortable } from '../specification/validate.js';
import { checkArgument } from '../program/preparation.js';
import type { Program, ProgramValue } from '../program/model.js';
import type { ProgramExecutionLimits, ProgramExecutionResult } from '../program/execution.js';

export const RUST_PROCESS_LIMITS = Object.freeze({
  input_bytes: 4 * 1024 * 1024,
  output_bytes: 16 * 1024 * 1024,
  compile_timeout_ms: 60_000,
  execution_timeout_ms: 60_000,
});
export type NativeObservation = Pick<ProgramExecutionResult, 'limits' | 'usage' | 'completion'>;

/** Encode owned, admitted arguments as data. This function never constructs Rust syntax. */
export function encodeRequest(args: ProgramValue[], limits: ProgramExecutionLimits): Buffer {
  const bytes = Buffer.allocUnsafe(RUST_PROCESS_LIMITS.input_bytes);
  let offset = bytes.write('CLR1', 'ascii');
  const reserve = (count: number) => {
    if (offset + count > bytes.length)
      throw new Error('Admitted arguments exceeded transport bound.');
    const start = offset;
    offset += count;
    return start;
  };
  const byte = (n: number) => bytes.writeUInt8(n, reserve(1));
  const count = (n: number) => bytes.writeUInt32LE(n, reserve(4));
  const text = (value: string) => {
    count(value.length);
    for (let i = 0; i < value.length; i++) bytes.writeUInt16LE(value.charCodeAt(i), reserve(2));
  };
  function value(item: ProgramValue): void {
    if (item === null) {
      byte(0);
      return;
    }
    if (typeof item === 'boolean') {
      byte(item ? 2 : 1);
      return;
    }
    if (typeof item === 'number') {
      byte(3);
      bytes.writeBigInt64LE(BigInt(item), reserve(8));
      return;
    }
    if (typeof item === 'string') {
      byte(4);
      text(item);
      return;
    }
    if (Array.isArray(item)) {
      byte(5);
      count(item.length);
      item.forEach(value);
      return;
    }
    byte(6);
    const entries = Object.entries(item);
    count(entries.length);
    for (const [key, child] of entries) {
      text(key);
      value(child);
    }
  }
  for (const key of ['work', 'allocation_units', 'value_units', 'evaluation_depth'] as const)
    bytes.writeBigUInt64LE(BigInt(limits[key]), reserve(8));
  value(args);
  return bytes.subarray(0, offset);
}

function malformed(): never {
  throw new ClearingsError(
    'RUST_EXECUTION_FAILED',
    'Native output does not satisfy the execution interface.',
    1,
  );
}
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    malformed();
}
function diagnostic(value: unknown, program: Program): void {
  object(value, ['phase', 'path', 'call_stack']);
  if (
    typeof value.phase !== 'string' ||
    !['arguments', 'execution', 'result'].includes(value.phase) ||
    typeof value.path !== 'string' ||
    !Array.isArray(value.call_stack) ||
    value.call_stack.length > 128
  )
    malformed();
  for (const frame of value.call_stack) {
    object(frame, ['function_id', 'call_path']);
    if (
      !program.functions.some((fn) => fn.id === frame.function_id) ||
      typeof frame.call_path !== 'string'
    )
      malformed();
  }
}

function valueUnits(value: ProgramValue): number {
  if (typeof value === 'string') return 1 + value.length;
  if (Array.isArray(value))
    return 1 + value.reduce<number>((sum, item) => sum + valueUnits(item), 0);
  if (value !== null && typeof value === 'object')
    return (
      1 + Object.entries(value).reduce((sum, [key, item]) => sum + key.length + valueUnits(item), 0)
    );
  return 1;
}

/** Validate process output before attaching trusted compilation identities. */
export function decodeResponse(
  bytes: Buffer,
  program: Program,
  limits: ProgramExecutionLimits,
): NativeObservation {
  try {
    if (bytes.length > RUST_PROCESS_LIMITS.output_bytes) malformed();
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // Output values can be larger than argument preparation permits, but remain logically bounded.
    assertPortable(result, limits.value_units + 2_000);
    object(result, ['limits', 'usage', 'completion']);
    if (!isDeepStrictEqual(result.limits, limits)) malformed();
    object(result.usage, Object.keys(limits));
    for (const key of Object.keys(limits) as (keyof ProgramExecutionLimits)[]) {
      const used = result.usage[key];
      if (typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0 || used > limits[key])
        malformed();
    }
    const completion = result.completion as Record<string, unknown>;
    if (!completion || typeof completion !== 'object') malformed();
    const entry = program.functions.find((fn) => fn.id === program.entry_function)!;
    const checkSize = (value: unknown) => {
      if (valueUnits(value as ProgramValue) > (result.usage as ProgramExecutionLimits).value_units)
        malformed();
    };
    switch (completion.kind) {
      case 'return':
        object(completion, ['kind', 'value']);
        checkArgument(completion.value as ProgramValue, entry.returns, '/result/value');
        checkSize(completion.value);
        break;
      case 'application-failure': {
        object(completion, ['kind', 'code', 'details', 'diagnostic']);
        const failure = entry.failures.find((failure) => failure.code === completion.code);
        if (!failure) malformed();
        checkArgument(completion.details as ProgramValue, failure.details, '/result/details');
        checkSize(completion.details);
        diagnostic(completion.diagnostic, program);
        break;
      }
      case 'runtime-fault':
        object(completion, ['kind', 'code', 'message', 'diagnostic']);
        if (
          typeof completion.code !== 'string' ||
          !['INTEGER_OVERFLOW', 'INDEX_OUT_OF_BOUNDS'].includes(completion.code) ||
          typeof completion.message !== 'string'
        )
          malformed();
        diagnostic(completion.diagnostic, program);
        break;
      case 'resource-exhaustion':
        object(completion, ['kind', 'resource', 'limit', 'diagnostic']);
        if (
          typeof completion.resource !== 'string' ||
          !Object.hasOwn(limits, completion.resource) ||
          completion.limit !== limits[completion.resource as keyof ProgramExecutionLimits]
        )
          malformed();
        diagnostic(completion.diagnostic, program);
        break;
      default:
        malformed();
    }
    return result as unknown as NativeObservation;
  } catch {
    malformed();
  }
}
