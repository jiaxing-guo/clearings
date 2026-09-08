import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from './types.js';
import type { Evidence, ScanResult } from './structural.js';
import { validateInventory } from './validate.js';
import { artifactId, recordId, scanCoverage } from '../analysis/identity.js';
import { canonical, compare, inventory } from '../repository/inventory.js';
import { SourceStore, sha256 } from '../repository/source.js';

const ajv = new Ajv({ strict: true, allErrors: true });
ajv.addSchema(
  JSON.parse(readFileSync(new URL('../../schemas/inventory.v0.1.json', import.meta.url), 'utf8')),
  'inventory.v0.1.json',
);
const check = ajv.compile<ScanResult>(
  JSON.parse(readFileSync(new URL('../../schemas/scan.v0.1.json', import.meta.url), 'utf8')),
);
function fail(message: string): never {
  throw new ClearingsError('INVALID_SCAN', message);
}
const withoutId = <T extends { id: string }>(value: T): Omit<T, 'id'> => {
  const { id: _, ...body } = value;
  return body;
};

export function validateScan(
  value: unknown,
  options: { repository?: string } = {},
): asserts value is ScanResult {
  if (!check(value))
    throw new ClearingsError(
      'INVALID_SCHEMA',
      `Scan does not match schema 0.1.0: ${check.errors?.[0]?.instancePath || '/'} ${check.errors?.[0]?.message ?? ''}`,
    );
  validateInventory(value.data.manifest);
  const { data, snapshot_id } = value;
  if (snapshot_id !== data.manifest.snapshot_id || value.artifact_id !== artifactId(value))
    fail('Snapshot or artifact digest mismatch.');
  if (canonical(value.coverage) !== canonical(scanCoverage(data)))
    fail('Coverage does not match structural records.');
  if (
    value.status !==
    (value.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'partial'
      : 'complete')
  )
    fail('Status does not match diagnostics.');
  const entries = new Map(data.manifest.data.files.map((file) => [file.path, file]));
  const files = new Map(data.files.map((file) => [file.id, file]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const reads = new Map(data.reads.map((read) => [read.path, read]));
  const evidence = new Map(data.evidence.map((item) => [item.id, item]));
  const symbols = new Map(data.symbols.map((symbol) => [symbol.id, symbol]));
  const sortedUnique = (values: string[]) => {
    if (values.some((value, i) => i > 0 && compare(values[i - 1]!, value) >= 0))
      fail('Record collections must be sorted and unique.');
  };
  for (const records of [data.projects, data.symbols, data.evidence, data.facts])
    sortedUnique(records.map((record) => record.id));
  for (const records of [data.files, data.reads])
    sortedUnique(records.map((record) => record.path));
  sortedUnique(value.diagnostics.map(canonical));
  if (
    value.diagnostics.some(
      (diagnostic) => diagnostic.project_id !== null && !projects.has(diagnostic.project_id),
    )
  )
    fail('Dangling diagnostic project reference.');
  for (const read of data.reads) {
    const entry = entries.get(read.path);
    if (
      !entry ||
      !['100644', '100755'].includes(entry.mode) ||
      entry.reason === 'explicit-exclusion' ||
      entry.object_id !== read.blob_sha ||
      entry.size_bytes !== read.size_bytes
    )
      fail('Source read does not match the manifest.');
  }
  const selected = data.manifest.data.files
    .filter(
      (file) => file.status === 'inventoried' && ['source', 'declaration'].includes(file.kind),
    )
    .map((file) => file.path);
  if (
    canonical(selected) !==
    canonical(data.files.filter((file) => file.role === 'selected').map((file) => file.path))
  )
    fail('Selected source denominator differs from the inventory.');
  const assigned: string[] = [];
  for (const project of data.projects) {
    if (project.id !== recordId('project', [snapshot_id, project.config_path]))
      fail('Project ID mismatch.');
    if (
      project.config_path !== null &&
      project.config_sha256 !== (reads.get(project.config_path)?.content_sha256 ?? null)
    )
      fail('Project configuration digest mismatch.');
    if (project.references.some((id) => !projects.has(id))) fail('Dangling project reference.');
    sortedUnique(project.references);
    sortedUnique(project.source_files);
    sortedUnique(project.selected_files);
    if (
      project.source_files.some((path) => !entries.has(path)) ||
      project.selected_files.some(
        (path) => !project.source_files.includes(path) || !selected.includes(path),
      )
    )
      fail('Invalid project source membership.');
    assigned.push(...project.selected_files);
  }
  if (canonical(assigned.sort(compare)) !== canonical(selected))
    fail('Each selected file must have exactly one extraction project.');
  for (const file of data.files) {
    const entry = entries.get(file.path);
    const read = reads.get(file.path);
    if (
      !entry ||
      file.id !== recordId('file', [snapshot_id, file.path, entry.object_id]) ||
      file.blob_sha !== entry.object_id ||
      file.size_bytes !== entry.size_bytes
    )
      fail('File identity does not match its manifest entry.');
    if (!['source', 'declaration'].includes(entry.kind))
      fail('Structural units must be source files.');
    if (file.status === 'parsed' && (!read || file.content_sha256 !== read.content_sha256))
      fail('Parsed source has no matching content read.');
    if (file.content_sha256 !== null && file.content_sha256 !== read?.content_sha256)
      fail('Source content digest mismatch.');
    sortedUnique(file.project_ids);
    if (!file.project_ids.length || file.project_ids.some((id) => !projects.has(id)))
      fail('Source has an invalid project assignment.');
    if (
      file.status === 'failed' &&
      !value.diagnostics.some(
        (diagnostic) => diagnostic.path === file.path && diagnostic.severity === 'error',
      )
    )
      fail('Failed source requires an explicit error.');
  }
  for (const item of data.evidence) {
    const file = files.get(item.file_id);
    if (
      !file ||
      file.status !== 'parsed' ||
      item.snapshot_id !== snapshot_id ||
      !file.project_ids.includes(item.project_id) ||
      item.blob_sha !== file.blob_sha ||
      item.content_sha256 !== file.content_sha256
    )
      fail('Evidence does not match its source snapshot.');
    if (
      item.start_byte > item.end_byte ||
      item.end_byte > file.size_bytes ||
      item.start_line > item.end_line ||
      (item.start_line === item.end_line && item.start_column > item.end_column)
    )
      fail('Invalid evidence span.');
    if (item.id !== recordId('evidence', withoutId(item))) fail('Evidence ID mismatch.');
  }
  for (const symbol of data.symbols) {
    const item = evidence.get(symbol.evidence_id);
    if (
      !item ||
      item.file_id !== symbol.file_id ||
      item.project_id !== symbol.project_id ||
      symbol.id !== recordId('symbol', withoutId(symbol))
    )
      fail('Invalid declaration evidence or ID.');
  }
  for (const fact of data.facts) {
    const subject = files.get(fact.subject_id) ?? symbols.get(fact.subject_id);
    const target =
      fact.target_id === null ? null : (files.get(fact.target_id) ?? symbols.get(fact.target_id));
    const subjectFile = subject && ('path' in subject ? subject : files.get(subject.file_id));
    if (
      !subject ||
      !subjectFile ||
      subjectFile.role !== 'selected' ||
      subjectFile.status !== 'parsed' ||
      !projects.get(fact.project_id)?.selected_files.includes(subjectFile.path) ||
      !subjectFile.project_ids.includes(fact.project_id)
    )
      fail(
        'Fact subject must be a parsed selected source or declaration in its extraction project.',
      );
    if (fact.target_id !== null && !target) fail('Dangling fact target.');
    if (
      target &&
      ('project_id' in target
        ? target.project_id !== fact.project_id
        : !target.project_ids.includes(fact.project_id))
    )
      fail('Fact target belongs to a different project program.');
    if (
      fact.evidence_ids.some(
        (id) =>
          evidence.get(id)?.project_id !== fact.project_id ||
          evidence.get(id)?.file_id !== subjectFile.id,
      )
    )
      fail('Fact evidence must belong to its source and project.');
    if (fact.resolution === 'resolved' && (!target || fact.reason !== null))
      fail('Resolved fact requires a target and no unresolved reason.');
    if (fact.resolution === 'unresolved' && (target || !fact.reason))
      fail('Unresolved fact requires a reason and no exact target.');
    if (
      fact.resolution === 'observed' &&
      (fact.kind !== 'declaration' || target || fact.reason !== null)
    )
      fail('Only declaration observations may omit resolution.');
    if (fact.kind === 'call' && target && !symbols.has(fact.target_id!))
      fail('Call target must be a declaration.');
    if (fact.id !== recordId('fact', withoutId(fact))) fail('Fact ID mismatch.');
  }
  if (options.repository) verifySources(value, options.repository);
}

/** A sparse byte/UTF-16 index: ASCII needs no adjustment entries. */
class SourceText {
  readonly bytes: Buffer;
  private readonly lineStarts = [0];
  private readonly adjustmentEnds: number[] = [];
  private readonly adjustments: number[] = [];

  constructor(text: string) {
    this.bytes = Buffer.from(text);
    let byte = 0;
    for (let offset = 0; offset < text.length;) {
      const code = text.codePointAt(offset)!;
      const units = code > 0xffff ? 2 : 1;
      const width = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      byte += width;
      offset += units;
      if (width !== units) {
        this.adjustmentEnds.push(byte);
        this.adjustments.push(byte - offset);
      }
      if (
        code === 10 ||
        code === 0x2028 ||
        code === 0x2029 ||
        (code === 13 && text.charCodeAt(offset) !== 10)
      )
        this.lineStarts.push(offset);
    }
  }

  position(byte: number): [number, number] {
    if (
      byte < 0 ||
      byte > this.bytes.length ||
      (byte < this.bytes.length && (this.bytes[byte]! & 0xc0) === 0x80)
    )
      fail('Evidence offset splits a UTF-8 codepoint.');
    const offset = byte - (this.adjustments[upperBound(this.adjustmentEnds, byte) - 1] ?? 0);
    const line = upperBound(this.lineStarts, offset) - 1;
    return [line + 1, offset - this.lineStarts[line]! + 1];
  }
}

function upperBound(values: number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function verifySources(result: ScanResult, repository: string): Map<string, SourceText> {
  const original = result.data.manifest;
  const actual = inventory({
    repository,
    ref: original.data.snapshot.commit_sha,
    include: original.data.scope.include,
    exclude: original.data.scope.exclude,
    expectedTree: original.data.snapshot.tree_sha,
  });
  if (actual.snapshot_id !== original.snapshot_id)
    fail('Repository inventory differs from the declared snapshot.');
  const store = new SourceStore(repository, actual, result.data.adapter);
  for (const read of result.data.reads) {
    const text = store.read(read.path, read.purpose);
    if (sha256(text) !== read.content_sha256) fail(`Stale source content: ${read.path}`);
  }
  const files = new Map(result.data.files.map((file) => [file.id, file]));
  const sources = new Map<string, SourceText>();
  for (const item of result.data.evidence) {
    if (!sources.has(item.file_id))
      sources.set(
        item.file_id,
        new SourceText(store.read(files.get(item.file_id)!.path, 'source')),
      );
    evidenceText(sources, item);
  }
  return sources;
}

function evidenceText(sources: Map<string, SourceText>, item: Evidence): string {
  const source = sources.get(item.file_id)!;
  if (
    canonical(source.position(item.start_byte)) !==
      canonical([item.start_line, item.start_column]) ||
    canonical(source.position(item.end_byte)) !== canonical([item.end_line, item.end_column])
  )
    fail('Evidence line/column does not match source bytes.');
  const span = source.bytes.subarray(item.start_byte, item.end_byte);
  if (sha256(span) !== item.span_sha256) fail('Evidence span hash mismatch.');
  return span.toString('utf8');
}

/** Verify once and retain immutable evidence/byte indexes for bounded retrieval. */
export function createEvidenceReader(
  result: ScanResult,
  repository: string,
): { read: (evidenceId: string) => string } {
  validateScan(result);
  const sources = verifySources(result, repository);
  const evidence = new Map(result.data.evidence.map((item) => [item.id, { ...item }]));
  return Object.freeze({
    read(evidenceId: string): string {
      const item = evidence.get(evidenceId);
      if (!item) throw new ClearingsError('UNKNOWN_EVIDENCE', 'Evidence ID is not in this scan.');
      return evidenceText(sources, item);
    },
  });
}

/** Resolve and verify an evidence span against immutable source, never the working tree. */
export function readEvidence(result: ScanResult, repository: string, evidenceId: string): string {
  return createEvidenceReader(result, repository).read(evidenceId);
}
