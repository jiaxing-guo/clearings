import { ClearingsError, copyValue, type Codec, type Value } from './values.js';
export interface OperationContext {
  readonly signal: AbortSignal;
  readonly deadline: number;
}
export interface Operation<I extends Value, O extends Value> {
  readonly id: string;
  readonly version: string;
  readonly input: Codec<I>;
  readonly output: Codec<O>;
  readonly effect: 'read';
  readonly execute: (input: I, context: OperationContext) => Promise<O>;
}
export function operation<I extends Value, O extends Value>(
  declaration: { id: string; version: string; input: Codec<I>; output: Codec<O>; effect?: 'read' },
  execute: (input: I, context: OperationContext) => Promise<O>,
): Operation<I, O> {
  if (
    Object.keys(declaration).some(
      (k) => !['id', 'version', 'input', 'output', 'effect'].includes(k),
    )
  )
    throw new ClearingsError('UNSUPPORTED');
  if (
    !declaration.id ||
    !declaration.version ||
    `${declaration.id}@${declaration.version}`.length > 256 ||
    (declaration.effect && declaration.effect !== 'read')
  )
    throw new ClearingsError('UNSUPPORTED');
  return Object.freeze({ ...declaration, effect: 'read', execute });
}
export class Ref<T extends Value> {
  declare private readonly resultType: T;
  constructor(
    readonly owner: Context,
    readonly id: number,
  ) {}
}
export interface Spec {
  kind: 'value' | 'call' | 'transform' | 'join';
  deps: number[];
  binding: string;
  source: string;
  value?: Value;
  execute?: (inputs: Value[], context: OperationContext) => Value | Promise<Value>;
  operation?: { id: string; version: string };
}
type Resolved<T> = T extends Ref<infer V> ? V : never;
export class Context {
  readonly nodes: Spec[] = [];
  constructor(
    readonly name: string,
    private readonly reserve: () => void,
  ) {}
  private ref<T extends Value>(spec: Spec): Ref<T> {
    if (spec.source.length > 1024 || !spec.source) throw new ClearingsError('INVALID_PLAN');
    this.reserve();
    const id = this.nodes.length;
    this.nodes.push(spec);
    return new Ref<T>(this, id);
  }
  reference<T extends Value>(ref: Ref<T>): number {
    if (!(ref instanceof Ref) || ref.owner !== this || !this.nodes[ref.id])
      throw new ClearingsError('INVALID_PLAN');
    return ref.id;
  }
  value<T extends Value>(value: T): Ref<T> {
    return this.ref({
      kind: 'value',
      deps: [],
      binding: '',
      source: `${this.name}:input:${this.nodes.length}`,
      value: copyValue(value),
    });
  }
  call<I extends Value, O extends Value>(
    op: Operation<I, O>,
    input: I | Ref<I>,
    source = `${this.name}:${op.id}:${this.nodes.length}`,
  ): Ref<O> {
    if (op.effect !== 'read') throw new ClearingsError('UNSUPPORTED');
    const dep = input instanceof Ref ? input : this.value(input);
    return this.ref({
      kind: 'call',
      deps: [this.reference(dep)],
      binding: `${op.id}@${op.version}`,
      source,
      operation: { id: op.id, version: op.version },
      execute: async (args, context) => {
        const argument = copyValue(args[0]!);
        if (!op.input.accepts(argument)) throw new ClearingsError('INVALID_VALUE', source);
        const result = copyValue(await op.execute(argument, context));
        if (!op.output.accepts(result)) throw new ClearingsError('INVALID_VALUE', source);
        return result;
      },
    });
  }
  transform<I extends Value, O extends Value>(
    input: Ref<I>,
    transform: (value: I) => O,
    source = `${this.name}:transform:${this.nodes.length}`,
  ): Ref<O> {
    return this.ref({
      kind: 'transform',
      deps: [this.reference(input)],
      binding: `transform:${this.nodes.length}`,
      source,
      execute: (args) => {
        const result = transform(copyValue(args[0]!) as I);
        if (result instanceof Promise) {
          void result.catch(() => {});
          throw new ClearingsError('UNSUPPORTED', source);
        }
        return copyValue(result);
      },
    });
  }
  join<T extends readonly Ref<Value>[]>(items: T): Ref<Resolved<T[number]>[]>;
  join<T extends Record<string, Ref<Value>>>(items: T): Ref<{ [K in keyof T]: Resolved<T[K]> }>;
  join(items: readonly Ref<Value>[] | Record<string, Ref<Value>>): Ref<Value> {
    const array = Array.isArray(items);
    const refs = array ? items : Object.values(items);
    if (refs.length > 128) throw new ClearingsError('CAPACITY');
    const keys = array ? [] : Object.keys(items);
    return this.ref({
      kind: 'join',
      deps: refs.map((r) => this.reference(r)),
      binding: array ? 'array' : 'object',
      source: `${this.name}:join:${this.nodes.length}`,
      execute: (args) => (array ? args : Object.fromEntries(keys.map((key, i) => [key, args[i]!]))),
    });
  }
  map<I extends Value, O extends Value>(
    items: readonly I[],
    build: (item: I, index: number) => Ref<O>,
    maxItems = 128,
  ): Ref<O[]> {
    if (
      !Array.isArray(items) ||
      !Number.isInteger(maxItems) ||
      maxItems < 0 ||
      maxItems > 128 ||
      items.length > maxItems
    )
      throw new ClearingsError('CAPACITY');
    return this.join(items.map((item, index) => build(item, index))) as Ref<O[]>;
  }
}
export interface Flow<I extends Value, O extends Value> {
  readonly name: string;
  readonly build: (context: Context, input: I) => Ref<O>;
}
export function flow<I extends Value, O extends Value>(
  name: string,
  build: (context: Context, input: I) => Ref<O>,
): Flow<I, O> {
  if (!name || name.length > 256) throw new ClearingsError('INVALID_PLAN');
  return Object.freeze({ name, build });
}
