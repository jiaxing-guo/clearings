import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from '../model/types.js';
import type { ProposalRequest, SemanticProposal, SemanticModel } from '../model/semantic.js';
import type { ScanResult } from '../model/structural.js';
import { validateScan } from '../model/validate-scan.js';
import { canonical, compare } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { contentId, digest } from './identity.js';

const ajv = new Ajv({ strict: true, allErrors: true });
for (const name of ['inventory', 'scan', 'semantic']) ajv.addSchema(JSON.parse(readFileSync(new URL(`../../schemas/${name}.v0.1.json`, import.meta.url), 'utf8')), `${name}.v0.1.json`);
const requestSchema = ajv.compile<ProposalRequest>({ $ref: 'semantic.v0.1.json#/definitions/Request' });
const proposalSchema = ajv.compile<SemanticProposal>({ $ref: 'semantic.v0.1.json#/definitions/Proposal' });
const modelSchema = ajv.compile<SemanticModel>({ $ref: 'semantic.v0.1.json#/definitions/Model' });
export function invalid(message: string): never { throw new ClearingsError('INVALID_SEMANTICS', message); }
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function unique(ids: string[], label: string): void { if (new Set(ids).size !== ids.length) invalid(`Duplicate ${label}.`); }
export interface SourceValidation { scan?: ScanResult; repository?: string }

export function validateRequest(value: unknown, options: SourceValidation = {}): asserts value is ProposalRequest {
  if (!requestSchema(value)) invalid(`Invalid request schema: ${requestSchema.errors?.[0]?.instancePath} ${requestSchema.errors?.[0]?.message}`);
  if (value.request_id !== contentId(value)) invalid('Request digest mismatch.');
  if (Buffer.byteLength(JSON.stringify(value, null, 2) + '\n') > value.data.max_bytes) invalid('Request exceeds its byte budget.');
  const { files, symbols, evidence, scope } = value.data;
  unique(files.map((file) => file.id), 'request file'); unique(files.map((file) => file.path), 'request path');
  unique(symbols.map((symbol) => symbol.id), 'request symbol'); unique(evidence.map((item) => item.id), 'request evidence');
  if (!same(files.map((file) => file.path).sort(compare), [...scope.paths].sort(compare)) || value.coverage.scope_files !== files.length || value.coverage.evidence_records !== evidence.length) invalid('Request scope/coverage mismatch.');
  const fileMap = new Map(files.map((file) => [file.id, file]));
  for (const item of evidence) {
    const file = fileMap.get(item.file_id);
    const { path, text, id, ...anchor } = item;
    if (!file || file.status !== 'parsed' || path !== file.path || item.snapshot_id !== value.snapshot_id || !file.project_ids.includes(item.project_id) || file.blob_sha !== item.blob_sha || file.content_sha256 !== item.content_sha256) invalid('Request evidence source mismatch.');
    if (digest('evidence', anchor) !== id || sha256(text) !== item.span_sha256 || Buffer.byteLength(text) !== item.end_byte - item.start_byte || item.end_byte > file.size_bytes) invalid('Invalid request excerpt/hash.');
  }
  if (symbols.some((symbol) => !fileMap.get(symbol.file_id)?.project_ids.includes(symbol.project_id))) invalid('Request symbol outside source scope.');
  if (value.status !== (value.diagnostics.some((item) => item.severity === 'error') ? 'partial' : 'complete')) invalid('Request status mismatch.');
  if (options.repository && !options.scan) invalid('Source revalidation requires the structural scan.');
  if (options.scan) {
    const scan = options.scan; validateScan(scan, options.repository ? { repository: options.repository } : {});
    if (scan.artifact_id !== value.data.scan_artifact_id || scan.snapshot_id !== value.snapshot_id || !same(scan.coverage, value.data.scan_coverage) || !same(scan.diagnostics, value.diagnostics)) invalid('Request belongs to a different structural scan.');
    const actualFiles = new Map(scan.data.files.map((file) => [file.id, file]));
    const actualEvidence = new Map(scan.data.evidence.map((item) => [item.id, item]));
    const actualSymbols = new Map(scan.data.symbols.map((symbol) => [symbol.id, symbol]));
    for (const file of files) if (!same(actualFiles.get(file.id) ?? null, file)) invalid('Request file differs from scan.');
    for (const { path: _, text: __, ...anchor } of evidence) if (!same(actualEvidence.get(anchor.id) ?? null, anchor)) invalid('Request evidence differs from scan.');
    for (const symbol of symbols) {
      const anchor = actualEvidence.get(symbol.evidence_id);
      if (!same(actualSymbols.get(symbol.id) ?? null, symbol) || !anchor || !evidence.some((item) => item.file_id === anchor.file_id && item.project_id === anchor.project_id && item.start_byte <= anchor.start_byte && item.end_byte >= anchor.end_byte)) invalid('Request symbol is not covered by its excerpts.');
    }
    const available = scan.data.evidence.filter((item) => fileMap.has(item.file_id)).length;
    if (value.coverage.omitted_scope_evidence !== available - evidence.length) invalid('Omitted evidence count mismatch.');
  }
}

