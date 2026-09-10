import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate as tick, setTimeout as delay } from 'node:timers/promises';
import { Runtime, flow, operation, s, ClearingsError } from '@clearings/sdk';
import { caseFlow } from './fixtures.mjs';
const cases = JSON.parse(
  readFileSync(new URL('../../contracts/execution-cases.json', import.meta.url), 'utf8'),
).cases;
for (const fixture of cases)
  test(`shared case: ${fixture.id}`, async () => {
    const runtime = new Runtime({ build: 'fixture-v1' });
    let calls = 0;
    const original = structuredClone(fixture.input);
    const invoke = runtime.run(
      caseFlow(fixture.kind, () => calls++),
      fixture.input,
    );
    if (fixture.error) await assert.rejects(invoke, { code: fixture.error });
    else {
      assert.deepEqual(await invoke, fixture.expected);
      assert.equal(calls, fixture.calls);
    }
    await runtime.drain();
    assert.deepEqual(fixture.input, original);
    assert.equal(runtime.snapshot().live_values, 0);
    assert.equal(runtime.snapshot().owned_nodes, 0);
    assert.equal(runtime.records[0].live_values, 0);
    assert.doesNotMatch(JSON.stringify(runtime.records), /private provider|private transform/);
    runtime.close();
    await runtime.drain();
  });
const declared = (id, execute) =>
  operation({ id, version: '1', input: s.number, output: s.number }, execute);
