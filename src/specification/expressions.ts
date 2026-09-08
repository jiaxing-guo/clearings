import { canonical } from '../repository/inventory.js';
import { ClearingsError } from '../model/types.js';
import type { Expression, JsonValue, ValueType } from './model.js';

export interface ExpressionEnvironment {
  input?: JsonValue;
  before?: JsonValue;
  after?: JsonValue;
  output?: JsonValue;
  local?: Record<string, JsonValue>;
}
export type ExpressionValue = { known: true; value: JsonValue } | { known: false; reason: string };
const unknown = (reason: string): ExpressionValue => ({ known: false, reason });
const known = (value: JsonValue): ExpressionValue => ({ known: true, value });
const equal = (left: JsonValue, right: JsonValue) => canonical(left) === canonical(right);
const own = (value: object, name: string) => Object.prototype.hasOwnProperty.call(value, name);

/** Closed interpreter with a work limit. Source strings never enter eval/Function. */
export function evaluateExpression(
  expression: Expression,
  environment: ExpressionEnvironment,
  maxSteps = 100000,
): ExpressionValue {
  let remaining = maxSteps;
  const evaluate = (expr: Expression, env: ExpressionEnvironment): ExpressionValue => {
    if (--remaining < 0) return unknown('Expression work limit reached.');
    switch (expr.kind) {
      case 'literal':
        return known(expr.value);
      case 'opaque':
        return unknown(expr.reason);
      case 'ref': {
        let value: JsonValue | undefined = env[expr.root];
        for (const key of expr.path) {
          if (!value || typeof value !== 'object' || Array.isArray(value) || !own(value, key))
            return unknown(`Missing observation: ${expr.root}.${expr.path.join('.')}`);
          value = value[key];
        }
        return value === undefined ? unknown(`Missing observation: ${expr.root}`) : known(value);
      }
      case 'all':
      case 'any': {
        let unresolved: ExpressionValue | undefined;
        for (const term of expr.terms) {
          const result = evaluate(term, env);
          if (!result.known) unresolved = result;
          else if (typeof result.value !== 'boolean') return unknown('Boolean operand expected.');
          else if (result.value === (expr.kind === 'any')) return known(result.value);
        }
        return unresolved ?? known(expr.kind === 'all');
      }
      case 'not':
      case 'length':
      case 'unique': {
        const result = evaluate(expr.value, env);
        if (!result.known) return result;
        if (expr.kind === 'not')
          return typeof result.value === 'boolean'
            ? known(!result.value)
            : unknown('Boolean operand expected.');
        if (expr.kind === 'length')
          return Array.isArray(result.value) || typeof result.value === 'string'
            ? known(result.value.length)
            : unknown('Collection operand expected.');
        return Array.isArray(result.value)
          ? known(new Set(result.value.map((item) => canonical(item))).size === result.value.length)
          : unknown('List operand expected.');
      }
      case 'compare': {
        const a = evaluate(expr.left, env),
          b = evaluate(expr.right, env);
        if (!a.known) return a;
        if (!b.known) return b;
        if (expr.op === 'eq' || expr.op === 'ne')
          return known(equal(a.value, b.value) === (expr.op === 'eq'));
        if (typeof a.value !== 'number' || typeof b.value !== 'number')
          return unknown('Numeric operands expected.');
        return known(
          expr.op === 'lt'
            ? a.value < b.value
            : expr.op === 'lte'
              ? a.value <= b.value
              : expr.op === 'gt'
                ? a.value > b.value
                : a.value >= b.value,
        );
      }
      case 'contains':
      case 'subset': {
        const collection = evaluate(expr.collection, env),
          value = evaluate(expr.value, env);
        if (!collection.known) return collection;
        if (!value.known) return value;
        if (!Array.isArray(collection.value)) return unknown('List operand expected.');
        const items = new Set(collection.value.map((item) => canonical(item)));
        if (expr.kind === 'contains') return known(items.has(canonical(value.value)));
        return Array.isArray(value.value)
          ? known(value.value.every((item) => items.has(canonical(item))))
          : unknown('Subset operand must be a list.');
      }
      case 'reachable': {
        const root = evaluate(expr.root, env),
          edges = evaluate(expr.edges, env);
        if (!root.known) return root;
        if (!edges.known) return edges;
        if (typeof root.value !== 'string' || !Array.isArray(edges.value))
          return unknown('Reachability needs a string root and an edge list.');
        const graph: { from: string; to: string }[] = [];
        for (const edge of edges.value) {
          if (--remaining < 0) return unknown('Expression work limit reached.');
          if (
            !edge ||
            typeof edge !== 'object' ||
            Array.isArray(edge) ||
            Object.keys(edge).length !== 2 ||
            !own(edge, 'from') ||
            !own(edge, 'to') ||
            typeof edge.from !== 'string' ||
            typeof edge.to !== 'string'
          )
            return unknown('Each edge needs exactly string from/to fields.');
          graph.push({ from: edge.from, to: edge.to });
        }
        // Least fixed point over supplied edges, separate from the assembler's queue.
        const reached = new Set([root.value]);
        let changed: boolean;
        do {
          changed = false;
          for (const edge of graph) {
            if (--remaining < 0) return unknown('Expression work limit reached.');
            if (reached.has(edge.from) && !reached.has(edge.to)) {
              reached.add(edge.to);
              changed = true;
            }
          }
        } while (changed);
        return known([...reached].sort());
      }
      case 'every': {
        const collection = evaluate(expr.collection, env);
        if (!collection.known) return collection;
        if (!Array.isArray(collection.value)) return unknown('List operand expected.');
        let unresolved: ExpressionValue | undefined;
        for (const item of collection.value) {
          const result = evaluate(expr.predicate, {
            ...env,
            local: { ...env.local, [expr.variable]: item },
          });
          if (!result.known) unresolved = result;
          else if (typeof result.value !== 'boolean') return unknown('Boolean predicate expected.');
          else if (!result.value) return known(false);
          if (remaining < 0) return unknown('Expression work limit reached.');
        }
        return unresolved ?? known(true);
      }
    }
  };
  return evaluate(expression, environment);
}

