import type { ProposalRequest, SemanticProposal, SemanticModel } from './semantic.js';

/** Source observations. These fields describe syntax, not runtime guarantees. */
export interface CallableObservation {
  id: string; role: 'function' | 'method' | 'getter' | 'setter' | 'arrow' | 'constructor';
  name: string; symbol_id: string | null; enclosing_symbol_id: string | null;
  evidence_id: string; start_byte: number; end_byte: number; span_sha256: string;
}
export interface ContractRequest {
  schema_version: '0.2.0'; command: 'propose'; snapshot_id: string; request_id: string;
  data: { source_request: ProposalRequest; callables: CallableObservation[]; max_bytes: number; instructions: string };
}
export interface ContractUnknown {
  id: string; subject_id: string; question: string; critical: boolean; evidence_ids: string[];
}
export interface FailureBoundary {
  condition: string; destination_id: string | null; claim_ids: string[];
}
export interface FunctionContract {
  id: string; alias: string; title: string; component_id: string;
  role: CallableObservation['role'] | 'external-callback'; implementation_id: string | null;
  input_claim_ids: string[]; output_claim_ids: string[];
  state_access: { state_id: string; mode: 'read' | 'write' | 'read-write'; claim_ids: string[] }[];
  effect_claim_ids: string[]; failures: FailureBoundary[];
  dependencies: { target_id: string; claim_ids: string[] }[];
  assumption_claim_ids: string[]; unknown_ids: string[];
}
export interface BehaviorContract {
  id: string; alias: string; title: string; capability_id: string;
  trigger_claim_ids: string[]; function_ids: string[]; state_ids: string[];
  flow_id: string; step_ids: string[];
  outcomes: { condition: string; claim_ids: string[] }[];
  failures: FailureBoundary[]; constraint_claim_ids: string[]; unknown_ids: string[];
}
export interface ContractProposal extends Omit<SemanticProposal, 'schema_version' | 'data'> {
  schema_version: '0.2.0';
  data: Omit<SemanticProposal['data'], 'unknowns'> & {
    functions: FunctionContract[]; behaviors: BehaviorContract[]; unknowns: ContractUnknown[];
  };
}
export interface ContractModel extends Omit<SemanticModel, 'schema_version' | 'data' | 'coverage'> {
  schema_version: '0.2.0';
  data: Omit<SemanticModel['data'], 'request' | 'proposal'> & { request: ContractRequest; proposal: ContractProposal };
  coverage: SemanticModel['coverage'] & { functions: number; behaviors: number; callable_observations: number };
}
