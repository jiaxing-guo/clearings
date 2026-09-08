// Copy validated, reviewed demo assets. Never compile source/proposal strings as MDX.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkReviewArchive } from './review-archive.mjs';
import './prepare-technical-docs.mjs';
import './prepare-operation-explorer.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(
  process.execPath,
  ['scripts/check-shared-demo.mjs', 'benchmarks/results/hono-shared'],
  { cwd: root, stdio: 'inherit' },
);
checkReviewArchive(fileURLToPath(new URL('../benchmarks/results/hono-shared/', import.meta.url)));
const source = new URL('../benchmarks/results/hono-shared/', import.meta.url);
const destination = new URL('../website/public/demo/', import.meta.url);
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const files = readFileSync(new URL('SHA256SUMS', source), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.split('  ')[1]);
for (const name of [...files, 'SHA256SUMS', 'clearings-shared-review.zip']) {
  const target = new URL(name, destination);
  mkdirSync(dirname(fileURLToPath(target)), { recursive: true });
  cpSync(new URL(name, source), target);
}
console.log(`Prepared ${files.length + 2} static demo assets.`);
execFileSync(
  process.execPath,
  ['scripts/check-bootstrap-demo.mjs', 'benchmarks/results/clearings-bootstrap'],
  { cwd: root, stdio: 'inherit' },
);
checkReviewArchive(
  fileURLToPath(new URL('../benchmarks/results/clearings-bootstrap/', import.meta.url)),
  'clearings-specification-review.zip',
);
const bootstrapSource = new URL('../benchmarks/results/clearings-bootstrap/', import.meta.url);
const bootstrapDestination = new URL('../website/public/demo/bootstrap/', import.meta.url);
const bootstrapFiles = readFileSync(new URL('SHA256SUMS', bootstrapSource), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.split('  ')[1]);
for (const name of [...bootstrapFiles, 'SHA256SUMS', 'clearings-specification-review.zip']) {
  const target = new URL(name, bootstrapDestination);
  mkdirSync(dirname(fileURLToPath(target)), { recursive: true });
  cpSync(new URL(name, bootstrapSource), target);
}
console.log(`Prepared ${bootstrapFiles.length + 2} typed specification assets.`);
