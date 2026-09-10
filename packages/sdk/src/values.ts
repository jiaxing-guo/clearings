export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
export type Code = import('./control.js').ErrorCode;
const actions: Record<Code, string> = {
  INVALID_PLAN: 'Check flow references, dependency limits and policy settings.',
  INVALID_VALUE: 'Use supported portable values and the declared operation schema.',
  UNSUPPORTED: 'Use an implemented capability and matching SDK/native versions.',
  CAPACITY: 'Reduce admitted work or explicitly adjust the runtime capacity.',
  OPERATION_FAILED:
    'Inspect the operation in the application; retry only under its declared semantics.',
  TRANSFORM_FAILED: 'Inspect the pure transformation at the indicated source.',
  CANCELLED: 'Start another invocation if the result is still needed.',
  TIMEOUT: 'Inspect queue and service time before changing the deadline.',
  CLOSED: 'Create a new Runtime for subsequent invocations.',
};
export class ClearingsError extends Error {
  readonly nextAction: string;
  constructor(
    readonly code: Code,
    readonly source: string | null = null,
  ) {
    super(`${code}${source ? ` at ${source}` : ''}. ${actions[code]}`);
    this.name = 'ClearingsError';
    this.nextAction = actions[code];
  }
}
export function nativeError(error: unknown): ClearingsError {
  if (error instanceof ClearingsError) return error;
  try {
    const parsed = JSON.parse(error instanceof Error ? error.message : String(error));
    if (Object.hasOwn(actions, parsed.code))
      return new ClearingsError(parsed.code, parsed.source ?? null);
  } catch {
    /* The native error may not be a serialized Failure. */
  }
  return new ClearingsError('INVALID_PLAN');
}
/** Snapshot the supported value domain without serializing application data through Rust. */
export function copyValue<T extends Value>(input: T): T {
  let entries = 0;
  let bytes = 0;
  const path = new Set<object>();
  function string(value: string): string {
    if (!value.isWellFormed()) throw new ClearingsError('INVALID_VALUE');
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > 1_048_576) throw new ClearingsError('CAPACITY');
    return value;
  }
  function visit(value: unknown, depth: number): Value {
    if (++entries > 100_000 || depth > 64) throw new ClearingsError('CAPACITY');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return string(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
        throw new ClearingsError('INVALID_VALUE');
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object' || path.has(value)) throw new ClearingsError('INVALID_VALUE');
    path.add(value);
    let out: Value;
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100_000)
        throw new ClearingsError('INVALID_VALUE');
      const values: Value[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor)) throw new ClearingsError('INVALID_VALUE');
        values.push(visit(descriptor.value, depth + 1));
      }
      out = values;
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        Object.getOwnPropertySymbols(value).length
      )
        throw new ClearingsError('INVALID_VALUE');
      const result: Record<string, Value> = {};
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (!descriptor.enumerable || !('value' in descriptor))
          throw new ClearingsError('INVALID_VALUE');
        Object.defineProperty(result, string(key), {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      out = result;
    }
    path.delete(value);
    return out;
  }
  return visit(input, 0) as T;
}
export interface Codec<T extends Value> {
  readonly schema: Value;
  accepts(value: Value): value is T;
}
export function codec<T extends Value>(
  schema: Value,
  accepts: (value: Value) => value is T,
): Codec<T> {
  return { schema: copyValue(schema), accepts };
}
type Decoded<C> = C extends Codec<infer T> ? T : never;
export const s = {
  any: codec<Value>({}, (v): v is Value => true),
  string: codec<string>({ type: 'string' }, (v): v is string => typeof v === 'string'),
  number: codec<number>({ type: 'number' }, (v): v is number => typeof v === 'number'),
  boolean: codec<boolean>({ type: 'boolean' }, (v): v is boolean => typeof v === 'boolean'),
  array<T extends Value>(item: Codec<T>): Codec<T[]> {
    return codec(
      { type: 'array', items: item.schema },
      (v): v is T[] => Array.isArray(v) && v.every((x) => item.accepts(x)),
    );
  },
  nullable<T extends Value>(item: Codec<T>): Codec<T | null> {
    return codec(
      { anyOf: [item.schema, { type: 'null' }] },
      (v): v is T | null => v === null || item.accepts(v),
    );
  },
  object<C extends Record<string, Codec<Value>>>(
    fields: C,
  ): Codec<{ [K in keyof C]: Decoded<C[K]> }> {
    return codec(
      {
        type: 'object',
        properties: Object.fromEntries(Object.entries(fields).map(([k, c]) => [k, c.schema])),
        required: Object.keys(fields),
        additionalProperties: false,
      },
      (v): v is { [K in keyof C]: Decoded<C[K]> } =>
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.keys(v).length === Object.keys(fields).length &&
        Object.entries(fields).every(([k, c]) => Object.hasOwn(v, k) && c.accepts(v[k]!)),
    );
  },
};
