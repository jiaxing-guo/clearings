import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const directory = fileURLToPath(new URL('.', import.meta.url));
const workspace = resolve(process.argv[2]);
const output = resolve(process.argv[3]); mkdirSync(output, { recursive: true });
const commands = [];
function run(label, program, args, env = {}) {
  const start = new Date(), result = spawnSync(program, args, { cwd: workspace, encoding: 'utf8', timeout: 180000, maxBuffer: 33554432, env: { ...process.env, ...env } });
  const log = (result.stdout ?? '') + (result.stderr ?? ''); writeFileSync(join(output, `${label}.log`), log);
  const record = { label, program, args, started_at: start.toISOString(), elapsed_ms: Date.now() - start.getTime(), exit_code: result.status, signal: result.signal, error: result.error?.message ?? null,
    log_sha256: createHash('sha256').update(log).digest('hex'), tests: Number(log.match(/^# tests (\d+)/m)?.[1] ?? 0), passed: Number(log.match(/^# pass (\d+)/m)?.[1] ?? 0), failed: Number(log.match(/^# fail (\d+)/m)?.[1] ?? 0) };
  commands.push(record); return record;
}
const build = run('build', 'npm', ['run', 'build']);
if (build.exit_code === 0) {
  run('typecheck', 'npm', ['run', 'typecheck']);
  run('withheld-tests', process.execPath, ['--test', '--test-reporter=tap', join(directory, 'impact.test.mjs')], { CLEARINGS_CANDIDATE: workspace });
  const tests = readdirSync(join(workspace, 'tests')).filter(name => name.endsWith('.test.mjs')).sort().map(name => join('tests', name));
  run('integration-tests', process.execPath, ['--test', '--test-reporter=tap', ...tests]);
}
const result = { evaluated_at: new Date().toISOString(), workspace, source_mutated_by_evaluator: false, candidate_repaired: false, outcome: commands.every(command => command.exit_code === 0) ? 'pass-frozen-checks' : 'failed-frozen-checks', commands };
writeFileSync(join(output, 'evaluation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
