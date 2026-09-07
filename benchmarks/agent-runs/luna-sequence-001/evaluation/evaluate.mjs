import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const workspace=resolve(process.argv[2]),output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});
const tests=fileURLToPath(new URL('sequence.test.mjs',import.meta.url));
const summary={workspace,started_at:new Date().toISOString(),checks:[]};
for(const [name,program,args]of [['typecheck','npm',['run','typecheck']],['build','npm',['run','build']],['withheld','node',['--test',tests]],['regression','npm',['test']]]){
 const result=spawnSync(program,args,{cwd:workspace,encoding:'utf8',timeout:240000,maxBuffer:16777216,env:{...process.env,CLEARINGS_SEQUENCE_ENTRY:join(workspace,'dist/index.js')}});
 const log=(result.stdout??'')+(result.stderr??'');writeFileSync(join(output,name+'.log'),log);
 summary.checks.push({name,exit_code:result.status,error:result.error?.message??null,tests:Number(log.match(/ℹ tests (\d+)/)?.[1]??0),passed:Number(log.match(/ℹ pass (\d+)/)?.[1]??0),failed:Number(log.match(/ℹ fail (\d+)/)?.[1]??0)});
 if(name==='build'&&result.status!==0)break;
}
summary.finished_at=new Date().toISOString();summary.pass=summary.checks.length===4&&summary.checks.every(c=>c.exit_code===0);writeFileSync(join(output,'evaluation.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));process.exitCode=summary.pass?0:1;
