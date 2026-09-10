import type { SemanticOperation } from './model.js';
import { executeContextStage } from './native-context.js';
export { prepareContextRuntime } from './native-context.js';
export { CONTEXT_NATIVE_STAGE_POLICY as CONTEXT_NATIVE_POLICY } from './native-observation.js';

/** Representation conversion only; traversal is computed by the compiled program. */
export function nativeRequiredClosure(rootId: string, operations: SemanticOperation[]): string[] {
  const records = operations.map((operation) => ({
    id: operation.id,
    dependencies: operation.dependencies.map((dependency) => ({
      target: dependency.operation_id,
      required: dependency.requirement === 'required',
    })),
  }));
  return executeContextStage('closure', [[rootId], records]) as string[];
}
