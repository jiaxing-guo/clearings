import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from '../model/types.js';
import { sha256 } from '../repository/source.js';
import { digest, normalized } from '../semantics/identity.js';
import { requireExpressionType, type TypeEnvironment } from './expressions.js';
import type { Expression, SemanticSpecification, ValueType } from './model.js';

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/specification.v0.3.json', import.meta.url), 'utf8'),
);
const checkSchema = new Ajv({ strict: true, allErrors: false, allowUnionTypes: true }).compile(
  schema,
);
const invalid = (message: string): never => {
  throw new ClearingsError('INVALID_SPECIFICATION', message);
};
export function specificationIdentity(
  specification: Omit<SemanticSpecification, 'artifact_id'> | SemanticSpecification,
): string {
  const { artifact_id: _, ...body } = specification as SemanticSpecification;
  return digest('specification', body);
}
/** Bound depth/work before schema recursion, hashing, and expression evaluation. */
export function assertPortable(value: unknown, maxNodes = 200000): void {
  let count = 0;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++count > maxNodes || depth > 64)
      invalid('Specification exceeds the structural work limit.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (
      !item ||
      typeof item !== 'object' ||
      (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
    )
      invalid('Expected portable JSON values.');
    if (ancestors.has(item as object))
      invalid('Object cycles are not portable; use operation references.');
    if (Object.getOwnPropertySymbols(item).length) invalid('Symbol properties are not portable.');
    if (
      Array.isArray(item) &&
      (Object.keys(item).length !== item.length ||
        Object.keys(item).some((key, index) => key !== String(index)))
    )
      invalid('Arrays must be dense and contain no named properties.');
    ancestors.add(item as object);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      if (!('value' in descriptor) || !descriptor.enumerable)
        invalid('Accessor and hidden properties are not portable.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item as object);
  };
  visit(value, 0);
}
export function sealSpecification(
  value: Omit<SemanticSpecification, 'artifact_id'> | SemanticSpecification,
): SemanticSpecification {
  assertPortable(value);
  const result = normalized({ ...value, artifact_id: specificationIdentity(value) });
  validateSpecification(result);
  return result;
}
export function operationTypeEnvironment(
  spec: SemanticSpecification,
  operation: SemanticSpecification['operations'][number],
): TypeEnvironment {
  const state: ValueType = {
    kind: 'record',
    fields: Object.fromEntries(spec.states.map((item) => [item.id, item.type])),
  };
  return {
    input: { kind: 'record', fields: operation.inputs },
    output: operation.output,
    before: state,
    after: state,
  };
}
function expressions(expr: Expression, visit: (expr: Expression) => void): void {
  visit(expr);
  if ('value' in expr && expr.kind !== 'literal') expressions(expr.value, visit);
  if ('terms' in expr) expr.terms.forEach((term) => expressions(term, visit));
  if ('left' in expr) {
    expressions(expr.left, visit);
    expressions(expr.right, visit);
  }
  if ('collection' in expr) expressions(expr.collection, visit);
  if ('predicate' in expr) expressions(expr.predicate, visit);
  if (expr.kind === 'reachable') {
    expressions(expr.root, visit);
    expressions(expr.edges, visit);
  }
}
export function validateSpecification(value: unknown): asserts value is SemanticSpecification {
  assertPortable(value);
  if (!checkSchema(value))
    invalid(
      `Specification schema mismatch: ${checkSchema.errors?.[0]?.instancePath ?? ''} ${checkSchema.errors?.[0]?.message ?? ''}`,
    );
  const spec = value as SemanticSpecification;
  if (spec.artifact_id !== specificationIdentity(spec))
    invalid('Specification digest does not match its content.');
  if ((spec.perspective === 'intended') !== (spec.provenance.origin === 'user-directed-design'))
    invalid('Intended requirements and source interpretations need distinct provenance.');
  const allIds = new Set<string>();
  const unique = (id: string) => {
    if (allIds.has(id)) invalid(`Duplicate canonical ID: ${id}`);
    allIds.add(id);
  };
  for (const item of [...spec.operations, ...spec.states, ...spec.sources]) unique(item.id);
  const aliases = new Set<string>();
  const operations = new Map(spec.operations.map((item) => [item.id, item]));
  const states = new Map(spec.states.map((item) => [item.id, item]));
  const sources = new Set(spec.sources.map((item) => item.id));
  const evidence = (ids: string[]) => {
    for (const id of ids) if (!sources.has(id)) invalid(`Missing source reference: ${id}`);
  };
  for (const source of spec.sources)
    if (source.sha256 !== sha256(source.text)) invalid(`Source text hash mismatch: ${source.id}`);
  for (const state of spec.states) evidence(state.evidence_ids);
  for (const operation of spec.operations) {
    if (
      aliases.has(operation.alias) ||
      (operations.has(operation.alias) && operation.alias !== operation.id)
    )
      invalid(`Ambiguous operation alias: ${operation.alias}`);
    aliases.add(operation.alias);
    evidence(operation.evidence_ids);
    const environment = operationTypeEnvironment(spec, operation);
    const expression = (expr: Expression, expected: ValueType, guard = false) => {
      requireExpressionType(expr, expected, environment);
      expressions(expr, (node) => {
        if (node.kind !== 'ref') return;
        if (guard && (node.root === 'after' || node.root === 'output'))
          invalid('Outcome guards can only read inputs and initial state.');
        if (node.root === 'before' || node.root === 'after') {
          if (!node.path.length) invalid('State expressions must name a field.');
          const field = node.path[0]!;
          if (![...operation.reads, ...operation.writes].includes(field))
            invalid(`Undeclared state access: ${field}`);
        }
      });
    };
    for (const id of [...operation.reads, ...operation.writes])
      if (!states.has(id)) invalid(`Missing state field: ${id}`);
    const depIds = new Set<string>();
    for (const dependency of operation.dependencies) {
      if (depIds.has(dependency.operation_id)) invalid('Duplicate operation dependency.');
      depIds.add(dependency.operation_id);
      if (dependency.requirement === 'required' && !operations.has(dependency.operation_id))
        throw new ClearingsError(
          'MISSING_REQUIRED_DEPENDENCY',
          `Required operation is missing: ${dependency.operation_id}`,
        );
    }
    const effects = new Set<string>();
    for (const effect of operation.effects.allowed) {
      if (effects.has(effect.id)) invalid('Duplicate effect ID.');
      effects.add(effect.id);
    }
    for (const rule of [
      ...operation.guarantees,
      ...operation.outcomes.flatMap((outcome) => outcome.ensures),
    ]) {
      unique(rule.id);
      evidence(rule.evidence_ids);
      expression(rule.predicate, { kind: 'boolean' });
    }
    for (const outcome of operation.outcomes) {
      unique(outcome.id);
      evidence(outcome.evidence_ids);
      expression(outcome.when, { kind: 'boolean' }, true);
      const updated = new Set<string>();
      for (const update of outcome.updates) {
        if (!operation.writes.includes(update.state_id) || updated.has(update.state_id))
          invalid('Outcome update needs a unique declared writable field.');
        updated.add(update.state_id);
        expression(update.value, states.get(update.state_id)!.type);
      }
      const outcomeEffects = new Set<string>();
      for (const effect of outcome.effects) {
        if (!effects.has(effect.effect_id) || outcomeEffects.has(effect.effect_id))
          invalid('Outcome references an absent or duplicate effect.');
        outcomeEffects.add(effect.effect_id);
      }
      for (const transition of outcome.transitions)
        if (!depIds.has(transition.operation_id))
          invalid('Transition target needs an explicit operation dependency.');
    }
    for (const implementation of operation.implementations) evidence(implementation.evidence_ids);
    for (const decision of operation.decisions) {
      unique(decision.id);
      evidence(decision.evidence_ids);
    }
    if (operation.coverage === 'partial' && !operation.decisions.length)
      invalid('Partial operations must explain their open boundary.');
  }
}
