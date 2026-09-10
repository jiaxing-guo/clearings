import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Runtime } from '@clearings/sdk';
import { caseFlow } from './fixtures.mjs';
const cases = JSON.parse(
  readFileSync(new URL('../../contracts/execution-cases.json', import.meta.url), 'utf8'),
).cases;
const records = [];
for (const c of cases) {
  const runtime = new Runtime();
  const output = { id: c.id };
  let calls = 0;
  try {
    output.result = await runtime.run(
      caseFlow(c.kind, () => calls++),
      c.input,
    );
    assert.deepEqual(output.result, c.expected);
    assert.equal(calls, c.calls);
  } catch (error) {
    assert.equal(error.code, c.error);
    output.error = error.code;
  }
  await runtime.drain();
  const record = runtime.records[0];
  output.record = Object.fromEntries(
    [
      'protocol',
      'core_version',
      'strategy',
      'logical_calls',
      'dispatched_calls',
      'completed_calls',
      'uncertain_actions',
    ].map((key) => [key, record[key]]),
  );
  assert.equal(runtime.snapshot().live_values, 0);
  records.push(output);
  runtime.close();
  await runtime.drain();
}
console.log(JSON.stringify(records));
