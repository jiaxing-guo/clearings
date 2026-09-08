import { ClearingsError } from '../model/types.js';

export interface ByteBudget {
  max_bytes: number;
  required_bytes: number;
  used_bytes: number;
  serialization: 'compact-json-utf8-with-newline';
}
export const compactJson = (value: unknown): string => JSON.stringify(value) + '\n';
export function validateByteBudget(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2097152)
    throw new ClearingsError('INVALID_BUDGET', 'Context byte budget must be 1 through 2097152.');
}
/** Account for the byte counters themselves; mutate only a newly constructed pack. */
export function accountBytes<T extends { budget: ByteBudget }>(pack: T, requiredBytes = 0): T {
  for (let attempts = 0; attempts < 16; attempts++) {
    const size = Buffer.byteLength(compactJson(pack));
    if (
      size === pack.budget.used_bytes &&
      (requiredBytes !== 0 || size === pack.budget.required_bytes)
    )
      return pack;
    pack.budget.used_bytes = size;
    pack.budget.required_bytes = requiredBytes || size;
  }
  throw new ClearingsError('CONTEXT_BUDGET', 'Byte accounting did not converge.');
}
