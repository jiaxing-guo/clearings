// Explicit benchmark migration. Historical plans are read-only inputs.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { validatePresentationPlan } from '../dist/index.js';
import { reportContracts } from '../dist/presentation/plan.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const model = read('../benchmarks/results/hono-contracts/semantic.json');
const oldModel = read('../benchmarks/results/hono-audiences/semantic.json');
const output = new URL('../benchmarks/presentations/hono-contracts/', import.meta.url);
mkdirSync(output, { recursive: true });
const map = {
  'request-dispatch': {
    'hono-fetch':['method'], 'hono-dispatch':['method','match','handlers','response','failure'], 'dispatch-head-wrapper':['method'],
    'direct-next':['handlers','response'], 'promise-result':['response'], 'promise-catch':['failure'], 'composed-finalization':['response','failure'],
    'hono-handle-error':['failure'], 'default-error':['failure'], 'default-not-found':['response'], 'compose-factory':['handlers'],
    'compose-runner':['handlers'], 'middleware-dispatch':['handlers','response','failure'], 'middleware-next':['handlers'],
    'context-res-getter':['response'], 'context-res-setter':['response'], 'context-not-found':['response'], 'context-default-response':['response'],
    'application-handler':['handlers'], 'application-error-handler':['failure'], 'application-not-found':['response'], 'application-outer-next':['handlers'],
  },
  'middleware-composition': {
    'compose-factory':['start'], 'compose-runner':['start'], 'middleware-dispatch':['guard','call','response','failure'], 'middleware-next':['call'],
    'context-res-getter':['response'], 'context-res-setter':['response'], 'context-not-found':['response'], 'context-default-response':['response'],
    'application-handler':['call'], 'application-error-handler':['failure'], 'application-not-found':['response'], 'application-outer-next':['call'],
  },
};
const review = { origin:'explicit-author-migration', independent_review:false, old_artifact_id:oldModel.artifact_id, artifact_id:model.artifact_id, note:'Article prose and code focuses retained after checking the shared assertions and source. Contract reference fields now come from canonical records. No source-support certification is implied.', plans:[] };
for (const alias of Object.keys(map)) {
  const original = read(`../benchmarks/presentations/hono/${alias}.json`);
  const pack = { records: reportContracts(model, alias) };
  const { functions:oldSummaries, schema_version:_, semantic_artifact_id:__, ...reading } = original;
  // All reused citations must retain exact assertion text and exact source attachment.
  const shared = oldModel.data.proposal.data.claims.filter(c => pack.records.claims.some(n => n.id === c.id));
  for (const claim of shared) if (JSON.stringify(claim) !== JSON.stringify(model.data.proposal.data.claims.find(c=>c.id===claim.id))) throw new Error('Changed assertion requires a new prose review.');
  for (const excerpt of oldModel.data.request.data.evidence) if (JSON.stringify(excerpt) !== JSON.stringify(model.data.request.data.source_request.data.evidence.find(e=>e.id===excerpt.id))) throw new Error('Changed source requires a new focus review.');
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (value.unknown_indices) value.unknown_indices = value.unknown_indices.map(i => {
        const old = oldModel.data.proposal.data.unknowns[i];
        const index = model.data.proposal.data.unknowns.findIndex(u=>u.subject_id===old.subject_id && u.question===old.question);
        if (index < 0) throw new Error('Changed unknown needs a new prose review.');
        return index;
      });
      Object.values(value).forEach(visit);
    }
  }; visit(reading);
  const bindings = pack.records.functions.map(fn => {
    const stage_keys = map[alias][fn.alias];
    if (!stage_keys) throw new Error(`Map new function ${fn.alias} to a reading stage.`);
    return {function_id:fn.id,stage_keys};
  });
  const already = new Set(reading.stages.flatMap(s=>s.claim_ids));
  for (const claim of pack.records.claims.filter(c=>!already.has(c.id))) {
    const fn = pack.records.functions.find(f=>JSON.stringify(f).includes(claim.id));
    const stage = bindings.find(b=>b.function_id===fn?.id)?.stage_keys[0] ?? 'response';
    reading.stages.find(s=>s.key===stage).claim_ids.push(claim.id);
  }
  const plan = { schema_version:'0.2.0', semantic_artifact_id:model.artifact_id, ...reading, function_bindings:bindings,
    behavior_ids:model.data.proposal.data.behaviors.filter(b=>b.capability_id===original.capability_id).map(b=>b.id) };
  validatePresentationPlan(plan,model,alias);
  writeFileSync(new URL(`${alias}.json`,output),JSON.stringify(plan,null,2)+'\n');
  review.plans.push({capability:alias, preserved_assertions:shared.length, authored_summaries_removed:oldSummaries.length, canonical_functions:bindings.length, assertions:pack.records.claims.length});
}
writeFileSync(new URL('binding-review.json',output),JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify(review,null,2));