export function matchesType(value: unknown, type: ValueType): value is JsonValue {
  switch (type.kind) {
    case 'null':
      return value === null;
    case 'boolean':
    case 'string':
      return typeof value === type.kind;
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'enum':
      return typeof value === 'string' && type.values.includes(value);
    case 'list':
      return Array.isArray(value) && value.every((item) => matchesType(item, type.element));
    case 'record':
      return (
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === Object.keys(type.fields).length &&
        Object.entries(type.fields).every(
          ([key, field]) =>
            own(value, key) && matchesType((value as Record<string, unknown>)[key], field),
        )
      );
  }
}

type InferredType = ValueType | { kind: 'empty' };
export type TypeEnvironment = Record<'input' | 'before' | 'after' | 'output', ValueType> & {
  local?: Record<string, ValueType>;
};
const invalid = (message: string): never => {
  throw new ClearingsError('SPEC_TYPE', message);
};
const compatible = (a: InferredType, b: InferredType): boolean => {
  if (a.kind === 'empty' || b.kind === 'empty') return true;
  if (['integer', 'number'].includes(a.kind) && ['integer', 'number'].includes(b.kind)) return true;
  if (a.kind === 'enum' && b.kind === 'enum')
    return a.values.some((value) => b.values.includes(value));
  if (['string', 'enum'].includes(a.kind) && ['string', 'enum'].includes(b.kind)) return true;
  if (a.kind === 'list' && b.kind === 'list') return compatible(a.element, b.element);
  if (a.kind === 'record' && b.kind === 'record')
    return (
      Object.keys(a.fields).length === Object.keys(b.fields).length &&
      Object.entries(a.fields).every(
        ([key, type]) => own(b.fields, key) && compatible(type, b.fields[key]!),
      )
    );
  return a.kind === b.kind;
};
function literalWithinDomains(value: JsonValue, type: InferredType): boolean {
  if (type.kind === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (type.kind === 'enum') return typeof value === 'string' && type.values.includes(value);
  if (type.kind === 'list' && Array.isArray(value))
    return value.every((item) => literalWithinDomains(item, type.element));
  if (type.kind === 'record' && value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(type.fields).every(
      ([key, field]) => own(value, key) && literalWithinDomains(value[key]!, field),
    );
  }
  return true;
}
/** Unify all literal elements, retaining constraints learned after empty lists. */
function mergeLiteralTypes(a: InferredType, b: InferredType): InferredType {
  if (a.kind === 'empty') return b;
  if (b.kind === 'empty') return a;
  if (!compatible(a, b)) return invalid('List literals must have a consistent element type.');
  if (a.kind === 'list' && b.kind === 'list')
    return { kind: 'list', element: mergeLiteralTypes(a.element, b.element) as ValueType };
  if (a.kind === 'record' && b.kind === 'record')
    return {
      kind: 'record',
      fields: Object.fromEntries(
        Object.entries(a.fields).map(([key, field]) => [
          key,
          mergeLiteralTypes(field, b.fields[key]!) as ValueType,
        ]),
      ),
    };
  if (
    (a.kind === 'integer' && b.kind === 'number') ||
    (a.kind === 'number' && b.kind === 'integer')
  )
    return { kind: 'number' };
  return a;
}
function literalType(value: JsonValue): InferredType {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    // Empty literals have no element constraints; this sentinel is internal only.
    if (!value.length) return { kind: 'list', element: { kind: 'empty' } as unknown as ValueType };
    let type = literalType(value[0]!);
    for (let index = 1; index < value.length; index++)
      type = mergeLiteralTypes(type, literalType(value[index]!));
    return { kind: 'list', element: type as ValueType };
  }
  if (typeof value === 'object')
    return {
      kind: 'record',
      fields: Object.fromEntries(
        Object.entries(value).map(([key, field]) => [key, literalType(field) as ValueType]),
      ),
    };
  if (typeof value === 'number')
    return { kind: Number.isSafeInteger(value) ? 'integer' : 'number' };
  return { kind: typeof value as 'boolean' | 'string' };
}
export function expressionType(expr: Expression, environment: TypeEnvironment): InferredType {
  const infer = (value: Expression) => expressionType(value, environment);
  const requireKind = (type: InferredType, kinds: string[]) => {
    if (!kinds.includes(type.kind))
      invalid(`Expected ${kinds.join('/')} expression; received ${type.kind}.`);
  };
  switch (expr.kind) {
    case 'literal':
      return literalType(expr.value);
    case 'opaque':
      return { kind: 'boolean' };
    case 'ref': {
      if (expr.root === 'local' && environment.local === undefined)
        invalid('Local reference requires a quantifier scope.');
      let type: ValueType =
        expr.root === 'local'
          ? { kind: 'record', fields: environment.local ?? {} }
          : environment[expr.root];
      for (const key of expr.path) {
        if (type.kind !== 'record' || !own(type.fields, key))
          invalid(`Unknown typed reference ${expr.root}.${expr.path.join('.')}.`);
        type = (type as Extract<ValueType, { kind: 'record' }>).fields[key]!;
      }
      return type;
    }
    case 'not':
      requireKind(infer(expr.value), ['boolean']);
      return { kind: 'boolean' };
    case 'length':
      requireKind(infer(expr.value), ['list', 'string']);
      return { kind: 'integer' };
    case 'unique':
      requireKind(infer(expr.value), ['list']);
      return { kind: 'boolean' };
    case 'all':
    case 'any':
      for (const term of expr.terms) requireKind(infer(term), ['boolean']);
      return { kind: 'boolean' };
    case 'compare': {
      const left = infer(expr.left),
        right = infer(expr.right);
      if (expr.op === 'eq' || expr.op === 'ne') {
        if (!compatible(left, right)) invalid('Equality operands have incompatible types.');
        if (
          (expr.left.kind === 'literal' && !literalWithinDomains(expr.left.value, right)) ||
          (expr.right.kind === 'literal' && !literalWithinDomains(expr.right.value, left))
        )
          invalid('Equality literal is outside the declared value domain.');
      } else {
        requireKind(left, ['integer', 'number']);
        requireKind(right, ['integer', 'number']);
      }
      return { kind: 'boolean' };
    }
    case 'contains':
    case 'subset': {
      const collection = infer(expr.collection),
        value = infer(expr.value);
      if (collection.kind !== 'list') return invalid('Collection expression must be a list.');
      if (expr.kind === 'subset' && value.kind !== 'list')
        invalid('Subset expression must be a list.');
      const element =
        expr.kind === 'subset' ? (value as Extract<ValueType, { kind: 'list' }>).element : value;
      if (!compatible(collection.element, element))
        invalid('Collection operands have incompatible element types.');
      if (
        expr.value.kind === 'literal' &&
        !literalWithinDomains(
          expr.value.value,
          expr.kind === 'subset' ? collection : collection.element,
        )
      )
        invalid('Collection literal is outside the declared value domain.');
      if (
        expr.collection.kind === 'literal' &&
        Array.isArray(expr.collection.value) &&
        !expr.collection.value.every((item) => literalWithinDomains(item, element))
      )
        invalid('Collection literal is outside the declared value domain.');
      return { kind: 'boolean' };
    }
    case 'reachable': {
      requireKind(infer(expr.root), ['string', 'enum']);
      const edges = infer(expr.edges);
      if (edges.kind !== 'list') return invalid('Reachability edges must be a list.');
      const edge = edges.element as InferredType;
      if (edge.kind !== 'empty') {
        if (
          edge.kind !== 'record' ||
          Object.keys(edge.fields).length !== 2 ||
          !own(edge.fields, 'from') ||
          !own(edge.fields, 'to')
        )
          return invalid('Reachability edges need exactly from/to fields.');
        requireKind(edge.fields.from!, ['string', 'enum']);
        requireKind(edge.fields.to!, ['string', 'enum']);
      }
      return { kind: 'list', element: { kind: 'string' } };
    }
    case 'every': {
      const collection = infer(expr.collection);
      if (collection.kind !== 'list') return invalid('Quantified collection must be a list.');
      const predicate = expressionType(expr.predicate, {
        ...environment,
        local: { ...environment.local, [expr.variable]: collection.element },
      });
      requireKind(predicate, ['boolean']);
      return { kind: 'boolean' };
    }
  }
}
export function requireExpressionType(
  expr: Expression,
  expected: ValueType,
  environment: TypeEnvironment,
): void {
  if (expr.kind === 'literal') {
    if (!matchesType(expr.value, expected)) invalid('Literal has the wrong declared type.');
    return;
  }
  const actual = expressionType(expr, environment);
  const assignable = (from: InferredType, to: ValueType): boolean => {
    if (from.kind === 'empty') return true;
    if (to.kind === 'number' && from.kind === 'integer') return true;
    if (to.kind === 'string' && from.kind === 'enum') return true;
    if (to.kind === 'enum')
      return from.kind === 'enum' && from.values.every((value) => to.values.includes(value));
    if (to.kind === 'list') return from.kind === 'list' && assignable(from.element, to.element);
    if (to.kind === 'record')
      return (
        from.kind === 'record' &&
        Object.keys(from.fields).length === Object.keys(to.fields).length &&
        Object.entries(to.fields).every(
          ([key, type]) => own(from.fields, key) && assignable(from.fields[key]!, type),
        )
      );
    return from.kind === to.kind;
  };
  if (!assignable(actual, expected)) invalid('Expression result has the wrong type.');
}

