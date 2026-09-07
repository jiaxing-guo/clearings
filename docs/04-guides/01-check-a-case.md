# Check a Hono case

This example checks an authored interpretation of Hono response selection. It does not run Hono or infer a new model from source. The specification is [response-selection.json](../../specifications/hono/response-selection.json).

## Inspect the model

Use Node.js 24 and npm 11. From the repository root:

```bash
npm ci --ignore-scripts
npm run build
node dist/cli/main.js inspect specifications/hono/response-selection.json
node dist/cli/main.js explain specifications/hono/response-selection.json --operation response-selection --format markdown
node dist/cli/main.js context specifications/hono/response-selection.json --operation response-selection --max-bytes 131072
```

The catalog identifies four operations. The selected response operation contains seven outcomes. Reading the rendered conditions does not require interpreting the raw expression AST.

## Interpret one branch

A direct handler result that is `null` or `undefined` selects the not-found handler, even if the context is already finalized. A falsy Promise result follows a different rule and can use a finalized context response.

The observation uses abstract labels: `path` identifies an already classified execution branch, `value` classifies the result, and `output` identifies the selected response source. See [abstraction mappings](../01-architecture/03-abstraction-and-refinement.md).

Save the following JSON as `case.json` outside the target repository:

```json
{
  "input": { "path": "direct", "value": "nullish" },
  "before": { "finalized": true },
  "outcome": "outcome:direct-missing",
  "output": "not-found"
}
```

```bash
node dist/cli/main.js check specifications/hono/response-selection.json --operation response-selection --observation /path/to/case.json
```

The result is `pass` with explicit partial-model limitations. Replacing `output` with `context-response` produces `fail`. Omitting `output` produces `unknown`. CLI exit codes are 0, 1, and 3 respectively; malformed observations produce an error with exit code 2.

## Executable reference example

The documentation checker runs the following trusted JavaScript block from the repository root after building the library. It verifies the distinct outcomes and the exact context serialization size. Package consumers can replace `./dist/index.js` with `clearings-semantic`.

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkOperation, assembleContext, serializeOperationContext,
  validateOperationContext,
} from './dist/index.js';

const specification = JSON.parse(readFileSync(
  'specifications/hono/response-selection.json', 'utf8',
));
const observation = {
  input: { path: 'direct', value: 'nullish' },
  before: { finalized: true },
  outcome: 'outcome:direct-missing',
  output: 'not-found',
};
assert.equal(checkOperation(specification, 'response-selection', observation).verdict, 'pass');
assert.equal(checkOperation(specification, 'response-selection', {
  ...observation, output: 'context-response',
}).verdict, 'fail');
const { output, ...incomplete } = observation;
assert.equal(checkOperation(specification, 'response-selection', incomplete).verdict, 'unknown');
const context = assembleContext(specification, 'response-selection', { maxBytes: 131072 });
validateOperationContext(context, specification);
const serialized = serializeOperationContext(context);
assert.equal(Buffer.byteLength(serialized, 'utf8'), context.budget.used_bytes);
assert.ok(serialized.endsWith('\n'));
```

The passing check establishes agreement between this observation and the modeled rules. It does not authenticate the source interpretation, execute the fallback, or prove that all Hono behavior is represented.
