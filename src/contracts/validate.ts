import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import type { ContractRequest, ContractProposal, ContractModel } from '../model/contracts.js';
import type { SemanticProposal } from '../model/semantic.js';
import { validateRequest, validateProposal, modelFields, invalid, type SourceValidation } from '../semantics/validate.js';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { contentId, digest } from '../semantics/identity.js';
import { observeCallables } from './callables.js';

const ajv = new Ajv({ strict: true, allErrors: true });
for (const name of ['inventory.v0.1', 'scan.v0.1', 'semantic.v0.1', 'semantic.v0.2']) ajv.addSchema(JSON.parse(readFileSync(new URL(`../../schemas/${name}.json`, import.meta.url), 'utf8')), `${name}.json`);
const requestSchema = ajv.compile<ContractRequest>({ $ref: 'semantic.v0.2.json#/definitions/Request' });
const proposalSchema = ajv.compile<ContractProposal>({ $ref: 'semantic.v0.2.json#/definitions/Proposal' });
const modelSchema = ajv.compile<ContractModel>({ $ref: 'semantic.v0.2.json#/definitions/Model' });
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) invalid('Duplicate contract record or alias.'); };

export function validateContractRequest(value: unknown, options: SourceValidation = {}): asserts value is ContractRequest {
  if (!requestSchema(value)) invalid(`Invalid contract request schema: ${requestSchema.errors?.[0]?.instancePath} ${requestSchema.errors?.[0]?.message}`);
  const source = value.data.source_request;
  validateRequest(source, options);
  if (value.request_id !== contentId(value) || value.snapshot_id !== source.snapshot_id) invalid('Contract request digest/snapshot mismatch.');
  if (Buffer.byteLength(JSON.stringify(value, null, 2) + '\n') > value.data.max_bytes) invalid('Contract request exceeds its byte budget.');
  unique(value.data.callables.map(item => item.id));
  const symbols = new Map(source.data.symbols.map(item => [item.id, item]));
  for (const callable of value.data.callables) {
    const { id, ...body } = callable;
    const excerpt = source.data.evidence.find(item => item.id === callable.evidence_id);
    if (id !== digest('callable', body) || !excerpt || callable.start_byte < excerpt.start_byte || callable.end_byte > excerpt.end_byte || callable.start_byte >= callable.end_byte) invalid('Invalid callable implementation anchor.');
    const bytes = Buffer.from(excerpt.text).subarray(callable.start_byte - excerpt.start_byte, callable.end_byte - excerpt.start_byte);
    if (sha256(bytes) !== callable.span_sha256 || Buffer.from(bytes.toString('utf8')).compare(bytes) !== 0) invalid('Invalid callable implementation bytes.');
    for (const symbolId of [callable.symbol_id, callable.enclosing_symbol_id]) {
      if (symbolId !== null && (symbols.get(symbolId)?.file_id !== excerpt.file_id || symbols.get(symbolId)?.project_id !== excerpt.project_id)) invalid('Callable symbol is outside its source.');
    }
  }
  if (options.scan && options.repository && !same(value.data.callables, observeCallables(options.scan, source, options.repository))) invalid('Callable observations differ from pinned source syntax.');
}

/** Use the existing record rules internally. This projection is never an artifact or migration. */
function coreProposal(proposal: ContractProposal, request: ContractRequest): SemanticProposal {
  const { functions, behaviors, unknowns, ...core } = proposal.data;
  const subjects = new Map([...functions.map(f => [f.id, f.component_id] as const), ...behaviors.map(b => [b.id, b.capability_id] as const)]);
  return { ...proposal, schema_version: '0.1.0', request_id: request.data.source_request.request_id,
    data: { ...core, unknowns: unknowns.map(({ id: _, ...u }) => ({ ...u, subject_id: subjects.get(u.subject_id) ?? u.subject_id })) } };
}

export function assertionIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') for (const [key, field] of Object.entries(v)) {
      if (key === 'claim_ids' || key.endsWith('_claim_ids')) {
        if (Array.isArray(field)) for (const id of field) if (typeof id === 'string') found.add(id);
      } else visit(field);
    }
  };
  visit(value); return [...found].sort();
}

