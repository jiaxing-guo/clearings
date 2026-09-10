import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const generated = JSON.parse(
  execFileSync('cargo', ['run', '--locked', '--quiet', '-p', 'clearings-core', '--bin', 'schema'], {
    encoding: 'utf8',
  }),
);
assert.deepEqual(
  generated,
  JSON.parse(readFileSync(new URL('../contracts/protocol.schema.json', import.meta.url), 'utf8')),
);
console.log('Generated control schema matches the checked-in contract.');
