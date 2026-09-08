import type { OperationContext } from '../specification/context.js';
import type { ContextAssemblyInvocation } from './context-contract.js';

export interface ContextReference {
  completion: 'return' | 'throw';
  code?: string;
  context?: OperationContext;
}

/** Independent reference: no candidate selection, accounting, or revalidation imports. */
export function referenceContextAssembly(invocation: ContextAssemblyInvocation): ContextReference {
  const { specification: spec, selection, options: { maxBytes } } = invocation;
  const operations = new Map(spec.operations.map(operation => [operation.id, operation]));
  if (spec.operations.some(operation => operation.dependencies.some(edge => edge.requirement === 'required' && !operations.has(edge.operation_id)))) return { completion: 'throw', code: 'MISSING_REQUIRED_DEPENDENCY' };
  if (maxBytes < 1 || maxBytes > 2097152) return { completion: 'throw', code: 'INVALID_BUDGET' };
  const root = spec.operations.find(operation => operation.id === selection || operation.alias === selection);
  if (!root) return { completion: 'throw', code: 'INVALID_SELECTION' };

  // Shortest, lexicographically least paths define stable breadth-first discovery
  // order. Relation relaxation is independent of the candidate's queue traversal.
  const compare = (a: string[], b: string[]): number => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
    return 0;
  };
  const paths = new Map<string, string[]>([[root.id, [root.id]]]);
  for (let pass = 0; pass < operations.size; pass++) {
    let changed = false;
    for (const operation of spec.operations) {
      const prefix = paths.get(operation.id);
      if (!prefix) continue;
      for (const edge of operation.dependencies) {
        if (edge.requirement !== 'required') continue;
        const proposed = [...prefix, edge.operation_id], previous = paths.get(edge.operation_id);
        if (!previous || compare(proposed, previous) < 0) { paths.set(edge.operation_id, proposed); changed = true; }
      }
    }
    if (!changed) break;
  }
  const selected = [...paths].sort((a, b) => compare(a[1], b[1])).map(([id]) => operations.get(id)!);
  const stateNames = new Set(selected.flatMap(operation => [...operation.reads, ...operation.writes]));
  const complete = selected.some(operation => operation.frame === 'complete');
  const byId = <T extends { id: string }>(values: T[]): T[] => values.sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
  const states = byId(spec.states.filter(state => complete || stateNames.has(state.id)));
  const evidenceRecords = [
    ...states,
    ...selected.flatMap(operation => [operation, ...operation.guarantees, ...operation.decisions, ...operation.implementations,
      ...operation.outcomes.flatMap(outcome => [outcome, ...outcome.ensures])]),
  ];
  const sourceNames = new Set(evidenceRecords.flatMap(record => record.evidence_ids));
  const links = selected.flatMap(operation => operation.dependencies.map(edge => ({ from_id: operation.id, to_id: edge.operation_id,
    target_name: operations.get(edge.operation_id)?.name ?? null, kind: edge.kind, role: edge.role, included: paths.has(edge.operation_id) })));
  const context: OperationContext = {
    schema_version: '0.3.0', command: 'context', artifact_id: spec.artifact_id, perspective: spec.perspective, provenance: spec.provenance,
    selection: { operation_id: root.id, name: root.name }, operations: selected, states, sources: byId(spec.sources.filter(source => sourceNames.has(source.id))), links,
    omissions: { operation_ids: spec.operations.map(operation => operation.id).filter(id => !paths.has(id)).sort(),
      deferred_dependencies: links.filter(link => !link.included).map(link => ({ from_id: link.from_id, to_id: link.to_id, role: link.role, available: operations.has(link.to_id) })) },
    checks: { integrity: 'valid', source_authentication: 'not-performed', claim_support: 'not-reviewed', acceptance: 'proposed' },
    retrieval: 'Use inspect on this exact specification with --operation <id>. Source text is attached and hashed; hashes establish content integrity, not source authenticity. Dependencies describe declared relationships, not an observed execution trace.',
    budget: { max_bytes: maxBytes, required_bytes: 0, used_bytes: 0, serialization: 'compact-json-utf8-with-newline' },
  };
  // Solve n = fixed payload bytes + 2 * decimalDigits(n), taking the least
  // solution. This does not use the candidate's iterative counter update.
  const fixed = new TextEncoder().encode(JSON.stringify(context) + '\n').length - 2;
  for (let digits = 1; digits <= 16; digits++) {
    const bytes = fixed + 2 * digits;
    if (String(bytes).length !== digits) continue;
    context.budget.required_bytes = bytes; context.budget.used_bytes = bytes;
    // Return owned records. Object-key order is not a semantic distinction.
    const owned = JSON.parse(JSON.stringify(context)) as OperationContext;
    return bytes <= maxBytes ? { completion: 'return', context: owned } : { completion: 'throw', code: 'CONTEXT_BUDGET', context: owned };
  }
  throw new Error('Reference byte count has no safe-integer solution.');
}
