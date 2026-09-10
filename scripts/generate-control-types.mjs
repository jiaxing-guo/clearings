import { compile } from 'json-schema-to-typescript';
import { format, resolveConfig } from 'prettier';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync('contracts/protocol.schema.json', 'utf8'));
const source = await compile(schema, 'Protocol', {
  bannerComment: '/* Generated from contracts/protocol.schema.json. Do not edit. */',
  additionalProperties: false,
});
const output = await format(source, {
  ...(await resolveConfig('packages/sdk/src/control.ts')),
  parser: 'typescript',
});
if (process.argv.includes('--check'))
  assert.equal(readFileSync('packages/sdk/src/control.ts', 'utf8'), output);
else writeFileSync('packages/sdk/src/control.ts', output);
