import { writeFileSync } from 'node:fs';
import { createRequiredDependencyClosureProgram } from '../programs/clearings/required-dependency-closure.mjs';

const program = createRequiredDependencyClosureProgram();
writeFileSync(
  new URL('../programs/clearings/required-dependency-closure.json', import.meta.url),
  JSON.stringify(program, null, 2) + '\n',
);
console.log(program.artifact_id);
