import { channel } from 'node:diagnostics_channel';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import type { PreparedRustProgram } from '../compiler/runner.js';
import type { NativeContextStage } from '../conformance/model.js';

export const CONTEXT_NATIVE_STAGE_POLICY = 'context-native-v2';
export const CONTEXT_NATIVE_STAGE_LIMITS = Object.freeze({
  work: 10_000_000,
  allocation_units: 10_000_000,
  value_units: 1_000_000,
  evaluation_depth: 256,
});
const observations = channel('clearings.context.native.v2');

/** Declare both stages before caller validation, so unstarted stages remain distinguishable. */
export function beginContextNativeExecution(): void {
  observations.publish({ event: 'begin', policy: CONTEXT_NATIVE_STAGE_POLICY });
}
export function startContextNativeStage(
  stage: NativeContextStage,
  args: unknown,
): string | undefined {
  if (!observations.hasSubscribers) return undefined;
  const arguments_sha256 = sha256(canonical(args));
  observations.publish({ event: 'start', stage, arguments_sha256 });
  return arguments_sha256;
}
export function observeContextNativeStage(
  stage: NativeContextStage,
  arguments_sha256: string | undefined,
  result: ReturnType<PreparedRustProgram['execute']>,
  native: PreparedRustProgram['native'],
): void {
  if (arguments_sha256 === undefined) return;
  observations.publish({
    event: 'result',
    observation: {
      stage,
      status: 'observed',
      policy: CONTEXT_NATIVE_STAGE_POLICY,
      arguments_sha256,
      result_sha256: sha256(canonical(result.completion)),
      result: result.completion,
      program_id: result.program_id,
      compiled_artifact_id: result.compiled_artifact_id,
      compiler_version: result.compiler_version,
      execution_semantics_version: result.execution_semantics_version,
      runtime: result.runtime,
      runner: result.runner,
      native,
      limits: result.limits,
      usage: result.usage,
      completion: result.completion.kind,
    },
  });
}
export function unavailableContextNativeStage(stage: NativeContextStage, error: unknown): void {
  observations.publish({
    event: 'unavailable',
    stage,
    reason:
      error instanceof Error
        ? error.message.slice(0, 1024) || 'Native execution failed.'
        : 'Native execution failed without a captured result.',
  });
}
