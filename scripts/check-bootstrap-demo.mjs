import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkOperation, validateSpecification, assembleContext, serializeOperationContext } from '../dist/index.js';

const root = resolve(process.argv[2] ?? 'benchmarks/results/clearings-bootstrap');
const read = name => readFileSync(join(root, name), 'utf8');
const json = name => JSON.parse(read(name));
const hash = value => createHash('sha256').update(value).digest('hex');
const verification = json('verification.json');
for (const [name, file] of Object.entries(verification.files)) {
  const bytes = readFileSync(join(root, name)); assert.equal(hash(bytes), file.sha256, name); assert.equal(bytes.length, file.bytes, name);
}
for (const line of read('SHA256SUMS').trim().split('\n')) { const [digest, name] = line.split('  '); assert.equal(hash(readFileSync(join(root, name))), digest, name); }
for (const name of ['clearings', 'hono']) {
  const spec = json(`${name}.specification.json`); validateSpecification(spec);
  const pack = json(`${name}.context.json`);
  assert.equal(pack.artifact_id, spec.artifact_id);
  assert.equal(read(`${name}.context.json`), serializeOperationContext(assembleContext(spec, pack.selection.operation_id, { maxBytes: pack.budget.max_bytes })));
  for (const scenario of json(`${name}.scenarios.json`)) assert.deepEqual(checkOperation(spec, scenario.operation_id, scenario.observation), scenario.result, scenario.name);
}
for (const fault of json('counterexamples.json')) {
  const result = checkOperation(json('clearings.specification.json'), 'assemble-context', fault.observation);
  assert.equal(result.verdict, 'fail'); assert.deepEqual(result, fault.result);
}
for (const binding of json('implementation-bindings.json').bindings) {
  assert.equal(hash(binding.text), binding.sha256);
  const source = readFileSync(new URL(`../${binding.path}`, import.meta.url));
  assert.equal(hash(source), binding.file_sha256, `Stale working-source binding: ${binding.path}`);
  assert.equal(source.subarray(binding.start_byte, binding.end_byte).toString('utf8'), binding.text);
}
let fragments = 0;
for (const name of readdirSync(root).filter(name => name.endsWith('.html'))) {
  const page = read(name), ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, name);
  for (const [, link] of page.matchAll(/\bhref="([^"]+)"/g)) {
    if (link.startsWith('#')) { assert(ids.includes(link.slice(1)), `${name}: ${link}`); fragments++; }
    else if (!/^[a-z]+:/.test(link)) assert(statSync(join(root, link)).isFile(), `${name}: ${link}`);
  }
  assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/i.test(page));
  assert(page.includes('name="viewport"')); assert(page.includes('<main'));
  if (name !== 'index.html') { assert(page.includes('tabindex="0"')); assert(page.includes('aria-label=')); }
}
assert.equal(verification.independent_review, false); assert.equal(verification.fresh_agent_trial, false);
console.log(JSON.stringify({ actual_clearings_cases: verification.actual_clearings_cases, authored_hono_cases: verification.authored_hono_cases, rejected_output_faults: verification.rejected_output_faults, context_reproduction: 'identical', exact_working_source_bindings: 'valid', file_hashes: 'valid', fragment_links: fragments, browser_interaction: 'not-run' }));
