import { execFileSync, spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const website = fileURLToPath(new URL('../website/', import.meta.url));
const run = script => execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
run('node_modules/typescript/bin/tsc');
run('scripts/prepare-docs.mjs');
let timer;
const watcher = watch(new URL('../docs/', import.meta.url), { recursive: true }, (_event, filename) => {
  if (filename && filename !== 'README.md' && !/^\d+-/.test(filename)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { run('scripts/prepare-technical-docs.mjs'); }
    catch { console.error('Documentation generation failed. Correct the Markdown and save again.'); }
  }, 150);
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)], {
  cwd: website, stdio: 'inherit', env: { ...process.env, DOCS_BASE_PATH: process.env.DOCS_BASE_PATH ?? '', NEXT_TELEMETRY_DISABLED: '1' },
});
function cleanup() { clearTimeout(timer); watcher.close(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); child.kill(signal); });
child.once('error', error => { cleanup(); console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { cleanup(); process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1); });
