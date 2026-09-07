import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkOperation } from '../dist/index.js';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parse } from '../website/node_modules/parse5/dist/index.js';
import { checkReviewArchive } from './review-archive.mjs';
import { staticClient } from '../website/node_modules/fumadocs-core/dist/search/client/orama-static.js';
const root=resolve('website/out');
checkReviewArchive(join(root,'demo'));
checkReviewArchive(join(root,'demo/bootstrap'),'clearings-specification-review.zip');
const files=[];
function walk(dir) {for(const entry of readdirSync(dir,{withFileTypes:true})) {const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else files.push(p);}}
walk(root);
const home=readFileSync(join(root,'index.html'),'utf8');
const base=(home.match(/(?:src|href)="([^"?]*)\/_next\//)?.[1]) ?? '';
const expected=process.env.DOCS_BASE_PATH ?? '/clearings';
assert.equal(base,expected,'Built base path differs. Set DOCS_BASE_PATH for a custom export check.');
const parsed=new Map();
function tree(file) {
 if(parsed.has(file))return parsed.get(file);
 const doc=parse(readFileSync(file,'utf8')),ids=new Set(),links=[],assets=[];
 const visit=node=>{const attrs=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));if(attrs.id) {assert(!ids.has(attrs.id),`Duplicate ID ${file}: ${attrs.id}`);ids.add(attrs.id);}
 if(attrs.href)links.push(attrs.href);
 if(attrs.src)assets.push(attrs.src);
 if(node.tagName==='link'&&attrs.href&&['stylesheet','preload','modulepreload'].includes(attrs.rel))assets.push(attrs.href);
 (node.childNodes??[]).forEach(visit);};visit(doc);
 const value={ids,links,assets};parsed.set(file,value);return value;
}
function target(url,file,requirePrefix=true) {
 const current='/'+relative(root,file).replaceAll('\\','/');
 const full=new URL(url,'https://local.invalid'+(file.includes('/demo/')?'':base)+current);
 if(full.origin!=='https://local.invalid')return null;
 let path=decodeURIComponent(full.pathname);
 if(!file.includes('/demo/')&&requirePrefix) {assert(path===base||path.startsWith(base+'/'),`Missing base path ${url} in ${file}`);path=path.slice(base.length)||'/';}
 else if(base&&path.startsWith(base+'/'))path=path.slice(base.length);
 let resolved=resolve(root,'.'+path);
 assert(resolved.startsWith(root+'/')||resolved===root,`Outside export: ${url}`);
 if(existsSync(resolved)&&statSync(resolved).isDirectory())resolved=join(resolved,'index.html');
 if(!existsSync(resolved)&&!path.endsWith('/')) {const candidate=join(resolved,'index.html');if(existsSync(candidate))resolved=candidate;}
 assert(existsSync(resolved)&&statSync(resolved).isFile(),`Missing target ${url} in ${file}`);
 if(full.hash&&resolved.endsWith('.html'))assert(tree(resolved).ids.has(decodeURIComponent(full.hash.slice(1))),`Missing fragment ${url} in ${file}`);
 return resolved;
}
let links=0;
for(const file of files.filter(f=>f.endsWith('.html'))) {
 const data=tree(file);
 for(const asset of data.assets) {
  if(asset.startsWith('data:'))continue;
  assert(!/^(?:[a-z][a-z0-9+.-]*:|[/\\]{2})/i.test(asset.trimStart()),`External asset: ${asset}`);
  assert(target(asset,file)!==null,`External asset: ${asset}`);
 }
 for(const link of data.links) {if(/^(mailto:|tel:|data:)/.test(link))continue;target(link,file);links++;}
}
const reference = JSON.parse(readFileSync(join(root, 'technical-reference.json'), 'utf8'));
const expectedSources = ['docs/README.md', ...readdirSync('docs').filter(name => /^\d+-/.test(name)).sort().flatMap(section => readdirSync(join('docs', section)).filter(name => /^\d+-.*\.md$/.test(name)).sort().map(name => `docs/${section}/${name}`))];
assert.deepEqual(reference.pages.map(page => page.source), expectedSources, 'Technical reference page inventory is incomplete.');
for (const page of reference.pages) {
 const content = readFileSync(page.source, 'utf8');
 assert.equal(page.sha256, createHash('sha256').update(content).digest('hex'), `Stale generated documentation: ${page.source}`);
 const file = target(base + page.url, join(root, 'index.html'));
 const document = parse(readFileSync(file, 'utf8'));
 const headings = [];
 const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
 const visit = node => { if (node.tagName === 'h1') headings.push(text(node)); (node.childNodes ?? []).forEach(visit); };
 visit(document);
 assert.deepEqual(headings, [page.title], `Missing or duplicate page title: ${page.url}`);
}
const explorer = JSON.parse(readFileSync(join(root, 'operation-explorer.json'), 'utf8'));
const specificationBytes = readFileSync(explorer.source, 'utf8');
const specification = JSON.parse(specificationBytes);
assert.equal(explorer.source_sha256, createHash('sha256').update(specificationBytes).digest('hex'));
assert.equal(explorer.artifact_id, specification.artifact_id);
assert.deepEqual(explorer.operation, specification.operations.find(operation => operation.id === 'response-selection'));
assert.deepEqual(explorer.cases.map(example => example.expected), ['pass', 'fail', 'unknown']);
for (const example of explorer.cases) {
 const result = checkOperation(specification, explorer.operation.id, example.observation);
 assert.deepEqual(example.result, result, `Stale operation explorer result: ${example.id}`);
 assert.equal(result.verdict, example.expected);
}
const operationPage = join(root, 'docs/technical/semantics/operations/index.html');
assert(tree(operationPage).ids.has('explorer-title'), 'Operation explorer was not rendered.');
const navigation = tree(join(root, 'docs/index.html')).links.map(link => link.replace(/\/$/, ''));
for (const page of reference.pages) assert(navigation.includes(base + page.url), `Reference page is missing from navigation: ${page.url}`);
const queries = ['finalized', 'context', 'source', 'refinement', 'opaque', 'frame'];
const searchFile=join(root,'search-index.json');assert(existsSync(searchFile),'Static search index missing.');
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),base+'/search-index.json');return new Response(readFileSync(searchFile),{headers:{'Content-Type':'application/json'}});};
try {
 const client=staticClient({from:base+'/search-index.json'});
 for(const query of queries) {
  const results=await client.search(query);assert(results.length>0,`Search has no results for ${query}`);
  for(const item of results) target(item.url,join(root,'index.html'),false);
  if (['refinement', 'opaque', 'frame'].includes(query)) assert(results.some(item => item.url.includes('/docs/technical/')), `Technical reference missing from search: ${query}`);
 }
}finally {globalThis.fetch=originalFetch;}
const model=JSON.parse(readFileSync(join(root,'demo/semantic.json')));
assert.equal(model.artifact_id,JSON.parse(readFileSync('benchmarks/results/hono-contracts/semantic.json')).artifact_id);
assert(!files.some(f=>f.endsWith('.php')||f.endsWith('.node')));
console.log(JSON.stringify({static_html_pages:files.filter(f=>f.endsWith('.html')).length,links_checked:links,base_path:base,technical_reference_pages:reference.pages.length,operation_explorer_cases:explorer.cases.length,static_search_queries:queries.length,demo_artifact:model.artifact_id,external_html_asset_references:0,asset_check_scope:'HTML src and stylesheet/preload/modulepreload href; CSS and JavaScript references are not inspected',browser_check:'not run; static checks only'}));
