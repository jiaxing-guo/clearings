import type { ExecutionRecord } from './model.js';

/** These failures provide no completed application result to compare with the reference. */
export function isNativeInterruption(record: ExecutionRecord): boolean {
  if (
    record.schema_version !== '0.2.0' ||
    record.completion.kind !== 'throw' ||
    record.completion.thrown.status !== 'captured'
  )
    return false;
  const error = record.completion.thrown.value;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
  return (
    error.code === 'CONTEXT_RESOURCE' ||
    (typeof error.code === 'string' && error.code.startsWith('RUST_'))
  );
}
