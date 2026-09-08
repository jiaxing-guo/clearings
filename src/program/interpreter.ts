import type { ProgramExpression, ProgramStatement, ProgramValue } from './model.js';
import { prepareProgramExecution } from './preparation.js';
import { PROGRAM_INTERPRETER_VERSION } from './execution.js';
import type {
  ProgramExecutionCompletion,
  ProgramExecutionOptions,
  ProgramExecutionResult,
} from './execution.js';
import { ExecutionHalt, ExecutionMeter, RuntimeValues, type RuntimeValue } from './runtime.js';

interface Cell {
  value: RuntimeValue;
}
interface Environment {
  bindings: Map<string, Cell>;
  parent?: Environment;
}

/** Execute the validated entry function synchronously with owned arguments and finite limits. */
export function executeProgram(
  input: unknown,
  arguments_: unknown,
  options: ProgramExecutionOptions = {},
): ProgramExecutionResult {
  const { program, args, limits } = prepareProgramExecution(input, arguments_, options);
  const functions = new Map(
    program.functions.map((fn, index) => [fn.id, { fn, path: `/functions/${index}` }]),
  );

  const meter = new ExecutionMeter(limits),
    values = new RuntimeValues(meter);
  function lookup(environment: Environment, name: string): Cell {
    meter.work(name.length);
    for (let current: Environment | undefined = environment; current; current = current.parent) {
      meter.work();
      const cell = current.bindings.get(name);
      if (cell) return cell;
    }
    throw new Error('Validated program contains an unresolved runtime binding.');
  }
  function bind(environment: Environment, name: string, value: RuntimeValue): void {
    meter.work(1 + name.length);
    environment.bindings.set(name, { value });
  }
  function invoke(id: string, args: RuntimeValue[], callPath: string): RuntimeValue {
    const { fn, path } = functions.get(id)!;
    meter.calls.push({ function_id: id, call_path: callPath });
    try {
      return meter.enter(path, () => {
        meter.work(id.length);
        const environment: Environment = { bindings: new Map() };
        fn.parameters.forEach((parameter, index) =>
          bind(environment, parameter.name, args[index]!),
        );
        const returned = block(fn.body, environment, `${path}/body`);
        if (returned === undefined)
          throw new Error('Validated function completed without an explicit return or failure.');
        return returned;
      });
    } finally {
      meter.calls.pop();
    }
  }
  function expression(
    expr: ProgramExpression,
    environment: Environment,
    path: string,
  ): RuntimeValue {
    return meter.enter(path, () => {
      const sub = (value: ProgramExpression, key: string) =>
        expression(value, environment, `${path}/${key}`);
      switch (expr.kind) {
        case 'literal':
          return values.import(expr.value, `${path}/value`);
        case 'ref':
          return lookup(environment, expr.name).value;
        case 'record':
          return values.record(
            expr.fields.map((field, index) => [
              field.name,
              sub(field.value, `fields/${index}/value`),
            ]),
          );
        case 'field': {
          const record = sub(expr.record, 'record');
          meter.work(1 + expr.name.length);
          return (record.data as Map<string, RuntimeValue>).get(expr.name)!;
        }
        case 'list':
          return values.list(expr.items.map((item, index) => sub(item, `items/${index}`)));
        case 'index': {
          const list = sub(expr.list, 'list').data as RuntimeValue[],
            index = sub(expr.index, 'index').data as number;
          meter.work();
          if (index < 0 || index >= list.length)
            meter.fault(
              'INDEX_OUT_OF_BOUNDS',
              `Index ${index} is outside a list of length ${list.length}.`,
            );
          return list[index]!;
        }
        case 'length':
          return values.scalar((sub(expr.list, 'list').data as RuntimeValue[]).length);
        case 'sort':
          return values.sort(sub(expr.list, 'list'));
        case 'append': {
          const list = sub(expr.list, 'list'),
            value = sub(expr.value, 'value');
          return values.append(list, value);
        }
        case 'contains': {
          const list = sub(expr.list, 'list').data as RuntimeValue[],
            value = sub(expr.value, 'value');
          return values.scalar(list.some((item) => values.equal(item, value)));
        }
        case 'not':
          return values.scalar(!sub(expr.value, 'value').data);
        case 'binary': {
          const left = sub(expr.left, 'left');
          if (
            (expr.op === 'and' && left.data === false) ||
            (expr.op === 'or' && left.data === true)
          )
            return left;
          const right = sub(expr.right, 'right');
          if (expr.op === 'and' || expr.op === 'or') return right;
          if (expr.op === 'eq' || expr.op === 'ne') {
            const equal = values.equal(left, right);
            return values.scalar(expr.op === 'eq' ? equal : !equal);
          }
          if (expr.op === 'add' || expr.op === 'sub') {
            meter.work();
            const result =
              expr.op === 'add'
                ? (left.data as number) + (right.data as number)
                : (left.data as number) - (right.data as number);
            if (!Number.isSafeInteger(result))
              meter.fault(
                'INTEGER_OVERFLOW',
                'Arithmetic result is outside the safe-integer domain.',
              );
            return values.scalar(result);
          }
          const order = values.compare(left.data as number | string, right.data as number | string);
          return values.scalar(
            expr.op === 'lt'
              ? order < 0
              : expr.op === 'lte'
                ? order <= 0
                : expr.op === 'gt'
                  ? order > 0
                  : order >= 0,
          );
        }
        case 'call':
          return invoke(
            expr.function_id,
            expr.arguments.map((arg, index) => sub(arg, `arguments/${index}`)),
            path,
          );
      }
    });
  }
  function block(
    statements: ProgramStatement[],
    parent: Environment,
    path: string,
  ): RuntimeValue | undefined {
    return meter.enter(path, () => {
      const environment: Environment = { bindings: new Map(), parent };
      for (const [index, statement] of statements.entries()) {
        const at = `${path}/${index}`;
        const returned = meter.at(at, () => {
          meter.work();
          const expr = (value: ProgramExpression, key: string) =>
            expression(value, environment, `${at}/${key}`);
          switch (statement.kind) {
            case 'let':
            case 'var':
              bind(environment, statement.name, expr(statement.value, 'value'));
              break;
            case 'assign': {
              const value = expr(statement.value, 'value');
              lookup(environment, statement.name).value = value;
              break;
            }
            case 'if': {
              const branch = expr(statement.condition, 'condition').data ? 'then' : 'else';
              return block(statement[branch], environment, `${at}/${branch}`);
            }
            case 'while':
              while (expr(statement.condition, 'condition').data) {
                const returned = block(statement.body, environment, `${at}/body`);
                if (returned !== undefined) return returned;
              }
              break;
            case 'return':
              return expr(statement.value, 'value');
            case 'fail': {
              const details = expr(statement.details, 'details');
              throw new ExecutionHalt({
                kind: 'application-failure',
                code: statement.code,
                details,
                diagnostic: meter.diagnostic(),
              });
            }
          }
          return undefined;
        });
        if (returned !== undefined) return returned;
      }
      return undefined;
    });
  }
  const result = (completion: ProgramExecutionCompletion): ProgramExecutionResult => ({
    program_id: program.artifact_id,
    interpreter_version: PROGRAM_INTERPRETER_VERSION,
    limits: { ...limits },
    usage: { ...meter.usage },
    completion,
  });
  const output = (value: RuntimeValue, path: string): ProgramValue => {
    meter.phase = 'result';
    return meter.at(path, () => values.export(value));
  };
  try {
    const imported = args.map((value, index) => values.import(value, `/arguments/${index}`));
    meter.phase = 'execution';
    const returned = invoke(program.entry_function, imported, '/entry_function');
    return result({ kind: 'return', value: output(returned, '/result/value') });
  } catch (error) {
    if (!(error instanceof ExecutionHalt)) throw error;
    if (error.completion.kind !== 'application-failure') return result(error.completion);
    try {
      return result({
        ...error.completion,
        details: output(error.completion.details, '/result/details'),
      });
    } catch (copyError) {
      if (
        !(copyError instanceof ExecutionHalt) ||
        copyError.completion.kind === 'application-failure'
      )
        throw copyError;
      return result(copyError.completion);
    }
  }
}
