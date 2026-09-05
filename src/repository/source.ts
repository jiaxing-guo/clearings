import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { ClearingsError } from '../model/types.js';
import type { InventoryFile, InventoryResult } from '../model/types.js';
import type { SourceRead } from '../model/structural.js';
import { git } from './git.js';

export const VIRTUAL_ROOT = '/__clearings_repository__/';
export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export const sourcePath = (path: string): string | null => {
  const normalized = posix.normalize(path);
  return normalized.startsWith(VIRTUAL_ROOT) ? normalized.slice(VIRTUAL_ROOT.length) : null;
};

export interface SourceLimits { max_file_bytes: number; max_total_bytes: number; max_source_files: number; max_projects: number }
export const DEFAULT_LIMITS: SourceLimits = { max_file_bytes: 2 * 1024 * 1024, max_total_bytes: 32 * 1024 * 1024, max_source_files: 1000, max_projects: 128 };

/** Snapshot-only filesystem. No host filesystem fallback, target execution, or lazy fetch. */
export class SourceStore {
  readonly entries: Map<string, InventoryFile>;
  readonly reads = new Map<string, SourceRead>();
  readonly failures = new Map<string, string>();
  private readonly cache = new Map<string, string>();
  private bytes = 0;

  constructor(readonly repository: string, readonly manifest: InventoryResult, readonly limits: SourceLimits) {
    this.entries = new Map(manifest.data.files.map((file) => [file.path, file]));
  }

  allowed(path: string): boolean {
    const file = this.entries.get(path);
    return !!file && ['100644', '100755'].includes(file.mode) && file.reason !== 'explicit-exclusion'
      && !path.split('/').some((part) => part === 'node_modules' || part === '.git')
      && (file.kind === 'source' || file.kind === 'declaration' || path.endsWith('.json'));
  }

  read(path: string, purpose: 'source' | 'config'): string {
    if (!this.allowed(path)) throw new ClearingsError('SOURCE_UNAVAILABLE', `Source is unavailable or excluded: ${path}`);
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;
    const entry = this.entries.get(path)!;
    const size = entry.size_bytes!;
    if (size > this.limits.max_file_bytes || this.bytes + size > this.limits.max_total_bytes) throw new ClearingsError('SOURCE_LIMIT', `Source byte budget exceeded: ${path}`);
    if (purpose === 'source' && [...this.reads.values()].filter((read) => read.purpose === 'source').length >= this.limits.max_source_files) throw new ClearingsError('SOURCE_LIMIT', 'Source file budget exceeded.');
    const bytes = git(this.repository, ['cat-file', 'blob', entry.object_id]);
    const digest = createHash(this.manifest.data.snapshot.object_format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (digest !== entry.object_id || bytes.length !== size) throw new ClearingsError('CORRUPT_SOURCE', `Git blob does not match its inventory: ${path}`, 1);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new ClearingsError('SOURCE_ENCODING', `Source is not valid UTF-8: ${path}`); }
    this.bytes += bytes.length;
    this.cache.set(path, text);
    this.reads.set(path, { path, blob_sha: entry.object_id, content_sha256: sha256(bytes), size_bytes: bytes.length, purpose });
    return text;
  }

  readVirtual = (name: string): string | undefined => {
    const path = sourcePath(name);
    if (path === null || !this.allowed(path)) return undefined;
    try { return this.read(path, path.endsWith('.json') ? 'config' : 'source'); }
    catch (error) {
      // Missing/corrupt Git objects are operational failures, not missing imports.
      if (error instanceof ClearingsError && error.exitCode === 1) throw error;
      this.failures.set(path, error instanceof Error ? error.message : 'Source read failed.');
      return undefined;
    }
  };

  exists = (name: string): boolean => { const path = sourcePath(name); return path !== null && this.allowed(path); };
  directoryExists = (name: string): boolean => {
    const prefix = posix.normalize(name).replace(/\/$/, '') + '/';
    return [...this.entries.keys()].some((path) => (VIRTUAL_ROOT + path).startsWith(prefix) && this.allowed(path));
  };
  directories = (name: string): string[] => this.directoryEntries(name).directories;
  directoryEntries(name: string): { files: string[]; directories: string[] } {
    const prefix = posix.normalize(name).replace(/\/$/, '') + '/';
    const files = new Set<string>(); const directories = new Set<string>();
    for (const path of this.entries.keys()) {
      const virtual = VIRTUAL_ROOT + path;
      if (!virtual.startsWith(prefix) || !this.allowed(path)) continue;
      const tail = virtual.slice(prefix.length); const slash = tail.indexOf('/');
      if (slash < 0) files.add(tail); else directories.add(tail.slice(0, slash));
    }
    return { files: [...files].sort(), directories: [...directories].sort() };
  }
}