export function formatExpression(expr: Expression): string {
  switch (expr.kind) {
    case 'literal':
      return JSON.stringify(expr.value);
    case 'ref':
      return [expr.root, ...expr.path].join('.');
    case 'opaque':
      return `Unformalized: ${expr.text}`;
    case 'not':
      return `not (${formatExpression(expr.value)})`;
    case 'length':
    case 'unique':
      return `${expr.kind}(${formatExpression(expr.value)})`;
    case 'all':
    case 'any':
      return (
        expr.terms
          .map((term) => `(${formatExpression(term)})`)
          .join(expr.kind === 'all' ? ' and ' : ' or ') || (expr.kind === 'all' ? 'true' : 'false')
      );
    case 'compare':
      return `${formatExpression(expr.left)} ${{ eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' }[expr.op]} ${formatExpression(expr.right)}`;
    case 'contains':
      return `${formatExpression(expr.collection)} contains ${formatExpression(expr.value)}`;
    case 'subset':
      return `${formatExpression(expr.value)} is a subset of ${formatExpression(expr.collection)}`;
    case 'reachable':
      return `IDs reachable from ${formatExpression(expr.root)} through ${formatExpression(expr.edges)} (including the root)`;
    case 'every':
      return `every ${expr.variable} in ${formatExpression(expr.collection)}: ${formatExpression(expr.predicate)}`;
  }
}
