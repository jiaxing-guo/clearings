import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const docs = resolve(root, 'docs');
const destination = resolve(root, 'website/content/docs');
const sourceRef =
  process.env.DOCS_SOURCE_REF ??
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const repository = 'https://github.com/jiaxing-guo/clearings';
const files = [
  'README.md',
  ...readdirSync(docs)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort(),
];
const pages = files.map((name) => {
  const source = `docs/${name}`;
  const text = readFileSync(resolve(root, source), 'utf8');
  const title = text.match(/^# (.+)\r?\n/)?.[1];
  if (!title) throw new Error(`Documentation must start with an H1: ${source}`);
  const slug = name === 'README.md' ? 'index' : name.slice(0, -3);
  return { source, text, title, slug, url: slug === 'index' ? '/docs' : `/docs/${slug}` };
});
const routes = new Map(pages.map((page) => [resolve(root, page.source), page.url]));
function sourceUrl(file) {
  const path = relative(root, file).split('/').map(encodeURIComponent).join('/');
  return `${repository}/${statSync(file).isDirectory() ? 'tree' : 'blob'}/${encodeURIComponent(sourceRef)}/${path}`;
}
function rewriteLinks(text, file) {
  let fence;
  return text
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return line;
      }
      if (fence) return line;
      return line.replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (match, before, href, after) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return match;
        const end = href.search(/[?#]/);
        const pathname = end < 0 ? href : href.slice(0, end);
        const suffix = end < 0 ? '' : href.slice(end);
        const target = resolve(dirname(file), decodeURIComponent(pathname));
        if (!(target === root.slice(0, -1) || target.startsWith(root)) || !existsSync(target))
          throw new Error(`Invalid reference link ${href} in ${file}`);
        return before + (routes.get(target) ?? sourceUrl(target)) + suffix + after;
      });
    })
    .join('\n');
}
const generated = new Map();
generated.set(
  'meta.json',
  JSON.stringify({ title: 'Clearings', pages: pages.map((page) => page.slug) }, null, 2) + '\n',
);
for (const page of pages) {
  const file = resolve(root, page.source);
  const body = rewriteLinks(page.text.replace(/^# .+\r?\n+/, ''), file);
  generated.set(
    `${page.slug}.md`,
    `---\ntitle: ${JSON.stringify(page.title)}\n---\n\n${body.trimEnd()}\n\n---\n\n[View Markdown source](${sourceUrl(file)})\n`,
  );
}
mkdirSync(destination, { recursive: true });
// Remove obsolete projection files, including the earlier generated reference tree.
for (const name of readdirSync(destination)) {
  if (!generated.has(name)) rmSync(resolve(destination, name), { recursive: true, force: true });
}
for (const [name, text] of generated) {
  const file = resolve(destination, name);
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
}
mkdirSync(resolve(root, 'website/public'), { recursive: true });
writeFileSync(
  resolve(root, 'website/public/reference.json'),
  JSON.stringify(
    {
      source_ref: sourceRef,
      pages: pages.map(({ source, url, title, text }) => ({
        source,
        url,
        title,
        sha256: createHash('sha256').update(text).digest('hex'),
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared ${pages.length} documentation pages.`);
