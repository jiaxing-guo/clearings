import { readFileSync, statSync } from 'node:fs';
import { ClearingsError } from '../model/types.js';
import type { ScanResult } from '../model/structural.js';
import { validateScan, createEvidenceReader } from '../model/validate-scan.js';
import { validateRequest, validateProposal, validateSemanticModel } from '../semantics/validate.js';
import { createProposalRequest, importProposal } from '../semantics/exchange.js';
import { renderCapability } from '../renderers/capability.js';
import { writeInventory } from '../repository/output.js';

type Values = Record<string, string | string[] | boolean | undefined>;
function required(values: Values, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || !value) throw new ClearingsError('INVALID_ARGUMENTS', `--${key} is required.`);
  return value;
}
export function readJson(path: string): unknown {
  try {
    if (statSync(path).size > 64 * 1024 * 1024) throw new Error('size');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { throw new ClearingsError('INVALID_JSON', 'Cannot read artifact JSON (maximum 64 MiB).'); }
}
function readScan(path: string): ScanResult { const value = readJson(path); validateScan(value); return value; }

export function semanticCommand(command: string, positionals: string[], values: Values): void {
  if (positionals.length !== 2) throw new ClearingsError('INVALID_ARGUMENTS', 'Semantic commands require one input artifact path.');
  const repository = required(values, 'repository');
  const input = positionals[1]!;
  let output: unknown; let markdown: string | undefined;
  process.stderr.write('Processing recorded evidence and semantic proposals; no model endpoint is invoked\n');
  if (command === 'propose') {
    const scan = readScan(input);
    output = createProposalRequest(scan, { repository, instruction: required(values, 'instruction'),
      ...(values.include ? { paths: values.include as string[] } : {}), ...(values.evidence ? { evidenceIds: values.evidence as string[] } : {}),
      ...(values['max-bytes'] ? { maxBytes: Number(values['max-bytes']) } : {}),
    });
  } else if (command === 'evidence') {
    const scan = readScan(input); const id = required(values, 'id');
    const reader = createEvidenceReader(scan, repository); const text = reader.read(id);
    const item = scan.data.evidence.find((item) => item.id === id)!;
    output = { schema_version: '0.1.0', command, status: 'complete', snapshot_id: scan.snapshot_id,
      data: { ...item, path: scan.data.files.find((file) => file.id === item.file_id)!.path, text }, diagnostics: [], coverage: { evidence_records: 1 } };
  } else if (command === 'import' || command === 'replay') {
    const scan = readScan(required(values, 'scan'));
    const request = readJson(required(values, 'request')); validateRequest(request);
    const proposal = readJson(input); validateProposal(proposal, request);
    output = importProposal(request, proposal, { scan, repository, replay: command === 'replay' });
  } else {
    const scan = readScan(required(values, 'scan')); const model = readJson(input);
    validateSemanticModel(model, { scan, repository });
    markdown = renderCapability(model, required(values, 'capability'));
  }
  const text = markdown ?? `${JSON.stringify(output, null, 2)}\n`;
  if (values.out) writeInventory(repository, required(values, 'out'), text);
  process.stdout.write(text);
}

export function validateSemanticArtifact(value: unknown, values: Values): { snapshot_id: string; coverage: unknown } {
  const scan = values.scan ? readScan(required(values, 'scan')) : undefined;
  const options = { ...(scan ? { scan } : {}), ...(values.repository ? { repository: required(values, 'repository') } : {}) };
  const command = value && typeof value === 'object' && 'command' in value ? value.command : null;
  if (command !== 'proposal' && values.request) throw new ClearingsError('INVALID_ARGUMENTS', '--request is only needed when validating a proposal response.');
  if (command === 'propose') { validateRequest(value, options); return value; }
  if (command === 'import') { validateSemanticModel(value, options); return value; }
  const request = readJson(required(values, 'request')); validateRequest(request, options);
  validateProposal(value, request);
  return { snapshot_id: value.snapshot_id, coverage: request.coverage };
}
