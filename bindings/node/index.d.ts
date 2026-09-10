export class NativeEngine {
  constructor(limits: string);
  submit(plan: string, now: number): number;
  advance(events: string, now: number, budget: number): string;
  close(): void;
  snapshot(): string;
}
