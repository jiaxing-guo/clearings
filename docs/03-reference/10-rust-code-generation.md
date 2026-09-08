# Rust code generation

`compileRust(program, runtime)` compiles a statically valid Program IR v0.1 artifact into a deterministic `RustCompiledArtifact`. Generated Rust implements the program's control flow and calls the primitive runtime for value semantics, diagnostics, and logical resource accounting. The emitter supports every current expression and statement form within the compiler limits below.

The TypeScript frontend performs compilation without evaluating the program, invoking Rust tools, or opening program-supplied paths. Native execution is currently available through the development test harness. The general library process runner, JSON transport, CLI backend selection, and installed-package execution workflow remain subsequent work in the [backend plan](../05-development/06-rust-backend-plan.md).

## Compile through the library

Build the package with `npm run build`. The compiler is exported from `clearings/compiler`; source generation does not require a Rust installation. Supply the identity of the complete trusted runtime build inventory as defined by the [artifact contract](09-rust-backend.md).

```js runnable
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compileRust, rustRuntimeIdentity, validateRustArtifact } from 'clearings/compiler';
const program = JSON.parse(readFileSync('programs/clearings/required-dependency-closure.json', 'utf8'));
const paths = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', ...readdirSync('runtime/rust/src').filter(path => path.endsWith('.rs')).map(path => `src/${path}`)];
const runtime = rustRuntimeIdentity(paths.map(path => ({ path, source: readFileSync(`runtime/rust/${path}`, 'utf8') })));
const compiled = compileRust(program, runtime);
validateRustArtifact(compiled, program, runtime);
assert.equal(compiled.module.path, 'program.rs');
assert.equal(compiled.module.source, compileRust(program, runtime).module.source);
assert.match(compiled.module.source, /pub fn execute/);
```

The module source is returned as text; the API writes no files. `sealRustArtifact` remains available for artifact construction from supplied source, but only `compileRust` performs IR lowering. Artifact validation establishes content integrity and expected bindings; it does not authenticate the compiler or prove semantic preservation.

## Lowering and value representation

The emitter assigns numeric identifiers in deterministic traversal order. Source function IDs map to `f_N`; expression and block helpers receive distinct generated identifiers. Original IDs, binding names, and JSON Pointers appear only as diagnostic/accounting data. Rust keywords and names such as `__proto__` cannot become unchecked Rust identifiers. Data strings and record keys are emitted as UTF-16 code-unit vectors, preserving lone surrogates and code-like text.

| Source construct                                      | Generated implementation                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Function and closed call                              | A fixed Rust function and direct call; parameters occupy fresh local slots                       |
| Expression                                            | A statically selected Rust helper wrapped in `Runtime::enter`                                    |
| Literal and argument type                             | `OwnedValue` construction and entry-signature `Type` descriptors                                 |
| Record/list construction                              | Explicit operand evaluation in IR array order, followed by a primitive constructor               |
| Arithmetic, comparison, indexing, membership, sorting | Primitive runtime calls after once-only, left-to-right operand evaluation                        |
| `and` / `or`                                          | Rust conditional control flow that returns the selected operand without a replacement allocation |
| `let`, `var`, `assign`, `ref`                         | Statically assigned slots, with original binding/lookup charges and lexical distances            |
| `if`, `while`                                         | Rust branches and loops calling the corresponding compiled blocks                                |
| `return`                                              | `Option<Value>` propagation through compiled blocks to the enclosing function                    |
| `fail`, fault, exhaustion                             | Immediate `Result` propagation through the runtime's explicit completion categories              |

Local slots contain immutable runtime `Value` handles. Each function receives fresh storage, and block-local slots are cleared on normal or abrupt block exit. Program IR types are checked by the frontend; the initial emitter uses the runtime's tagged value representation instead of generating a separate Rust struct for every record type. Rust checks the generated module's use of its runtime interface. This distinction matters when interpreting what native compilation establishes.

Expression and block helpers flatten the generated source's syntactic nesting. They contain fixed primitive calls and compiled control flow, with no AST lookup, opcode dispatch, dynamically selected IR function, interpreter call, or graph-specific primitive. Required dependency closure is compiled by the same emitter as identity and sum.

Every expression, block, function, and statement retains its IR location and reference charge ordering. Statically known lexical distance eliminates dynamic environment search while retaining each logical lookup charge separately. Native optimization cannot remove the observable accounting operations without changing the result contract. The emitter adds no Clearings optimization pass.

## Generated module interface

Each module exposes `PROGRAM_ID` and:

```rust
pub fn execute(arguments: &[OwnedValue], limits: Limits)
    -> Result<Execution, ExecutionError>;
```

`Execution` contains `limits`, `usage`, and `completion`. The caller must associate these semantic fields with the exact compiled artifact and runtime it built. The generated module does not embed its own compiled-artifact digest, which would create a circular source identity. A future runner will construct the full TypeScript `RustExecutionResult` metadata envelope.

`execute` validates limits, prepares exact positional argument types, imports arguments under the meter, calls the compiled entry function, and exports the completion after all generated calls unwind. Its `ExecutionError` distinguishes invalid limits, `InputError`, and a runtime ABI defect. Language failures, faults, and resource exhaustion are successful `Execution` results with the corresponding completion variant. Host panics and physical allocation failures remain host failures.

## Compiler limits

