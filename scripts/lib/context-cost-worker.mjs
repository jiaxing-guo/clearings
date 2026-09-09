import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';

const [root, inputPath, caseId, mode, countText] = process.argv.slice(2);
const count = Number(countText);
assert(['cold', 'cached-first', 'resident', 'audit'].includes(mode));
assert(Number.isInteger(count) && count > 0 && count <= 100);
const item = JSON.parse(readFileSync(inputPath)).find((item) => item.id === caseId);
assert(item, 'Unknown benchmark workload.');
const { assembleContext, serializeOperationContext, prepareContextRuntime } = await import(
  pathToFileURL(resolve(root, 'dist/index.js'))
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const before = JSON.stringify(item.invocation);
function invoke() {
  const { specification, selection, options } = item.invocation;
  const start = performance.now();
  const context = assembleContext(specification, selection, options);
  const assembled = performance.now();
  const serialized = serializeOperationContext(context);
  const end = performance.now();
  // All expected-result comparisons, hashing, and output occur after the timed interval.
  assert.equal(digest(serialized), item.expected_sha256);
  assert.equal(Buffer.byteLength(serialized), item.expected_bytes);
  assert.equal(JSON.stringify(item.invocation), before);
  return {
    assembly_ms: assembled - start,
    final_serialization_ms: end - assembled,
    total_ms: end - start,
  };
}
let identity;
if (mode === 'resident' || mode === 'audit') identity = prepareContextRuntime();
if (mode === 'resident') for (let i = 0; i < 3; i++) invoke();
const stages = [];
const legacy = (observation) => stages.push({ stage: 'closure', ...observation });
const current = (event) => {
  if (event.event === 'result') stages.push(event.observation);
};
if (mode === 'audit') {
  channel('clearings.context.native.v1').subscribe(legacy);
  channel('clearings.context.native.v2').subscribe(current);
} else {
  assert(!channel('clearings.context.native.v1').hasSubscribers);
  assert(!channel('clearings.context.native.v2').hasSubscribers);
}
const measurements = Array.from({ length: count }, invoke);
if (mode === 'audit') {
  channel('clearings.context.native.v1').unsubscribe(legacy);
  channel('clearings.context.native.v2').unsubscribe(current);
  assert.deepEqual(
    stages.map((stage) => stage.stage),
    identity.stages ? ['closure', 'selection'] : ['closure'],
  );
  assert(stages.every((stage) => stage.status === 'observed' && stage.completion === 'return'));
}
console.log(
  JSON.stringify({
    case_id: caseId,
    mode,
    expected_sha256: item.expected_sha256,
    output_verified: true,
    input_unchanged: true,
    ...(mode === 'audit' ? { identity, stages } : { measurements }),
  }),
);
