import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ClearingsError } from '../model/types.js';
import { git, resolveSnapshot } from './git.js';
import { normalizePaths } from './inventory.js';

export interface Target {
  target_id: string;
  repository: string;
  commit: string;
  tree_sha: string;
  scope: {
    inventory_roots: string[];
    deep_source_files: string[];
    supporting_context: string[];
    excluded_roots: string[];
  };
}

// Select only analyzer configuration. Evaluator metadata and answers never enter
// the returned object, inventory, or digest.
export function readTarget(path: string): Target {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ClearingsError('INVALID_TARGET', 'Cannot read target manifest JSON.');
  }
  if (!value || typeof value !== 'object')
    throw new ClearingsError('INVALID_TARGET', 'Expected a target manifest object.');
  const input = value as Record<string, unknown>;
  if (input.schema_version !== '0.1.0')
    throw new ClearingsError('INVALID_TARGET', 'Expected target manifest schema_version 0.1.0.');
  const hash = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/;
  if (
    typeof input.target_id !== 'string' ||
    !input.target_id ||
    typeof input.repository !== 'string' ||
    typeof input.commit !== 'string' ||
    typeof input.tree_sha !== 'string' ||
    !hash.test(input.commit) ||
    !hash.test(input.tree_sha) ||
    input.commit.length !== input.tree_sha.length
  ) {
    throw new ClearingsError(
      'INVALID_TARGET',
      'Target requires an ID, HTTPS repository URL, and full commit/tree hashes.',
    );
  }
  let url: URL;
  try {
    url = new URL(input.repository);
  } catch {
    throw new ClearingsError('INVALID_TARGET', 'Target repository must be an HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ClearingsError(
      'INVALID_TARGET',
      'Target repository must use HTTPS without embedded credentials, query, or fragment.',
    );
  }
  const scope = input.scope as Record<string, unknown> | undefined;
  const paths = (key: string): string[] => {
    const list = scope?.[key];
    if (!Array.isArray(list) || !list.every((entry) => typeof entry === 'string'))
      throw new ClearingsError('INVALID_TARGET', `Target scope.${key} must be a string array.`);
    return normalizePaths(list);
  };
  const result: Target = {
    target_id: input.target_id,
    repository: input.repository,
    commit: input.commit,
    tree_sha: input.tree_sha,
    scope: {
      inventory_roots: paths('inventory_roots'),
      deep_source_files: paths('deep_source_files'),
      supporting_context: paths('supporting_context'),
      excluded_roots: paths('excluded_roots'),
    },
  };
  if (!result.scope.inventory_roots.length || !result.scope.deep_source_files.length)
    throw new ClearingsError('INVALID_TARGET', 'Inventory and deep scope must be nonempty.');
  return result;
}

export function fetchTarget(target: Target, destination: string): string {
  if (
    !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(target.commit) ||
    !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(target.tree_sha) ||
    target.commit.length !== target.tree_sha.length
  ) {
    throw new ClearingsError('INVALID_TARGET', 'Fetch requires full commit and tree hashes.');
  }
  let url: URL;
  try {
    url = new URL(target.repository);
  } catch {
    throw new ClearingsError('INVALID_TARGET', 'Fetch requires an HTTPS repository URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ClearingsError(
      'INVALID_TARGET',
      'Fetch requires HTTPS without embedded credentials, query, or fragment.',
    );
  const output = resolve(destination);
  mkdirSync(dirname(output), { recursive: true });
  try {
    mkdirSync(output);
  } catch {
    throw new ClearingsError('OUTPUT_EXISTS', 'Fetch destination must be a new directory.');
  }
  // A bare object store avoids checkout filters and any target working-tree writes.
  // A failed fetch is left for inspection; existing destinations are never reused.
  git(output, [
    'init',
    '--bare',
    '--template=',
    `--object-format=${target.commit.length === 40 ? 'sha1' : 'sha256'}`,
  ]);
  git(
    output,
    [
      'fetch',
      '--no-tags',
      '--depth=1',
      '--no-recurse-submodules',
      target.repository,
      target.commit,
    ],
    true,
  );
  const snapshot = resolveSnapshot(output, 'FETCH_HEAD');
  if (snapshot.commit_sha !== target.commit || snapshot.tree_sha !== target.tree_sha)
    throw new ClearingsError('PIN_MISMATCH', 'Fetched commit or tree does not match the manifest.');
  git(output, ['update-ref', 'refs/heads/pinned', snapshot.commit_sha]);
  git(output, ['symbolic-ref', 'HEAD', 'refs/heads/pinned']);
  return output;
}
