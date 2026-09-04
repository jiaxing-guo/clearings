import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from './types.js';
import type { InventoryResult } from './types.js';
import { canonical, compare, coverageFor, inPath, normalizePaths, snapshotId } from '../repository/inventory.js';

const schema = JSON.parse(readFileSync(new URL('../../schemas/inventory.v0.1.json', import.meta.url), 'utf8')) as object;
const checkSchema = new Ajv({ strict: true, allErrors: true }).compile<InventoryResult>(schema);

/** Validate artifact integrity, not source truth or semantic entailment. */
export function validateInventory(value: unknown): asserts value is InventoryResult {
  if (!checkSchema(value)) throw new ClearingsError('INVALID_SCHEMA', `Inventory does not match schema 0.1.0: ${checkSchema.errors?.[0]?.instancePath || '/'} ${checkSchema.errors?.[0]?.message ?? ''}`);
  const { data } = value;
  const fail = (message: string): never => { throw new ClearingsError('INVALID_INVENTORY', message); };
  if (snapshotId(data) !== value.snapshot_id) fail('Snapshot digest does not match inventory data.');
  if (canonical(coverageFor(data.files)) !== canonical(value.coverage)) fail('Coverage does not match the file inventory.');
  const length = data.snapshot.object_format === 'sha1' ? 40 : 64;
  if ([data.snapshot.commit_sha, data.snapshot.tree_sha, ...data.files.map((file) => file.object_id)].some((id) => id.length !== length)) fail('Git object hashes do not match the declared format.');
  for (const key of ['include', 'exclude'] as const) {
    if (canonical(normalizePaths(data.scope[key])) !== canonical(data.scope[key])) fail('Scope must be normalized, sorted, and unique.');
  }
  for (const root of data.scope.include) {
    if (root !== '.' && !data.files.some((file) => inPath(file.path, root))) fail('Included scope is absent from the inventory.');
  }
  for (const [i, file] of data.files.entries()) {
    if (file.path.startsWith('/') || file.path.includes('\0') || file.path.split('/').some((part) => !part || part === '.' || part === '..')) fail('Invalid repository entry path.');
    if (i > 0 && compare(data.files[i - 1]!.path, file.path) >= 0) fail('File paths must be sorted and unique.');
    const reason = file.mode === '120000' ? 'symlink' : file.mode === '160000' ? 'submodule' : data.scope.exclude.some((root) => inPath(file.path, root)) ? 'explicit-exclusion' : !data.scope.include.some((root) => inPath(file.path, root)) ? 'outside-scope' : null;
    if (file.reason !== reason || file.status !== (reason ? 'excluded' : 'inventoried')) fail('File status is inconsistent with mode or scope.');
    if (file.mode === '160000' ? file.object_type !== 'commit' || file.size_bytes !== null : file.object_type !== 'blob' || file.size_bytes === null) fail('Object type or size is inconsistent with Git mode.');
  }
}
