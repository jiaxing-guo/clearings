import { ClearingsError } from '../model/types.js';
import type {
  Program,
  ProgramExpression,
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
class Source {
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
  private source = new Source();
  private next = 0;
  private functions: Map<string, number>;
  constructor(private program: Program) {
    this.functions = new Map(program.functions.map((fn, index) => [fn.id, index]));
  }
  private fresh(prefix: string): string {
    return `${prefix}_${this.next++}`;
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
  private lookup(scope: Scope, name: string): Binding {
    const binding = scope.bindings.get(name);
    if (!binding) throw new Error('Validated binding is missing during Rust emission.');
    return binding;
  }
  private load(scope: Scope, name: string): string {
    const binding = this.lookup(scope, name);
    return (
      `rt.lookup(${quoted(name)}, ${scope.depth - binding.depth + 1})?;\n` +
      `Ok(locals[${binding.slot}].as_ref().ok_or(RuntimeError::InvalidAbi("Uninitialized generated local."))?.clone())`
    );
  }
  private expression(expr: ProgramExpression, scope: Scope, path: string): string {
    const name = this.fresh('e');
    const children = new Map<string, string>();
    const child = (value: ProgramExpression, key: string) =>
      children.set(key, this.expression(value, scope, `${path}/${key}`));
    switch (expr.kind) {
      case 'record':
        expr.fields.forEach((field, i) => child(field.value, `fields/${i}/value`));
        break;
      case 'field':
        child(expr.record, 'record');
        break;
      case 'list':
        expr.items.forEach((item, i) => child(item, `items/${i}`));
        break;
      case 'index':
        child(expr.list, 'list');
        child(expr.index, 'index');
        break;
      case 'length':
      case 'sort':
        child(expr.list, 'list');
        break;
      case 'append':
      case 'contains':
        child(expr.list, 'list');
        child(expr.value, 'value');
        break;
      case 'not':
        child(expr.value, 'value');
        break;
      case 'binary':
        child(expr.left, 'left');
        child(expr.right, 'right');
        break;
      case 'call':
        expr.arguments.forEach((arg, i) => child(arg, `arguments/${i}`));
        break;
    }
    const call = (key: string): string => `${children.get(key)!}(rt, locals)?`;
    this.write(
      `fn ${name}(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Value> {\nrt.enter(${quoted(path)}, |rt| {\n`,
    );
    switch (expr.kind) {
      case 'literal':
        this.write('let value = ');
        this.owned(expr.value);
        this.write(`;\nrt.import(&value, ${quoted(`${path}/value`)})`);
        break;
      case 'ref':
        this.write(this.load(scope, expr.name));
        break;
      case 'record':
        this.write('let mut fields = Vec::new();\n');
        expr.fields.forEach((field, i) => {
          this.write(`let value = ${call(`fields/${i}/value`)};\nfields.push((`);
          this.units(field.name);
          this.write(', value));\n');
        });
        this.write('rt.record(fields)');
        break;
      case 'list':
        this.write('let mut items = Vec::new();\n');
        expr.items.forEach((_, i) => this.write(`items.push(${call(`items/${i}`)});\n`));
        this.write('rt.list(items)');
        break;
      case 'field':
        this.write(`let record = ${call('record')};\nrt.field(&record, &`);
        this.units(expr.name);
        this.write(')');
        break;
      case 'index':
        this.write(
          `let list = ${call('list')};\nlet index = ${call('index')};\nrt.index(&list, &index)`,
        );
        break;
      case 'length':
      case 'sort':
        this.write(`let list = ${call('list')};\nrt.${expr.kind}(&list)`);
        break;
      case 'append':
      case 'contains':
        this.write(
          `let list = ${call('list')};\nlet value = ${call('value')};\nrt.${expr.kind}(&list, &value)`,
        );
        break;
      case 'not':
        this.write(`let value = ${call('value')};\nrt.not(&value)`);
        break;
      case 'binary':
        this.write(`let left = ${call('left')};\n`);
        if (expr.op === 'and' || expr.op === 'or') {
          this.write(
            `if left.boolean()? == ${expr.op === 'or'} { return Ok(left); }\nOk(${call('right')})`,
          );
        } else {
          this.write(`let right = ${call('right')};\n`);
          if (expr.op === 'add' || expr.op === 'sub')
            this.write(`rt.arithmetic(&left, &right, ${expr.op === 'sub'})`);
          else if (expr.op === 'eq' || expr.op === 'ne')
            this.write(
              `let equal = rt.equal(&left, &right)?;\nrt.boolean(${expr.op === 'ne' ? '!' : ''}equal)`,
            );
          else {
            const comparison = {
              lt: '== Ordering::Less',
              lte: '!= Ordering::Greater',
              gt: '== Ordering::Greater',
              gte: '!= Ordering::Less',
            }[expr.op];
            this.write(`let order = rt.compare(&left, &right)?;\nrt.boolean(order ${comparison})`);
          }
        }
        break;
      case 'call':
        this.write('let mut args = Vec::new();\n');
        expr.arguments.forEach((_, i) => this.write(`args.push(${call(`arguments/${i}`)});\n`));
        this.write(`f_${this.functions.get(expr.function_id)!}(rt, &args, ${quoted(path)})`);
    }
    this.write('\n})\n}\n');
    return name;
  }
  private block(statements: ProgramStatement[], parent: Scope, path: string): string {
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
          const binding = this.lookup(scope, statement.name);
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
      bodies.push(
        this.source.reserve(
          `if let Some(value) = rt.at(${quoted(at)}, |rt| {\nrt.work(1)?;\n${body}\n})? { return Ok(Some(value)); }\n`,
        ),
      );
    }
    this.write(
      `fn ${name}(rt: &mut Runtime, locals: &mut [Option<Value>]) -> Eval<Option<Value>> {\nlet result = rt.enter(${quoted(path)}, |rt| {\n`,
    );
    for (const body of bodies) this.source.appendReserved(body);
    this.write('Ok(None)\n});\n');
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
    for (const [index, fn] of this.program.functions.entries()) {
      const scope: Scope = { bindings: new Map(), depth: 0, slots: { next: 0 } };
      fn.parameters.forEach((parameter) =>
        scope.bindings.set(parameter.name, { slot: scope.slots.next++, depth: 0 }),
      );
      const body = this.block(fn.body, scope, `/functions/${index}/body`);
      this.write(
        `fn f_${index}(rt: &mut Runtime, args: &[Value], call_path: &str) -> Eval<Value> {\nrt.call(${quoted(fn.id)}, call_path, "/functions/${index}", |rt| {\nlet mut locals = vec![None; ${scope.slots.next}];\n`,
      );
      fn.parameters.forEach((parameter, i) =>
        this.write(
          `rt.bind(${quoted(parameter.name)})?;\nlocals[${i}] = Some(args[${i}].clone());\n`,
        ),
      );
      this.write(
        `${body}(rt, &mut locals)?.ok_or(RuntimeError::InvalidAbi("Generated function did not return or fail."))\n})\n}\n`,
      );
    }
    const entryIndex = this.functions.get(this.program.entry_function)!;
    this.write(
      'pub fn execute(arguments: &[OwnedValue], limits: Limits) -> Result<Execution, ExecutionError> {\nlet mut rt = Runtime::new(limits).map_err(ExecutionError::Limits)?;\nlet types = vec![',
    );
    for (const parameter of this.program.functions[entryIndex]!.parameters) {
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
