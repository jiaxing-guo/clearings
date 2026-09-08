import { types } from 'node:util';
import { assertPortable } from '../specification/validate.js';
import type { JsonValue } from '../specification/model.js';
import type { CapturedValue } from './model.js';

export const unavailable = (reason: string): CapturedValue => ({ status: 'unavailable', reason });

/** Leave room for the record envelope and separately derived measurements. */
export function snapshot(value: unknown): JsonValue {
  assertPortable(value, 25000);
  const depth = (item: unknown, level: number): void => {
    if (level > 48) throw new Error('Capture exceeds depth 48.');
    if (item && typeof item === 'object')
      Object.values(item).forEach((child) => depth(child, level + 1));
  };
  depth(value, 0);
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function capture(value: unknown): CapturedValue {
  try {
    return { status: 'captured', value: snapshot(value) };
  } catch {
    return unavailable('Value is not portable JSON within 25,000 visited values and depth 48.');
  }
}

/** Native Error instances use an explicit data projection; stack traces are excluded. */
export function captureException(value: unknown): CapturedValue {
  if (!types.isNativeError(value)) return capture(value);
  try {
    if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol error fields.');
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value)).filter(
      ([key]) => key !== 'stack',
    );
    if (entries.some(([, descriptor]) => !('value' in descriptor)))
      throw new Error('Accessor error fields.');
    const projected: Record<string, unknown> = Object.fromEntries(
      entries.map(([key, descriptor]) => [key, descriptor.value]),
    );
    for (const key of ['name', 'message']) {
      if (Object.hasOwn(projected, key)) continue;
      let object: object | null = value;
      while (object) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor) {
          if (!('value' in descriptor)) throw new Error('Accessor error field.');
          Object.defineProperty(projected, key, { value: descriptor.value, enumerable: true });
          break;
        }
        object = Object.getPrototypeOf(object) as object | null;
      }
    }
    return capture(projected);
  } catch {
    return unavailable(
      'Native error fields cannot be captured as portable data without invoking accessors.',
    );
  }
}
