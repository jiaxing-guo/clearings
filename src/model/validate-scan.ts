import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from './types.js';
import type { Evidence, ScanResult } from './structural.js';
import { validateInventory } from './validate.js';
import { artifactId, recordId, scanCoverage } from '../analysis/identity.js';
import { canonical, compare, inventory } from '../repository/inventory.js';
import { SourceStore, sha256 } from '../repository/source.js';

const ajv = new Ajv({ strict: true, allErrors: true });
ajv.addSchema(JSON.parse(readFileSync(new URL('../../schemas/inventory.v0.1.json', import.meta.url), 'utf8')), 'inventory.v0.1.json');
const check = ajv.compile<ScanResult>(JSON.parse(readFileSync(new URL('../../schemas/scan.v0.1.json', import.meta.url), 'utf8')));
function fail(message: string): never { throw new ClearingsError('INVALID_SCAN', message); }
const withoutId = <T extends { id: string }>(value: T): Omit<T, 'id'> => { const { id: _, ...body } = value; return body; };

export function validateScan(value: unknown, options: { repository?: string } = {}): asserts value is ScanResult {
  if (!check(value)) throw new ClearingsError('INVALID_SCHEMA', `Scan does not match schema 0.1.0: ${check.errors?.[0]?.instancePath || '/'} ${check.errors?.[0]?.message ?? ''}`);
  validateInventory(value.data.manifest);
  const { data, snapshot_id } = value;
  if (snapshot_id !== data.manifest.snapshot_id || value.artifact_id !== artifactId(value)) fail('Snapshot or artifact digest mismatch.');
  if (canonical(value.coverage) !== canonical(scanCoverage(data))) fail('Coverage does not match structural records.');
  if (value.status !== (value.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'partial' : 'complete')) fail('Status does not match diagnostics.');
  const entries = new Map(data.manifest.data.files.map((file) => [file.path, file]));
  const files = new Map(data.files.map((file) => [file.id, file]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const reads = new Map(data.reads.map((read) => [read.path, read]));
  const evidence = new Map(data.evidence.map((item) => [item.id, item]));
  const symbols = new Map(data.symbols.map((symbol) => [symbol.id, symbol]));
  const sortedUnique = (values: string[]) => {
    if (values.some((value, i) => i > 0 && compare(values[i - 1]!, value) >= 0)) fail('Record collections must be sorted and unique.');
  };
  for (const records of [data.projects, data.symbols, data.evidence, data.facts]) sortedUnique(records.map((record) => record.id));
  for (const records of [data.files, data.reads]) sortedUnique(records.map((record) => record.path));
  sortedUnique(value.diagnostics.map(canonical));
  for (const read of data.reads) {
    const entry = entries.get(read.path);
    if (!entry || !['100644', '100755'].includes(entry.mode) || entry.reason === 'explicit-exclusion' || entry.object_id !== read.blob_sha || entry.size_bytes !== read.size_bytes) fail('Source read does not match the manifest.');
  }
  const selected = data.manifest.data.files.filter((file) => file.status === 'inventoried' && ['source', 'declaration'].includes(file.kind)).map((file) => file.path);
  if (canonical(selected) !== canonical(data.files.filter((file) => file.role === 'selected').map((file) => file.path))) fail('Selected source denominator differs from the inventory.');
  const assigned: string[] = [];
  for (const project of data.projects) {
    if (project.id !== recordId('project', [snapshot_id, project.config_path])) fail('Project ID mismatch.');
    if (project.config_path !== null && project.config_sha256 !== (reads.get(project.config_path)?.content_sha256 ?? null)) fail('Project configuration digest mismatch.');
    if (project.references.some((id) => !projects.has(id))) fail('Dangling project reference.');
    sortedUnique(project.references); sortedUnique(project.source_files); sortedUnique(project.selected_files);
    if (project.source_files.some((path) => !entries.has(path)) || project.selected_files.some((path) => !project.source_files.includes(path) || !selected.includes(path))) fail('Invalid project source membership.');
    assigned.push(...project.selected_files);
  }
  if (canonical(assigned.sort(compare)) !== canonical(selected)) fail('Each selected file must have exactly one extraction project.');
  for (const file of data.files) {
    const entry = entries.get(file.path); const read = reads.get(file.path);
    if (!entry || file.id !== recordId('file', [snapshot_id, file.path, entry.object_id]) || file.blob_sha !== entry.object_id || file.size_bytes !== entry.size_bytes) fail('File identity does not match its manifest entry.');
    if (!['source', 'declaration'].includes(entry.kind)) fail('Structural units must be source files.');
    if (file.status === 'parsed' && (!read || file.content_sha256 !== read.content_sha256)) fail('Parsed source has no matching content read.');
    if (file.content_sha256 !== null && file.content_sha256 !== read?.content_sha256) fail('Source content digest mismatch.');
    sortedUnique(file.project_ids);
    if (!file.project_ids.length || file.project_ids.some((id) => !projects.has(id))) fail('Source has an invalid project assignment.');
    if (file.status === 'failed' && !value.diagnostics.some((diagnostic) => diagnostic.path === file.path && diagnostic.severity === 'error')) fail('Failed source requires an explicit error.');
  }
  for (const item of data.evidence) {
    const file = files.get(item.file_id);
    if (!file || file.status !== 'parsed' || item.snapshot_id !== snapshot_id || !file.project_ids.includes(item.project_id) || item.blob_sha !== file.blob_sha || item.content_sha256 !== file.content_sha256) fail('Evidence does not match its source snapshot.');
    if (item.start_byte > item.end_byte || item.end_byte > file.size_bytes || item.start_line > item.end_line || (item.start_line === item.end_line && item.start_column > item.end_column)) fail('Invalid evidence span.');
    if (item.id !== recordId('evidence', withoutId(item))) fail('Evidence ID mismatch.');
  }
  for (const symbol of data.symbols) {
    const item = evidence.get(symbol.evidence_id);
    if (!item || item.file_id !== symbol.file_id || item.project_id !== symbol.project_id || symbol.id !== recordId('symbol', withoutId(symbol))) fail('Invalid declaration evidence or ID.');
  }
  for (const fact of data.facts) {
    const subject = files.get(fact.subject_id) ?? symbols.get(fact.subject_id);
    const target = fact.target_id === null ? null : files.get(fact.target_id) ?? symbols.get(fact.target_id);
    const subjectFile = subject && ('path' in subject ? subject : files.get(subject.file_id));
    if (!subject || !subjectFile || subjectFile.role !== 'selected' || subjectFile.status !== 'parsed' || !projects.get(fact.project_id)?.selected_files.includes(subjectFile.path) || !subjectFile.project_ids.includes(fact.project_id)) fail('Fact subject must be a parsed selected source or declaration in its extraction project.');
    if (fact.target_id !== null && !target) fail('Dangling fact target.');
    if (target && ('project_id' in target ? target.project_id !== fact.project_id : !target.project_ids.includes(fact.project_id))) fail('Fact target belongs to a different project program.');
    if (fact.evidence_ids.some((id) => evidence.get(id)?.project_id !== fact.project_id || evidence.get(id)?.file_id !== subjectFile.id)) fail('Fact evidence must belong to its source and project.');
    if (fact.resolution === 'resolved' && (!target || fact.reason !== null)) fail('Resolved fact requires a target and no unresolved reason.');
    if (fact.resolution === 'unresolved' && (target || !fact.reason)) fail('Unresolved fact requires a reason and no exact target.');
    if (fact.resolution === 'observed' && (fact.kind !== 'declaration' || target || fact.reason !== null)) fail('Only declaration observations may omit resolution.');
    if (fact.kind === 'call' && target && !symbols.has(fact.target_id!)) fail('Call target must be a declaration.');
    if (fact.id !== recordId('fact', withoutId(fact))) fail('Fact ID mismatch.');
  }
  if (options.repository) verifySources(value, options.repository);
}

function verifySources(result: ScanResult, repository: string): SourceStore {
  const original = result.data.manifest;
  const actual = inventory({ repository, ref: original.data.snapshot.commit_sha, include: original.data.scope.include, exclude: original.data.scope.exclude, expectedTree: original.data.snapshot.tree_sha });
  if (actual.snapshot_id !== original.snapshot_id) fail('Repository inventory differs from the declared snapshot.');
  const store = new SourceStore(repository, actual, result.data.adapter);
  for (const read of result.data.reads) {
    const text = store.read(read.path, read.purpose);
    if (sha256(text) !== read.content_sha256) fail(`Stale source content: ${read.path}`);
  }
  for (const item of result.data.evidence) evidenceText(result, store, item);
  return store;
}

function evidenceText(result: ScanResult, store: SourceStore, item: Evidence): string {
  const file = result.data.files.find((file) => file.id === item.file_id)!;
  const text = store.read(file.path, 'source'); const bytes = Buffer.from(text);
  const span = bytes.subarray(item.start_byte, item.end_byte);
  // Re-encoding catches boundaries that split a UTF-8 codepoint.
  if (sha256(span) !== item.span_sha256 || !Buffer.from(span.toString('utf8')).equals(span)) fail('Evidence span hash or UTF-8 boundary mismatch.');
  const position = (offset: number) => {
    const prefix = bytes.subarray(0, offset); const decoded = prefix.toString('utf8');
    if (!Buffer.from(decoded).equals(prefix)) fail('Evidence offset splits a UTF-8 codepoint.');
    const lines = decoded.split(/\r\n|\r|\n|\u2028|\u2029/);
    return [lines.length, lines[lines.length - 1]!.length + 1];
  };
  if (canonical(position(item.start_byte)) !== canonical([item.start_line, item.start_column]) || canonical(position(item.end_byte)) !== canonical([item.end_line, item.end_column])) fail('Evidence line/column does not match source bytes.');
  return span.toString('utf8');
}

/** Resolve and verify an evidence span against immutable source, never the working tree. */
export function readEvidence(result: ScanResult, repository: string, evidenceId: string): string {
  validateScan(result);
  const item = result.data.evidence.find((item) => item.id === evidenceId);
  if (!item) throw new ClearingsError('UNKNOWN_EVIDENCE', 'Evidence ID is not in this scan.');
  const store = verifySources(result, repository);
  return evidenceText(result, store, item);
}
