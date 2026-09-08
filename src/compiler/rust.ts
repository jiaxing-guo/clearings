import { ClearingsError } from '../model/types.js';
import type {
  Program,
  ProgramExpression,
  ProgramFunction,
  ProgramStatement,
  ProgramType,
  ProgramValue,
} from '../program/model.js';
import { normalized } from '../semantics/identity.js';
import { RUST_ARTIFACT_LIMITS, sealRustArtifact, validateCompilationInput } from './artifacts.js';
import type { RustCompiledArtifact, RustRuntimeIdentity } from './artifacts.js';

export const RUST_COMPILATION_LIMITS = Object.freeze({
  work: 250_000,
  source_bytes: RUST_ARTIFACT_LIMITS.source_bytes,
});

/** Incremental bounds apply before retaining generated text, including literal expansion. */
class RustSourceBuffer {
  private parts: string[] = [];
  private bytes = 0;
  private work = 0;
  reserve(text: string): string {
    if (++this.work > RUST_COMPILATION_LIMITS.work)
      this.reject('work-limit', 'Code generation exceeds its work limit.');
    const bytes = Buffer.byteLength(text, 'utf8');
    if (this.bytes + bytes > RUST_COMPILATION_LIMITS.source_bytes)
      this.reject('source-limit', 'Generated Rust exceeds its source byte limit.');
    this.bytes += bytes;
    return text;
  }
  write(text: string): void {
    this.parts.push(this.reserve(text));
  }
  appendReserved(text: string): void {
    this.parts.push(text);
  }
  private reject(rule: string, message: string): never {
    throw new ClearingsError('INVALID_COMPILED_PROGRAM', message, 2, {
      path: '/module/source',
      rule,
    });
  }
  finish(): string {
    return this.parts.join('');
  }
}
interface Binding {
  slot: number;
  depth: number;
}
interface Scope {
  bindings: Map<string, Binding>;
  depth: number;
  slots: { next: number };
}
// Only validated ASCII identifiers and compiler-created paths reach this encoder.
const quoted = (text: string): string => JSON.stringify(text);