export function validateContractProposal(value: unknown, request: ContractRequest): asserts value is ContractProposal {
  validateContractRequest(request);
  if (!proposalSchema(value)) invalid(`Invalid contract proposal schema: ${proposalSchema.errors?.[0]?.instancePath} ${proposalSchema.errors?.[0]?.message}`);
  if (value.request_id !== request.request_id || value.snapshot_id !== request.snapshot_id) invalid('Contract proposal request/snapshot mismatch.');
  validateProposal(coreProposal(value, request), request.data.source_request);
  const { concepts, claims, flows, functions, behaviors, unknowns } = value.data;
  unique([...concepts, ...claims, ...value.data.relations, ...flows, ...flows.flatMap(f => f.steps), ...functions, ...behaviors, ...unknowns].map(item => item.id));
  unique([...concepts, ...functions, ...behaviors].map(item => item.alias));
  const cm = new Map(concepts.map(item => [item.id, item])); const fm = new Map(functions.map(item => [item.id, item]));
  const bm = new Map(behaviors.map(item => [item.id, item])); const um = new Map(unknowns.map(item => [item.id, item]));
  const claimMap = new Map(claims.map(item => [item.id, item]));
  const callables = new Map(request.data.callables.map(item => [item.id, item]));
  const endpoint = (id: string) => fm.has(id) || ['component', 'external'].includes(cm.get(id)?.kind ?? '');
  for (const record of [...functions, ...behaviors]) {
    if (assertionIds(record).some(id => !claimMap.has(id))) invalid('Contract has a dangling assertion.');
    if (record.unknown_ids.some(id => !um.has(id))) invalid('Contract has a dangling unknown.');
    for (const failure of record.failures) if (failure.destination_id !== null && !endpoint(failure.destination_id)) invalid('Invalid failure destination kind.');
  }
  const usedImplementations: string[] = [];
  for (const f of functions) {
    if (!['component', 'external'].includes(cm.get(f.component_id)?.kind ?? '')) invalid('Function owner must be a component or external system.');
    if (f.state_access.some(item => cm.get(item.state_id)?.kind !== 'state')) invalid('Function state access must target state.');
    if (f.dependencies.some(item => !endpoint(item.target_id))) invalid('Invalid function dependency kind.');
    if (f.role === 'external-callback') {
      if (f.implementation_id !== null || !f.unknown_ids.some(id => um.get(id)?.critical)) invalid('External callback needs an unknown implementation and critical uncertainty.');
    } else {
      const implementation = f.implementation_id === null ? undefined : callables.get(f.implementation_id);
      if (!implementation || implementation.role !== f.role) invalid('Function implementation role/anchor mismatch.');
      usedImplementations.push(implementation.id);
    }
    const relevant = new Set([f.id, f.component_id, ...f.state_access.map(s => s.state_id), ...f.dependencies.map(d => d.target_id)]);
    for (const id of f.unknown_ids) if (!relevant.has(um.get(id)!.subject_id)) invalid('Function unknown is unrelated to its contract.');
  }
  unique(usedImplementations);
  for (const b of behaviors) {
    const flow = flows.find(f => f.id === b.flow_id);
    if (cm.get(b.capability_id)?.kind !== 'capability' || flow?.capability_id !== b.capability_id) invalid('Behavior flow must belong to its capability.');
    if (b.step_ids.some(id => !flow.steps.some(step => step.id === id))) invalid('Behavior step is outside its flow.');
    if (b.function_ids.some(id => !fm.has(id)) || b.state_ids.some(id => cm.get(id)?.kind !== 'state')) invalid('Invalid behavior participant kind.');
    const relevant = new Set([b.id, b.capability_id, ...b.function_ids, ...b.state_ids, ...b.function_ids.map(id => fm.get(id)!.component_id)]);
    for (const id of b.unknown_ids) if (!relevant.has(um.get(id)!.subject_id)) invalid('Behavior unknown is unrelated to its contract.');
  }
  if (concepts.some(c => c.kind === 'capability' && !behaviors.some(b => b.capability_id === c.id))) invalid('Every capability requires a behavior contract.');
  for (const u of unknowns) if (!cm.has(u.subject_id) && !fm.has(u.subject_id) && !bm.has(u.subject_id)) invalid('Unknown contract uncertainty subject.');
}
export function contractFields(proposal: ContractProposal, request: ContractRequest) {
  const fields = modelFields(coreProposal(proposal, request), request.data.source_request);
  return { ...fields, coverage: { ...fields.coverage, functions: proposal.data.functions.length, behaviors: proposal.data.behaviors.length, callable_observations: request.data.callables.length } };
}
export function validateContractModel(value: unknown, options: SourceValidation = {}): asserts value is ContractModel {
  if (!modelSchema(value)) invalid(`Invalid contract model schema: ${modelSchema.errors?.[0]?.instancePath} ${modelSchema.errors?.[0]?.message}`);
  validateContractRequest(value.data.request, options); validateContractProposal(value.data.proposal, value.data.request);
  if (value.snapshot_id !== value.data.request.snapshot_id || value.artifact_id !== contentId(value) || value.data.proposal_id !== digest('proposal', value.data.proposal)) invalid('Contract model digest/snapshot mismatch.');
  const fields = contractFields(value.data.proposal, value.data.request);
  if (!same(fields.claim_checks, value.data.claim_checks) || !same(fields.coverage, value.coverage) || !same(fields.diagnostics, value.diagnostics) || fields.status !== value.status) invalid('Contract model check/coverage mismatch.');
}
