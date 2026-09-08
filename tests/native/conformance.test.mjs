import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSuite } from './conformance.mjs';
import {
  exhaustiveClosureSuite,
  targetedClosureSuite,
  closureFaultSuite,
} from './closure-corpus.mjs';
import { seededSuite } from './seeded-corpus.mjs';
import { languageSuite, preparationSuite } from './language-corpus.mjs';
import { accountingSuite, resourceSweepSuite } from './resource-corpus.mjs';

// Every suite is mandatory. A missing Rust toolchain fails; there is no fallback or silent skip.
for (const [name, buildSuite, expectedCases, expectedFaults] of [
  ['exhaustive three-node closure', exhaustiveClosureSuite, 1536, 0],
  ['targeted closure behavior', targetedClosureSuite, 34, 0],
  ['independent faulty-program controls', closureFaultSuite, 10, 5],
  ['fixed-seed language combinations', seededSuite, 192, 0],
  ['language boundaries and operand order', languageSuite, 58, 0],
  ['argument preparation boundaries', preparationSuite, 9, 0],
  ['independently derived accounting', accountingSuite, 28, 0],
  ['resource sweeps and deep calls', resourceSweepSuite, 387, 0],
]) {
  test(`compiled conformance: ${name}`, { timeout: 480_000 }, (t) => {
    const suite = buildSuite();
    assert.equal(
      suite.cases.length,
      expectedCases,
      'The declared domain must not silently shrink.',
    );
    const report = evaluateSuite(suite, (progress) => t.diagnostic(JSON.stringify(progress)));
    assert.equal(report.cases, expectedCases);
    assert.equal(report.fault_controls, expectedFaults);
    t.diagnostic(JSON.stringify(report));
  });
}
