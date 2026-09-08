import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { ClearingsError } from '../model/types.js';
import { digest, normalized } from '../semantics/identity.js';
import { assertPortable } from '../specification/validate.js';
import type {
  Program,
  ProgramExpression,
  ProgramFunction,
  ProgramStatement,
  ProgramType,
  ProgramValue,
} from './model.js';

export const PROGRAM_VALIDATION_LIMITS = Object.freeze({
  portable_values: 50000,
  type_depth: 16,
  semantic_steps: 200000,
});
const schema = JSON.parse(
  readFileSync(new URL('../../schemas/program.v0.1.json', import.meta.url), 'utf8'),
);
const checkSchema = new Ajv({
  strict: true,
  allErrors: false,
  allowUnionTypes: true,
  ownProperties: true,
}).compile(schema);
const invalid = (path: string, rule: string, message: string): never => {
  throw new ClearingsError('INVALID_PROGRAM', `${path || '/'}: ${message}`, 2, { path, rule });
};
const pointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');
function portable(value: unknown): void {
  try {
    assertPortable(value, PROGRAM_VALIDATION_LIMITS.portable_values);
  } catch (error) {
    if (!(error instanceof ClearingsError)) throw error;
    invalid('', 'portability', error.message);
  }
}

/** Compute content identity for portable object input; this does not establish well-formedness. */
export function programIdentity(value: Program | Omit<Program, 'artifact_id'>): string {
  portable(value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('', 'schema', 'Expected a program object.');
  const { artifact_id: _, ...body } = value as Program;
  return digest('program', body);
}

/** Copy, identify, and statically validate a program. No program is executed. */
export function sealProgram(value: Program | Omit<Program, 'artifact_id'>): Program {
  const artifact_id = programIdentity(value);
  const result = normalized({ ...value, artifact_id });
  validateProgram(result);
  return result;
}

interface Binding {
  type: ProgramType;
  mutable: boolean;
}
type Environment = Map<string, Binding>;
const integer: ProgramType = { kind: 'integer' },
  boolean: ProgramType = { kind: 'boolean' };

/** Check syntax, integrity, lexical scope, types, completion paths, and declared failures. */
export function validateProgram(value: unknown): asserts value is Program {
  portable(value);
  if (!checkSchema(value)) {
    const error = checkSchema.errors?.at(-1);
    invalid(
      error?.instancePath ?? '',
      'schema',
      `Program schema mismatch: ${error?.message ?? 'invalid structure'}.`,
    );
  }
  const program = value as Program;
  if (program.artifact_id !== programIdentity(program))
    invalid('/artifact_id', 'identity', 'Program digest does not match its content.');
  let work = 0;
  const step = (path: string, count = 1): void => {
    work += count;
    if (work > PROGRAM_VALIDATION_LIMITS.semantic_steps)
      invalid(path, 'work-limit', 'Program exceeds the static validation work limit.');
  };
  function type(annotation: ProgramType, path: string, depth = 0): void {
    step(path);
    if (depth > PROGRAM_VALIDATION_LIMITS.type_depth)
      invalid(path, 'type-depth', 'Type exceeds the maximum constructor nesting depth.');
    if (annotation.kind === 'list') return type(annotation.element, `${path}/element`, depth + 1);
    if (annotation.kind === 'record')
      for (const [name, field] of Object.entries(annotation.fields))
        type(field, `${path}/fields/${pointer(name)}`, depth + 1);
  }
  function same(left: ProgramType, right: ProgramType, path: string): boolean {
    step(path);
    if (left.kind !== right.kind) return false;
    if (left.kind === 'list' && right.kind === 'list')
      return same(left.element, right.element, path);
    if (left.kind === 'record' && right.kind === 'record') {
      const keys = Object.keys(left.fields);
      return (
        keys.length === Object.keys(right.fields).length &&
        keys.every(
          (key) =>
            Object.hasOwn(right.fields, key) && same(left.fields[key]!, right.fields[key]!, path),
        )
      );
    }
    return true;
  }
  const requireType = (actual: ProgramType, expected: ProgramType, path: string): void => {
    if (!same(actual, expected, path))
      invalid(
        path,
        'type',
        `Expected the declared ${expected.kind} type; received an incompatible ${actual.kind} type.`,
      );
  };
  function literal(value: ProgramValue, type: ProgramType, path: string): void {
    step(path);
    if (type.kind === 'list' && Array.isArray(value)) {
      value.forEach((item, index) => literal(item, type.element, `${path}/${index}`));
      return;
    }
    if (
      type.kind === 'record' &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      if (
        Object.keys(value).length !== Object.keys(type.fields).length ||
        Object.keys(type.fields).some((key) => !Object.hasOwn(value, key))
      )
        invalid(path, 'literal', 'Literal must contain exactly the declared record fields.');
      for (const [key, field] of Object.entries(type.fields))
        literal(value[key]!, field, `${path}/${pointer(key)}`);
      return;
    }
    if (
      (type.kind === 'null' && value === null) ||
      (type.kind === 'integer' && Number.isSafeInteger(value)) ||
      (type.kind === 'boolean' && typeof value === 'boolean') ||
      (type.kind === 'string' && typeof value === 'string')
    )
      return;
    invalid(path, 'literal', `Literal does not inhabit its declared ${type.kind} type.`);
  }

  const functions = new Map<
    string,
    { fn: ProgramFunction; path: string; failures: Map<string, ProgramType> }
  >();
  for (const [index, fn] of program.functions.entries()) {
    const path = `/functions/${index}`;
    if (functions.has(fn.id))
      invalid(`${path}/id`, 'duplicate-function', `Duplicate function ID: ${fn.id}.`);
    const parameters = new Set<string>(),
      failures = new Map<string, ProgramType>();
    fn.parameters.forEach((parameter, index) => {
      if (parameters.has(parameter.name))
        invalid(
          `${path}/parameters/${index}/name`,
          'duplicate-binding',
          `Duplicate parameter: ${parameter.name}.`,
        );
      parameters.add(parameter.name);
      type(parameter.type, `${path}/parameters/${index}/type`);
    });
    type(fn.returns, `${path}/returns`);
    fn.failures.forEach((failure, index) => {
      if (failures.has(failure.code))
        invalid(
          `${path}/failures/${index}/code`,
          'duplicate-failure',
          `Duplicate failure code: ${failure.code}.`,
        );
      failures.set(failure.code, failure.details);
      type(failure.details, `${path}/failures/${index}/details`);
    });
    functions.set(fn.id, { fn, path, failures });
  }
  if (!functions.has(program.entry_function))
    invalid('/entry_function', 'reference', 'Entry function is not defined by this program.');
  const calls = new Map<string, Map<string, string>>();
  for (const { fn, path, failures } of functions.values()) {
    const edges = new Map<string, string>();
    calls.set(fn.id, edges);
    function expression(
      expr: ProgramExpression,
      environment: Environment,
      path: string,
    ): ProgramType {
      step(path);
      const sub = (child: ProgramExpression, key: string) =>
        expression(child, environment, `${path}/${key}`);
      const list = (child: ProgramExpression): Extract<ProgramType, { kind: 'list' }> => {
        const result = sub(child, 'list');
        if (result.kind !== 'list') invalid(`${path}/list`, 'type', 'Expected a list.');
        return result as Extract<ProgramType, { kind: 'list' }>;
      };
      switch (expr.kind) {
        case 'literal':
          type(expr.type, `${path}/type`);
          literal(expr.value, expr.type, `${path}/value`);
          return expr.type;
        case 'ref': {
          const binding = environment.get(expr.name);
          if (!binding)
            return invalid(`${path}/name`, 'scope', `Binding is not in scope: ${expr.name}.`);
          return binding.type;
        }
        case 'record': {
          const fields = new Map<string, ProgramType>();
          expr.fields.forEach((field, index) => {
            if (fields.has(field.name))
              invalid(
                `${path}/fields/${index}/name`,
                'duplicate-field',
                `Duplicate record field: ${field.name}.`,
              );
            fields.set(field.name, sub(field.value, `fields/${index}/value`));
          });
          return { kind: 'record', fields: Object.fromEntries(fields) };
        }
        case 'field': {
          const record = sub(expr.record, 'record');
          if (record.kind !== 'record' || !Object.hasOwn(record.fields, expr.name))
            return invalid(`${path}/name`, 'field', `No declared record field: ${expr.name}.`);
          return record.fields[expr.name]!;
        }
        case 'list':
          type(expr.element_type, `${path}/element_type`);
          expr.items.forEach((item, index) =>
            requireType(sub(item, `items/${index}`), expr.element_type, `${path}/items/${index}`),
          );
          return { kind: 'list', element: expr.element_type };
        case 'index': {
          const collection = list(expr.list);
          requireType(sub(expr.index, 'index'), integer, `${path}/index`);
          return collection.element;
        }
        case 'length':
          list(expr.list);
          return integer;
        case 'sort': {
          const collection = list(expr.list);
          if (!['integer', 'string'].includes(collection.element.kind))
            invalid(`${path}/list`, 'type', 'Sorting requires a list of integers or strings.');
          return collection;
        }
        case 'append':
        case 'contains': {
          const collection = list(expr.list);
          requireType(sub(expr.value, 'value'), collection.element, `${path}/value`);
          return expr.kind === 'append' ? collection : boolean;
        }
        case 'not':
          requireType(sub(expr.value, 'value'), boolean, `${path}/value`);
          return boolean;
        case 'binary': {
          const left = sub(expr.left, 'left'),
            right = sub(expr.right, 'right');
          if (expr.op === 'and' || expr.op === 'or') {
            requireType(left, boolean, `${path}/left`);
            requireType(right, boolean, `${path}/right`);
            return boolean;
          }
          if (expr.op === 'add' || expr.op === 'sub') {
            requireType(left, integer, `${path}/left`);
            requireType(right, integer, `${path}/right`);
            return integer;
          }
          requireType(right, left, `${path}/right`);
          if (expr.op !== 'eq' && expr.op !== 'ne' && !['integer', 'string'].includes(left.kind))
            invalid(path, 'type', 'Ordering requires integers or strings of the same type.');
          return boolean;
        }
        case 'call': {
          const callee = functions.get(expr.function_id);
          if (!callee)
            return invalid(
              `${path}/function_id`,
              'reference',
              `Function is not defined by this program: ${expr.function_id}.`,
            );
          edges.set(expr.function_id, path);
          if (expr.arguments.length !== callee.fn.parameters.length)
            invalid(
              `${path}/arguments`,
              'arity',
              'Argument count differs from the function signature.',
            );
          expr.arguments.forEach((argument, index) =>
            requireType(
              sub(argument, `arguments/${index}`),
              callee.fn.parameters[index]!.type,
              `${path}/arguments/${index}`,
            ),
          );
          for (const [code, details] of callee.failures) {
            const declared = failures.get(code);
            if (!declared)
              invalid(
                path,
                'failure-propagation',
                `Caller must declare propagated failure: ${code}.`,
              );
            requireType(details, declared!, path);
          }
          return callee.fn.returns;
        }
      }
    }
    // Returns whether a syntactic path can reach the end of the block. No constant folding.
    function block(statements: ProgramStatement[], parent: Environment, path: string): boolean {
      step(path, parent.size + 1);
      const environment = new Map(parent);
      let fallsThrough = true;
      for (const [index, statement] of statements.entries()) {
        const at = `${path}/${index}`;
        step(at);
        if (!fallsThrough)
          invalid(at, 'unreachable', 'Statement follows a block that always returns or fails.');
        const expr = (value: ProgramExpression, key: string) =>
          expression(value, environment, `${at}/${key}`);
        switch (statement.kind) {
          case 'let':
          case 'var':
            if (environment.has(statement.name))
              invalid(
                `${at}/name`,
                'duplicate-binding',
                `Binding would shadow an active name: ${statement.name}.`,
              );
            type(statement.type, `${at}/type`);
            requireType(expr(statement.value, 'value'), statement.type, `${at}/value`);
            environment.set(statement.name, {
              type: statement.type,
              mutable: statement.kind === 'var',
            });
            break;
          case 'assign': {
            const binding = environment.get(statement.name);
            if (!binding)
              invalid(`${at}/name`, 'scope', `Binding is not in scope: ${statement.name}.`);
            if (!binding!.mutable)
              invalid(`${at}/name`, 'immutable', 'Only var bindings can be assigned.');
            requireType(expr(statement.value, 'value'), binding!.type, `${at}/value`);
            break;
          }
          case 'if': {
            requireType(expr(statement.condition, 'condition'), boolean, `${at}/condition`);
            const thenFalls = block(statement.then, environment, `${at}/then`),
              elseFalls = block(statement.else, environment, `${at}/else`);
            fallsThrough = thenFalls || elseFalls;
            break;
          }
          case 'while':
            requireType(expr(statement.condition, 'condition'), boolean, `${at}/condition`);
            block(statement.body, environment, `${at}/body`);
            break;
          case 'return':
            requireType(expr(statement.value, 'value'), fn.returns, `${at}/value`);
            fallsThrough = false;
            break;
          case 'fail': {
            const details = failures.get(statement.code);
            if (!details)
              invalid(`${at}/code`, 'failure', `Function must declare failure: ${statement.code}.`);
            requireType(expr(statement.details, 'details'), details!, `${at}/details`);
            fallsThrough = false;
            break;
          }
        }
      }
      return fallsThrough;
    }
    const parameters = new Map(
      fn.parameters.map((parameter) => [parameter.name, { type: parameter.type, mutable: false }]),
    );
    if (block(fn.body, parameters, `${path}/body`))
      invalid(
        `${path}/body`,
        'fallthrough',
        'Every function path must explicitly return or fail; loops may execute zero times.',
      );
  }
  // Acyclic IR calls are separate from cyclic dependency graphs represented as input data.
  const active = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    visited.add(id);
    active.add(id);
    for (const [callee, path] of calls.get(id)!) {
      step(path);
      if (active.has(callee))
        invalid(
          path,
          'recursive-call',
          'Recursive calls are outside Program IR v0.1; use iteration.',
        );
      if (!visited.has(callee)) visit(callee);
    }
    active.delete(id);
  }
  for (const id of functions.keys()) if (!visited.has(id)) visit(id);
}
