import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContextAssemblyCases } from 'clearings/conformance';
import { sealProgram } from 'clearings/program';
import { sealSpecification } from 'clearings';
import { referenceContextAssembly } from '../../dist/conformance/context-reference.js';

/** Exercise the installed production adapter with both host execution alternatives disabled. */
export function checkInstalledContext(installed, directory) {
  writeFileSync(
    join(installed, 'dist/analysis/dependencies.js'),
    'export function requiredClosure() { throw new Error("Host traversal is forbidden in this package test."); }\n',
  );
  const cases = createContextAssemblyCases();
  const invocation = cases.find((item) => item.case_id === 'breadth-first-order').invocation;
  const fixture = join(directory, 'context-input.json');
  writeFileSync(fixture, JSON.stringify(invocation));
  const script = join(installed, 'context-consumer.mjs');
  writeFileSync(
    script,
    `import { readFileSync } from 'node:fs';
import { channel } from 'node:diagnostics_channel';
import { assembleContext } from 'clearings';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let native;
channel('clearings.context.native.v1').subscribe(value => { native = value; });
try {
  const context = assembleContext(input.specification, input.selection, input.options);
  console.log(JSON.stringify({context, native}));
} catch (error) {
  console.log(JSON.stringify({error: {code: error.code, details: error.details}}));
  process.exitCode = error.exitCode ?? 1;
}
`,
  );
  const cache = join(directory, 'context-native-cache');
  const execute = (env = {}) =>
    spawnSync(process.execPath, [script, fixture], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, CLEARINGS_NATIVE_CACHE: cache, ...env },
    });
  const cold = execute();
  assert.equal(cold.status, 0, cold.stderr + cold.stdout);
  const actual = JSON.parse(cold.stdout);
  assert.deepEqual(actual.context, referenceContextAssembly(invocation).context);
  assert.deepEqual(
    actual.context.operations.map((item) => item.id),
    ['root', 'a', 'z', 'y', 'b'],
  );
  assert.equal(actual.native.status, 'observed');
  const warm = execute({ PATH: '' });
  assert.equal(warm.status, 0, warm.stderr + warm.stdout);
  assert.deepEqual(JSON.parse(warm.stdout), actual);

  const cli = join(installed, 'dist/cli/main.js');
  const specification = join(directory, 'context-specification.json');
  writeFileSync(specification, JSON.stringify(invocation.specification));
  const command = () =>
    spawnSync(
      process.execPath,
      [
        cli,
        'context',
        specification,
        '--operation',
        invocation.selection,
        '--max-bytes',
        '2097152',
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, PATH: '', CLEARINGS_NATIVE_CACHE: cache },
      },
    );
  const cliResult = command();
  assert.equal(cliResult.status, 0, cliResult.stderr + cliResult.stdout);
  assert.deepEqual(
    JSON.parse(cliResult.stdout).operations.map((item) => item.id),
    ['root', 'a', 'z', 'y', 'b'],
  );

  // The guard remains earlier than cold setup even when neither native nor host execution is possible.
  writeFileSync(
    fixture,
    JSON.stringify(
      cases.find((item) => item.case_id === 'dependency-before-budget-and-selection').invocation,
    ),
  );
  const guarded = execute({ PATH: '', CLEARINGS_NATIVE_CACHE: join(directory, 'guard-cache') });
  assert.equal(JSON.parse(guarded.stdout).error.code, 'MISSING_REQUIRED_DEPENDENCY');
  writeFileSync(fixture, JSON.stringify(invocation));
  const unavailable = execute({
    PATH: '',
    CLEARINGS_NATIVE_CACHE: join(directory, 'missing-cache'),
  });
  assert.equal(unavailable.status, 1);
  assert.equal(JSON.parse(unavailable.stdout).error.code, 'RUST_TOOLCHAIN_UNAVAILABLE');

  // Preserve success at the former limit and explicit exhaustion beyond the improved domain.
  for (const size of [512, 2048]) {
    const large = structuredClone(invocation.specification);
    const template = large.operations[0];
    large.operations = Array.from({ length: size }, (_, i) => ({
      ...structuredClone(template),
      id: i === 0 ? invocation.selection : `n${i}`,
      alias: `alias-n${i}`,
      name: `n${i}`,
      outcomes: template.outcomes.map((outcome) => ({
        ...structuredClone(outcome),
        id: `done-n${i}`,
      })),
      dependencies:
        i === size - 1
          ? []
          : [
              {
                operation_id: `n${i + 1}`,
                requirement: 'required',
                kind: 'uses-contract',
                role: 'Next record.',
              },
            ],
    }));
    writeFileSync(specification, JSON.stringify(sealSpecification(large)));
    const result = command();
    if (size === 512) {
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.deepEqual(
        JSON.parse(result.stdout).operations.map((item) => item.id),
        Array.from({ length: size }, (_, i) => (i === 0 ? invocation.selection : `n${i}`)),
      );
    } else {
      assert.equal(result.status, 3, result.stderr + result.stdout);
      const diagnostic = JSON.parse(result.stdout).diagnostics[0];
      assert.equal(diagnostic.code, 'CONTEXT_RESOURCE');
      assert.equal(diagnostic.details.resource, 'work');
    }
  }

  // Change the algorithm in IR only. The ordinary installed adapter must execute the changed algorithm.
  const programPath = join(installed, 'programs/clearings/required-dependency-closure.json');
  const program = JSON.parse(readFileSync(programPath, 'utf8'));
  const result = program.functions.find((fn) => fn.id === 'targets').body.at(-1);
  assert.equal(result.value.kind, 'sort');
  result.value = result.value.list;
  writeFileSync(programPath, JSON.stringify(sealProgram(program)));
  const mutant = execute();
  assert.equal(mutant.status, 0, mutant.stderr + mutant.stdout);
  const changed = JSON.parse(mutant.stdout);
  assert.notEqual(changed.native.compiled_artifact_id, actual.native.compiled_artifact_id);
  assert.notDeepEqual(changed.context, referenceContextAssembly(invocation).context);
  assert.deepEqual(
    changed.context.operations.map((item) => item.id),
    ['root', 'z', 'a', 'b', 'y'],
  );

  const executable = join(
    cache,
    changed.native.native.build_id.slice('native-build:'.length),
    process.platform === 'win32' ? 'native.exe' : 'native',
  );
  appendFileSync(executable, '\naltered');
  const altered = execute({ PATH: '' });
  assert.equal(altered.status, 1);
  assert.equal(JSON.parse(altered.stdout).error.code, 'RUST_BUILD_INVALID');
}
