// Render only the authored Markdown reference; semantic records and source excerpts remain data.
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
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const docs = resolve(root, 'docs');
const destination = resolve(root, 'website/content/docs/technical');
const sourceRef =
  process.env.DOCS_SOURCE_REF ??
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const repository = `https://github.com/jiaxing-guo/clearings-semantic`;
const slug = (name) => name.replace(/^\d+-/, '').replace(/\.md$/, '');
const sections = readdirSync(docs, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+-/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const files = [
  'README.md',
  ...sections.flatMap((section) =>
    readdirSync(resolve(docs, section))
      .filter((name) => /^\d+-.*\.md$/.test(name))
      .sort()
      .map((name) => `${section}/${name}`),
  ),
];
const pages = files.map((file) => {
  const text = readFileSync(resolve(docs, file), 'utf8');
  const heading = text.match(/^# (.+)\n/);
  if (!heading) throw new Error(`Reference page must begin with an H1: ${file}`);
  const path = file === 'README.md' ? 'index' : file.split('/').map(slug).join('/');
  return {
    file,
    path,
    title: heading[1],
    text,
    url: '/docs/technical' + (path === 'index' ? '' : `/${path}`),
  };
});
const routes = new Map(pages.map((page) => [resolve(docs, page.file), page.url]));
const repositoryPath = (file) => relative(root, file).split(sep).map(encodeURIComponent).join('/');
const sourceUrl = (file) =>
  `${repository}/${statSync(file).isDirectory() ? 'tree' : 'blob'}/${encodeURIComponent(sourceRef)}/${repositoryPath(file)}`;

function rewriteLinks(text, file) {
  // Match the inline-link convention checked by check-markdown-docs. Keep fenced examples verbatim.
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
        if (!(target === root || target.startsWith(root + sep)) || !existsSync(target))
          throw new Error(`Invalid reference link ${href} in ${file}`);
        return before + (routes.get(target) ?? sourceUrl(target)) + suffix + after;
      });
    })
    .join('\n');
}

const generated = new Map();
const write = (path, data) => generated.set(path, data);
const meta = (path, data) =>
  write(resolve(destination, path, 'meta.json'), JSON.stringify(data, null, 2) + '\n');
meta('', { title: 'Technical reference', pages: ['index', ...sections.map(slug)] });
for (const section of sections) {
  const name = slug(section);
  const title =
    name === 'reference' ? 'Interface reference' : name[0].toUpperCase() + name.slice(1);
  meta(name, {
    title,
    pages: pages
      .filter((page) => page.file.startsWith(section + '/'))
      .map((page) => page.path.split('/')[1]),
  });
}
for (const page of pages) {
  const file = resolve(docs, page.file);
  const body = rewriteLinks(page.text.replace(/^# .+\n+/, ''), file);
  write(
    resolve(destination, `${page.path}.md`),
    `---\ntitle: ${JSON.stringify(page.title)}\n---\n\n${body.trimEnd()}\n\n---\n\n[View Markdown source](${sourceUrl(file)})\n`,
  );
}
const manifest = {
  source_ref: sourceRef,
  pages: pages.map((page) => ({
    source: `docs/${page.file}`,
    url: page.url,
    title: page.title,
    sha256: createHash('sha256').update(page.text).digest('hex'),
  })),
};
write(
  resolve(root, 'website/public/technical-reference.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
// Preserve unchanged files for the development watcher; remove only obsolete generated entries.
for (const [path, content] of generated) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path) || readFileSync(path, 'utf8') !== content) writeFileSync(path, content);
}
function prune(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      prune(path);
      if (!readdirSync(path).length) rmSync(path, { recursive: true });
    } else if (!generated.has(path)) rmSync(path);
  }
}
prune(destination);
console.log(`Prepared ${pages.length} technical reference pages from canonical Markdown.`);
