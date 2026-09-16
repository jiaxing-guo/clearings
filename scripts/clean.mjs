import { rmSync } from 'node:fs';

if (process.argv.length !== 2) throw new Error('Usage: npm run clean');
// Named build outputs only; source, installed dependencies and saved records are retained.
const generated = [
  'target',
  'website/.next',
  'website/out',
  'website/.source',
  'website/next-env.d.ts',
  'website/tsconfig.tsbuildinfo',
  'website/content/docs',
  'website/public/reference.json',
];
for (const path of generated)
  rmSync(new URL(`../${path}`, import.meta.url), { recursive: true, force: true });
console.log('Removed generated documentation and build output; saved records are retained.');
