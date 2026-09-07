import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parse } from '../website/node_modules/parse5/dist/index.js';
import { checkReviewArchive } from './review-archive.mjs';
import { staticClient } from '../website/node_modules/fumadocs-core/dist/search/client/orama-static.js';
const root=resolve('website/out');
checkReviewArchive(join(root,'demo'));
const files=[];
function walk(dir) {for(const entry of readdirSync(dir,{withFileTypes:true})) {const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else files.push(p);}}
walk(root);
const home=readFileSync(join(root,'index.html'),'utf8');
const base=(home.match(/(?:src|href)="([^"?]*)\/_next\//)?.[1]) ?? '';
const expected=process.env.DOCS_BASE_PATH ?? '/clearings-semantic';
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
const searchFile=join(root,'search-index.json');assert(existsSync(searchFile),'Static search index missing.');
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),base+'/search-index.json');return new Response(readFileSync(searchFile),{headers:{'Content-Type':'application/json'}});};
try {
 const client=staticClient({from:base+'/search-index.json'});
 for(const query of ['finalized','context','source']) {
  const results=await client.search(query);assert(results.length>0,`Search has no results for ${query}`);
  for(const item of results) target(item.url,join(root,'index.html'),false);
 }
}finally {globalThis.fetch=originalFetch;}
const model=JSON.parse(readFileSync(join(root,'demo/semantic.json')));
assert.equal(model.artifact_id,JSON.parse(readFileSync('benchmarks/results/hono-contracts/semantic.json')).artifact_id);
assert(!files.some(f=>f.endsWith('.php')||f.endsWith('.node')));
console.log(JSON.stringify({static_html_pages:files.filter(f=>f.endsWith('.html')).length,links_checked:links,base_path:base,static_search_queries:3,demo_artifact:model.artifact_id,external_assets:0,browser_check:'not run; static checks only'}));
