import type { ProgramValue } from './model.js';

/** Version of execution results and resource accounting, independent of the IR schema. */
export const PROGRAM_INTERPRETER_VERSION = '0.1.0';
export interface ProgramExecutionLimits {
  work: number;
  allocation_units: number;
  value_units: number;
  evaluation_depth: number;
}
export const PROGRAM_EXECUTION_DEFAULT_LIMITS: Readonly<ProgramExecutionLimits> = Object.freeze({
  work: 1_000_000,
  allocation_units: 1_000_000,
  value_units: 100_000,
  evaluation_depth: 128,
});
export const PROGRAM_EXECUTION_MAX_LIMITS: Readonly<ProgramExecutionLimits> = Object.freeze({
  work: 10_000_000,
  allocation_units: 10_000_000,
  value_units: 1_000_000,
  evaluation_depth: 256,
});
/** Fixed preparation bounds apply separately to the program and argument array. */
export const PROGRAM_EXECUTION_INPUT_LIMITS = Object.freeze({
  portable_values: 50_000,
  input_units: 1_000_000,
});
export type ProgramExecutionOptions = Partial<ProgramExecutionLimits>;
/** Cumulative work/allocation and peak admitted value size/evaluation depth. */
export interface ProgramExecutionUsage extends ProgramExecutionLimits {}
export interface ProgramExecutionDiagnostic {
  phase: 'arguments' | 'execution' | 'result';
  path: string;
  /** Entry-to-current order; call_path identifies the invoking call expression. */
  call_stack: { function_id: string; call_path: string }[];
}
export type ProgramRuntimeFaultCode = 'INTEGER_OVERFLOW' | 'INDEX_OUT_OF_BOUNDS';
export type ProgramExecutionCompletion =
  | { kind: 'return'; value: ProgramValue }
  | {
      kind: 'application-failure';
      code: string;
      details: ProgramValue;
      diagnostic: ProgramExecutionDiagnostic;
    }
  | {
      kind: 'runtime-fault';
      code: ProgramRuntimeFaultCode;
      message: string;
      diagnostic: ProgramExecutionDiagnostic;
    }
  | {
      kind: 'resource-exhaustion';
      resource: keyof ProgramExecutionLimits;
      limit: number;
      diagnostic: ProgramExecutionDiagnostic;
    };
export interface ProgramExecutionResult {
  program_id: string;
  interpreter_version: typeof PROGRAM_INTERPRETER_VERSION;
  limits: ProgramExecutionLimits;
  usage: ProgramExecutionUsage;
  completion: ProgramExecutionCompletion;
}
