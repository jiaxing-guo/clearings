# Compile and run a program with Rust

Compile Clearings' required dependency closure into Rust, inspect the generated source, and execute it with the same arguments and resource limits as the reference interpreter. The graph traversal runs in generated native code.

## Prerequisites

Use Node.js 24, npm 11, and an authorized checkout. Native execution requires rustup on `PATH`, the pinned Rust 1.85.1 toolchain, and a working host linker. The workflow is tested on Linux; macOS requires its developer command-line tools. Windows support remains unverified.

```bash
npm ci --ignore-scripts
rustup toolchain install 1.85.1 --profile minimal
```

Source generation does not require rustup or a native compiler. No model endpoint or external Rust crate is used.

## Execute the closure example

```bash
npm run program -- demo --backend rust
```

The returned value is `["root", "a", "z", "y", "b"]`. The report identifies the source program, compiled artifact, compiler, primitive runtime, and process driver, followed by cumulative work/allocation and peak admitted value size/depth. Each invocation compiles afresh and removes its temporary files afterward.

Compare the reference execution:

```bash
npm run program -- demo
```

The default remains the interpreter. Values, completions, diagnostics, and logical resource measurements correspond; backend identity fields differ.

## Inspect generated source

```bash
npm run program -- compile closure --out compiled/closure
```

The command validates the program and writes deterministic source and metadata. It does not build or execute a native binary.

| File                                  | Purpose                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `program.rs`                          | Generated expressions, statements, control flow, and IR-defined calls             |
| `artifact.json`                       | Full compiled artifact, including generated source and identity bindings          |
| `build.json`                          | Source-file digests, driver identity, pinned toolchain, and native compiler flags |
| `main.rs`, `protocol.rs`, `output.rs` | Fixed native driver and transport implementation                                  |
| `runtime/`                            | The exact primitive runtime source inventory bound by the artifact                |

Find the generated `f_` functions and `while` statements in `program.rs`. The module performs the traversal; the runtime supplies general language primitives and accounting. Generated identifiers are deterministic compiler names. Use `program inspect closure` to read the source algorithm with its original IR names and types.

The destination must be new. Existing directories, files, and symlinks are rejected. Repeating an export to a different directory produces identical files. The conventional `compiled/` directory is ignored by Git and removed by `npm run clean`; exports elsewhere are retained and must be removed explicitly when no longer needed. Do not edit generated output as the implementation source: revise Program IR and compile it again.

## Supply arguments and inspect failures

Use the graph from [Run and inspect a Program IR algorithm](05-run-programs.md#supply-your-own-arguments), saved as `closure.arguments.json`:

```bash
npm run program -- run closure closure.arguments.json --backend rust
npm run --silent program -- run closure closure.arguments.json --backend rust --format json
```

Changing its root to an absent ID produces `application-failure`, code `MISSING_REQUIRED_DEPENDENCY`, and exit status 1. A deliberately small resource limit produces a different completion:

```bash
npm run program -- demo --backend rust --work 1
```

This exits with status 3 and reports the first rejected charge. Input errors use status 2. A missing toolchain, native compilation failure, panic, timeout, or malformed response is an operational failure with status 1; the runner does not fall back to interpretation.

`--out new-file` on `run` or `demo` saves exactly the displayed JSON or Markdown. On `compile`, `--out` instead names the source directory. See the [CLI reference](../03-reference/08-program-cli.md) for all options.

## Use the library or installed command

The following example is executed by `npm run docs:check:rust` and the Rust CI workflow:

```js runnable-rust
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRustProgram, executeRustProgram } from 'clearings/compiler';
const program = JSON.parse(readFileSync('programs/clearings/required-dependency-closure.json', 'utf8'));
const args = JSON.parse(readFileSync('programs/clearings/required-dependency-closure.arguments.json', 'utf8'));
const artifact = compileRustProgram(program);
const result = executeRustProgram(program, args);
assert.equal(result.compiled_artifact_id, artifact.artifact_id);
assert.equal(result.backend, 'rust');
assert.deepEqual(result.completion, { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] });
```

`writeRustProgram(program, directory)` exports the same artifact with its source bundle. Both compilation and execution take Program IR. Neither accepts saved Rust source or an artifact as an execution request.

For the installed command name from a checkout, run `npm run build` and `npm link`, then use `clearings program demo --backend rust`. The unpublished package can also be packed and installed locally:

```bash
npm run build
npm pack --ignore-scripts
npm install --ignore-scripts /absolute/path/to/clearings-0.0.1.tgz
npx --no-install clearings program demo --backend rust
```

Run the install command in the consuming project. Program JSON, primitive runtime, and driver assets resolve relative to the installed package, independently of the current directory. Rust and its linker remain external prerequisites.

## Verify and troubleshoot

```bash
npm run test:compiler
npm run docs:check:rust
```

The compiler gate includes independent/differential conformance, native CLI behavior, transport rejection, and a tarball installation test with interpreter execution disabled. The dedicated Rust documentation check executes both ordinary runnable examples and the native example above. Ordinary Markdown checks do not require Rust.

If the toolchain is unavailable, check `rustup run 1.85.1 rustc --version` and the host linker. If a build or process fails, the CLI diagnostic retains its stage, exit status or signal, and a bounded error excerpt. If an output directory exists, select a new path or remove the generated directory deliberately. A saved artifact is an integrity-bound build product; it is not authenticated execution evidence or a native-code sandbox.

This completes the initial compilation and execution workflow. Production context assembly executes compiled closure followed by compiled state/source selection. [Production adoption](../05-development/08-production-adoption.md) defines the compatibility and evidence migration.

## Prepare once and invoke repeatedly

`prepareRustProgram(program, { cacheDirectory? })` validates and compiles one program, returning an owned handle with `artifact`, `runner`, `native`, `execute(arguments, limits?)`, and `dispose()`. Each execution has fresh arguments, counters, and a new native process. Call `dispose()` when finished. Without a cache, disposal removes the build directory. With an explicit cache, disposal releases the handle and retains reusable build products.

A cache is local to its host and trusted like the installed package. Its identity includes the compiled artifact, driver, pinned toolchain/flags, platform, and architecture. Entries are published by atomic directory rename; concurrent preparation may perform duplicate builds, but never consumes a partial entry. Preparation and every invocation check the manifest and executable digest. Altered or incompatible entries fail explicitly. These checks establish integrity, not source authentication or a security boundary against the local account. Callers must not modify a build concurrently with execution.

A cache hit requires no Rust compiler. A cache miss requires the pinned toolchain and linker. Cache directories must be owned and must not allow group/other writes on Unix. Remove a cache only when its users have stopped. Existing `executeRustProgram` retains fresh compilation and admission-error precedence.

Run `node scripts/measure-native-preparation.mjs` after building to measure preparation and chain workloads. The recorded Linux run prepared closure in approximately 2.32 seconds and reopened its cache in 27 milliseconds; individual 8–256-node chain invocations took 25–86 milliseconds under maximum logical limits. These are single-run feasibility measurements, not throughput, host-memory, or speedup claims. The [measurement record](../../benchmarks/results/native-preparation-20260908/README.md) preserves its domain.
