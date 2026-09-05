// Recorded replay packaging. No model call; evaluation records never enter analyzer inputs.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { validateContractModel, renderCapability, createSemanticWalkthrough, renderSemanticWalkthrough, createContextPack, serializeContextPack } from '../dist/index.js';
import { writeInventory } from '../dist/repository/output.js';
const [repository, replayDir, outputDir] = process.argv.slice(2);
if (!repository || !replayDir || !outputDir) throw new Error('Usage: node scripts/build-shared-demo.mjs <pinned-repository> <contract-replay-directory> <new-output-directory>');
const output = resolve(outputDir);
if (existsSync(output)) throw new Error('Use a new output directory.');
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = directory => {
  const result = createHash('sha256');
  const walk = dir => { for (const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name < b.name ? -1 : 1)) {
    const path=join(dir,entry.name); if(entry.isDirectory()) walk(path); else if(entry.isFile()) result.update(relative(directory,path)).update('\0').update(readFileSync(path)); else throw new Error('Target fingerprint needs regular files and directories.');
  } }; walk(directory); return result.digest('hex');
};
const before=fingerprint(repository);
const read = path => JSON.parse(readFileSync(path,'utf8'));
const model=read(join(replayDir,'semantic.json')), structural=read(join(replayDir,'scan.json'));
const original=read(new URL('../benchmarks/results/hono-contracts/semantic.json',import.meta.url));
if (model.artifact_id!==original.artifact_id) throw new Error('Demo expects the reviewed contract artifact.');
validateContractModel(model,{scan:structural,repository});
const notice=readFileSync(new URL('../benchmarks/results/hono-contracts/LICENSE-HONO',import.meta.url),'utf8');
const artifacts={'semantic.json':JSON.stringify(model,null,2)+'\n','LICENSE-HONO':notice};
const reports=[];
for (const capability of ['request-dispatch','middleware-composition']) {
  const presentation=read(new URL(`../benchmarks/presentations/hono-contracts/${capability}.json`,import.meta.url));
  artifacts[`${capability}.presentation.json`]=JSON.stringify(presentation,null,2)+'\n';
  for (const audience of ['overview','engineer']) for (const format of ['html','markdown']) {
    const extension=format==='html'?'html':'md'; const filename=`${capability}.${audience}.${extension}`;
    const options={presentation,audience,format,companion:`${capability}.${audience==='overview'?'engineer':'overview'}.${extension}`,sourceNotice:notice};
    const text=renderCapability(model,capability,options);
    if(text!==renderCapability(model,capability,options)) throw new Error('Report differs on repeat.');
    artifacts[filename]=text; reports.push(filename);
  }
  artifacts[`${capability}.context.json`]=serializeContextPack(createContextPack(model,{capability},{maxBytes:131072,includeNeighbors:false}));
}
const getter=model.data.proposal.data.functions.find(f=>f.alias==='context-res-getter');
const options={behavior:'response-selection',functionId:getter.id,maxBytes:131072,scan:structural,repository,sourceNotice:notice};
const walkthrough=createSemanticWalkthrough(model,options);
artifacts['walkthrough.json']=JSON.stringify(walkthrough,null,2)+'\n';
for(const format of ['html','markdown']) artifacts[`internal.${format==='html'?'html':'md'}`]=renderSemanticWalkthrough(model,{...options,format});
for(const [file,name] of [['answers.json','agent/answers.json'],['initial-answers.json','agent/initial-answers.json'],['input.json','agent/input.json'],['questions.json','agent/questions.json'],['review.json','agent/review.json']]) {
  const value=readFileSync(new URL(`../benchmarks/agent-runs/hono-comprehension/${file}`,import.meta.url),'utf8');
  if (file!=='questions.json' && read(new URL(`../benchmarks/agent-runs/hono-comprehension/${file}`,import.meta.url)).artifact_id!==model.artifact_id) throw new Error('Agent record belongs to a different model.');
  artifacts[name]=value;
}
for (const capability of ['request-dispatch','middleware-composition']) artifacts[`agent/${capability}.context.json`] = artifacts[`${capability}.context.json`];
artifacts['evaluation/expected.json'] = readFileSync(new URL('../benchmarks/evaluators/hono-comprehension.json',import.meta.url),'utf8');
artifacts['index.html']=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clearings · Three demos</title><style>body{font:17px/1.6 system-ui;max-width:760px;margin:auto;padding:32px;color:#24382e;background:#fafaf6}a{color:#256242}td,th{padding:12px;text-align:left}code{overflow-wrap:anywhere}</style></head><body><main><h1>Internal representation for AI coding</h1><p>One Hono model, three views. Start with a question and choose the detail you need.</p><table><thead><tr><th>Capability</th><th>Overview</th><th>Engineer</th></tr></thead><tbody>${['request-dispatch','middleware-composition'].map(c=>`<tr><td>${c.replaceAll('-',' ')}</td><td><a href="${c}.overview.html">Purpose and outcomes</a></td><td><a href="${c}.engineer.html">Conditions and code</a></td></tr>`).join('')}</tbody></table><p><a href="internal.html">Inspect the internal representation →</a></p><p><a href="agent/answers.json">Read the agent answers</a> · <a href="agent/review.json">Review the assessment</a> · <a href="README.md">Reproduce the demo</a></p><p>Partial scope. Semantic support needs independent review. The recorded comprehension run is an author demonstration with prior source exposure.</p><details><summary>Artifact identity and source notice</summary><p><code>${model.artifact_id}</code></p><a href="LICENSE-HONO">Hono source license</a></details></main></body></html>\n`;
artifacts['README.md']=`# Clearings: three views of one model\n\nOpen index.html. The overview gives purpose and outcomes. The engineer article adds conditions and source. internal.html follows real query output through a behavior, function, shared state, assertion, and evidence. Markdown copies are included.\n\nArtifact: ${model.artifact_id}\n\nAll views are recorded replay from pinned Hono source. The model has ${model.coverage.functions} functions, ${model.coverage.behaviors} behaviors, and ${model.data.proposal.data.claims.length} assertions. Contracts and prose need independent support review.\n\nThe agent answers are a continuing-session author demonstration, not a blind or independent evaluation. Rebuilding copies the recorded answers; no model is called. Input context files are the adjacent request-dispatch.context.json and middleware-composition.context.json. See agent/input.json and agent/questions.json.\n\nReproduce from the Clearings repository root after npm ci --ignore-scripts and npm run build:\n\n\`\`\`bash\nnode scripts/replay-contracts.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts\nnode scripts/build-shared-demo.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts benchmarks/results/local/my-demo\npython scripts/package-shared-demo.py benchmarks/results/local/my-demo\n\`\`\`\n\nUse new output directories. Fetch the pinned bare checkout first with npm run benchmark:fetch if absent. The scan is produced by replay and kept outside this smaller bundle.\n\nReview source fidelity, conditions, callback unknowns, and the assertion links. review.json records source checks and hashes. Browser policy blocked local preview in the current session history. No new browser pass is claimed. Native details, responsive CSS, keyboard code scrolling, internal links, and local assets are checked statically; desktop/mobile interaction review remains pending.\n\nSource excerpts retain the upstream notice in LICENSE-HONO. Reports include that notice.\n`;
const after=fingerprint(repository); if(before!==after) throw new Error('Target files changed.');
const review={artifact_id:model.artifact_id,snapshot_id:model.snapshot_id,transport:'recorded-replay',model_called:false,source_excerpts_verified:model.data.request.data.source_request.data.evidence.length,target_bytes_unchanged:true,deterministic_reports:true,reports,coverage:model.coverage,independent_claim_review:false,presentation_review:'author binding review; independent content review pending',browser:{status:'not-run-policy-block',reason:'The earlier local preview was blocked by browser policy. No alternate browser route used.',desktop_mobile_keyboard_interaction:'pending'},static_checks:'Run scripts/check-shared-demo.mjs on this bundle.',files:Object.fromEntries(Object.entries(artifacts).map(([name,text])=>[name,{bytes:Buffer.byteLength(text),sha256:hash(text)}]))};
artifacts['review.json']=JSON.stringify(review,null,2)+'\n';
artifacts['SHA256SUMS']=Object.entries(artifacts).sort(([a],[b])=>a<b?-1:1).map(([name,text])=>`${hash(text)}  ${name}`).join('\n')+'\n';
for (const [name,text] of Object.entries(artifacts)) writeInventory(repository,join(output,name),text);
console.log(JSON.stringify({artifact_id:model.artifact_id,files:Object.keys(artifacts).length,target_bytes_unchanged:true}));
