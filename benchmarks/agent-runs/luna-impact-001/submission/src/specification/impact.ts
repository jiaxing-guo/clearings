import { ClearingsError } from '../model/types.js';
import { validateSpecification } from './validate.js';
import type { Dependency, OpenDecision, SemanticSpecification } from './model.js';

export interface ImpactOptions { mode?: 'required' | 'all' }
export interface ImpactEntry {
  operation_id: string;
  name: string;
  distance: number;
  witness: string[];
  decisions: OpenDecision[];
}
export interface ImpactReport {
  schema_version: '0.3.0';
  command: 'impact';
  artifact_id: string;
  perspective: SemanticSpecification['perspective'];
  mode: 'required' | 'all';
  changed_operation_ids: string[];
  affected: ImpactEntry[];
  omitted_operation_ids: string[];
  unavailable_optional_dependencies: { from_id: string; to_id: string; kind: Dependency['kind']; role: string }[];
  interpretation: 'potential-impact-from-declared-dependencies';
  acceptance: 'proposed';
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sequenceCompare = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const result = compare(a[i]!, b[i]!);
    if (result) return result;
  }
  return a.length - b.length;
};

function resolveSelection(specification: SemanticSpecification, selection: unknown): string {
  if (typeof selection !== 'string') throw new ClearingsError('INVALID_SELECTION', 'Changed selections must be operation ID or alias strings.');
  const exact = specification.operations.find(operation => operation.id === selection);
  if (exact) return exact.id;
  const aliases = specification.operations.filter(operation => operation.alias === selection);
  if (aliases.length !== 1) throw new ClearingsError('INVALID_SELECTION', `Unknown operation selection: ${selection}`);
  return aliases[0]!.id;
}

export function analyzeImpact(
  specification: SemanticSpecification,
  changed: readonly string[],
  options?: ImpactOptions,
): ImpactReport {
  validateSpecification(specification);
  if (!Array.isArray(changed) || changed.length === 0) throw new ClearingsError('INVALID_SELECTION', 'At least one changed operation is required.');

  let mode: 'required' | 'all' = 'required';
  if (options !== undefined) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ClearingsError('INVALID_ARGUMENTS', 'Options must be an object.');
    const keys = Object.keys(options as object);
    if (keys.some(key => key !== 'mode')) throw new ClearingsError('INVALID_ARGUMENTS', 'Unknown impact option.');
    if (options.mode !== undefined && options.mode !== 'required' && options.mode !== 'all') throw new ClearingsError('INVALID_ARGUMENTS', 'Mode must be required or all.');
    mode = options.mode ?? 'required';
  }

  const roots = [...new Set(changed.map(selection => resolveSelection(specification, selection)))].sort(compare);
  const operations = new Map(specification.operations.map(operation => [operation.id, operation]));
  const active = new Map<string, { to: string; dependency: Dependency }[]>();
  for (const operation of specification.operations) {
    const edges = operation.dependencies
      .filter(dependency => (mode === 'all' || dependency.requirement === 'required') && operations.has(dependency.operation_id))
      .map(dependency => ({ to: dependency.operation_id, dependency }))
      .sort((a, b) => compare(a.to, b.to));
    active.set(operation.id, edges);
  }
  const reverse = new Map<string, string[]>();
  for (const [from, edges] of active) for (const edge of edges) {
    const incoming = reverse.get(edge.to) ?? [];
    incoming.push(from);
    reverse.set(edge.to, incoming);
  }
  for (const incoming of reverse.values()) incoming.sort(compare);

  const distances = new Map<string, number>();
  const witnesses = new Map<string, string[]>();
  const pending = roots.map(id => ({ id, distance: 0, path: [id] }));
  for (const root of roots) { distances.set(root, 0); witnesses.set(root, [root]); }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const current = pending[cursor]!;
    for (const source of reverse.get(current.id) ?? []) {
      const candidatePath = [source, ...current.path];
      const candidateDistance = current.distance + 1;
      const previousDistance = distances.get(source);
      const previousPath = witnesses.get(source);
      if (previousDistance === undefined || candidateDistance < previousDistance || (candidateDistance === previousDistance && previousPath !== undefined && sequenceCompare(candidatePath, previousPath) < 0)) {
        distances.set(source, candidateDistance);
        witnesses.set(source, candidatePath);
        pending.push({ id: source, distance: candidateDistance, path: candidatePath });
      }
    }
  }

  const affected = [...distances.keys()].sort(compare).map(id => {
    const operation = operations.get(id)!;
    return { operation_id: id, name: operation.name, distance: distances.get(id)!, witness: [...witnesses.get(id)!], decisions: operation.decisions.map(decision => ({ ...decision, evidence_ids: [...decision.evidence_ids] })) };
  });
  const included = new Set(distances.keys());
  const omitted = specification.operations.map(operation => operation.id).filter(id => !included.has(id)).sort(compare);
  const unavailable_optional_dependencies = specification.operations.flatMap(operation => operation.dependencies
    .filter(dependency => dependency.requirement === 'optional' && !operations.has(dependency.operation_id) && included.has(operation.id))
    .map(dependency => ({ from_id: operation.id, to_id: dependency.operation_id, kind: dependency.kind, role: dependency.role })))
    .sort((a, b) => compare(a.from_id, b.from_id) || compare(a.to_id, b.to_id));
  return { schema_version: '0.3.0', command: 'impact', artifact_id: specification.artifact_id, perspective: specification.perspective, mode,
    changed_operation_ids: roots, affected, omitted_operation_ids: omitted, unavailable_optional_dependencies,
    interpretation: 'potential-impact-from-declared-dependencies', acceptance: 'proposed' };
}
