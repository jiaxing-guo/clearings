import { readFileSync } from 'node:fs';
import { ClearingsError } from '../model/types.js';
import { sealSpecification, validateSpecification } from '../specification/validate.js';
import { validateConformanceProfile } from './validate.js';
import type { SemanticSpecification } from '../specification/model.js';
import type { ConformanceProfile } from './model.js';

export interface ContextAssemblyInvocation {
  specification: SemanticSpecification;
  selection: string;
  options: { maxBytes: number };
}

/** Return an owned copy of the bundled contract, never a caller-selected executable module. */
export function getContextAssemblyContract(): {
  specification: SemanticSpecification;
  profile: ConformanceProfile;
} {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(
        new URL(`../../specifications/clearings/conformance/${name}.json`, import.meta.url),
        'utf8',
      ),
    );
  const specification = read('specification') as SemanticSpecification,
    profile = read('profile');
  validateConformanceProfile(profile, specification);
  return { specification, profile };
}

/** Validate the declared domain without consuming the candidate's exception behavior. */
export function validateContextInvocation(
  value: unknown,
): asserts value is ContextAssemblyInvocation {
  const invocation = value as Partial<ContextAssemblyInvocation> | null;
  if (
    !invocation ||
    typeof invocation !== 'object' ||
    Array.isArray(invocation) ||
    Object.keys(invocation).some(
      (key) => !['specification', 'selection', 'options'].includes(key),
    ) ||
    typeof invocation.selection !== 'string' ||
    !invocation.selection.length ||
    !invocation.options ||
    typeof invocation.options !== 'object' ||
    Array.isArray(invocation.options) ||
    Object.keys(invocation.options).some((key) => key !== 'maxBytes') ||
    !Number.isSafeInteger(invocation.options.maxBytes)
  ) {
    throw new ClearingsError(
      'INVALID_CONFORMANCE',
      'Expected specification, nonempty selection, and safe-integer maxBytes.',
    );
  }
  try {
    validateSpecification(invocation.specification);
  } catch (error) {
    if (!(error instanceof ClearingsError) || error.code !== 'MISSING_REQUIRED_DEPENDENCY')
      throw error;
    // The original schema and digest have been checked. Relax only target presence
    // in a validation copy, retaining dependencies for transition and uniqueness checks.
    // The original invocation, including its required edges, is executed and recorded.
    const relaxed = structuredClone(invocation.specification!);
    const ids = new Set(relaxed.operations.map((operation) => operation.id));
    for (const operation of relaxed.operations)
      for (const dependency of operation.dependencies) {
        if (dependency.requirement === 'required' && !ids.has(dependency.operation_id))
          dependency.requirement = 'optional';
      }
    sealSpecification(relaxed);
  }
}
