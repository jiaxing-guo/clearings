import type { ProgramValue } from './model.js';
import type { ProgramExecutionCompletion, ProgramExecutionDiagnostic, ProgramExecutionLimits, ProgramExecutionUsage, ProgramRuntimeFaultCode } from './execution.js';

/** Owned immutable values. Units count the expanded tree even when children share storage. */
export interface RuntimeValue {
  data: null | boolean | number | string | RuntimeValue[] | Map<string, RuntimeValue>;
  units: number;
}
type Interrupted = Extract<ProgramExecutionCompletion, { kind: 'runtime-fault' | 'resource-exhaustion' }>
  | { kind: 'application-failure'; code: string; details: RuntimeValue; diagnostic: ProgramExecutionDiagnostic };
/** Internal nonlocal completion; unexpected host exceptions are never converted into language failures. */
export class ExecutionHalt { constructor(readonly completion: Interrupted) {} }

export class ExecutionMeter {
  readonly usage: ProgramExecutionUsage = { work: 0, allocation_units: 0, value_units: 0, evaluation_depth: 0 };
  phase: ProgramExecutionDiagnostic['phase'] = 'arguments';
  path = '/arguments';
  readonly calls: ProgramExecutionDiagnostic['call_stack'] = [];
  private depth = 0;
  constructor(readonly limits: ProgramExecutionLimits) {}
  diagnostic(): ProgramExecutionDiagnostic {
    return { phase: this.phase, path: this.path, call_stack: this.calls.map(frame => ({ ...frame })) };
  }
  private check(resource: keyof ProgramExecutionLimits, next: number): void {
    if (next > this.limits[resource]) throw new ExecutionHalt({ kind: 'resource-exhaustion', resource, limit: this.limits[resource], diagnostic: this.diagnostic() });
  }
  work(count = 1): void {
    this.check('work', this.usage.work + count); this.usage.work += count;
  }
  allocate(units: number): void {
    this.check('allocation_units', this.usage.allocation_units + units); this.usage.allocation_units += units;
  }
  value(units: number): void {
    this.check('value_units', units);
    this.allocate(units);
    this.usage.value_units = Math.max(this.usage.value_units, units);
  }
  at<T>(path: string, action: () => T): T {
    const previous = this.path; this.path = path;
    try { return action(); } finally { this.path = previous; }
  }
  enter<T>(path: string, action: () => T): T {
    return this.at(path, () => {
      this.work(); this.check('evaluation_depth', this.depth + 1);
      this.depth++; this.usage.evaluation_depth = Math.max(this.usage.evaluation_depth, this.depth);
      try { return action(); } finally { this.depth--; }
    });
  }
  fault(code: ProgramRuntimeFaultCode, message: string): never {
    throw new ExecutionHalt({ kind: 'runtime-fault', code, message, diagnostic: this.diagnostic() });
  }
}

/** General value primitives only; no algorithm-specific or host-call operation. */
export class RuntimeValues {
  constructor(private readonly meter: ExecutionMeter) {}
  scalar(data: null | boolean | number | string): RuntimeValue {
    const units = 1 + (typeof data === 'string' ? data.length : 0);
    this.meter.work(units); this.meter.value(units);
    return { data: data === 0 ? 0 : data, units };
  }
  list(items: RuntimeValue[]): RuntimeValue {
    this.meter.work(1 + items.length);
    const units = 1 + items.reduce((sum, item) => sum + item.units, 0);
    this.meter.value(units); return { data: items, units };
  }
  record(entries: [string, RuntimeValue][]): RuntimeValue {
    const names = entries.reduce((sum, [name]) => sum + name.length, 0);
    this.meter.work(1 + entries.length + names);
    const units = 1 + names + entries.reduce((sum, [, value]) => sum + value.units, 0);
    this.meter.value(units); return { data: new Map(entries), units };
  }
  import(value: ProgramValue, path: string): RuntimeValue {
    return this.meter.at(path, () => {
      if (Array.isArray(value)) return this.list(value.map((item, index) => this.import(item, `${path}/${index}`)));
      if (value !== null && typeof value === 'object') return this.record(Object.entries(value).map(([name, item]) => [name, this.import(item, `${path}/${name}`)]));
      return this.scalar(value);
    });
  }
  append(list: RuntimeValue, item: RuntimeValue): RuntimeValue {
    const items = list.data as RuntimeValue[], units = list.units + item.units;
    this.meter.work(2 + items.length); this.meter.value(units);
    return { data: [...items, item], units };
  }
  compare(left: number | string, right: number | string): number {
    this.meter.work();
    if (typeof left === 'number') { const other = right as number; return left < other ? -1 : left > other ? 1 : 0; }
    const other = right as string;
    for (let index = 0; index < Math.min(left.length, other.length); index++) {
      this.meter.work();
      const a = left.charCodeAt(index), b = other.charCodeAt(index);
      if (a !== b) return a < b ? -1 : 1;
    }
    return left.length < other.length ? -1 : left.length > other.length ? 1 : 0;
  }
  equal(left: RuntimeValue, right: RuntimeValue): boolean {
    this.meter.work();
    const a = left.data, b = right.data;
    if (typeof a === 'string') return this.compare(a, b as string) === 0;
    if (Array.isArray(a)) {
      const items = b as RuntimeValue[];
      return a.length === items.length && a.every((item, index) => this.equal(item, items[index]!));
    }
    if (a instanceof Map) {
      const fields = b as Map<string, RuntimeValue>;
      if (a.size !== fields.size) return false;
      for (const [key, item] of a) {
        this.meter.work(1 + key.length);
        const other = fields.get(key);
        if (!other || !this.equal(item, other)) return false;
      }
      return true;
    }
    return a === b;
  }
  sort(value: RuntimeValue): RuntimeValue {
    const items = value.data as RuntimeValue[];
    this.meter.work(1 + items.length); this.meter.value(value.units);
    let source = items.slice();
    if (items.length < 2) return { data: source, units: value.units };
    // Bottom-up stable merge sort fixes comparison/write order across JS engines.
    this.meter.work(items.length); this.meter.allocate(items.length);
    let target = new Array<RuntimeValue>(items.length);
    for (let width = 1; width < items.length; width *= 2) {
      for (let start = 0; start < items.length; start += 2 * width) {
        const middle = Math.min(start + width, items.length), end = Math.min(start + 2 * width, items.length);
        let left = start, right = middle;
        for (let out = start; out < end; out++) {
          this.meter.work();
          if (left < middle && (right === end || this.compare(source[left]!.data as number | string, source[right]!.data as number | string) <= 0)) target[out] = source[left++]!;
          else target[out] = source[right++]!;
        }
      }
      [source, target] = [target, source];
    }
    return { data: source, units: value.units };
  }
  export(value: RuntimeValue): ProgramValue {
    // Reserve the fully expanded output before copying. Repeated references are copied again.
    this.meter.value(value.units);
    const copy = (value: RuntimeValue): ProgramValue => {
      const data = value.data;
      if (Array.isArray(data)) { this.meter.work(1 + data.length); return data.map(copy); }
      if (data instanceof Map) {
        this.meter.work(1 + data.size);
        return Object.fromEntries([...data].map(([key, item]) => {
          this.meter.work(key.length); return [key, copy(item)];
        }));
      }
      this.meter.work(1 + (typeof data === 'string' ? data.length : 0)); return data;
    };
    return copy(value);
  }
}
