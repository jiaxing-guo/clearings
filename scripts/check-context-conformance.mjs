import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContextAssemblyCases, getContextAssemblyContract, recordContextAssembly, createContextAssemblyEvaluator } from '../dist/conformance/index.js';
import { canonical } from '../dist/repository/inventory.js';
import { candidateCheckout, controlSource, faults, faultSource } from '../tests/helpers/conformance.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const manifestPath = new URL('../specifications/clearings/conformance/suite.json', import.meta.url);
const full = createContextAssemblyCases('full'), smoke = createContextAssemblyCases('smoke');
const suite = cases => ({ cases: cases.length, graph_cases: cases.filter(item => item.category === 'graph').length, cases_sha256: hash(canonical(cases)) });
const definition = { schema_version: '0.1.0', kind: 'context-conformance-suite', profile_id: getContextAssemblyContract().profile.artifact_id,
  graph_domain: { labels: ['a', 'b', 'c'], directed_graphs: 512, roots_per_graph: 3, self_loops: true },
  full: suite(full), smoke: suite(smoke), targeted_case_ids: full.filter(item => item.category === 'targeted').map(item => item.case_id),
  positive_control_sha256: hash(controlSource), faults_sha256: hash(readFileSync(new URL('../tests/fixtures/conformance/faults.json', import.meta.url))), fault_count: faults.length };
const manifest = { ...definition, artifact_id: `context-conformance-suite:${hash(canonical(definition))}` };
if (process.argv.length === 3 && process.argv[2] === '--freeze') {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(manifest));
} else {
  assert(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--smoke'), 'Use --smoke, --freeze, or no argument for the full suite.');
  assert.deepEqual(manifest, JSON.parse(readFileSync(manifestPath, 'utf8')), 'Suite inputs and control sources must match the frozen manifest.');
  const cases = process.argv[2] === '--smoke' ? smoke : full;
  const evaluateContextAssembly = createContextAssemblyEvaluator();
  const control = candidateCheckout(controlSource);
  let executions = 0;
  try {
    for (const [name, implementation_root] of [['production', undefined], ['positive-control', control.root]]) {
      // Bound concurrency without sharing candidate workers or mutable arguments.
      let cursor = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (cursor < cases.length) {
          const input = cases[cursor++];
          const record = await recordContextAssembly({ ...input, ...(implementation_root ? { implementation_root } : {}) });
          const evaluation = evaluateContextAssembly(record);
          assert.equal(evaluation.acceptance, 'accepted', `${name}/${input.case_id}: ${JSON.stringify(evaluation)}`);
          assert.equal(evaluation.contract.verdict, 'unknown');
          if (++executions % 128 === 0) process.stderr.write(`${executions} conforming executions checked\n`);
        }
      }));
    }
    for (const fault of faults) {
      const candidate = candidateCheckout(faultSource(fault));
      try {
        const input = cases.find(item => item.case_id === fault.case_id);
        assert(input, `Missing designated case for ${fault.id}`);
        const record = await recordContextAssembly({ ...input, implementation_root: candidate.root, timeout_ms: fault.detect === 'timeout' ? 2000 : 10000 });
        const evaluation = evaluateContextAssembly(record);
        if (fault.detect === 'timeout') { assert.equal(record.completion.kind, 'timeout'); assert.equal(evaluation.acceptance, 'inconclusive'); }
        else {
          assert.equal(evaluation.acceptance, 'rejected', `${fault.id}: ${JSON.stringify(evaluation)}`);
          assert([...evaluation.checks, ...evaluation.obligations].some(check => check.id === fault.detect && check.status === 'fail'), `Fault ${fault.id} must fail its designated check ${fault.detect}`);
        }
      } finally { candidate.dispose(); }
    }
  } finally { control.dispose(); }
  console.log(JSON.stringify({ suite_id: manifest.artifact_id, conforming_executions: executions, detected_faults: faults.length, application_faults: faults.filter(fault => fault.detect !== 'timeout').length,
    nontermination_faults: faults.filter(fault => fault.detect === 'timeout').length, status: 'pass', residual: 'External effects and universal refinement remain unproved.' }));
}
