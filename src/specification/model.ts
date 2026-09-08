/** Portable specification language. No compiler objects or executable source. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ValueType =
  | { kind: 'boolean' | 'string' | 'integer' | 'number' | 'null' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'list'; element: ValueType }
  | { kind: 'record'; fields: Record<string, ValueType> };

export type Expression =
  | { kind: 'literal'; value: JsonValue }
  | { kind: 'ref'; root: 'input' | 'before' | 'after' | 'output' | 'local'; path: string[] }
  | { kind: 'not' | 'length' | 'unique'; value: Expression }
  | { kind: 'all' | 'any'; terms: Expression[] }
  | {
      kind: 'compare';
      op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
      left: Expression;
      right: Expression;
    }
  | { kind: 'contains' | 'subset'; collection: Expression; value: Expression }
  | { kind: 'reachable'; root: Expression; edges: Expression }
  | { kind: 'every'; collection: Expression; variable: string; predicate: Expression }
  | { kind: 'opaque'; text: string; reason: string };

export interface Rule {
  id: string;
  description: string;
  predicate: Expression;
  evidence_ids: string[];
}
export interface StateField {
  id: string;
  name: string;
  description: string;
  scope: 'invocation' | 'request' | 'repository' | 'process' | 'external';
  type: ValueType;
  evidence_ids: string[];
}
export interface OpenDecision {
  id: string;
  question: string;
  consequence: string;
  disposition: 'unresolved-requirement' | 'analysis-limit' | 'implementation-choice';
  blocking: boolean;
  evidence_ids: string[];
}
export interface Dependency {
  operation_id: string;
  kind: 'uses-contract' | 'invokes' | 'awaits' | 'continuation';
  requirement: 'required' | 'optional';
  role: string;
}
export interface ImplementationRole {
  name: string;
  responsibility: string;
  symbol_id: string | null;
  evidence_ids: string[];
}
export interface OperationOutcome {
  id: string;
  description: string;
  when: Expression;
  ensures: Rule[];
  updates: { state_id: string; value: Expression }[];
  effects: { effect_id: string; occurrence: 'required' | 'permitted' }[];
  transitions: {
    operation_id: string;
    handoff: 'invoke' | 'await' | 'continue' | 'propagate';
    description: string;
  }[];
  evidence_ids: string[];
}
export interface SemanticOperation {
  id: string;
  alias: string;
  name: string;
  purpose: string;
  inputs: Record<string, ValueType>;
  output: ValueType;
  reads: string[];
  writes: string[];
  frame: 'complete' | 'partial';
  effects: { completeness: 'complete' | 'partial'; allowed: { id: string; description: string }[] };
  outcome_policy: 'exclusive' | 'allowed';
  coverage: 'complete' | 'partial';
  outcomes: OperationOutcome[];
  guarantees: Rule[];
  dependencies: Dependency[];
  implementations: ImplementationRole[];
  decisions: OpenDecision[];
  evidence_ids: string[];
}
export interface SpecificationSource {
  id: string;
  origin: 'source' | 'requirement' | 'design';
  locator: string;
  text: string;
  sha256: string;
  binding: { artifact_id: string; snapshot_id: string | null } | null;
}
export interface SemanticSpecification {
  schema_version: '0.3.0';
  kind: 'specification';
  artifact_id: string;
  name: string;
  perspective: 'intended' | 'observed';
  provenance: {
    author: string;
    origin: 'user-directed-design' | 'source-interpretation';
    review: 'proposed';
    notes: string[];
  };
  states: StateField[];
  operations: SemanticOperation[];
  sources: SpecificationSource[];
}
export interface OperationObservation {
  input: Record<string, JsonValue>;
  before: Record<string, JsonValue>;
  outcome?: string;
  output?: JsonValue;
  after?: Record<string, JsonValue>;
  effects?: string[];
}
export type Verdict = 'pass' | 'fail' | 'unknown';
export interface RuleCheck {
  id: string;
  description: string;
  verdict: Verdict;
  reason: string | null;
}
export interface OperationCheck {
  artifact_id: string;
  operation_id: string;
  perspective: SemanticSpecification['perspective'];
  verdict: Verdict;
  applicable_outcome_ids: string[];
  uncertain_outcome_ids: string[];
  checks: RuleCheck[];
  limitations: string[];
}
