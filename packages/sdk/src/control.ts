/* Generated from contracts/protocol.schema.json. Do not edit. */

export type Command =
  | {
      binding: string;
      command: number;
      inputs: number[];
      kind: Kind;
      node: number;
      run: number;
      source: string;
      type: 'dispatch';
    }
  | {
      run: number;
      type: 'release';
      value: number;
    }
  | {
      command: number;
      run: number;
      type: 'cancel';
    }
  | {
      error?: Failure | null;
      record: Record;
      run: number;
      type: 'finished';
      value?: number | null;
    }
  | {
      run: number;
      type: 'dropped';
    };
export type Kind = 'value' | 'call' | 'transform' | 'join';
export type ErrorCode =
  | 'INVALID_PLAN'
  | 'INVALID_VALUE'
  | 'UNSUPPORTED'
  | 'CAPACITY'
  | 'OPERATION_FAILED'
  | 'TRANSFORM_FAILED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'CLOSED';
export type Event =
  | {
      command: number;
      error?: Failure | null;
      run: number;
      type: 'complete';
      value?: number | null;
    }
  | {
      run: number;
      type: 'cancel';
    };

/**
 * Schema root for both native bindings and generated SDK projections.
 */
export interface Protocol {
  command: Command;
  event: Event;
  failure: Failure;
  limits: Limits;
  plan: Plan;
  snapshot: Snapshot;
  turn: Turn;
}
export interface Failure {
  code: ErrorCode;
  source?: string | null;
}
export interface Record {
  build: string;
  completed_calls: number;
  core_version: string;
  dispatched_calls: number;
  effective_max_in_flight: number;
  finished_ms: number;
  flow: string;
  limit_origin: string;
  logical_calls: number;
  protocol: number;
  queue_ms: number;
  started_ms: number;
  strategy: string;
  uncertain_actions: number;
}
export interface Limits {
  max_in_flight: number;
  max_nodes: number;
  max_runs: number;
}
export interface Plan {
  build: string;
  flow: string;
  max_in_flight: number;
  nodes: Node[];
  protocol: number;
  root: number;
  timeout_ms: number;
}
export interface Node {
  binding: string;
  deps: number[];
  kind: Kind;
  source: string;
  value?: number | null;
}
export interface Snapshot {
  closed: boolean;
  ignored_completions: number;
  in_flight: number;
  nodes: number;
  runs: number;
}
export interface Turn {
  commands: Command[];
  has_work: boolean;
  next_wakeup_ms?: number | null;
  steps: number;
}
