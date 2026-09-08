import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Removed routes must not survive in either Next.js or Fumadocs macro output.
for (const name of ['.next', '.source', 'out'])
  rmSync(new URL(`../${name}`, import.meta.url), { recursive: true, force: true });
const run = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'build'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
);
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
