import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(process.argv[2] ?? 'benchmarks/results/hono-shared');
const read=name=>readFileSync(join(root,name),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const model=JSON.parse(read('semantic.json')), review=JSON.parse(read('review.json'));
assert.equal(review.artifact_id,model.artifact_id);
for(const [name,record] of Object.entries(review.files)) {const bytes=readFileSync(join(root,name));assert.equal(hash(bytes),record.sha256,name);assert.equal(bytes.length,record.bytes,name);}
for(const line of read('SHA256SUMS').trim().split('\n')) {const [expected,name]=line.split('  ');assert.equal(hash(readFileSync(join(root,name))),expected,name);}
const htmlFiles=readdirSync(root).filter(n=>n.endsWith('.html'));
let fragments=0;
for(const name of htmlFiles) {
 const page=read(name),ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,`duplicate ID in ${name}`);
 for(const m of page.matchAll(/\bhref="([^"]+)"/g)) {
  const link=m[1];if(link.startsWith('#')) {assert(ids.includes(link.slice(1)),`${name}: ${link}`);fragments++;}
  else if(!/^[a-z]+:/.test(link)) assert(statSync(join(root,link)).isFile(),`${name}: ${link}`);
 }
 assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/i.test(page),name);
 assert(page.includes('name="viewport"'),name);assert(page.includes('<main'),name);
 if(name.includes('.engineer.')||name==='internal.html') {assert(page.includes('tabindex="0"'));assert(page.includes('aria-label='));}
 if(name!=='index.html') assert(page.includes(model.artifact_id),name);
}
for(const name of readdirSync(root).filter(n=>/\.(overview|engineer)\.md$/.test(n))) {
 const page=read(name),ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,name);
 for(const m of page.matchAll(/\]\(#([^)]*)\)/g)) assert(ids.includes(m[1]),`${name}: ${m[1]}`);
 assert(page.includes(model.artifact_id),name);
}
const answers=JSON.parse(read('agent/answers.json')),assessment=JSON.parse(read('agent/review.json'));
assert.equal(assessment.answer_sha256,hash(readFileSync(join(root,'agent/answers.json'))));
assert.equal(assessment.artifact_id,model.artifact_id);assert.equal(answers.artifact_id,model.artifact_id);
assert.equal(answers.answers.length,6);assert.equal(assessment.checks.length,6);
const recordIds=new Set(Object.values(model.data.proposal.data).flat().filter(x=>x&&typeof x==='object'&&x.id).map(x=>x.id));
for(const answer of answers.answers) for(const id of answer.record_ids) assert(recordIds.has(id),id);
const input=JSON.parse(read('agent/input.json'));
for(const file of input.context_files) {const bytes=readFileSync(join(root,'agent',file.path));assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);}
assert.equal(assessment.initial_answer_sha256,hash(readFileSync(join(root,'agent/initial-answers.json'))));
assert.equal(assessment.input_sha256,hash(readFileSync(join(root,'agent/input.json'))));
assert.equal(assessment.rubric_sha256,hash(readFileSync(join(root,'evaluation/expected.json'))));
assert.equal(assessment.independent,false);assert.equal(assessment.independent_support_gate,'not-established');
console.log(JSON.stringify({artifact_id:model.artifact_id,html_files:htmlFiles.length,markdown_reports:4,fragment_links:fragments,file_hashes:'valid',source_checked_by_builder:review.source_excerpts_verified,agent_record_bindings:'valid',browser_interaction:'not-run-policy-block'}));
