import type { Diagnostic, InventoryResult } from './types.js';

export interface ScanDiagnostic extends Diagnostic {
  severity: 'warning' | 'error';
  path: string | null;
  project_id: string | null;
  start_byte: number | null;
  end_byte: number | null;
}

export interface SourceRead {
  path: string;
  blob_sha: string;
  content_sha256: string;
  size_bytes: number;
  purpose: 'source' | 'config';
}

export interface Project {
  id: string;
  config_path: string | null;
  config_sha256: string | null;
  references: string[];
  source_files: string[];
  selected_files: string[];
  status: 'loaded' | 'failed';
  // Portable JSON options; paths are repository-relative, enum values are names.
  options: { base_url: string | null; paths: Record<string, string[]>; module: string; module_resolution: string; target: string; jsx: string; types: string[] };
}

export interface SourceUnit {
  id: string;
  path: string;
  blob_sha: string;
  content_sha256: string | null;
  size_bytes: number;
  role: 'selected' | 'support';
  status: 'parsed' | 'failed';
  project_ids: string[];
}

export interface Evidence {
  id: string;
  snapshot_id: string;
  file_id: string;
  project_id: string;
  blob_sha: string;
  content_sha256: string;
  start_byte: number;
  end_byte: number;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  span_sha256: string;
  method: 'typescript-syntax' | 'typescript-symbol';
}

export interface Declaration {
  id: string;
  file_id: string;
  project_id: string;
  name: string;
  kind: 'function' | 'variable' | 'parameter' | 'class' | 'method' | 'property' | 'interface' | 'type' | 'enum' | 'namespace' | 'binding';
  evidence_id: string;
}

export interface Fact {
  id: string;
  project_id: string;
  kind: 'declaration' | 'import' | 'export' | 'reference' | 'call' | 'dynamic-write';
  subject_id: string;
  target_id: string | null;
  name: string;
  specifier: string | null;
  usage: 'runtime' | 'type' | 'mixed';
  resolution: 'observed' | 'resolved' | 'unresolved';
  reason: string | null;
  evidence_ids: string[];
}

export interface ScanCoverage {
  tracked_entries: number;
  selected_source_files: number;
  parsed_source_files: number;
  failed_source_files: number;
  support_source_files: number;
  failed_support_files: number;
  inventory_only_entries: number;
  facts: number;
  resolved_references: number;
  unresolved_references: number;
  resolved_calls: number;
  unresolved_calls: number;
  resolved_imports: number;
  unresolved_imports: number;
  semantic_analysis: 'not-run';
}

export interface ScanData {
  manifest: InventoryResult;
  adapter: {
    name: 'typescript'; version: 'm1.1'; compiler_version: string;
    resolution_mode: 'source-only'; full_typecheck: false; external_types_loaded: false;
    max_file_bytes: number; max_total_bytes: number; max_source_files: number; max_projects: number;
  };
  projects: Project[];
  reads: SourceRead[];
  files: SourceUnit[];
  symbols: Declaration[];
  evidence: Evidence[];
  facts: Fact[];
}

export interface ScanResult {
  schema_version: '0.1.0';
  command: 'scan';
  status: 'complete' | 'partial';
  snapshot_id: string;
  artifact_id: string;
  data: ScanData;
  diagnostics: ScanDiagnostic[];
  coverage: ScanCoverage;
}
