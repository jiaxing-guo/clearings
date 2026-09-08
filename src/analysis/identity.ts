import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import type { ScanCoverage, ScanResult } from '../model/structural.js';

export const recordId = (kind: string, value: unknown): string =>
  `${kind}:${sha256(canonical(value))}`;
export const artifactId = (result: Omit<ScanResult, 'artifact_id'> | ScanResult): string => {
  const { artifact_id: _, ...body } = result as ScanResult;
  return recordId('scan', body);
};
export function scanCoverage(data: ScanResult['data']): ScanCoverage {
  const selected = data.files.filter((file) => file.role === 'selected');
  const support = data.files.filter((file) => file.role === 'support');
  const count = (kind: string, resolution: string) =>
    data.facts.filter((fact) => fact.kind === kind && fact.resolution === resolution).length;
  return {
    tracked_entries: data.manifest.coverage.tracked_entries,
    selected_source_files: selected.length,
    parsed_source_files: selected.filter((file) => file.status === 'parsed').length,
    failed_source_files: selected.filter((file) => file.status === 'failed').length,
    support_source_files: support.length,
    failed_support_files: support.filter((file) => file.status === 'failed').length,
    inventory_only_entries: data.manifest.coverage.tracked_entries - data.files.length,
    facts: data.facts.length,
    resolved_references: count('reference', 'resolved'),
    unresolved_references: count('reference', 'unresolved'),
    resolved_calls: count('call', 'resolved'),
    unresolved_calls: count('call', 'unresolved'),
    resolved_imports: count('import', 'resolved'),
    unresolved_imports: count('import', 'unresolved'),
    semantic_analysis: 'not-run',
  };
}
