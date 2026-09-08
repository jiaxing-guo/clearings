import { isDeepStrictEqual } from 'node:util';
import {
  executeProgram,
  PROGRAM_EXECUTION_DEFAULT_LIMITS,
  PROGRAM_INTERPRETER_VERSION,
} from 'clearings/program';
import { nativeBatch } from './harness.mjs';

const pointer = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');

/** Exact observation comparison, including unexpected fields and array order. */
export function differingPaths(expected, actual, path = '') {
  if (isDeepStrictEqual(expected, actual)) return [];
  if (
    expected === null ||
    actual === null ||
    typeof expected !== 'object' ||
    typeof actual !== 'object' ||
    Array.isArray(expected) !== Array.isArray(actual) ||
    (Array.isArray(expected) && expected.length !== actual.length)
  )
    return [path || '/'];
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) => {
    const at = `${path}/${pointer(key)}`;
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) return [at];
    return differingPaths(expected[key], actual[key], at);
  });
}

export class CompilerConformanceError extends Error {
  constructor(report) {
    super(`Compiler conformance mismatch\n${JSON.stringify(report, null, 2)}`);
    this.name = 'CompilerConformanceError';
    this.report = report;
  }
}

export function referenceObservation(program, args, limits) {
  try {
    const { limits: effectiveLimits, usage, completion } = executeProgram(program, args, limits);
    return { limits: effectiveLimits, usage, completion };
  } catch (error) {
    // Only expected invocation rejections belong to the comparison contract.
    if (error.code !== 'INVALID_PROGRAM_EXECUTION') throw error;
    return { error: { code: error.code, path: error.details.path, rule: error.details.rule } };
  }
}

/** Independent expectations describe application data; differential checks retain all diagnostics. */
export function semanticOutcome(observation) {
  if (observation.error) return observation;
  const completion = observation.completion;
  switch (completion.kind) {
    case 'return':
      return { kind: completion.kind, value: completion.value };
    case 'application-failure':
      return { kind: completion.kind, code: completion.code, details: completion.details };
    case 'runtime-fault':
      return { kind: completion.kind, code: completion.code };
    case 'resource-exhaustion':
      return { kind: completion.kind, resource: completion.resource, limit: completion.limit };
    default:
      throw new Error('Unknown completion in compiler observation.');
  }
}

export function checkCase(suite, testCase, program, artifact, reference, native) {
  const context = {
    suite,
    case: testCase.name,
    ...(testCase.seed === undefined ? {} : { seed: testCase.seed }),
    program_id: program.artifact_id,
    program,
    arguments: testCase.args,
    limits: { ...PROGRAM_EXECUTION_DEFAULT_LIMITS, ...testCase.limits },
    backend: {
      backend: artifact.backend,
      compiled_artifact_id: artifact.artifact_id,
      compiler_version: artifact.compiler_version,
      execution_semantics_version: artifact.execution_semantics_version,
      runtime: artifact.runtime,
      toolchain: artifact.toolchain,
      options: artifact.options,
      module_sha256: artifact.module.sha256,
      interpreter_version: PROGRAM_INTERPRETER_VERSION,
    },
  };
  const requireEqual = (comparison, expected, actual) => {
    const paths = differingPaths(expected, actual);
    if (paths.length)
      throw new CompilerConformanceError({ ...context, comparison, paths, expected, actual });
  };
  requireEqual('reference/native', reference, native);
  if (!Object.hasOwn(testCase, 'expected'))
    throw new Error(`Missing independent expectation: ${testCase.name}`);
  const actual = semanticOutcome(native);
  if (testCase.reject) {
    if (isDeepStrictEqual(testCase.expected, actual))
      throw new CompilerConformanceError({
        ...context,
        comparison: 'undetected-fault',
        expected: testCase.expected,
        actual,
      });
  } else {
    requireEqual('independent/native', testCase.expected, actual);
  }
  if (testCase.observation)
    requireEqual('independent accounting/native', testCase.observation, native);
}

/** Partition the authored domain without raising the native harness's process/source bounds. */
export function* nativeBatches(cases, maximumCases = 96) {
  if (!Number.isInteger(maximumCases) || maximumCases < 1 || maximumCases > 96)
    throw new Error('Conformance batches require 1 through 96 cases.');
  let batch = [],
    programs = new Set();
  for (const testCase of cases) {
    if (
      batch.length === maximumCases ||
      (!programs.has(testCase.program) && programs.size === 32)
    ) {
      yield batch;
      batch = [];
      programs = new Set();
    }
    batch.push(testCase);
    programs.add(testCase.program);
  }
  if (batch.length) yield batch;
}

export function evaluateSuite(suite, onBatch = () => {}) {
  const names = new Set(suite.cases.map((testCase) => testCase.name));
  if (!suite.cases.length || names.size !== suite.cases.length)
    throw new Error('Conformance case names must be unique.');
  let completed = 0,
    batches = 0,
    faults = 0;
  for (const batch of nativeBatches(suite.cases)) {
    const indices = [...new Set(batch.map((testCase) => testCase.program))];
    const programs = indices.map((index) => suite.programs[index]);
    const cases = batch.map((testCase) => ({
      ...testCase,
      program: indices.indexOf(testCase.program),
    }));
    // A build error, panic, timeout, or malformed output fails the gate; none count as a detected fault.
    const { artifacts, results } = nativeBatch(programs, cases);
    batch.forEach((testCase, index) => {
      const localIndex = cases[index].program;
      const program = programs[localIndex];
      checkCase(
        suite.name,
        testCase,
        program,
        artifacts[localIndex],
        referenceObservation(program, testCase.args, testCase.limits),
        results[index],
      );
      if (testCase.reject) faults++;
    });
    completed += batch.length;
    batches++;
    onBatch({ suite: suite.name, completed, total: suite.cases.length });
  }
  return {
    suite: suite.name,
    programs: suite.programs.length,
    cases: completed,
    fault_controls: faults,
    batches,
    status: 'pass',
  };
}