| Boundary            | Limit                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Program preparation | 50,000 portable values, depth 64, 1,000,000 input units; existing static type/work limits also apply |
| Emission work       | 250,000 output-fragment reservations; each emitted UTF-16 code unit reserves one fragment            |
| Generated source    | 8 MiB of exact UTF-8 bytes, reserved incrementally before retaining fragments                        |

`RUST_COMPILATION_LIMITS` exports the emission bounds. Deferred statement text reserves its bytes before it is retained, and the final source concatenation consumes already bounded fragments. The work count is a deterministic compiler implementation bound, not an execution charge or elapsed-time metric. A valid IR artifact may still exceed this compiler's bounds.

Compiler failures use `INVALID_COMPILED_PROGRAM`, exit status 2, and `{ path, rule }`. Incremental emission failures identify `/module/source` and `work-limit` or `source-limit`. Preparation failures retain the artifact contract's rules, while static language failures retain `INVALID_PROGRAM`. There are no compiler limit overrides or unmetered execution options in this version.

Identical validated content, compiler/runtime versions, and fixed target/options produce identical source bytes. Object property insertion order, working directory, timestamps, and locale do not affect output. Native binary reproducibility additionally depends on the Rust compiler, target, linker, flags, and environment; this implementation does not assert byte-identical native binaries across hosts.

## Native validation

Install the pinned Rust 1.85.1 toolchain through rustup and put rustup on `PATH`. From a source checkout:

```bash
npm run test:compiler
npm run test:rust
npm run check:rust
npm run benchmark:rust
```

`test:compiler` includes artifact/emitter tests and the [native suite](../../tests/native/rust-codegen.test.mjs). Missing Rust tools fail the native test command explicitly. Ordinary `npm test` continues to run without requiring a Rust toolchain.

The [test harness](../../tests/native/harness.mjs) generates fresh modules from validated IR, copies the exact hashed runtime inventory into a temporary directory, and compiles runtime and test executable with `rustup run 1.85.1 rustc`, Rust 2021, `opt-level=1`, `debuginfo=0`, and warnings denied. It removes generated products on completion. Each compiler/native process has a 60-second timeout and a 16 MiB captured-output limit; batches allow at most 32 programs, 512 authored cases, 32 MiB of module source, and 8 MiB of harness source. These are development harness bounds, not a native-code sandbox or physical memory quota.

The executable receives authored fixed inputs constructed in Rust. It runs from the isolated directory with an empty `PATH`, without Node.js, interpreter entry points, the production kernel, or a Program AST. A test-only output encoder preserves UTF-16 strings for comparison. This establishes execution of generated computation without introducing a general JSON input protocol or arbitrary Rust-source execution API.

Initial native cases cover every expression/statement form, identity, nonnegative sum, closure ordering and declared failures, Unicode and prototype-looking data, sibling scopes, mutation, nested returns, short-circuiting, arithmetic/index faults, invalid arguments, and exhaustion. Independently stated outcomes and the path-enumeration graph oracle accompany exact differential comparisons of limits, admitted usage, completions, fault messages, and IR diagnostics. The exhaustive three-node compiler domain, seeded program combinations, and compiler fault controls belong to the subsequent conformance change. Current tests supply bounded evidence rather than a universal compiler-correctness proof.

## Initial closure experiment

The measurement command compiles and executes the authored five-record closure example and asserts the result `["root", "a", "z", "y", "b"]`. The following single local observation was recorded on 2026-09-08, Linux x86-64, `x86_64-unknown-linux-gnu`, Rust 1.85.1. It is a feasibility measurement, not a performance regression threshold or a comparison against the interpreter.

| Measurement                                                                     | Observation                                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Generated module source                                                         | 40,389 bytes                                                                |
| Fresh runtime compilation                                                       | 0.787 seconds                                                               |
| Module and harness compilation/linking, using that runtime                      | 4.481 seconds                                                               |
| Second module/harness compilation, same directory/runtime                       | 4.579 seconds                                                               |
| Executable including runtime, standard-library linkage, and test/output harness | 4,459,856 bytes                                                             |
| 100 executions measured inside the process                                      | 8.792 ms total; 87.9 µs per execution                                       |
| Entire process, including setup and test serialization                          | 15.979 ms                                                                   |
| Logical usage per execution                                                     | Work 5,774; allocation units 912; peak value units 166; evaluation depth 12 |

The execution timer includes argument preparation, metered invocation, and completion export. It excludes construction of the authored argument fixture and output encoding. The process timer includes those costs and process startup. The second compilation is a fresh `rustc` invocation with a reused runtime library, not an incremental compilation or cache-hit measurement. Host load, filesystem caches, and linker configuration were not controlled.

Source program: `program:e1c3b84ce0f6fccb3d5f36b6351d9bcd48f2b4f19210a0f8c2a8910bbb10686c`.
Compiled artifact: `compiled-program:d4452f2d57b1e5d61f9bf66ad18e95ac3146e7af17cf3517df7dc8697a0695cd`.
Runtime inventory: `rust-runtime:6bfaacb4d71e5af66eff2c8aad4a74510d609c658c8301de6b9ff9c2368e3dde`.

Compilation latency is material compared with this small workload's execution time. Later runner integration should compile once and reuse the result under verified source/runtime/toolchain bindings. Packaging must supply the runtime inventory, locate the pinned compiler, preserve UTF-16 transport, and distinguish host build/process failures from language completions. Production adoption also requires the separate API and historical-evidence compatibility work recorded in the backend plan.
