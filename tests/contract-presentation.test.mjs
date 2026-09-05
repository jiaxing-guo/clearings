import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCapability, validatePresentationPlan, createPresentationPlan, createSemanticWalkthrough, renderSemanticWalkthrough } from '../dist/index.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const model=read('../benchmarks/results/hono-contracts/semantic.json');
const plan=alias=>read(`../benchmarks/presentations/hono-contracts/${alias}.json`);
const anchor=id=>id.replace(':','-');
const decode=text=>text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

test('contract reports retain model identity, canonical fields, source fidelity, and every link in both audience formats',()=>{
 const before=JSON.stringify(model);const union=new Set();
 for(const alias of ['request-dispatch','middleware-composition']) {
  const presentation=plan(alias);
  for(const audience of ['overview','engineer']) for(const format of ['html','markdown']) {
   const page=renderCapability(model,alias,{presentation,audience,format});
   assert.equal(page,renderCapability(model,alias,{presentation,audience,format}));
   assert(page.includes(model.artifact_id));assert(!page.includes('Authored function summaries'));
   const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
   for(const m of page.matchAll(/href="#([^"]+)"|\]\(#([^)]*)\)/g)) assert(ids.includes(m[1]??m[2]),m[0]);
   for(const id of presentation.behavior_ids) assert(ids.includes(anchor(id)));
   for(const {function_id} of presentation.function_bindings) {
    assert(ids.includes(anchor(function_id)));const fn=model.data.proposal.data.functions.find(f=>f.id===function_id);
    for(const id of [...fn.input_claim_ids,...fn.output_claim_ids,...fn.effect_claim_ids,...fn.failures.flatMap(f=>f.claim_ids)]) {assert(ids.includes(anchor(id)),id);union.add(id);}
   }
   for(const stage of presentation.stages) for(const id of stage.claim_ids) {assert(ids.includes(anchor(id)));union.add(id);}
   if(format==='html') {
    const blocks=[...page.matchAll(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));
    for(const block of blocks) assert(model.data.request.data.source_request.data.evidence.some(e=>e.text.includes(block)));
    assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/i.test(page));
    if(alias==='request-dispatch'&&audience==='engineer') assert(blocks.some(b=>b.includes('ReturnType<H>')&&b.includes(': (res ?? this.#notFoundHandler(c))\n    }')));
   }
  }
 }
 assert.equal(union.size,model.data.proposal.data.claims.length);assert.equal(JSON.stringify(model),before);
});

test('new plans reject historical rebinding and omitted or unrelated contracts',()=>{
 const invalid=edit=>{const p=plan('request-dispatch');edit(p);assert.throws(()=>validatePresentationPlan(p,model,'request-dispatch'),{code:'INVALID_PRESENTATION'});};
 invalid(p=>{p.schema_version='0.1.0'});invalid(p=>{p.semantic_artifact_id='semantic:'+'0'.repeat(64)});
 invalid(p=>p.behavior_ids.pop());invalid(p=>p.function_bindings.pop());
 invalid(p=>p.function_bindings.push(p.function_bindings[0]));invalid(p=>p.function_bindings[0].stage_keys=['absent']);
 invalid(p=>{p.functions=[]});invalid(p=>{p.guide.sections[0].code.end_line=99999});
 const old=read('../benchmarks/presentations/hono/request-dispatch.json');old.semantic_artifact_id=model.artifact_id;
 assert.throws(()=>validatePresentationPlan(old,model,'request-dispatch'),{code:'INVALID_PRESENTATION'});
 const derived=createPresentationPlan(model,'request-dispatch');assert.equal(derived.schema_version,'0.2.0');
 const html=renderCapability(model,'request-dispatch');assert(html.includes('Canonical contracts'));
});

test('walkthrough is generated from actual queries and keeps source-check and membership boundaries',()=>{
 const getter=model.data.proposal.data.functions.find(f=>f.alias==='context-res-getter');
 const options={behavior:'response-selection',functionId:getter.id,maxBytes:131072};
 const walk=createSemanticWalkthrough(model,options);
 assert.equal(walk.artifact_id,model.artifact_id);assert.equal(walk.checks.source_rechecked,false);
 assert.deepEqual(walk.function,getter);assert.deepEqual(walk.relationships.map(r=>r.to_id),walk.behavior.function_ids);
 assert.equal(walk.context_bytes,Buffer.byteLength(JSON.stringify(walk.context)+'\n'));
 assert(walk.queries.some(q=>q.root_ids.includes(getter.id)));
 assert.equal(walk.source.text,model.data.request.data.source_request.data.evidence.find(e=>e.id===walk.source.id).text);
 const html=renderSemanticWalkthrough(model,{...options,format:'html'});
 assert(html.includes(model.artifact_id));assert(html.includes('Source rechecked in this walkthrough: false'));
 const markdown=renderSemanticWalkthrough(model,options);assert(markdown.includes(walk.source.text));
 assert.throws(()=>createSemanticWalkthrough(model,{...options,functionId:model.data.proposal.data.functions.find(f=>f.alias==='hono-fetch').id}),{code:'INVALID_SELECTION'});
 assert.throws(()=>createSemanticWalkthrough(model,{...options,maxBytes:1}),{code:'CONTEXT_BUDGET'});
});
