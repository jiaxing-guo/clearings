import ts from 'typescript';
import { inventory, canonical, compare } from '../repository/inventory.js';
import type { InventoryOptions } from '../repository/inventory.js';
import { SourceStore, DEFAULT_LIMITS } from '../repository/source.js';
import type { SourceLimits } from '../repository/source.js';
import { ClearingsError } from '../model/types.js';
import type { ScanDiagnostic, ScanResult } from '../model/structural.js';
import { extract } from '../adapters/typescript/extract.js';
import { artifactId, scanCoverage } from './identity.js';

export interface ScanOptions extends InventoryOptions {
  project?: string;
  limits?: Partial<SourceLimits>;
}

export function scan(options: ScanOptions): ScanResult {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ClearingsError('INVALID_LIMIT', 'Source limits must be positive safe integers.');
  const manifest = inventory(options);
  const store = new SourceStore(options.repository, manifest, limits);
  const diagnostics: ScanDiagnostic[] = [];
  const records = extract(store, diagnostics, options.project);
  const data: ScanResult['data'] = {
    manifest,
    adapter: {
      name: 'typescript',
      version: 'm1.1',
      compiler_version: ts.version,
      resolution_mode: 'source-only',
      full_typecheck: false,
      external_types_loaded: false,
      ...limits,
    },
    ...records,
  };
  const sorted = [
    ...new Map(diagnostics.map((diagnostic) => [canonical(diagnostic), diagnostic])).entries(),
  ]
    .sort(([a], [b]) => compare(a, b))
    .map(([, diagnostic]) => diagnostic);
  const result: ScanResult = {
    schema_version: '0.1.0',
    command: 'scan',
    status: sorted.some((diagnostic) => diagnostic.severity === 'error') ? 'partial' : 'complete',
    snapshot_id: manifest.snapshot_id,
    artifact_id: '',
    data,
    diagnostics: sorted,
    coverage: scanCoverage(data),
  };
  result.artifact_id = artifactId(result);
  return result;
}
