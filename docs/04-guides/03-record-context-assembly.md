# Record a context-assembly invocation

Use the recorder to observe an actual `assembleContext` invocation and inspect the corresponding contract checks. This guide exercises Clearings on its authored context-assembly specification. The result is evidence for one invocation. Continue with [independent evaluation and replay](04-evaluate-context-conformance.md) to obtain a scoped acceptance result.

## Prepare a built checkout

Use Node.js 24 and install dependencies from the lockfile. From the repository root:

```bash
npm ci --ignore-scripts
npm run native:prepare
```

Native preparation requires Rust 1.85.1 and a host linker on a cache miss. It runs before the invocation deadline; warm execution requires no Rust compiler. `CLEARINGS_NATIVE_CACHE` selects an owned local cache.

The recorder needs Git history, source files, emitted JavaScript, and package metadata. It runs trusted local code in a worker with a time limit. It does not scan or execute an unrelated repository automatically.

## Record and check one return

Run this example as an ES module from the repository root, for example with `node --input-type=module`:

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOperation } from 'clearings';
import {
  getContextAssemblyContract,
  recordContextAssembly,
  mapContextAssemblyObservation,
} from 'clearings/conformance';

const inputSpecification = JSON.parse(
  readFileSync('specifications/clearings/context-assembly.json', 'utf8'),
);
const record = await recordContextAssembly({
  case_id: 'guide-context-return',
  invocation: {
    specification: inputSpecification,
    selection: 'assemble-context',
    options: { maxBytes: 65536 },
  },
});
assert.equal(record.origin, 'recorded-execution');
assert.equal(record.completion.kind, 'return');

const mapping = mapContextAssemblyObservation(record);
assert.equal(mapping.status, 'mapped');
const { specification } = getContextAssemblyContract();
const result = checkOperation(specification, mapping.operation_id, mapping.observation);
assert.equal(result.verdict, 'unknown');
assert(!result.checks.some(check => check.verdict === 'fail'));
console.log({ record_id: record.artifact_id, completion: record.completion.kind, verdict: result.verdict });
```

The recorder retains original and resulting arguments, the returned package, implementation file digests, adapter identity, and runtime metadata. `returned-context` preserves reported byte counters. `serialized-bytes` measures the captured package independently with compact JSON, UTF-8, and a final newline.

The overall verdict remains `unknown` because the contract contains residual independent-check and external-effect obligations. A mapped observation and successful predicates do not establish scoped acceptance.

## Inspect other completions

Set `maxBytes` to `1` to record a capacity exception. Inspect `record.completion.thrown.value.details.required_bytes` and `details.max_bytes`; the mapper reads structured fields, not message text. The `exception` measurement preserves an absent required-size detail as an empty list and a present zero as `[0]`, allowing the contract to reject either when it requires a positive excess.

Inspect `mapping.status` before reading `mapping.observation`. Missing snapshots, malformed returns, unknown exception codes, timeouts, and worker failures can produce `unmapped`. Their raw records remain available with reasons for unobserved measurements.

For another built implementation of the same API, pass its Git working-tree root as `implementation_root`. The recorder always loads `dist/specification/context.js` and calls its `assembleContext` export. A custom `repository` value supplies provenance metadata; it does not select a remote execution target. The recorder does not compile the candidate or authenticate its installed dependencies.

See [conformance artifacts](../03-reference/05-conformance-artifacts.md#recording-interface-and-identity-scope) for capture limits, identity scope, and error handling, and [executable conformance](../02-semantics/04-executable-conformance.md) for the observation and acceptance boundaries.
