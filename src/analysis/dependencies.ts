import { ClearingsError } from '../model/types.js';

/** Stable breadth-first closure. Cycles are references, never recursive expansion. */
export function requiredClosure<T>(
  roots: string[],
  records: ReadonlyMap<string, T>,
  dependencies: (record: T) => readonly string[],
): string[] {
  const selected = new Set<string>();
  const pending = [...roots];
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const id = pending[cursor]!;
    if (selected.has(id)) continue;
    const record = records.get(id);
    if (!record)
      throw new ClearingsError('MISSING_REQUIRED_DEPENDENCY', `Required record is missing: ${id}`);
    selected.add(id);
    for (const target of [...dependencies(record)].sort())
      if (!selected.has(target)) pending.push(target);
  }
  return [...selected];
}
