// Integrity check for the archived experiment, separate from feature evaluation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url));
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const check=(base,files)=>{for(const [name,record]of Object.entries(files)){const path=resolve(base,name);assert(path.startsWith(resolve(base)+sep));const bytes=readFileSync(path);assert.equal(bytes.length,record.bytes,name);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,name);}};
const frozen=read('freeze.json'),capture=read('submission/capture.json'),manifest=read('MANIFEST.json');
check(root,frozen.files);check(resolve(root,'submission'),capture.files);check(root,manifest.files);
const result=read('results/evaluated/evaluation.json');assert.equal(result.pass,true);assert.equal(result.checks.find(x=>x.name==='withheld').passed,17);assert.equal(result.checks.find(x=>x.name==='regression').passed,81);
for(const path of ['src/index.ts','src/specification/sequence.ts'])assert.equal(readFileSync(resolve(root,'../../..',path),'utf8'),readFileSync(resolve(root,'submission',path),'utf8'),path);
console.log(JSON.stringify({frozen_files:Object.keys(frozen.files).length,captured_files:Object.keys(capture.files).length,archive_files:Object.keys(manifest.files).length,first_submission_tests:17,regression_tests:81,integrated_source:'identical'}));
