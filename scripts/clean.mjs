import { rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit build products only. Source, dependencies, and recorded runs are retained.
const generatedPaths = [
  'dist',
  'coverage',
  'compiled',
  'runtime/rust/target',
  'website/.next',
  'website/out',
  'website/.source',
  'website/next-env.d.ts',
  'website/tsconfig.tsbuildinfo',
  'website/public/demo',
  'website/public/technical-reference.json',
  'website/public/operation-explorer.json',
  'website/content/docs/technical',
];

if (process.argv.length !== 2) throw new Error('Usage: npm run clean');
for (const path of generatedPaths) {
  rmSync(new URL(`../${path}`, import.meta.url), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
// Match the default package-local cache namespace in specification/native-closure.ts.
// Explicit CLEARINGS_NATIVE_CACHE locations are user-managed and retained.
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const namespace = createHash('sha256').update(packageRoot).digest('hex').slice(0, 24);
rmSync(join(tmpdir(), `clearings-native-${process.getuid?.() ?? 'user'}`, namespace), {
  recursive: true,
  force: true,
});
console.log(
  'Removed library, compiled-source, default native cache, and documentation build products.',
);
