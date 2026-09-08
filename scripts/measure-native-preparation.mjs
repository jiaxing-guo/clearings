import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { prepareRustProgram } from 'clearings/compiler';
import { PROGRAM_EXECUTION_MAX_LIMITS } from 'clearings/program';

const program = JSON.parse(
  readFileSync(new URL('../programs/clearings/required-dependency-closure.json', import.meta.url)),
);
const directory = mkdtempSync(join(tmpdir(), 'clearings-preparation-measurement-'));
try {
  const start = performance.now();
  const prepared = prepareRustProgram(program, { cacheDirectory: directory });
  const cold_ms = performance.now() - start;
  const warm = performance.now();
  const reused = prepareRustProgram(program, { cacheDirectory: directory });
  const warm_prepare_ms = performance.now() - warm;
  const cases = [];
  for (const size of [8, 32, 64, 128, 256]) {
    const records = Array.from({ length: size }, (_, i) => ({
      id: `n${i}`,
      dependencies: i + 1 < size ? [{ target: `n${i + 1}`, required: true }] : [],
    }));
    const began = performance.now();
    const result = prepared.execute([['n0'], records], PROGRAM_EXECUTION_MAX_LIMITS);
    cases.push({
      size,
      milliseconds: performance.now() - began,
      completion: result.completion.kind,
      usage: result.usage,
    });
  }
  console.log(
    JSON.stringify(
      { program_id: program.artifact_id, native: prepared.native, cold_ms, warm_prepare_ms, cases },
      null,
      2,
    ),
  );
  prepared.dispose();
  reused.dispose();
} finally {
  rmSync(directory, { recursive: true, force: true });
}
