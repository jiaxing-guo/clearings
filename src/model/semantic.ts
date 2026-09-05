import type { Declaration, Evidence, ScanCoverage, ScanDiagnostic, SourceUnit } from './structural.js';

export interface EvidenceExcerpt extends Evidence { path: string; text: string }
export interface ProposalRequest {
  schema_version: '0.1.0'; command: 'propose'; status: 'complete' | 'partial';
  snapshot_id: string; request_id: string;
  data: {
    scan_artifact_id: string;
    scope: { instruction: string; paths: string[] };
    max_bytes: number;
    instructions: string;
    files: SourceUnit[];
    symbols: Declaration[];
    evidence: EvidenceExcerpt[];
    scan_coverage: ScanCoverage;
  };
  diagnostics: ScanDiagnostic[];
  coverage: { scope_files: number; evidence_records: number; omitted_scope_evidence: number };
}
export type SemanticKind = 'concept' | 'claim' | 'relation' | 'flow' | 'step' | 'function' | 'behavior' | 'unknown';
export interface Concept {
  id: string; kind: 'component' | 'capability' | 'state' | 'external';
  alias: string; title: string; description: string;
  evidence_ids: string[]; symbol_ids: string[];
}
export interface Claim {
  id: string; text: string; subject_ids: string[]; evidence_ids: string[];
  category: 'purpose' | 'behavior' | 'state' | 'effect' | 'failure' | 'constraint';
}
export interface Relation {
  id: string; kind: 'contains' | 'exposes' | 'implements' | 'depends_on' | 'reads' | 'writes' | 'invokes' | 'produces' | 'constrained_by';
  from_id: string; to_id: string; evidence_ids: string[];
}
export interface FlowStep {
  id: string; title: string; kind: 'action' | 'branch' | 'repeat' | 'failure' | 'unresolved';
  claim_ids: string[]; evidence_ids: string[];
  next: { step_id: string; condition: string | null; evidence_ids: string[] }[];
}
export interface CapabilityFlow {
  id: string; capability_id: string; entry_symbol_ids: string[]; entry_step_ids: string[];
  steps: FlowStep[];
}
export interface SemanticProposal {
  schema_version: '0.1.0'; command: 'proposal'; snapshot_id: string; request_id: string;
  producer: { kind: 'agent' | 'human'; name: string; model: string | null; input_tokens: number | null; output_tokens: number | null };
  data: {
    concepts: Concept[]; claims: Claim[]; relations: Relation[]; flows: CapabilityFlow[];
    unknowns: { subject_id: string; question: string; critical: boolean; evidence_ids: string[] }[];
  };
}
export interface SemanticModel {
  schema_version: '0.1.0'; command: 'import'; status: 'complete' | 'partial';
  snapshot_id: string; artifact_id: string;
  data: {
    transport: 'file-exchange' | 'recorded-replay';
    request: ProposalRequest; proposal: SemanticProposal; proposal_id: string;
    claim_checks: { claim_id: string; origin: 'model-inference' | 'human-declaration'; citations: 'valid'; verification: 'unknown'; acceptance: 'proposed' }[];
  };
  diagnostics: ScanDiagnostic[];
  coverage: { capabilities: number; claims: number; cited_evidence_records: number; unknowns: number; claim_support: 'not-reviewed' };
}
