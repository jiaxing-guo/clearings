import { createHash } from 'node:crypto';
import { ClearingsError, SCHEMA_VERSION, TOOL_VERSION } from '../model/types.js';
import type { Coverage, InventoryData, InventoryFile, InventoryResult, Scope } from '../model/types.js';
import { git, resolveSnapshot } from './git.js';

export const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => {
    const normalized = path.replace(/\/+$/, '') || (path === '.' ? '.' : '');
    if (!normalized || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('\0') || /^[A-Za-z]:/.test(normalized) || (normalized !== '.' && normalized.split('/').some((part) => !part || part === '.' || part === '..'))) {
      throw new ClearingsError('INVALID_SCOPE', 'Scope entries must be literal repository-relative paths, or a single dot for the root.');
    }
    return normalized;
  }))].sort(compare);
}

export function inPath(path: string, root: string): boolean {
  return root === '.' || path === root || path.startsWith(`${root}/`);
}

export function coverageFor(files: InventoryFile[]): Coverage {
  const selected = files.filter((file) => file.status === 'inventoried');
  return {
    tracked_entries: files.length, inventoried_files: selected.length,
    excluded_entries: files.length - selected.length,
    inventoried_bytes: selected.reduce((sum, file) => sum + (file.size_bytes ?? 0), 0),
    parsed_files: 0, semantic_analysis: 'not-run',
  };
}

// Canonical object-key ordering makes the digest insensitive to JSON formatting.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function snapshotId(data: InventoryData): string {
  return `sha256:${createHash('sha256').update(canonical({ schema_version: SCHEMA_VERSION, data })).digest('hex')}`;
}

export interface InventoryOptions {
  repository: string;
  ref?: string;
  include?: string[];
  exclude?: string[];
  expectedCommit?: string;
  expectedTree?: string;
}

export function inventory(options: InventoryOptions): InventoryResult {
  const snapshot = resolveSnapshot(options.repository, options.ref ?? 'HEAD');
  if ((options.expectedCommit && snapshot.commit_sha !== options.expectedCommit) || (options.expectedTree && snapshot.tree_sha !== options.expectedTree)) {
    throw new ClearingsError('PIN_MISMATCH', 'The repository revision does not match the target commit and tree.');
  }
  const scope: Scope = { include: normalizePaths(options.include ?? ['.']), exclude: normalizePaths(options.exclude ?? []) };
  if (!scope.include.length) throw new ClearingsError('EMPTY_SCOPE', 'At least one included path is required.');
  const raw = git(options.repository, ['ls-tree', '--full-tree', '-r', '-l', '-z', snapshot.commit_sha]);
  let records: string[];
  try { records = new TextDecoder('utf-8', { fatal: true }).decode(raw).split('\0').filter(Boolean); }
  catch { throw new ClearingsError('UNSUPPORTED_PATH_ENCODING', 'Git paths must be valid UTF-8; no entries were silently dropped.'); }
  const files: InventoryFile[] = records.map((record): InventoryFile => {
    const tab = record.indexOf('\t');
    const header = record.slice(0, tab).trim().split(/\s+/);
    const [mode, object_type, object_id, size] = header;
    const path = record.slice(tab + 1);
    if (tab < 0 || !mode || !object_id || !size || !['blob', 'commit'].includes(object_type ?? '')) {
      throw new ClearingsError('INVALID_GIT_ENTRY', 'Unexpected Git tree entry.', 1);
    }
    const reason = mode === '120000' ? 'symlink' : mode === '160000' ? 'submodule' : scope.exclude.some((root) => inPath(path, root)) ? 'explicit-exclusion' : !scope.include.some((root) => inPath(path, root)) ? 'outside-scope' : null;
    return {
      path, object_id, mode, object_type: object_type as 'blob' | 'commit',
      size_bytes: size === '-' ? null : Number(size),
      kind: /\.d\.[cm]?ts$/.test(path) ? 'declaration' : /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) ? 'source' : /(?:^|\/)(?:package\.json|[jt]sconfig(?:\.[^/]+)?\.json)$/.test(path) ? 'config' : 'other',
      test_named: /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path),
      status: reason ? 'excluded' : 'inventoried', reason,
    };
  }).sort((a, b) => compare(a.path, b.path));
  for (const root of scope.include) {
    if (root !== '.' && !files.some((file) => inPath(file.path, root))) {
      throw new ClearingsError('MISSING_SCOPE', `Included path is absent from this commit: ${root}`);
    }
  }
  const data: InventoryData = { tool_version: TOOL_VERSION, analysis_level: 'inventory', snapshot, scope, files };
  return {
    schema_version: SCHEMA_VERSION, command: 'inventory', status: 'complete',
    snapshot_id: snapshotId(data), data, diagnostics: [], coverage: coverageFor(files),
  };
}
