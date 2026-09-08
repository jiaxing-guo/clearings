export const SCHEMA_VERSION = '0.1.0' as const;
export const TOOL_VERSION = '0.0.1' as const;

export interface Diagnostic {
  code: string;
  message: string;
}

export interface Snapshot {
  mode: 'git-commit';
  object_format: 'sha1' | 'sha256';
  commit_sha: string;
  tree_sha: string;
}

export interface Scope {
  include: string[];
  exclude: string[];
}

export interface InventoryFile {
  path: string;
  object_id: string;
  mode: string;
  object_type: 'blob' | 'commit';
  size_bytes: number | null;
  kind: 'source' | 'declaration' | 'config' | 'other';
  test_named: boolean;
  status: 'inventoried' | 'excluded';
  reason: 'outside-scope' | 'explicit-exclusion' | 'symlink' | 'submodule' | null;
}

export interface Coverage {
  tracked_entries: number;
  inventoried_files: number;
  excluded_entries: number;
  inventoried_bytes: number;
  parsed_files: 0;
  semantic_analysis: 'not-run';
}

export interface InventoryData {
  tool_version: typeof TOOL_VERSION;
  analysis_level: 'inventory';
  snapshot: Snapshot;
  scope: Scope;
  files: InventoryFile[];
}

export interface Envelope<T> {
  schema_version: typeof SCHEMA_VERSION;
  command: string;
  status: 'complete' | 'partial' | 'failed';
  snapshot_id: string | null;
  data: T;
  diagnostics: Diagnostic[];
  coverage: Coverage | null;
}

export type InventoryResult = Envelope<InventoryData> & {
  command: 'inventory';
  status: 'complete';
  snapshot_id: string;
  coverage: Coverage;
};

export class ClearingsError extends Error {
  declare readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: 1 | 2 = 2,
    details?: Readonly<Record<string, string | number | boolean | null>>,
  ) {
    super(message);
    if (details !== undefined) this.details = details;
  }
}
