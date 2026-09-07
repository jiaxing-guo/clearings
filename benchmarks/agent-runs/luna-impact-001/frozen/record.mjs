// Experiment access recorder. This records requested actions, not OS isolation.
import { readFileSync, appendFileSync, mkdirSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('.', import.meta.url));
const directory = join(root, 'trace'); mkdirSync(directory, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [action, ...args] = process.argv.slice(2);
const start = new Date().toISOString();
const within = path => { const full = realpathSync(resolve(root, path)); const rel = relative(root, full); if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Use only files inside the coding workspace.'); return full; };
let output = '', status = 0, details = {};
try {
  if (action === 'read') {
    for (const path of args) { const full = within(path), bytes = readFileSync(full); output += `File: ${path}\n${bytes.toString('utf8')}\n`; details[path] = { sha256: hash(bytes), bytes: bytes.length }; }
  } else if (action === 'files') {
    const walk = path => { for (const entry of readdirSync(path, { withFileTypes: true }).sort((a,b)=>a.name<b.name?-1:1)) { const next = join(path, entry.name); if (entry.isDirectory() && !['node_modules','dist','trace','.git'].includes(entry.name)) walk(next); else if (entry.isFile()) output += relative(root, next) + '\n'; } };
    for (const path of args.length ? args : ['src']) walk(within(path));
  } else if (action === 'note') output = args.join(' ') + '\n';
  else if (action === 'run') {
    const [program, ...programArgs] = args;
    if (!['npm', 'node', 'rg'].includes(program)) throw new Error('Recorder permits npm, node, and rg.');
    if (program === 'npm' && !['run','test'].includes(programArgs[0])) throw new Error('Dependency installation is outside this run.');
    const run = spawnSync(program, programArgs, { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16777216 });
    output = (run.stdout ?? '') + (run.stderr ?? ''); status = run.status ?? 1; details = { error: run.error?.message ?? null, signal: run.signal };
  } else throw new Error('Use read <paths>, files [dir], note <text>, or run <npm|node|rg> <args>.');
} catch (error) { output += String(error) + '\n'; status = 1; }
const number = readdirSync(directory).filter(name => name.endsWith('.txt')).length + 1;
const filename = `${String(number).padStart(4,'0')}.txt`; writeFileSync(join(directory, filename), output);
appendFileSync(join(directory, 'activity.jsonl'), JSON.stringify({ start, end: new Date().toISOString(), action, args, status, details, output_file: filename, output_sha256: hash(output), output_bytes: Buffer.byteLength(output) }) + '\n');
process.stdout.write(output); process.exitCode = status;
