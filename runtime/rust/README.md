# Clearings Rust runtime

This unpublished, dependency-free crate implements the primitive runtime interface for the Rust backend. It contains immutable values, argument preparation, arithmetic and collection primitives, explicit completions, diagnostics, and reference-compatible logical resource accounting. It does not interpret Program IR, compile source, load modules, or implement a graph algorithm.

Use the pinned toolchain through rustup. From the repository root:

```bash
npm run test:rust
npm run check:rust
npm run format:rust
```

These commands enter this directory so rustup selects `rust-toolchain.toml`. `cargo test --locked --offline` runs without a package registry after the toolchain is installed. Prettier formats the TypeScript and documentation; rustfmt formats Rust. The existing Node.js library and interpreter do not require Rust for execution.

Read the [backend contract](../../docs/03-reference/09-rust-backend.md) for the artifact format, primitive call discipline, type/preparation boundary, completion mapping, and exact compatibility scope. The runtime interface is a versioned Rust source API compiled with its consumer, not a stable binary or C ABI. A generated function accepts a mutable `Runtime` and immutable values and returns `Eval<Value>`.

`OwnedValue` is the owned, typed boundary representation. `String(Vec<u16>)` preserves lone surrogates. The future runner must decode and encode these values faithfully; this crate does not currently provide a JSON codec. `prepare_arguments` checks sizes, arity, and exact types and produces owned records in canonical order. `Runtime::import` then performs metered import. Generated code must use `enter`, `at`, `call`, `bind`, and `lookup` at the locations specified by the execution contract. Control flow is emitted as Rust control flow.

`RuntimeError::InvalidAbi` indicates a compiler/runtime defect and must remain a host error. Rust panics and physical allocation failures are also host failures, not application failures or logical resource exhaustion. After a panic the runtime instance must be discarded. `Runtime::finish` converts a completed invocation into an owned return/failure/fault/exhaustion result, with result-copy exhaustion taking precedence over a return or application failure.

The tests contain authored primitive invocations and independent expected values and charges. They are not generated-code or compiler-conformance evidence. The separate [native compiler tests](../../tests/native/rust-codegen.test.mjs) exercise generated code; run `npm run test:compiler` from the repository root. Native runner packaging remains subsequent work.
