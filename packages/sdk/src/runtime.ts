import { NativeEngine } from '@clearings/native';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { Context, type Flow, type Spec } from './flow.js';
import { ClearingsError, copyValue, nativeError, type Value } from './values.js';
import type {
  Command,
  Event,
  Limits,
  Node,
  Plan,
  Record as CoreRecord,
  Snapshot,
  Turn,
} from './control.js';

const now = () => Math.floor(performance.now());
function integer(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new ClearingsError('CAPACITY');
  return value;
}
function keys(value: object, allowed: string[]): void {
  if (Object.keys(value).some((k) => !allowed.includes(k))) throw new ClearingsError('UNSUPPORTED');
}
export interface RuntimeOptions {
  maxRuns?: number;
  maxNodes?: number;
  maxInFlight?: number;
  workBudget?: number;
  recordLimit?: number;
  build?: string;
}
export interface RunOptions {
  timeoutMs?: number;
  maxInFlight?: number;
  signal?: AbortSignal;
}
export interface RunRecord extends CoreRecord {
  sdk_version: string;
  adapter_versions: { id: string; version: string }[];
  adapter_versions_dropped: number;
  elapsed_ms: number;
  live_values: number;
  released_values: number;
  outcome: string;
}
interface Run {
  specs: Spec[];
  values: Map<number, Value>;
  nextValue: number;
  resolve: (value: Value) => void;
  reject: (error: ClearingsError) => void;
  removeAbort: () => void;
  deadline: number;
  started: number;
  record?: RunRecord;
  releasedValues: number;
}
export class Runtime {
  private readonly core: NativeEngine;
  private readonly limits: Limits;
  private readonly workBudget: number;
  private readonly recordLimit: number;
  private readonly build: string;
  private readonly runs = new Map<number, Run>();
  private readonly actions = new Map<number, { run: number; controller: AbortController }>();
  private events: Event[] = [];
  private pumping = false;
  private scheduled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private fault: ClearingsError | undefined;
  private planning = 0;
  private ownedNodes = 0;
  private history: RunRecord[] = [];
  private waiters: (() => void)[] = [];
  constructor(options: RuntimeOptions = {}) {
    keys(options, ['maxRuns', 'maxNodes', 'maxInFlight', 'workBudget', 'recordLimit', 'build']);
    this.limits = {
      max_runs: integer(options.maxRuns ?? 64, 1, 1024),
      max_nodes: integer(options.maxNodes ?? 4096, 1, 65536),
      max_in_flight: integer(options.maxInFlight ?? 32, 1, 4096),
    };
    this.workBudget = integer(options.workBudget ?? 64, 1, 4096);
    this.recordLimit = integer(options.recordLimit ?? 64, 0, 1024);
    this.build = options.build ?? 'unversioned';
    if (this.build.length > 256) throw new ClearingsError('INVALID_PLAN');
    try {
      this.core = new NativeEngine(JSON.stringify(this.limits));
    } catch (error) {
      throw nativeError(error);
    }
  }
  get records(): readonly RunRecord[] {
    return structuredClone(this.history);
  }
  snapshot(): Snapshot & { planning: number; live_values: number; owned_nodes: number } {
    const core = JSON.parse(this.core.snapshot()) as Snapshot;
    return {
      ...core,
      planning: this.planning,
      live_values: [...this.runs.values()].reduce((n, r) => n + r.values.size, 0),
      owned_nodes: this.ownedNodes,
    };
  }
  async run<I extends Value, O extends Value>(
    flow: Flow<I, O>,
    input: I,
    options: RunOptions = {},
  ): Promise<O> {
    keys(options, ['timeoutMs', 'maxInFlight', 'signal']);
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal))
      throw new ClearingsError('INVALID_VALUE');
    if (this.closed) throw new ClearingsError('CLOSED');
    if (this.planning + this.runs.size >= this.limits.max_runs)
      throw new ClearingsError('CAPACITY');
    const started = performance.now();
    const deadline = now() + integer(options.timeoutMs ?? 30_000, 1, 2_147_483_647);
    const capacity = integer(
      options.maxInFlight ?? this.limits.max_in_flight,
      1,
      this.limits.max_in_flight,
    );
    const check = () => {
      if (this.closed) throw new ClearingsError('CLOSED');
      if (options.signal?.aborted) throw new ClearingsError('CANCELLED');
      if (now() >= deadline) throw new ClearingsError('TIMEOUT');
    };
    check();
    this.planning++;
    const context = new Context(flow.name, () => {
      if (this.ownedNodes >= this.limits.max_nodes) throw new ClearingsError('CAPACITY');
      this.ownedNodes++;
    });
    let reserved = 0;
    try {
      // Start the build on a host turn, and yield while compiling supported large graphs.
      await yieldTurn();
      check();
      const root = flow.build(context, copyValue(input));
      const rootId = context.reference(root);
      const reachable = new Set<number>();
      const pending = [rootId];
      let work = 0;
      while (pending.length) {
        const id = pending.pop()!;
        if (!reachable.has(id)) {
          reachable.add(id);
          pending.push(...context.nodes[id]!.deps);
        }
        if (++work % 64 === 0) {
          await yieldTurn();
          check();
        }
      }
      const selected = [...reachable].sort((a, b) => a - b);
      const mapping = new Map(selected.map((id, index) => [id, index]));
      const values = new Map<number, Value>();
      let nextValue = 1;
      const specs: Spec[] = [];
      const nodes: Node[] = [];
      for (const id of selected) {
        const original = context.nodes[id]!;
        const spec = { ...original, deps: original.deps.map((d) => mapping.get(d)!) };
        let value: number | null = null;
        if (spec.kind === 'value') {
          value = nextValue++;
          values.set(value, spec.value!);
          delete spec.value;
        }
        specs.push(spec);
        nodes.push({
          kind: spec.kind,
          deps: spec.deps,
          binding: spec.binding,
          source: spec.source,
          value,
        });
        if (nodes.length % 64 === 0) {
          await yieldTurn();
          check();
        }
      }
      check();
      const submittedAt = now();
      const plan: Plan = {
        protocol: 1,
        flow: flow.name,
        build: this.build,
        nodes,
        root: mapping.get(rootId)!,
        timeout_ms: Math.max(1, deadline - submittedAt),
        max_in_flight: capacity,
      };
      const encoded = JSON.stringify(plan);
      if (Buffer.byteLength(encoded) > 2_097_152) throw new ClearingsError('CAPACITY');
      const id = this.core.submit(encoded, submittedAt);
      reserved = selected.length;
      this.ownedNodes -= context.nodes.length - selected.length;
      const result = new Promise<Value>((resolve, reject) => {
        const abort = () => {
          this.events.push({ type: 'cancel', run: id });
          this.wake();
        };
        options.signal?.addEventListener('abort', abort, { once: true });
        this.runs.set(id, {
          specs,
          values,
          nextValue,
          resolve,
          reject,
          removeAbort: () => options.signal?.removeEventListener('abort', abort),
          deadline,
          started,
          releasedValues: 0,
        });
        if (options.signal?.aborted) abort();
      });
      context.nodes.length = 0;
      this.planning--;
      this.wake();
      return (await result) as O;
    } catch (error) {
      if (!reserved) this.ownedNodes -= context.nodes.length;
      throw nativeError(error);
    } finally {
      // A submitted run is counted in runs, so planning must finish before awaiting it.
      if (!reserved) {
        this.planning--;
        this.notifyIdle();
      }
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.core.close();
    this.wake();
  }
  async drain(): Promise<void> {
    if (this.fault) throw this.fault;
    if (!this.runs.size && !this.planning) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.fault) throw this.fault;
  }
  private notifyIdle(): void {
    if (!this.runs.size && !this.planning) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const resolve of waiters) resolve();
    }
  }
  private wake(): void {
    if (this.fault) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pumping || this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      void this.pump();
    });
  }
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const events = this.events.splice(0, Math.min(this.workBudget, 128));
      const turn = JSON.parse(
        this.core.advance(JSON.stringify(events), now(), this.workBudget),
      ) as Turn;
      for (let i = 0; i < turn.commands.length; i++) {
        this.command(turn.commands[i]!);
        if ((i + 1) % 64 === 0) await yieldTurn();
      }
      this.pumping = false;
      if (turn.has_work || this.events.length) this.wake();
      else if (turn.next_wakeup_ms !== null && turn.next_wakeup_ms !== undefined)
        this.timer = setTimeout(
          () => {
            this.timer = undefined;
            this.wake();
          },
          Math.max(1, turn.next_wakeup_ms - now()),
        );
      this.notifyIdle();
    } catch (error) {
      this.pumping = false;
      this.closed = true;
      this.fault = nativeError(error);
      this.core.close();
      for (const action of this.actions.values()) action.controller.abort();
      for (const run of this.runs.values()) {
        run.removeAbort();
        run.reject(nativeError(error));
      }
      // Stop after a driver fault; drain reports the fault instead of spinning or claiming cleanup.
      for (const resolve of this.waiters) resolve();
      this.waiters = [];
    }
  }
  private command(command: Command): void {
    const run = this.runs.get(command.run);
    if (!run) throw new ClearingsError('INVALID_PLAN');
    switch (command.type) {
      case 'dispatch': {
        const spec = run.specs[command.node]!;
        if (!spec.execute || spec.binding !== command.binding)
          throw new ClearingsError('INVALID_PLAN');
        const inputs = command.inputs.map((handle) => {
          if (!run.values.has(handle)) throw new ClearingsError('INVALID_PLAN');
          return run.values.get(handle)!;
        });
        const controller = new AbortController();
        this.actions.set(command.command, { run: command.run, controller });
        const finish = (event: Event) => {
          this.actions.delete(command.command);
          this.events.push(event);
          this.wake();
        };
        Promise.resolve()
          .then(() => spec.execute!(inputs, { signal: controller.signal, deadline: run.deadline }))
          .then(
            (result) => {
              try {
                const value = copyValue(result);
                const handle = run.nextValue++;
                run.values.set(handle, value);
                finish({
                  type: 'complete',
                  run: command.run,
                  command: command.command,
                  value: handle,
                  error: null,
                });
              } catch (error) {
                finish({
                  type: 'complete',
                  run: command.run,
                  command: command.command,
                  value: null,
                  error: {
                    code: error instanceof ClearingsError ? error.code : 'INVALID_VALUE',
                    source: command.source,
                  },
                });
              }
            },
            (error) =>
              finish({
                type: 'complete',
                run: command.run,
                command: command.command,
                value: null,
                error: {
                  code:
                    error instanceof ClearingsError
                      ? error.code
                      : command.kind === 'call'
                        ? 'OPERATION_FAILED'
                        : 'TRANSFORM_FAILED',
                  source: command.source,
                },
              }),
          );
        break;
      }
      case 'release':
        run.values.delete(command.value);
        run.releasedValues++;
        if (run.record) {
          run.record.released_values = run.releasedValues;
          run.record.live_values = run.values.size;
        }
        break;
      case 'cancel':
        this.actions.get(command.command)?.controller.abort();
        break;
      case 'finished': {
        const adapters = new Map(
          run.specs
            .filter((s) => s.operation)
            .map((s) => [`${s.operation!.id}@${s.operation!.version}`, s.operation!]),
        );
        const record: RunRecord = {
          ...command.record,
          sdk_version: '0.1.0',
          adapter_versions: [...adapters.values()].slice(0, 128),
          adapter_versions_dropped: Math.max(0, adapters.size - 128),
          elapsed_ms: performance.now() - run.started,
          live_values: run.values.size,
          released_values: run.releasedValues,
          outcome: command.error?.code ?? 'SUCCEEDED',
        };
        run.record = record;
        this.history.push(record);
        if (this.history.length > this.recordLimit) this.history.shift();
        run.removeAbort();
        if (command.error)
          run.reject(new ClearingsError(command.error.code, command.error.source ?? null));
        else if (
          command.value === undefined ||
          command.value === null ||
          !run.values.has(command.value)
        )
          throw new ClearingsError('INVALID_PLAN');
        else run.resolve(run.values.get(command.value)!);
        break;
      }
      case 'dropped':
        this.ownedNodes -= run.specs.length;
        run.values.clear();
        if (run.record) run.record.live_values = 0;
        this.runs.delete(command.run);
        break;
    }
  }
}
