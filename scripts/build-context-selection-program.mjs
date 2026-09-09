import { writeFileSync } from 'node:fs';
import { createContextSelectionProgram } from '../programs/clearings/context-selection.mjs';

writeFileSync(
  new URL('../programs/clearings/context-selection.json', import.meta.url),
  JSON.stringify(createContextSelectionProgram(), null, 2) + '\n',
);