class Emitter {
  private readonly source = new RustSourceBuffer();
  private nextIdentifier = 0;
  private readonly functionTargets: Map<string, { index: number; definition: ProgramFunction }>;
  constructor(private readonly program: Program) {
    this.functionTargets = new Map(
      program.functions.map((definition, index) => [definition.id, { index, definition }]),
    );
  }
  private functionTarget(id: string): { index: number; definition: ProgramFunction } {
    const target = this.functionTargets.get(id);
    if (!target) throw new Error('Validated function is missing during Rust emission.');
    return target;
  }
  private fresh(prefix: string): string {
    return `${prefix}_${this.nextIdentifier++}`;
  }
  private write(text: string): void {
    this.source.write(text);
  }
  private units(text: string): void {
    this.write('vec![');
    for (let i = 0; i < text.length; i++) this.write(`${text.charCodeAt(i)},`);
    this.write(']');
  }
  private owned(value: ProgramValue): void {
    if (value === null) this.write('OwnedValue::Null');
    else if (typeof value === 'boolean') this.write(`OwnedValue::Boolean(${value})`);
    else if (typeof value === 'number') this.write(`OwnedValue::Integer(${value})`);
    else if (typeof value === 'string') {
      this.write('OwnedValue::String(');
      this.units(value);
      this.write(')');
    } else if (Array.isArray(value)) {
      this.write('OwnedValue::List(vec![');
      for (const child of value) {
        this.owned(child);
        this.write(',');
      }
      this.write('])');
    } else {
      this.write('OwnedValue::Record(vec![');
      for (const key of Object.keys(value).sort()) {
        this.write('(');
        this.units(key);
        this.write(',');
        this.owned(value[key]!);
        this.write('),');
      }
      this.write('])');
    }
  }
  private type(type: ProgramType): void {
    switch (type.kind) {
      case 'null':
        this.write('Type::Null');
        break;
      case 'boolean':
        this.write('Type::Boolean');
        break;
      case 'integer':
        this.write('Type::Integer');
        break;
      case 'string':
        this.write('Type::String');
        break;
      case 'list':
        this.write('Type::List(Box::new(');
        this.type(type.element);
        this.write('))');
        break;
      case 'record':
        this.write('Type::Record(vec![');
        for (const key of Object.keys(type.fields).sort()) {
          this.write('(');
          this.units(key);
          this.write(',');
          this.type(type.fields[key]!);
          this.write('),');
        }
        this.write('])');
    }
  }
  private lookupBinding(scope: Scope, name: string): Binding {
    const binding = scope.bindings.get(name);
    if (!binding) throw new Error('Validated binding is missing during Rust emission.');
    return binding;
  }
  private load(scope: Scope, name: string): string {
    const binding = this.lookupBinding(scope, name);
    return (
      `rt.lookup(${quoted(name)}, ${scope.depth - binding.depth + 1})?;\n` +
      `Ok(locals[${binding.slot}].as_ref().ok_or(RuntimeError::InvalidAbi("Uninitialized generated local."))?.clone())`
    );
  }
  private expression(expr: ProgramExpression, scope: Scope, path: string): string {
    const name = this.fresh('e');
    // Emit each operand before its parent helper, retaining the original traversal order.
    const writeBody = this.prepareExpressionBody(expr, scope, path);
    this.write(
      `fn ${name}(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Value> {\nenter_value(rt, ${quoted(path)}, locals, ${name}_body)\n}\nfn ${name}_body(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Value> {\n`,
    );
    writeBody();
    this.write('\n}\n');
    return name;
  }
  private prepareExpressionBody(expr: ProgramExpression, scope: Scope, path: string): () => void {
    const operand = (value: ProgramExpression, key: string): string =>
      `${this.expression(value, scope, `${path}/${key}`)}(rt, locals)?`;
    switch (expr.kind) {
      case 'literal':
        return () => {
          this.write('let value = ');
          this.owned(expr.value);
          this.write(`;\nrt.import(&value, ${quoted(`${path}/value`)})`);
        };
      case 'ref':
        return () => this.write(this.load(scope, expr.name));
      case 'record': {
        const fields = expr.fields.map((field, index) => ({
          name: field.name,
          value: operand(field.value, `fields/${index}/value`),
        }));
        return () => {
          this.write('let mut fields = Vec::new();\n');
          fields.forEach(({ name, value }) => {
            this.write(`let value = ${value};\nfields.push((`);
            this.units(name);
            this.write(', value));\n');
          });
          this.write('rt.record(fields)');
        };
      }
      case 'list': {
        const items = expr.items.map((item, index) => operand(item, `items/${index}`));
        return () => {
          this.write('let mut items = Vec::new();\n');
          items.forEach((item) => this.write(`items.push(${item});\n`));
          this.write('rt.list(items)');
        };
      }
      case 'field': {
        const record = operand(expr.record, 'record');
        return () => {
          this.write(`let record = ${record};\nrt.field(&record, &`);
          this.units(expr.name);
          this.write(')');
        };
      }
      case 'index': {
        const list = operand(expr.list, 'list');
        const index = operand(expr.index, 'index');
        return () =>
          this.write(`let list = ${list};\nlet index = ${index};\nrt.index(&list, &index)`);
      }
      case 'length':
      case 'sort': {
        const list = operand(expr.list, 'list');
        return () => this.write(`let list = ${list};\nrt.${expr.kind}(&list)`);
      }
      case 'append':
      case 'contains': {
        const list = operand(expr.list, 'list');
        const value = operand(expr.value, 'value');
        return () =>
          this.write(`let list = ${list};\nlet value = ${value};\nrt.${expr.kind}(&list, &value)`);
      }
      case 'not': {
        const value = operand(expr.value, 'value');
        return () => this.write(`let value = ${value};\nrt.not(&value)`);
      }
      case 'binary': {
        const left = operand(expr.left, 'left');
        const right = operand(expr.right, 'right');
        return () => this.writeBinary(expr.op, left, right);
      }
      case 'call': {
        const args = expr.arguments.map((argument, index) =>
          operand(argument, `arguments/${index}`),
        );
        const { index } = this.functionTarget(expr.function_id);
        return () => {
          this.write('let mut args = Vec::new();\n');
          args.forEach((argument) => this.write(`args.push(${argument});\n`));
          this.write(`f_${index}(rt, &args, ${quoted(path)})`);
        };
      }
    }
  }
  private writeBinary(
    op: Extract<ProgramExpression, { kind: 'binary' }>['op'],
    left: string,
    right: string,
  ): void {
    this.write(`let left = ${left};\n`);
    switch (op) {
      case 'and':
      case 'or':
        this.write(`if left.boolean()? == ${op === 'or'} { return Ok(left); }\nOk(${right})`);
        return;
      default:
        this.write(`let right = ${right};\n`);
    }
    switch (op) {
      case 'add':
      case 'sub':
        this.write(`rt.arithmetic(&left, &right, ${op === 'sub'})`);
        return;
      case 'eq':
      case 'ne':
        this.write(
          `let equal = rt.equal(&left, &right)?;\nrt.boolean(${op === 'ne' ? '!' : ''}equal)`,
        );
        return;
      default: {
        const comparison = {
          lt: '== Ordering::Less',
          lte: '!= Ordering::Greater',
          gt: '== Ordering::Greater',
          gte: '!= Ordering::Less',
        }[op];
        this.write(`let order = rt.compare(&left, &right)?;\nrt.boolean(order ${comparison})`);
      }
    }
  }
  private block(statements: readonly ProgramStatement[], parent: Scope, path: string): string {
    const name = this.fresh('b');
    const scope: Scope = {
      bindings: new Map(parent.bindings),
      depth: parent.depth + 1,
      slots: parent.slots,
    };
    const declarations: number[] = [];
    const bodies: string[] = [];
    for (const [index, statement] of statements.entries()) {
      const at = `${path}/${index}`;
      const expr = (value: ProgramExpression, key: string) =>
        `${this.expression(value, scope, `${at}/${key}`)}(rt, locals)?`;
      let body: string;
      switch (statement.kind) {
        case 'let':
        case 'var': {
          const value = expr(statement.value, 'value');
          const slot = scope.slots.next++;
          scope.bindings.set(statement.name, { slot, depth: scope.depth });
          declarations.push(slot);
          body = `let value = ${value};\nrt.bind(${quoted(statement.name)})?;\nlocals[${slot}] = Some(value);\nOk(None)`;
          break;
        }
        case 'assign': {
          const value = expr(statement.value, 'value');
          const binding = this.lookupBinding(scope, statement.name);
          body = `let value = ${value};\nrt.lookup(${quoted(statement.name)}, ${scope.depth - binding.depth + 1})?;\nlocals[${binding.slot}] = Some(value);\nOk(None)`;
          break;
        }
        case 'if': {
          const condition = expr(statement.condition, 'condition');
          const yes = this.block(statement.then, scope, `${at}/then`);
          const no = this.block(statement.else, scope, `${at}/else`);
          body = `if ${condition}.boolean()? { ${yes}(rt, locals) } else { ${no}(rt, locals) }`;
          break;
        }
        case 'while': {
          const condition = expr(statement.condition, 'condition');
          const block = this.block(statement.body, scope, `${at}/body`);
          body = `while ${condition}.boolean()? {\nif let Some(value) = ${block}(rt, locals)? { return Ok(Some(value)); }\n}\nOk(None)`;
          break;
        }
        case 'return':
          body = `Ok(Some(${expr(statement.value, 'value')}))`;
          break;
        case 'fail':
          body = `let details = ${expr(statement.details, 'details')};\nrt.fail(${quoted(statement.code)}, details)`;
      }
      const statementName = `${name}_statement_${index}`;
      this.write(
        `fn ${statementName}(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Option<Value>> {\n${body}\n}\n`,
      );
      bodies.push(
        this.source.reserve(
          `if let Some(value) = at_statement(rt, ${quoted(at)}, locals, ${statementName})? { return Ok(Some(value)); }\n`,
        ),
      );
    }
    this.write(
      `fn ${name}_body(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Option<Value>> {\n`,
    );
    for (const body of bodies) this.source.appendReserved(body);
    this.write(
      `Ok(None)\n}\nfn ${name}(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Option<Value>> {\nlet result = enter_block(rt, ${quoted(path)}, locals, ${name}_body);\n`,
    );
    for (const slot of declarations) this.write(`locals[${slot}] = None;\n`);
    this.write('result\n}\n');
    return name;
  }
  emit(): string {
    this.write('// Generated by Clearings. Source authority: Program IR.\n');
    // A uniform helper signature keeps output independent of usage analysis.
    this.write(
      '#![allow(unused_variables, unused_mut, dead_code, unused_imports)]\nuse clearings_runtime::*;\nuse std::cmp::Ordering;\n',
    );
    this.write(`pub const PROGRAM_ID: &str = ${quoted(this.program.artifact_id)};\n`);
    this.write(
      "#[derive(Debug)]\npub enum ExecutionError { Limits(&'static str), Input(InputError), Runtime(RuntimeError) }\n",
    );
    this.write(
      '#[derive(Debug)]\npub struct Execution { pub limits: Limits, pub usage: Usage, pub completion: Completion }\n',
    );
    // Function pointers avoid one closure type (and FnOnce shim) per IR node. The four frame
    // adapters have fixed callback types, so deep IR calls do not exhaust Rust monomorphization.
    this.write(
      [
        'type ValueBody = fn(&mut Runtime, &mut [Option<Value>]) -> Eval<Value>;',
        'type BlockBody = fn(&mut Runtime, &mut [Option<Value>]) -> Eval<Option<Value>>;',
        'type FunctionBody = fn(&mut Runtime, &[Value]) -> Eval<Value>;',
        'fn enter_value(rt: &mut Runtime, path: &str, locals: &mut [Option<Value>], action: ValueBody) -> Eval<Value> { rt.enter(path, |rt| action(rt, locals)) }',
        'fn enter_block(rt: &mut Runtime, path: &str, locals: &mut [Option<Value>], action: BlockBody) -> Eval<Option<Value>> { rt.enter(path, |rt| action(rt, locals)) }',
        'fn at_statement(rt: &mut Runtime, path: &str, locals: &mut [Option<Value>], action: BlockBody) -> Eval<Option<Value>> { rt.at(path, |rt| { rt.work(1)?; action(rt, locals) }) }',
        'fn call_function(rt: &mut Runtime, id: &str, call_path: &str, path: &str, args: &[Value], action: FunctionBody) -> Eval<Value> { rt.call(id, call_path, path, |rt| action(rt, args)) }',
        '',
      ].join('\n'),
    );
    for (const [index, fn] of this.program.functions.entries()) {
      const scope: Scope = { bindings: new Map(), depth: 0, slots: { next: 0 } };
      fn.parameters.forEach((parameter) =>
        scope.bindings.set(parameter.name, { slot: scope.slots.next++, depth: 0 }),
      );
      const body = this.block(fn.body, scope, `/functions/${index}/body`);
      this.write(
        `fn f_${index}(rt: &mut Runtime, args: &[Value], call_path: &str) -> Eval<Value> {\ncall_function(rt, ${quoted(fn.id)}, call_path, "/functions/${index}", args, f_${index}_body)\n}\nfn f_${index}_body(rt: &mut Runtime, args: &[Value]) -> Eval<Value> {\nlet mut locals = vec![None; ${scope.slots.next}];\n`,
      );
      fn.parameters.forEach((parameter, i) =>
        this.write(
          `rt.bind(${quoted(parameter.name)})?;\nlocals[${i}] = Some(args[${i}].clone());\n`,
        ),
      );
      this.write(
        `${body}(rt, &mut locals)?.ok_or(RuntimeError::InvalidAbi("Generated function did not return or fail."))\n}\n`,
      );
    }
    const { index: entryIndex, definition: entry } = this.functionTarget(
      this.program.entry_function,
    );
    this.write(
      'pub fn execute(arguments: &[OwnedValue], limits: Limits) -> Result<Execution, ExecutionError> {\nlet mut rt = Runtime::new(limits).map_err(ExecutionError::Limits)?;\nlet types = vec![',
    );
    for (const parameter of entry.parameters) {
      this.type(parameter.type);
      this.write(',');
    }
    this.write(
      '];\nlet arguments = prepare_arguments(arguments, &types).map_err(ExecutionError::Input)?;\nlet result = (|| -> Eval<Value> {\nlet mut args = Vec::new();\nfor (i, argument) in arguments.iter().enumerate() { args.push(rt.import(argument, &format!("/arguments/{i}"))?); }\nrt.set_phase(Phase::Execution);\n',
    );
    this.write(
      `f_${entryIndex}(&mut rt, &args, "/entry_function")\n})();\nlet completion = rt.finish(result).map_err(ExecutionError::Runtime)?;\nOk(Execution { limits: rt.limits(), usage: rt.usage(), completion })\n}\n`,
    );
    return this.source.finish();
  }
}

/** Pure, bounded lowering. The caller supplies the trusted runtime build identity. */
export function compileRust(program: unknown, runtime: RustRuntimeIdentity): RustCompiledArtifact {
  validateCompilationInput(program);
  const source = new Emitter(normalized(program)).emit();
  return sealRustArtifact(program, source, runtime);
}
