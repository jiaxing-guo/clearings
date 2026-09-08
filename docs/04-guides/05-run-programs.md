# Run and inspect a Program IR algorithm

Execute Clearings' required dependency closure, inspect its implementation, then supply your own graph. This workflow uses the reference interpreter and the authored JSON program. The traversal, lookup, sorting, and failure propagation execute as Program IR operations.

## Prerequisites

Use Node.js 24 and npm 11 from an authorized repository checkout on Linux or macOS. Install the library dependencies once:

```bash
npm ci --ignore-scripts
```

The `program` npm script builds the CLI before invoking it. No model endpoint, API key, or target-repository checkout is needed.

## Execute the bundled graph

```bash
npm run program -- demo
```

The command executes `closure` with [authored example arguments](../../programs/clearings/required-dependency-closure.arguments.json). The report labels that input as an authored example and identifies the program digest, interpreter version, completion, and resource usage. Its returned value is:

```json
["root", "a", "z", "y", "b"]
```

This order preserves the roots, expands breadth first, and sorts required targets within each record. The [algorithm contract](../02-semantics/06-required-dependency-closure.md) defines ordering, duplicate handling, and missing references precisely.

The same command group includes smaller language examples:

```bash
npm run program -- list
npm run program -- demo identity
npm run program -- demo sum
```

The identity example returns `"Clearings"`. The sum example returns `5` for its bundled list `[2, 0, 3]`. Each invocation performs fresh interpretation.

To execute the same algorithm as compiled native code, follow [Compile and run a program with Rust](06-compile-and-run-rust.md).

## Read the implementation

```bash
npm run program -- inspect closure
npm run program -- validate closure
```

Inspection shows all four functions, including their parameter types, return types, declared failures, and complete bodies. Find the mutable `pending`, `selected`, and `cursor` bindings in `required_dependency_closure`. The loop calls the IR-defined `lookup_record` and `required_targets` functions; the latter collects required targets and sorts them. `validate_records` rejects duplicate record IDs before traversal.

The listing is a derived display notation. The canonical [JSON artifact](../../programs/clearings/required-dependency-closure.json) remains the implementation representation. Function comments such as `/functions/2` connect the listing to JSON Pointer diagnostics. Static validation and inspection do not execute the program or prove termination.

## Supply your own arguments

Save the following JSON as `closure.arguments.json` in your working directory:

```json
[
  ["entry"],
  [
    {"id": "entry", "dependencies": [
      {"target": "z", "required": true},
      {"target": "a", "required": true},
      {"target": "optional", "required": false}
    ]},
    {"id": "z", "dependencies": []},
    {"id": "a", "dependencies": []}
  ]
]
```

The outer array supplies two positional arguments: ordered root IDs and records. The optional target does not require a record because the closure does not reach it.

```bash
npm run program -- run closure closure.arguments.json
```

The returned value is `["entry", "a", "z"]`. To execute another artifact, replace `closure` with a local program JSON path. `run` always requires an explicit arguments file; a zero-parameter entry uses `[]`.

## Inspect failure and exhaustion

Change the roots in `closure.arguments.json` to `["absent"]` and run the same command. The completion is `application-failure`, with code `MISSING_REQUIRED_DEPENDENCY` and details `"absent"`. The diagnostic identifies the `fail` statement in `lookup_record` and retains the caller stack. The process exits with status `1`.

Use a deliberately small work limit to inspect resource exhaustion:

```bash
npm run program -- demo --work 1
```

The completion is `resource-exhaustion`, and the process exits with status `3`. Exhaustion reports the rejected resource charge; it does not establish that the algorithm is incorrect. Arithmetic overflow and invalid indexing instead produce `runtime-fault`. The [execution reference](../03-reference/07-program-execution.md) defines each completion and the accounting rules.

## Save or automate a run

```bash
npm run program -- inspect closure --out closure.program.md
npm run --silent program -- demo --format json --out closure.result.json
```

Each output path must be new. The command also emits the same report to standard output. `--silent` suppresses npm's command headings so JSON stdout can be parsed; the authored-example label is written to stderr. Run/demo JSON is exactly the library's `ProgramExecutionResult`. Saving it does not create an authenticated execution record or evaluate conformance.

If you want the installed command name from a source checkout, run `npm run build` and `npm link`. You can then use `clearings program demo`, `clearings program inspect closure`, and `clearings program run closure closure.arguments.json`. The packed package includes the program and argument JSON assets; named examples are resolved relative to the package, independently of the working directory.

## Verify the implementation

```bash
npm run test:program
```

This command checks static validation, independent language semantics, the dependency-closure evaluation domain, report rendering, CLI behavior, and packaged examples. The focused [Program IR workflow](../../.github/workflows/program.yml) runs these tests and the Markdown examples on relevant changes.

The documentation check also executes this CLI example after building the library:

```js runnable
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const execution = spawnSync(process.execPath,
  ['dist/cli/main.js', 'program', 'demo', '--format', 'json'],
  { encoding: 'utf8', timeout: 10000 });
assert.ifError(execution.error);
assert.equal(execution.status, 0);
const result = JSON.parse(execution.stdout);
assert.deepEqual(result.completion,
  { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] });
assert.match(execution.stderr, /Authored example: closure/);
```

For exact options, diagnostics, limits, and exit statuses, see [Program CLI and reports](../03-reference/08-program-cli.md). To read this guide in the local Fumadocs site, follow [Run the documentation locally](../05-development/02-documentation.md#run-the-documentation-locally).