const single = (op) => flow('single', (q, input) => q.call(op, input));
test('runtime capacity is shared by concurrent requests', async () => {
  let active = 0,
    peak = 0;
  const op = declared('wait', async (x) => {
    active++;
    peak = Math.max(peak, active);
    await delay(3);
    active--;
    return x;
  });
  const r = new Runtime({ maxInFlight: 2 });
  assert.deepEqual(
    await Promise.all(Array.from({ length: 12 }, (_, i) => r.run(single(op), i))),
    Array.from({ length: 12 }, (_, i) => i),
  );
  await r.drain();
  assert.equal(peak, 2);
  assert.equal(r.snapshot().in_flight, 0);
});
test('timeout retains capacity until a non-cooperative handler settles', async () => {
  let settle, started;
  const began = new Promise((resolve) => (started = resolve));
  const op = declared('blocked', (x) => {
    started();
    return new Promise((resolve) => (settle = () => resolve(x)));
  });
  const r = new Runtime({ maxInFlight: 1 });
  const result = r.run(single(op), 1, { timeoutMs: 30 });
  await began;
  await assert.rejects(result, { code: 'TIMEOUT' });
  await tick();
  assert.equal(r.snapshot().in_flight, 1);
  assert.equal(r.records[0].uncertain_actions, 1);
  settle();
  await r.drain();
  assert.equal(r.snapshot().in_flight, 0);
  assert.equal(r.snapshot().live_values, 0);
});
test('AbortSignal stops dependents and cooperatively cancels the current handler', async () => {
  let called = 0,
    started;
  const began = new Promise((resolve) => (started = resolve));
  const op = declared('abort', (x, { signal }) => {
    called++;
    started();
    return new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const f = flow('chain', (q, x) => q.call(op, q.call(op, x)));
  const r = new Runtime();
  const controller = new AbortController();
  const result = r.run(f, 0, { signal: controller.signal });
  await began;
  controller.abort();
  await assert.rejects(result, { code: 'CANCELLED' });
  await r.drain();
  assert.equal(called, 1);
  assert.equal(r.snapshot().live_values, 0);
});
test('abort and timeout before dispatch perform no operation', async () => {
  let calls = 0;
  const op = declared('unused', async (x) => {
    calls++;
    return x;
  });
  const r = new Runtime();
  await assert.rejects(r.run(single(op), 1, { signal: AbortSignal.abort() }), {
    code: 'CANCELLED',
  });
  const slowBuild = flow('slow-build', (q, x) => {
    const end = performance.now() + 5;
    while (performance.now() < end) {}
    return q.call(op, x);
  });
  await assert.rejects(r.run(slowBuild, 1, { timeoutMs: 1 }), { code: 'TIMEOUT' });
  assert.equal(calls, 0);
  assert.equal(r.snapshot().owned_nodes, 0);
  await r.drain();
});
test('oversized maps, foreign references and unsupported policies fail explicitly', async () => {
  const r = new Runtime({ maxNodes: 32 });
  let other;
  await r.run(
    flow('first', (q, x) => (other = q.value(x))),
    1,
  );
  await r.drain();
  await assert.rejects(
    r.run(
      flow('foreign', (q) => q.transform(other, (x) => x)),
      null,
    ),
    { code: 'INVALID_PLAN' },
  );
  await assert.rejects(
    r.run(
      flow('oversized', (q, x) => q.map(x, (i) => q.value(i))),
      Array(129).fill(0),
    ),
    { code: 'CAPACITY' },
  );
  await assert.rejects(r.run(caseFlow('value'), 1, { batch: true }), { code: 'UNSUPPORTED' });
  assert.equal(r.snapshot().owned_nodes, 0);
});
test('portable values reject unsupported representations without executing code', async () => {
  const r = new Runtime();
  const f = caseFlow('value');
  const cycle = {};
  cycle.self = cycle;
  for (const invalid of [
    undefined,
    NaN,
    Infinity,
    9007199254740992,
    1n,
    new Date(),
    { missing: undefined },
    Array(1),
    '\ud800',
    cycle,
    () => 0,
  ])
    await assert.rejects(r.run(f, invalid), ClearingsError);
  let read = false;
  const getter = {
    get value() {
      read = true;
      return 1;
    },
  };
  await assert.rejects(r.run(f, getter), { code: 'INVALID_VALUE' });
  assert.equal(read, false);
  assert.deepEqual(await r.run(f, { zero: -0 }), { zero: 0 });
  await r.drain();
  assert.equal(r.snapshot().live_values, 0);
});
test('invalid adapter output and synchronous dispatch failures settle their actions', async () => {
  const r = new Runtime();
  await assert.rejects(r.run(single(declared('bad', async () => 'wrong')), 1), {
    code: 'INVALID_VALUE',
  });
  await assert.rejects(
    r.run(
      single(
        declared('throw', () => {
          throw new Error('secret');
        }),
      ),
      1,
    ),
    { code: 'OPERATION_FAILED' },
  );
  await r.drain();
  assert.equal(r.snapshot().in_flight, 0);
  assert.equal(r.snapshot().live_values, 0);
});
test('large supported graph yields to the host and removes unused operations', async () => {
  const r = new Runtime({ workBudget: 1 });
  let ticks = 0,
    calls = 0;
  const timer = setInterval(() => ticks++, 0);
  const op = declared('unused', async (x) => {
    calls++;
    return x;
  });
  const f = flow('large', (q, input) => {
    q.call(op, input);
    let ref = q.value(input);
    for (let i = 0; i < 400; i++) ref = q.transform(ref, (x) => x + 1);
    return ref;
  });
  assert.equal(await r.run(f, 0), 400);
  await r.drain();
  clearInterval(timer);
  assert.ok(ticks > 0);
  assert.equal(calls, 0);
  assert.equal(r.snapshot().owned_nodes, 0);
});
test('records are bounded and close rejects subsequent invocations', async () => {
  const r = new Runtime({ recordLimit: 2 });
  for (let i = 0; i < 20; i++) {
    await r.run(caseFlow('value'), i);
    await r.drain();
  }
  assert.equal(r.records.length, 2);
  assert.equal(r.snapshot().runs, 0);
  r.close();
  await r.drain();
  await assert.rejects(r.run(caseFlow('value'), 1), { code: 'CLOSED' });
});
test('an ordinary HTTP endpoint invokes the installed SDK interface', async () => {
  const { server } = await import('../../examples/product-cards/typescript.ts');
  const runtime = new Runtime();
  const endpoint = server(runtime);
  await new Promise((resolve) => endpoint.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${endpoint.address().port}/?id=A&id=B&id=A`);
    assert.equal(response.status, 200);
    assert.deepEqual(
      await response.json(),
      cases.find((c) => c.id === 'ordered-duplicates').expected,
    );
    await runtime.drain();
    assert.equal(runtime.records[0].dispatched_calls, 6);
  } finally {
    await new Promise((resolve) => endpoint.close(resolve));
    runtime.close();
    await runtime.drain();
  }
});
