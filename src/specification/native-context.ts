import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClearingsError } from '../model/types.js';
import { prepareRustProgram, type PreparedRustProgram } from '../compiler/runner.js';
import { sha256 } from '../repository/source.js';
import type { NativeContextStage } from '../conformance/model.js';
import {
  CONTEXT_NATIVE_STAGE_LIMITS,
  CONTEXT_NATIVE_STAGE_POLICY,
  startContextNativeStage,
  observeContextNativeStage,
  unavailableContextNativeStage,
} from './native-observation.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const prepared = new Map<NativeContextStage, PreparedRustProgram>();
function prepareStage(stage: NativeContextStage): PreparedRustProgram {
  let program = prepared.get(stage);
  if (!program) {
    const name = stage === 'closure' ? 'required-dependency-closure' : 'context-selection';
    program = prepareRustProgram(
      JSON.parse(
        readFileSync(new URL(`../../programs/clearings/${name}.json`, import.meta.url), 'utf8'),
      ),
      {
        cacheDirectory:
          process.env.CLEARINGS_NATIVE_CACHE ??
          join(
            tmpdir(),
            `clearings-native-${process.getuid?.() ?? 'user'}`,
            sha256(root).slice(0, 24),
          ),
      },
    );
    prepared.set(stage, program);
  }
  return program;
}

/** Prepare both independent cache entries before bounded recording. */
export function prepareContextRuntime() {
  const stages = (['closure', 'selection'] as const).map((stage) => {
    const program = prepareStage(stage);
    return {
      stage,
      program_id: program.artifact.program_id,
      compiled_artifact_id: program.artifact.artifact_id,
      native: program.native,
    };
  });
  // Retain the original closure identity fields for existing callers.
  const { stage: _, ...closure } = stages[0]!;
  return { ...closure, policy: CONTEXT_NATIVE_STAGE_POLICY, stages };
}

/** Execute one bounded IR stage, preserving observed results before mapping caller errors. */
export function executeContextStage(stage: NativeContextStage, args: unknown) {
  const argumentHash = startContextNativeStage(stage, args);
  let result: ReturnType<PreparedRustProgram['execute']>, program: PreparedRustProgram;
  try {
    program = prepareStage(stage);
    result = program.execute(args, CONTEXT_NATIVE_STAGE_LIMITS);
  } catch (error) {
    unavailableContextNativeStage(stage, error);
    if (
      error instanceof ClearingsError &&
      error.code === 'INVALID_PROGRAM_EXECUTION' &&
      error.details?.path === '/arguments' &&
      ['portability', 'input-limit'].includes(String(error.details?.rule))
    )
      throw new ClearingsError(
        'CONTEXT_RESOURCE',
        `Context ${stage} exceeds native preparation limits.`,
        3,
        {
          policy: CONTEXT_NATIVE_STAGE_POLICY,
          context_stage: stage,
          cause: error.code,
          diagnostic: JSON.stringify(error.details),
        },
      );
    if (error instanceof ClearingsError)
      throw new ClearingsError(error.code, error.message, error.exitCode, {
        ...error.details,
        context_stage: stage,
        policy: CONTEXT_NATIVE_STAGE_POLICY,
      });
    throw error;
  }
  observeContextNativeStage(stage, argumentHash, result, program.native);
  const completion = result.completion;
  if (completion.kind === 'return') return completion.value;
  if (completion.kind === 'resource-exhaustion')
    throw new ClearingsError(
      'CONTEXT_RESOURCE',
      `Context ${stage} exhausted its native execution limit.`,
      3,
      {
        policy: CONTEXT_NATIVE_STAGE_POLICY,
        context_stage: stage,
        resource: completion.resource,
        limit: completion.limit,
        diagnostic: JSON.stringify(completion.diagnostic),
        usage: JSON.stringify(result.usage),
      },
    );
  if (
    stage === 'closure' &&
    completion.kind === 'application-failure' &&
    completion.code === 'MISSING_REQUIRED_DEPENDENCY'
  )
    throw new ClearingsError(completion.code, `Required record is missing: ${completion.details}`);
  throw new ClearingsError(
    'CONTEXT_NATIVE_FAILED',
    `Compiled context ${stage} failed after specification validation.`,
    1,
    { context_stage: stage, completion: JSON.stringify(completion) },
  );
}
