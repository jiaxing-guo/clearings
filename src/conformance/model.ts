import type { JsonValue, ValueType } from '../specification/model.js';

/** Evaluation metadata, separate from the operation specification and its verdicts. */
export type MeasurementSource = 'arguments-before' | 'arguments-after' | 'return' | 'exception' | 'independent' | 'instrumentation';
export interface MeasurementDefinition {
  id: string;
  description: string;
  source: MeasurementSource;
  type: ValueType;
  procedure: string;
}
export type VerificationMethod =
  | { kind: 'predicate'; rule_ids: string[] }
  | { kind: 'independent-check'; check_id: string }
  | { kind: 'unresolved'; reason: string };
export interface ConformanceObligation {
  id: string;
  requirement: string;
  operation_ids: string[];
  rule_ids: string[];
  measurement_ids: string[];
  mandatory: boolean;
  verification: VerificationMethod;
  limitation: string;
}
export interface ConformanceProfile {
  schema_version: '0.1.0';
  kind: 'conformance-profile';
  artifact_id: string;
  name: string;
  specification_id: string;
  target: { module: string; export: string };
  scope: { input_domain: string[]; requirements: string[]; exclusions: string[] };
  completion_operations: { return: string; throw: string };
  measurements: MeasurementDefinition[];
  obligations: ConformanceObligation[];
}

/** A capture can be absent without being replaced by null, zero, or an empty list. */
export type CapturedValue = { status: 'captured'; value: JsonValue } | { status: 'unavailable'; reason: string };
export type ExecutionCompletion =
  | { kind: 'return'; result: CapturedValue }
  | { kind: 'throw'; thrown: CapturedValue }
  | { kind: 'timeout'; limit_ms: number }
  | { kind: 'harness-failure'; phase: 'prepare' | 'invoke' | 'capture'; message: string };
export type Measurement =
  | { id: string; status: 'observed'; value: JsonValue }
  | { id: string; status: 'unobserved'; reason: string };
export interface ContentIdentity { name: string; sha256: string }
export type ComponentIdentity = ({ status: 'bound' } & ContentIdentity) | { status: 'unavailable'; reason: string };
export interface ExecutionRecord {
  schema_version: '0.1.0';
  kind: 'execution-record';
  artifact_id: string;
  origin: 'recorded-execution' | 'authored-example';
  profile_id: string;
  specification_id: string;
  case_id: string;
  identities: {
    implementation: {
      repository: string; commit: string; tree: string;
      module: string; export: string; files: { path: string; sha256: string }[];
    };
    adapter: ComponentIdentity;
    evaluator: ComponentIdentity;
    fixture: ContentIdentity;
    runtime: { status: 'bound'; name: string; version: string; platform: string; architecture: string; lockfile_sha256: string }
      | { status: 'unavailable'; reason: string };
  };
  arguments_before: JsonValue;
  arguments_after: CapturedValue;
  completion: ExecutionCompletion;
  measurements: Measurement[];
  limitations: string[];
}
