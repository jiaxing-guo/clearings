import { rmSync } from 'node:fs';

// Explicit build products only. Source, dependencies, and recorded runs are retained.
const generatedPaths = [
  'dist',
  'coverage',
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
console.log('Removed library and documentation build products.');
