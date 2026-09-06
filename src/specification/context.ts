import { ClearingsError } from '../model/types.js';
import { normalized } from '../semantics/identity.js';
import { canonical } from '../repository/inventory.js';
import { requiredClosure } from '../analysis/dependencies.js';
import { accountBytes, compactJson, validateByteBudget, type ByteBudget } from '../analysis/budget.js';
import { resolveOperation } from './check.js';
import { assertPortable, validateSpecification } from './validate.js';
import { formatExpression } from './expressions.js';
import type { SemanticSpecification, SemanticOperation, StateField, SpecificationSource } from './model.js';

export interface OperationContext {
  schema_version: '0.3.0';
  command: 'context';
  artifact_id: string;
  perspective: SemanticSpecification['perspective'];
  provenance: SemanticSpecification['provenance'];
  selection: { operation_id: string; name: string };
  operations: SemanticOperation[];
  states: StateField[];
  sources: SpecificationSource[];
  links: { from_id: string; to_id: string; target_name: string | null; kind: string; role: string; included: boolean }[];
  omissions: { operation_ids: string[]; deferred_dependencies: { from_id: string; to_id: string; role: string; available: boolean }[] };
  checks: { integrity: 'valid'; source_authentication: 'not-performed'; claim_support: 'not-reviewed'; acceptance: 'proposed' };
  retrieval: string;
  budget: ByteBudget;
}

/** Self-contained operation packages are the primary agent interface for specifications. */
export function assembleContext(spec: SemanticSpecification, selection: string, options: { maxBytes: number }): OperationContext {
  validateSpecification(spec); validateByteBudget(options.maxBytes);
  const root = resolveOperation(spec, selection);
  const index = new Map(spec.operations.map(operation => [operation.id, operation]));
  const ids = requiredClosure([root.id], index, operation => operation.dependencies.filter(item => item.requirement === 'required').map(item => item.operation_id));
  const included = new Set(ids);
  const operations = ids.map(id => index.get(id)!);
  // Complete frames preserve all modeled fields; partial frames include explicit accesses.
  const stateIds = new Set(operations.some(item => item.frame === 'complete') ? spec.states.map(item => item.id) : operations.flatMap(item => [...item.reads, ...item.writes]));
  const states = spec.states.filter(state => stateIds.has(state.id)).sort((a, b) => a.id < b.id ? -1 : 1);
  const sourceIds = new Set<string>();
  const evidence = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(evidence);
    else if (value && typeof value === 'object') for (const [key, field] of Object.entries(value)) {
      if (key === 'evidence_ids' && Array.isArray(field)) field.forEach(id => sourceIds.add(id)); else evidence(field);
    }
  };
  evidence(operations); evidence(states);
  const links = operations.flatMap(operation => operation.dependencies.map(dependency => ({ from_id: operation.id, to_id: dependency.operation_id,
    target_name: index.get(dependency.operation_id)?.name ?? null, kind: dependency.kind, role: dependency.role, included: included.has(dependency.operation_id) })));
  const pack: OperationContext = normalized({ schema_version: '0.3.0', command: 'context', artifact_id: spec.artifact_id, perspective: spec.perspective,
    provenance: spec.provenance,
    selection: { operation_id: root.id, name: root.name }, operations, states,
    sources: spec.sources.filter(source => sourceIds.has(source.id)).sort((a, b) => a.id < b.id ? -1 : 1), links,
    omissions: { operation_ids: spec.operations.filter(operation => !included.has(operation.id)).map(item => item.id).sort(),
      deferred_dependencies: links.filter(link => !link.included).map(link => ({ from_id: link.from_id, to_id: link.to_id, role: link.role, available: index.has(link.to_id) })) },
    checks: { integrity: 'valid', source_authentication: 'not-performed', claim_support: 'not-reviewed', acceptance: 'proposed' },
    retrieval: 'Use inspect on this exact specification with --operation <id>. Source text is attached and hashed; hashes establish content integrity, not source authenticity. Dependencies describe declared relationships, not an observed execution trace.',
    budget: { max_bytes: options.maxBytes, required_bytes: 0, used_bytes: 0, serialization: 'compact-json-utf8-with-newline' } });
  accountBytes(pack);
  if (pack.budget.used_bytes > options.maxBytes) throw new ClearingsError('CONTEXT_BUDGET', `Required context needs ${pack.budget.required_bytes} bytes; budget is ${options.maxBytes}. Select a narrower operation or increase the budget. No required rule was removed.`);
  return pack;
}
export const serializeOperationContext = compactJson;

/** Reconstruct a received package from its exact specification before trusting it. */
export function validateOperationContext(value: unknown, spec: SemanticSpecification): asserts value is OperationContext {
  assertPortable(value);
  const pack = value as Partial<OperationContext> | null;
  if (!pack || typeof pack !== 'object' || typeof pack.selection?.operation_id !== 'string' || typeof pack.budget?.max_bytes !== 'number') throw new ClearingsError('INVALID_CONTEXT', 'A context needs an operation selection and byte budget.');
  const expected = assembleContext(spec, pack.selection.operation_id, { maxBytes: pack.budget.max_bytes });
  if (canonical(value) !== canonical(expected)) throw new ClearingsError('INVALID_CONTEXT', 'Context differs from the required projection of its specification.');
}

/** Readable projection, not an independently authored summary. */
export function describeOperation(operation: SemanticOperation): string[] {
  return [operation.purpose,
    ...operation.outcomes.map(outcome => `When ${formatExpression(outcome.when)}: ${outcome.description}`),
    ...operation.guarantees.map(rule => `Required: ${rule.description}`),
    ...operation.implementations.map(item => `${item.name}: ${item.responsibility}`),
    ...operation.decisions.map(item => `${item.disposition}: ${item.question} ${item.consequence}`)];
}
