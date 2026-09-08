import { channel } from 'node:diagnostics_channel';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClearingsError } from '../model/types.js';
import { prepareRustProgram, type PreparedRustProgram } from '../compiler/runner.js';
import { PROGRAM_EXECUTION_MAX_LIMITS } from '../program/execution.js';
import { sha256 } from '../repository/source.js';
import type { SemanticOperation } from './model.js';

export const CONTEXT_NATIVE_POLICY = 'context-native-v1';
const observations = channel('clearings.context.native.v1');
const root = fileURLToPath(new URL('../../', import.meta.url));
let prepared: PreparedRustProgram | undefined;

/** Warm setup can run outside the bounded invocation recorder. */
export function prepareContextRuntime() {
  prepared ??= prepareRustProgram(
    JSON.parse(
      readFileSync(
        new URL('../../programs/clearings/required-dependency-closure.json', import.meta.url),
        'utf8',
      ),
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
  return {
    program_id: prepared.artifact.program_id,
    compiled_artifact_id: prepared.artifact.artifact_id,
    native: prepared.native,
  };
}

/** Representation conversion only; the traversal is computed by the compiled program. */
export function nativeRequiredClosure(rootId: string, operations: SemanticOperation[]): string[] {
  prepareContextRuntime();
  const records = operations.map((operation) => ({
    id: operation.id,
    dependencies: operation.dependencies.map((dependency) => ({
      target: dependency.operation_id,
      required: dependency.requirement === 'required',
    })),
  }));
  let result;
  try {
    result = prepared!.execute([[rootId], records], PROGRAM_EXECUTION_MAX_LIMITS);
  } catch (error) {
    if (
      error instanceof ClearingsError &&
      error.code === 'INVALID_PROGRAM_EXECUTION' &&
      error.details?.path === '/arguments' &&
      ['portability', 'input-limit'].includes(String(error.details?.rule))
    )
      throw new ClearingsError(
        'CONTEXT_RESOURCE',
        'Context graph exceeds native preparation limits.',
        3,
        {
          policy: CONTEXT_NATIVE_POLICY,
          cause: error.code,
          diagnostic: JSON.stringify(error.details),
        },
      );
    throw error;
  }
  observations.publish({
    status: 'observed',
    policy: CONTEXT_NATIVE_POLICY,
    program_id: result.program_id,
    compiled_artifact_id: result.compiled_artifact_id,
    compiler_version: result.compiler_version,
    execution_semantics_version: result.execution_semantics_version,
    runtime: result.runtime,
    runner: result.runner,
    native: prepared!.native,
    limits: result.limits,
    usage: result.usage,
    completion: result.completion.kind,
  });
  const completion = result.completion;
  if (completion.kind === 'return') return completion.value as string[];
  if (completion.kind === 'resource-exhaustion')
    throw new ClearingsError(
      'CONTEXT_RESOURCE',
      'Context dependency closure exhausted its native execution limit.',
      3,
      {
        policy: CONTEXT_NATIVE_POLICY,
        resource: completion.resource,
        limit: completion.limit,
        diagnostic: JSON.stringify(completion.diagnostic),
        usage: JSON.stringify(result.usage),
      },
    );
  if (
    completion.kind === 'application-failure' &&
    completion.code === 'MISSING_REQUIRED_DEPENDENCY'
  )
    throw new ClearingsError(completion.code, `Required record is missing: ${completion.details}`);
  throw new ClearingsError(
    'CONTEXT_NATIVE_FAILED',
    'Compiled context closure failed after specification validation.',
    1,
    { completion: JSON.stringify(completion) },
  );
}
