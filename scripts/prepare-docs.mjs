// Copy validated, reviewed demo assets. Never compile source/proposal strings as MDX.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,['scripts/check-shared-demo.mjs','benchmarks/results/hono-shared'],{cwd:root,stdio:'inherit'});
const source=new URL('../benchmarks/results/hono-shared/',import.meta.url);
const destination=new URL('../website/public/demo/',import.meta.url);
rmSync(destination,{recursive:true,force:true});
mkdirSync(destination,{recursive:true});
const files=readFileSync(new URL('SHA256SUMS',source),'utf8').trim().split('\n').map(line=>line.split('  ')[1]);
for(const name of [...files,'SHA256SUMS','clearings-shared-review.zip']) {
  const target = new URL(name,destination); mkdirSync(dirname(fileURLToPath(target)),{recursive:true}); cpSync(new URL(name,source),target);
}
console.log(`Prepared ${files.length+2} static demo assets.`);
