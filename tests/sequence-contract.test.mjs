// Frozen before the coding session. Written by the experiment author, not Luna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const api = await import(process.env.CLEARINGS_SEQUENCE_ENTRY ? pathToFileURL(process.env.CLEARINGS_SEQUENCE_ENTRY).href : '../dist/index.js');
const { sealSpecification, specificationIdentity, checkOperation } = api;
const run = (...args) => { assert.equal(typeof api.checkOperationSequence,'function','public sequence API missing'); return api.checkOperationSequence(...args); };
const lit = value => ({kind:'literal',value});
const ref = (root,...path) => ({kind:'ref',root,path});
const eq = (left,right) => ({kind:'compare',op:'eq',left,right});
const state = (id,type={kind:'integer'},scope='request') => ({id,name:id,description:`Observe ${id}.`,scope,type,evidence_ids:[]});
function fixture(perspective='intended') {
 const op={id:'op:store',alias:'store',name:'Store or reject',purpose:'Keep the old value if the write fails.',inputs:{value:{kind:'integer'},reject:{kind:'boolean'}},output:{kind:'integer'},reads:['counter'],writes:['counter'],frame:'partial',effects:{completeness:'complete',allowed:[]},outcome_policy:'exclusive',coverage:'complete',outcomes:[],guarantees:[],dependencies:[],implementations:[],decisions:[],evidence_ids:[]};
 op.outcomes=[false,true].map(reject=>({id:reject?'store:rejected':'store:written',description:reject?'Keep the old value.':'Store the new value.',when:eq(ref('input','reject'),lit(reject)),ensures:[{id:reject?'return:old':'return:new',description:'Return the retained value.',predicate:eq(ref('output'),reject?ref('before','counter'):ref('input','value')),evidence_ids:[]}],updates:[{state_id:'counter',value:reject?ref('before','counter'):ref('input','value')}],effects:[],transitions:[],evidence_ids:[]}));
 const ping={...structuredClone(op),id:'op:ping',alias:'ping',name:'Ping',purpose:'Return zero.',inputs:{},writes:[],reads:[],outcomes:[{id:'ping:done',description:'Return zero without a modeled update.',when:lit(true),ensures:[{id:'ping:zero',description:'Return zero.',predicate:eq(ref('output'),lit(0)),evidence_ids:[]}],updates:[],effects:[],transitions:[],evidence_ids:[]}]};
 return sealSpecification({schema_version:'0.3.0',kind:'specification',name:'Original sequential storage fixture',perspective,provenance:{author:'Independent test author',origin:perspective==='intended'?'user-directed-design':'source-interpretation',review:'proposed',notes:[]},states:[state('counter'),state('constructor'),state('toString'),state('A'),state('z'),state('meta',{kind:'record',fields:{left:{kind:'integer'},right:{kind:'list',element:{kind:'integer'}}}}),state('flag',{kind:'boolean'}),state('empty',{kind:'string'}),state('nil',{kind:'null'}),state('local',{kind:'integer'},'invocation')],operations:[op,ping],sources:[]});
}
const store=(before,value,reject=false)=>({operation:'store',observation:{input:{value,reject},before:{counter:before},outcome:reject?'store:rejected':'store:written',output:reject?before:value,after:{counter:reject?before:value},effects:[]}});
const ping=()=>({operation:'ping',observation:{input:{},before:{},outcome:'ping:done',output:0,after:{},effects:[]}});
const error=(code,fn)=>assert.throws(fn,e=>e?.code===code,`expected ${code}`);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('oracle fixture: successful and rejected writes have valid independent step checks',()=>{
 const spec=fixture();for(const step of [store(0,1),store(1,8,true),ping()])assert.equal(checkOperation(spec,step.operation,step.observation).verdict,'pass');
 const bad=store(1,8,true);bad.observation.after.counter=8;assert.equal(checkOperation(spec,'store',bad.observation).verdict,'fail');
});
test('sequence public result preserves exact step checks and provenance',()=>{
 const spec=fixture(),steps=[store(0,1),store(1,2)];steps[1].operation='op:store';
 const r=run(spec,steps,{stateIds:['counter']});
 assert.deepEqual(Object.keys(r).sort(),['schema_version','command','artifact_id','perspective','state_ids','steps','continuity','verdict','interpretation','acceptance'].sort());
 assert.equal(r.schema_version,'0.3.0');assert.equal(r.command,'check-sequence');assert.equal(r.artifact_id,spec.artifact_id);assert.equal(r.perspective,'intended');assert.equal(r.interpretation,'supplied-observations-only');assert.equal(r.acceptance,'proposed');assert.equal(r.verdict,'pass');
 assert.deepEqual(r.steps,steps.map((s,index)=>({index,operation_id:'op:store',result:checkOperation(spec,s.operation,s.observation)})));
 assert.deepEqual(r.continuity,[{from_index:0,to_index:1,state_id:'counter',verdict:'pass',reason:null}]);
});
test('a contract-valid failure preserves state and permits the next record',()=>{
 const r=run(fixture(),[store(0,1),store(1,77,true),store(1,2)],{stateIds:['counter']});assert.equal(r.verdict,'pass');assert.deepEqual(r.steps.map(x=>x.result.verdict),['pass','pass','pass']);assert.equal(r.continuity.length,2);
});
test('valid individual operations can have a failed continuity link',()=>{
 const r=run(fixture(),[store(0,1),store(9,2)],{stateIds:['counter']});assert.equal(r.verdict,'fail');assert(r.steps.every(x=>x.result.verdict==='pass'));assert.equal(r.continuity[0].verdict,'fail');assert(r.continuity[0].reason.length>0);
});
test('missing adjacent state stays unknown without inferred values or distant bridging',()=>{
 const a=ping(),b=ping(),c=ping();a.observation.after.counter=1;b.observation.before.counter=1;c.observation.before.counter=1;
 const r=run(fixture(),[a,b,c],{stateIds:['counter']});assert.deepEqual(r.continuity.map(x=>x.verdict),['pass','unknown']);assert.equal(r.verdict,'unknown');assert(r.continuity[1].reason.length>0);
 delete b.observation.before.counter;assert.deepEqual(run(fixture(),[a,b,c],{stateIds:['counter']}).continuity.map(x=>x.verdict),['unknown','unknown']);
});
test('empty scope and one-step scope do not invent continuity requirements',()=>{
 const a=store(0,1),b=store(55,2);a.observation.after.local=1;b.observation.before.local=99;
 assert.equal(run(fixture(),[a,b],{stateIds:[]}).verdict,'pass');assert.equal(run(fixture(),[a],{stateIds:['counter','meta']}).continuity.length,0);
 assert.equal(run(fixture(),[a,b],{stateIds:['local']}).verdict,'fail');
});
test('state IDs are unique, code-unit sorted, and links are in adjacent-pair order',()=>{
 const r=run(fixture(),[ping(),ping(),ping()],{stateIds:['z','counter','A','z']});assert.deepEqual(r.state_ids,['A','counter','z']);assert.deepEqual(r.continuity.map(x=>[x.from_index,x.to_index,x.state_id]),[[0,1,'A'],[0,1,'counter'],[0,1,'z'],[1,2,'A'],[1,2,'counter'],[1,2,'z']]);
});
test('JSON equality ignores object key order but preserves array order',()=>{
 const a=ping(),b=ping();a.observation.after.meta={left:2,right:[3,4]};b.observation.before.meta={right:[3,4],left:2};assert.equal(run(fixture(),[a,b],{stateIds:['meta']}).verdict,'pass');b.observation.before.meta.right=[4,3];assert.equal(run(fixture(),[a,b],{stateIds:['meta']}).verdict,'fail');
});
test('falsy state values are present and inherited properties are absent',()=>{
 const a=ping(),b=ping();for(const [k,v]of Object.entries({counter:0,flag:false,empty:'',nil:null,constructor:4,toString:5})){a.observation.after[k]=v;b.observation.before[k]=v;}
 assert.equal(run(fixture(),[a,b],{stateIds:['counter','flag','empty','nil','constructor','toString']}).verdict,'pass');delete a.observation.after.constructor;delete b.observation.before.toString;const r=run(fixture(),[a,b],{stateIds:['constructor','toString']});assert.deepEqual(r.continuity.map(x=>x.verdict),['unknown','unknown']);
});
test('fail precedes unknown and all later operation results remain',()=>{
 const a=store(0,1),b=store(1,2),c=store(2,3);delete a.observation.output;b.observation.output=9;const r=run(fixture(),[a,b,c],{stateIds:['counter']});assert.equal(r.verdict,'fail');assert.deepEqual(r.steps.map(x=>x.result.verdict),['unknown','fail','pass']);
});
test('whole-spec validation and observation validation preserve existing errors',()=>{
 const spec=fixture(),stale=structuredClone(spec);stale.name+=' changed';error('INVALID_SPECIFICATION',()=>run(stale,[ping()],{stateIds:[]}));
 const broken=structuredClone(spec);broken.operations[0].dependencies=[{operation_id:'absent',kind:'uses-contract',requirement:'required',role:'Needed outside selected operation.'}];broken.artifact_id=specificationIdentity(broken);error('MISSING_REQUIRED_DEPENDENCY',()=>run(broken,[ping()],{stateIds:[]}));
 const step=store(0,1);step.observation.output='wrong';error('INVALID_OBSERVATION',()=>run(spec,[step],{stateIds:[]}));
 error('INVALID_SELECTION',()=>run(spec,[{operation:'missing',observation:ping().observation}],{stateIds:[]}));
});
test('wrapper bounds and operation selections reject malformed input',()=>{
 const spec=fixture();for(const steps of [null,{},[],Array.from({length:257},ping),[{}],[{operation:'ping'}],[{...ping(),extra:true}]])error('INVALID_OBSERVATION',()=>run(spec,steps,{stateIds:[]}));
 for(const operation of [null,2,false,[]])error('INVALID_SELECTION',()=>run(spec,[{operation,observation:ping().observation}],{stateIds:[]}));
 const r=run(spec,Array.from({length:256},ping),{stateIds:[]});assert.equal(r.steps.length,256);assert.equal(r.verdict,'pass');
});
test('required explicit options reject invalid state selection',()=>{
 const spec=fixture();for(const options of [undefined,null,5,[],{}, {stateIds:null},{stateIds:['missing']},{stateIds:[3]},{stateIds:[],extra:true}])error('INVALID_ARGUMENTS',()=>run(spec,[ping()],options));
});
test('portable guards reject accessors, sparse arrays, cycles, and undefined without invoking getters',()=>{
 const spec=fixture(),sparse=[];sparse.length=1;error('INVALID_SPECIFICATION',()=>run(spec,sparse,{stateIds:[]}));let touched=false;const step={operation:'ping',get observation(){touched=true;return ping().observation;}};error('INVALID_SPECIFICATION',()=>run(spec,[step],{stateIds:[]}));assert.equal(touched,false);
 const bad=ping();bad.observation.after.loop=bad;error('INVALID_SPECIFICATION',()=>run(spec,[bad],{stateIds:[]}));error('INVALID_SPECIFICATION',()=>run(spec,[{...ping(),observation:undefined}],{stateIds:[]}));
});
test('frozen inputs and independent returned records remain unchanged across calls',()=>{
 const spec=freeze(fixture()),steps=freeze([store(0,1),store(1,2)]),options=freeze({stateIds:['counter','counter']});const before=JSON.stringify([spec,steps,options]);const a=run(spec,steps,options),b=run(spec,steps,options);assert.deepEqual(a,b);a.state_ids.push('bad');a.steps[0].result.checks[0].description='mutated';a.continuity[0].reason='changed';assert.equal(JSON.stringify([spec,steps,options]),before);assert.deepEqual(run(spec,steps,options),b);
});
test('observed source interpretation is preserved without acceptance promotion',()=>{
 const r=run(fixture('observed'),[ping()],{stateIds:[]});assert.equal(r.perspective,'observed');assert.equal(r.acceptance,'proposed');assert.equal(r.interpretation,'supplied-observations-only');
});
test('exhaustive small verdict table uses an independent ordering oracle',()=>{
 const spec=fixture(),ranking={pass:0,unknown:1,fail:2},names=['pass','unknown','fail'];
 for(const x of names)for(const y of names)for(const link of names){
  const a=ping(),b=ping();if(x==='fail')a.observation.output=1;if(x==='unknown')delete a.observation.output;if(y==='fail')b.observation.output=1;if(y==='unknown')delete b.observation.output;
  a.observation.after.counter=1;if(link!=='unknown')b.observation.before.counter=link==='pass'?1:2;
  const r=run(spec,[a,b],{stateIds:['counter']});assert.equal(r.verdict,names[Math.max(ranking[x],ranking[y],ranking[link])]);assert.equal(r.continuity[0].verdict,link);
 }
});
