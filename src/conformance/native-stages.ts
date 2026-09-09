import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import type { NativeContextStage, NativeStageCapture } from './model.js';

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/execution-record.v0.3.json', import.meta.url), 'utf8'),
);
const validCapture = new Ajv({ strict: true, allowUnionTypes: true }).compile({
  ...schema.properties.native_stages.items,
  definitions: schema.definitions,
});
const names = ['closure', 'selection'] as const;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));

/** Retain completed observations; malformed or repeated events cannot overwrite them. */
export class NativeStageRecorder {
  active: boolean;
  stages: NativeStageCapture[] = names.map((stage) => ({
    stage,
    status: 'unavailable',
    reason: 'No stage instrumentation was captured.',
  }));
  errors: string[] = [];
  private begun = false;
  private started = new Set<NativeContextStage>();
  private completed = new Set<NativeContextStage>();
  constructor(force = false) {
    this.active = force;
  }
  error(reason: string): void {
    this.active = true;
    if (this.errors.length < 8) this.errors.push(reason);
  }
  receive(value: unknown): void {
    this.active = true;
    const event = object(value);
    if (!event) {
      this.error('Native stage event is not an object.');
      return;
    }
    if (event.event === 'begin') {
      if (this.begun || this.started.size) {
        this.error('Repeated native invocation declaration.');
        return;
      }
      if (!keys(event, ['event', 'policy']) || event.policy !== 'context-native-v2') {
        this.error('Invalid native invocation declaration.');
        return;
      }
      this.begun = true;
      this.stages = names.map((stage) => ({
        stage,
        status: 'not-run',
        reason: 'Invocation ended before this stage started.',
      }));
      return;
    }
    if (!this.begun) this.error('Stage event preceded the invocation declaration.');
    const observation = event.event === 'result' ? object(event.observation) : event;
    const stage = observation?.stage;
    if (stage !== 'closure' && stage !== 'selection') {
      this.error('Unknown native stage.');
      return;
    }
    const index = names.indexOf(stage);
    if (event.event === 'start') {
      if (
        !keys(event, ['event', 'stage', 'arguments_sha256']) ||
        typeof event.arguments_sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(event.arguments_sha256)
      ) {
        this.error(`Invalid ${stage} start event.`);
        return;
      }
      if (this.started.has(stage)) {
        this.error(`Repeated ${stage} start event.`);
        return;
      }
      if (
        stage === 'selection' &&
        (!this.completed.has('closure') ||
          this.stages[0]?.status !== 'observed' ||
          this.stages[0].completion !== 'return')
      )
        this.error('Selection started before successful closure.');
      this.started.add(stage);
      this.stages[index] = {
        stage,
        status: 'unavailable',
        arguments_sha256: event.arguments_sha256,
        reason: 'Stage started but its result was not captured.',
      };
      return;
    }
    if (this.completed.has(stage)) {
      this.error(`Repeated ${stage} completion.`);
      return;
    }
    if (!this.started.has(stage)) this.error(`${stage} result has no start event.`);
    if (
      event.event === 'result' &&
      keys(event, ['event', 'observation']) &&
      validCapture(observation) &&
      observation?.status === 'observed'
    ) {
      const previous = this.stages[index];
      if (
        previous?.status === 'unavailable' &&
        previous.arguments_sha256 &&
        previous.arguments_sha256 !== observation.arguments_sha256
      )
        this.error(`${stage} argument binding changed during execution.`);
      this.stages[index] = observation as unknown as NativeStageCapture;
      this.completed.add(stage);
    } else if (
      event.event === 'unavailable' &&
      keys(event, ['event', 'stage', 'reason']) &&
      typeof event.reason === 'string' &&
      event.reason.length
    ) {
      const previous = this.stages[index];
      this.stages[index] = {
        stage,
        status: 'unavailable',
        reason: event.reason,
        ...(previous?.status === 'unavailable' && previous.arguments_sha256
          ? { arguments_sha256: previous.arguments_sha256 }
          : {}),
      };
      this.completed.add(stage);
    } else this.error(`Malformed ${stage} completion event.`);
  }
}
