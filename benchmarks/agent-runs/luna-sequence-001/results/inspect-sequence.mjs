// Post-submission inspection. The frozen tests remain the acceptance gate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [workspace,runDirectory,outputDirectory]=process.argv.slice(2).map(x=>resolve(x));
const {sealSpecification,checkOperation,checkOperationSequence}=await import(pathToFileURL(join(workspace,'dist/index.js')).href);
const hash=x=>createHash('sha256').update(x).digest('hex');const literal=value=>({kind:'literal',value}),ref=(root,...path)=>({kind:'ref',root,path}),eq=(left,right)=>({kind:'compare',op:'eq',left,right});
const states=[{id:'value',name:'Stored value',description:'The value held by the original in-memory fixture.',scope:'process',type:{kind:'integer'},evidence_ids:[]}];
const operation={id:'op:store',alias:'store',name:'Store a value',purpose:'Keep the previous value when the simulated write fails.',inputs:{value:{kind:'integer'},reject:{kind:'boolean'}},output:{kind:'integer'},reads:['value'],writes:['value'],frame:'complete',effects:{completeness:'complete',allowed:[]},outcome_policy:'exclusive',coverage:'complete',outcomes:[false,true].map(reject=>({id:reject?'store:rejected':'store:written',description:reject?'Keep the old value.':'Store the requested value.',when:eq(ref('input','reject'),literal(reject)),ensures:[{id:reject?'return:old':'return:new',description:'Return the retained value.',predicate:eq(ref('output'),reject?ref('before','value'):ref('input','value')),evidence_ids:[]}],updates:[{state_id:'value',value:reject?ref('before','value'):ref('input','value')}],effects:[],transitions:[],evidence_ids:[]})),guarantees:[],dependencies:[],implementations:[],decisions:[],evidence_ids:[]};
const fixture=sealSpecification({schema_version:'0.3.0',kind:'specification',name:'Original storage recorder',perspective:'intended',provenance:{author:'Experiment evaluator',origin:'user-directed-design',review:'proposed',notes:['Original fixture, not Hono or another analyzed target.']},states,operations:[operation],sources:[]});
let value=0;
function attempt(next,reject=false){const before={value};let outcome='store:written';try{if(reject)throw Error('Simulated rejected write');value=next;}catch{outcome='store:rejected';}return{operation:'store',observation:{input:{value:next,reject},before,outcome,output:value,after:{value},effects:[]}};}
const recorded=[attempt(1),attempt(88,true),attempt(2)];
const mismatch=structuredClone(recorded);mismatch[1].observation.before.value=7;mismatch[1].observation.after.value=7;mismatch[1].observation.output=7;
const missing=structuredClone(recorded);delete missing[1].observation.after;
const brokenFailure=structuredClone(recorded);brokenFailure[1].observation.after.value=88;
const intended=JSON.parse(readFileSync(join(runDirectory,'frozen/specification.json'),'utf8'));
const cases=[];
for(const[name,steps,expected]of [['Recorded writes with a rejected write',recorded,'pass'],['Individually valid records with inconsistent shared state',mismatch,'fail'],['Missing resulting state',missing,'unknown'],['A rejected write changes storage',brokenFailure,'fail']]){
 const options={stateIds:['value']},before=hash(JSON.stringify([fixture,steps,options]));const result=checkOperationSequence(fixture,steps,options);assert.equal(result.verdict,expected);assert.equal(before,hash(JSON.stringify([fixture,steps,options])));
 const observation={input:{step_count:steps.length,expected_link_count:steps.length-1,step_verdicts:steps.map(s=>checkOperation(fixture,s.operation,s.observation).verdict),continuity_verdicts:result.continuity.map(x=>x.verdict)},before:{'input-digest':before},after:{'input-digest':hash(JSON.stringify([fixture,steps,options]))},outcome:`sequence:${result.verdict}`,output:{verdict:result.verdict,step_count:result.steps.length,link_count:result.continuity.length}};
 const check=checkOperation(intended,'check-sequence',observation);assert.equal(check.verdict,'unknown');assert(!check.checks.some(x=>x.verdict==='fail'));
 cases.push({name,origin:name.startsWith('Recorded')?'actual original fixture records':'edited fixture records; not a faulty compiled implementation',steps,result,observation,intended_rule_check:check});
}
mkdirSync(outputDirectory,{recursive:true});writeFileSync(join(outputDirectory,'inspection.json'),JSON.stringify({fixture,cases,limits:['The adapter trusts supplied record order and selected storage identity.','Continuity verdicts are projected from the candidate for the typed aggregate check. Independent frozen tests check their truth separately.','Five opaque rules keep the typed result unknown. No general effect monitor or source equivalence proof is present.']},null,2)+'\n');console.log(JSON.stringify({cases:cases.length,verdicts:cases.map(x=>x.result.verdict),typed_results:cases.map(x=>x.intended_rule_check.verdict)}));