export function validateProposal(value: unknown, request: ProposalRequest): asserts value is SemanticProposal {
  validateRequest(request);
  if (!proposalSchema(value)) invalid(`Invalid proposal schema: ${proposalSchema.errors?.[0]?.instancePath} ${proposalSchema.errors?.[0]?.message}`);
  if (value.request_id !== request.request_id || value.snapshot_id !== request.snapshot_id) invalid('Proposal request/snapshot mismatch.');
  const { concepts, claims, relations, flows, unknowns } = value.data;
  unique([...concepts, ...claims, ...relations, ...flows, ...flows.flatMap((flow) => flow.steps)].map((item) => item.id), 'semantic ID');
  unique(concepts.map((item) => item.alias), 'concept alias'); unique(flows.map((flow) => flow.capability_id), 'capability flow');
  const conceptMap = new Map(concepts.map((item) => [item.id, item]));
  const claimMap = new Map(claims.map((item) => [item.id, item]));
  const evidence = new Set(request.data.evidence.map((item) => item.id));
  const symbols = new Map(request.data.symbols.map((item) => [item.id, item]));
  const checkEvidence = (ids: string[]) => { if (ids.some((id) => !evidence.has(id))) invalid('Citation was not supplied in this request.'); };
  const checkSymbols = (ids: string[]) => { if (ids.some((id) => !symbols.has(id))) invalid('Unknown request symbol.'); };
  for (const concept of concepts) { checkEvidence(concept.evidence_ids); checkSymbols(concept.symbol_ids); }
  for (const claim of claims) { checkEvidence(claim.evidence_ids); if (claim.subject_ids.some((id) => !conceptMap.has(id))) invalid('Unknown claim subject.'); }
  for (const relation of relations) {
    checkEvidence(relation.evidence_ids);
    const from = conceptMap.get(relation.from_id); const to = conceptMap.get(relation.to_id);
    if (!from || !to) invalid('Unknown relation endpoint.');
    if (['reads', 'writes'].includes(relation.kind) && to.kind !== 'state') invalid('Read/write relations must target state.');
    if (relation.kind === 'implements' && (from.kind !== 'component' || to.kind !== 'capability')) invalid('Implementation relations connect components to capabilities.');
    if (relation.kind === 'exposes' && (from.kind !== 'component' || to.kind !== 'capability')) invalid('Exposure relations connect components to capabilities.');
  }
  for (const flow of flows) {
    if (conceptMap.get(flow.capability_id)?.kind !== 'capability') invalid('Flow owner must be a capability.');
    checkSymbols(flow.entry_symbol_ids);
    const steps = new Map(flow.steps.map((step) => [step.id, step]));
    if (flow.entry_step_ids.some((id) => !steps.has(id))) invalid('Unknown flow entry.');
    for (const step of flow.steps) {
      checkEvidence(step.evidence_ids);
      if (step.claim_ids.some((id) => !claimMap.get(id)?.subject_ids.includes(flow.capability_id))) invalid('Flow claims must describe its capability.');
      if (step.kind === 'branch' && (step.next.length < 2 || step.next.some((edge) => edge.condition === null))) invalid('Branches require at least two labeled alternatives.');
      for (const edge of step.next) { checkEvidence(edge.evidence_ids); if (!steps.has(edge.step_id)) invalid('Flow edge leaves its flow.'); }
    }
    const reached = new Set<string>(); const pending = [...flow.entry_step_ids];
    while (pending.length) { const id = pending.pop()!; if (reached.has(id)) continue; reached.add(id); pending.push(...steps.get(id)!.next.map((edge) => edge.step_id)); }
    if (reached.size !== steps.size) invalid('Flow has unreachable steps.');
  }
  if (concepts.some((item) => item.kind === 'capability' && !flows.some((flow) => flow.capability_id === item.id))) invalid('Every capability requires a flow.');
  for (const item of unknowns) { checkEvidence(item.evidence_ids); if (!conceptMap.has(item.subject_id)) invalid('Unknown uncertainty subject.'); }
}

export function modelFields(proposal: SemanticProposal, request: ProposalRequest): Pick<SemanticModel, 'status' | 'diagnostics' | 'coverage'> & { claim_checks: SemanticModel['data']['claim_checks'] } {
  const cited = new Set<string>();
  for (const item of [...proposal.data.concepts, ...proposal.data.claims, ...proposal.data.relations, ...proposal.data.unknowns, ...proposal.data.flows.flatMap((flow) => flow.steps.flatMap((step) => [step, ...step.next]))]) item.evidence_ids.forEach((id) => cited.add(id));
  return {
    status: request.status === 'partial' || proposal.data.unknowns.some((item) => item.critical) ? 'partial' : 'complete',
    diagnostics: request.diagnostics,
    coverage: { capabilities: proposal.data.flows.length, claims: proposal.data.claims.length, cited_evidence_records: cited.size, unknowns: proposal.data.unknowns.length, claim_support: 'not-reviewed' },
    claim_checks: proposal.data.claims.map((claim) => ({ claim_id: claim.id, origin: proposal.producer.kind === 'agent' ? 'model-inference' : 'human-declaration', citations: 'valid', verification: 'unknown', acceptance: 'proposed' })),
  };
}
export function validateSemanticModel(value: unknown, options: SourceValidation = {}): asserts value is SemanticModel {
  if (!modelSchema(value)) invalid(`Invalid semantic model schema: ${modelSchema.errors?.[0]?.instancePath} ${modelSchema.errors?.[0]?.message}`);
  const { request, proposal } = value.data;
  validateRequest(request, options); validateProposal(proposal, request);
  if (value.snapshot_id !== request.snapshot_id || value.artifact_id !== contentId(value) || value.data.proposal_id !== digest('proposal', proposal)) invalid('Semantic model digest/snapshot mismatch.');
  const fields = modelFields(proposal, request);
  if (!same(fields.claim_checks, value.data.claim_checks) || !same(fields.coverage, value.coverage) || !same(fields.diagnostics, value.diagnostics) || value.status !== fields.status) invalid('Semantic model status/coverage/check mismatch.');
}
