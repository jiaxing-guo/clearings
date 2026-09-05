import { randomUUID } from 'node:crypto';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import type { SemanticKind } from '../model/semantic.js';

/** Allocate once when proposing a record; preserve IDs when editing or replaying. */
export const newSemanticId = (kind: SemanticKind): string => `${kind}:${randomUUID()}`;
export const digest = (kind: string, value: unknown): string => `${kind}:${sha256(canonical(value))}`;
export function contentId(value: { request_id: string } | { artifact_id: string }): string {
  const key = 'artifact_id' in value ? 'artifact_id' : 'request_id';
  const body = { ...value } as Record<string, unknown>; delete body[key];
  return digest(key === 'request_id' ? 'request' : 'semantic', body);
}
export const normalized = <T>(value: T): T => JSON.parse(canonical(value)) as T;
