// Verify trusted repository Markdown. Do not execute archive or source/proposal text.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : entry.isFile() && extname(path) === '.md'
        ? [path]
        : [];
  });
const files = [
  ...walk(join(root, 'docs')),
  ...['README.md', 'CONTRIBUTING.md', 'AGENTS.md'].map((path) => join(root, path)),
].sort();
const errors = [];
const parsed = new Map();

function parse(path) {
  if (parsed.has(path)) return parsed.get(path);
  const prose = [],
    runnable = [];
  let fence = null,
    body = [],
    start = 0,
    executable = false;
  for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
        if (executable) runnable.push({ code: body.join('\n'), line: start });
        fence = null;
      } else body.push(line);
      prose.push('');
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening) {
      fence = opening[1];
      body = [];
      start = index + 2;
      executable = opening[2].trim() === 'js runnable';
      prose.push('');
    } else prose.push(line);
  }
  if (fence) errors.push(`${relative(root, path)}: unclosed code fence`);
  const result = { prose: prose.join('\n'), runnable };
  parsed.set(path, result);
  return result;
}

const anchorCache = new Map();
function anchors(path) {
  if (anchorCache.has(path)) return anchorCache.get(path);
  const { prose } = parse(path),
    result = new Set(),
    counts = new Map();
  for (const match of prose.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    result.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  for (const match of prose.matchAll(/\bid=["']([^"']+)["']/g)) result.add(match[1]);
  anchorCache.set(path, result);
  return result;
}

let links = 0,
  examples = 0;
for (const path of files) {
  const { prose, runnable } = parse(path);
  for (const match of prose.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
    links += 1;
    const [pathname, fragment] = target.split('#');
    const destination = pathname ? resolve(dirname(path), decodeURIComponent(pathname)) : path;
    const location = `${relative(root, path)} → ${target}`;
    if (!existsSync(destination)) {
      errors.push(`${location}: missing target`);
      continue;
    }
    if (
      fragment &&
      extname(destination) === '.md' &&
      statSync(destination).isFile() &&
      !anchors(destination).has(decodeURIComponent(fragment))
    )
      errors.push(`${location}: missing fragment`);
  }
  if (!/^docs\/[0-9]{2}-[^/]+\//.test(relative(root, path))) continue;
  for (const example of runnable) {
    examples += 1;
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      input: example.code,
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1048576,
    });
    if (result.error || result.status !== 0) {
      errors.push(
        `${relative(root, path)}:${example.line}: example failed\n${result.error?.message ?? result.stderr ?? result.stdout}`,
      );
    }
  }
}
if (examples === 0) errors.push('No executable documentation examples were found.');
if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    JSON.stringify({
      markdown_files: files.length,
      local_links: links,
      executable_examples: examples,
      status: 'pass',
    }) + '\n',
  );
}
