# Rust backend implementation plan

Status: implemented. The four PRs provide the artifact contract, primitive runtime, deterministic code generation, bounded semantic-preservation evaluation, and library/CLI/package integration. Production adoption remains subsequent work. It follows executable conformance and Program IR/reference execution. The implementation used four dependent PRs.

## Goal and observable outcome

Compile a validated Program IR v0.1 artifact into deterministic Rust that executes the represented algorithm through a versioned runtime interface. Evaluate the generated implementation against both the reference interpreter and independent expectations. Ordered required dependency closure is the principal Clearings workload.

At completion, a developer can compile, inspect, and execute the closure program through the CLI and library, with explicit source-program and backend identities. Generated control flow, calls, and collection operations perform the algorithm. Calling the reference interpreter or the existing TypeScript closure from an emitted wrapper does not meet this goal.

This provides the first compiler backend in the bootstrap sequence. The compiler frontend and reference interpreter remain in TypeScript; the generated-code runtime is implemented in Rust. Compiling one Clearings algorithm establishes a useful compilation boundary; production adoption and compiler self-hosting require subsequent work.

## Scope and design decisions

| Decision          | Proposed boundary                                                                     | Rationale                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Target            | Rust 2021 source, built with the pinned Rust toolchain                                | Establishes a statically checked native target and an independent runtime implementation                       |
| Source language   | All statically valid Program IR v0.1 constructs within declared compiler input limits | The backend implements a language, rather than recognizing one algorithm                                       |
| Lowering          | Direct compilation from the existing structured IR                                    | The workload does not yet require CFG, SSA, bytecode, or another public IR                                     |
| Runtime           | A versioned Rust source interface between generated modules and primitive helpers     | Safe integers, structural values, completions, diagnostics, and resource accounting require explicit semantics |
| Resources         | Preserve the reference interpreter's current abstract accounting contract             | Exhaustion and usage are observable behavior, including the first rejected charge                              |
| Program authority | Authored IR remains the source; generated files are derived build products            | Reproduction and review need a single implementation source                                                    |
| Validation        | Differential execution plus independent language and graph expectations               | Agreement between two implementations can conceal a shared defect                                              |

No optimization or speedup claim is required. The generated program must compute the algorithm directly, even if compatibility instrumentation adds overhead. Future optimized backends may define a different resource policy explicitly; this implementation scope must not silently weaken the current one.

## Semantic-preservation obligation

For a validated program, admissible positional arguments, and the same valid limits, compare reference execution with the compiled execution. Backend identity fields are necessarily different; the comparison must name exactly which result fields correspond.

The proposed contract preserves:

- Return values, typed application-failure codes and payloads, runtime-fault codes, and resource-exhaustion classification.
- Left-to-right evaluation, short-circuiting, failure precedence, lexical scope, local mutation, and closed IR-defined calls.
- Safe-integer arithmetic, exact structural record types and equality, integer sorting, UTF-16 string ordering, and immutable value ownership.
- Resource limits, admitted usage, the first rejected charge, and diagnostic phase, IR JSON Pointer, and IR call stack. Host stack traces and wall-clock timing are outside this comparison.
- Input validation and preparation boundaries, including errors that occur before execution. Compiler-specific invalid options or input limits are separate compilation errors.

PR 1 must specify the comparison, diagnostic-message policy, input limits, and runtime ABI before the emitter is implemented. Existing reference execution results and their `interpreter_version` remain compatible. Compiled results must identify the compiler, runtime, source program, and applicable execution-semantics version without mislabeling compiled execution as interpretation.

Tests support this obligation over their stated domain. They do not constitute a universal compiler-correctness proof or establish that a program satisfies an arbitrary operation contract. Requirements-to-program construction remains an authoring or synthesis task, followed by explicit evaluation.

## Four implementation PRs

### PR 1: Compiled artifacts and runtime interface

Implemented: [backend contract](../03-reference/09-rust-backend.md), `clearings/compiler` artifact APIs, and the primitive `clearings-runtime` Rust crate. The artifact constructor seals caller-supplied source; it does not generate code. Runtime tests use authored primitive calls, not compiled Program IR.

Larger goal: make the execution contract precise enough to implement and review a backend.

Define compiled-artifact and execution metadata, compiler options, validation errors, and the runtime ABI. Bind the source program identity, compiler version, runtime ABI version, execution-semantics version, target/options, and exact generated module bytes. Specify deterministic serialization, hashing, and compatibility checks without circular identities.

Implement the primitive runtime services needed for Program IR values, faults, diagnostics, and compatible resource accounting. Any extraction from the current interpreter must preserve its public API and behavior. Runtime helpers implement language primitives; they must not interpret a Program AST or implement dependency closure as a special case.

Completion criteria: artifact validation rejects incompatible or altered inputs; runtime primitives pass independent edge-case tests; the existing interpreter regression suite passes unchanged. Documentation records the observable comparison and all compilation/preparation limits.

### PR 2: Deterministic Rust code generation

Implemented: [Rust emitter, native execution tests, and compilation experiment](../03-reference/10-rust-code-generation.md). The full language lowers through general primitives and explicit Rust control flow. Native tests retain independent expectations and compare reference diagnostics and logical accounting.

Larger goal: turn Program IR algorithms into executable target programs.

Start with required dependency closure as an end-to-end compilation experiment, recording compilation latency, executable size, execution cost, and integration constraints. Then implement complete lowering of expressions, statements, function parameters, closed calls, returns, and declared failures. Emit structured Rust control flow and runtime calls for primitive semantics. Assign generated identifiers deterministically, preserve source evaluation order, and retain IR locations for diagnostics. Treat data strings and record keys as data, including Unicode, lone surrogates, and prototype-looking names; source identifiers must never become unchecked Rust syntax.

Generated source must be deterministic; reproducible native binaries additionally require a controlled compiler, linker, target, and environment. Produce the same source bytes for the same validated artifact, compiler/runtime versions, target, and options. Exclude timestamps, absolute paths, locale-dependent ordering, and environment-dependent names. Compilation must not execute the program or load code from program-supplied paths. Define bounded compilation failure for inputs that exceed the documented compiler limits.

Completion criteria: every Program IR construct compiles; compiled native modules execute identity, sum, and closure through the runtime; repeated generated source is byte-identical. Execution must succeed with interpreter entry points and the production closure unavailable, establishing that generated computation is actually used.

### PR 3: Semantic-preservation evaluation

Implemented: [compiler conformance](../03-reference/11-compiler-conformance.md), including the exhaustive graph domain, fixed-seed language combinations, independent accounting, fault controls, and reproducible mismatch reports. A deep-call regression also fixes Rust monomorphization failure in compiler version `0.1.1`.

Larger goal: make compiler defects observable through reproducible, independently grounded tests.

Build a differential harness that executes the same program and arguments through the interpreter and compiled Rust, comparing the PR 1 result contract. Cover operand order, scope, abrupt completion, ownership, arithmetic boundaries, structural equality, sorting, and resource exhaustion during argument preparation, execution, and result copying. Include small-limit tests that distinguish the first rejected charge and diagnostic location.

Evaluate compiled dependency closure against the existing independent path-enumeration oracle over all 1,536 directed three-node graph/root cases and the targeted multiple-root, duplicate, missing-reference, cycle, ordering, and failure cases. Use predefined faulty programs or backend mutations to demonstrate that incorrect ordering, lost failures, or skipped computation are detected. Add a fixed-seed, bounded program corpus for combinations of supported constructs; do not rely solely on generated snapshots or interpreter agreement.

Shared primitive helpers reduce drift but also create common-mode risk. Independent expected outcomes and the graph oracle remain required. Mismatch reports identify the program, arguments, limits, backend versions, and differing observations so failures are reproducible.

Completion criteria: no unexplained differential mismatches, independent expectations pass, predefined faults are rejected, and existing language and context-conformance gates retain their results. Record the evaluated domain and exclusions without claiming universal refinement.

### PR 4: Compiler CLI, packaging, and worked example

Implemented: [native execution and source export](../04-guides/06-compile-and-run-rust.md), packaged runtime/driver assets, backend-aware JSON and Markdown, completion exit statuses, and installed-package tests. The public execution entrypoint compiles validated Program IR afresh and checks a bounded process response.

Larger goal: make compilation a usable, reproducible development workflow.

Add concise compile and backend-selection commands while preserving the current interpreter default. The proposed command forms are `clearings program compile closure --backend rust --out <directory>` and `clearings program run closure <arguments.json> --backend rust`; these commands are implemented, with Rust as the default for `compile` and the interpreter as the default for `run`/`demo`. Exact options and output contracts are recorded in the [CLI reference](../03-reference/08-program-cli.md).

Expose compilation and compiled execution through a documented library subpath. Emit inspectable Rust and metadata with protected output creation. Include backend identities and semantic results in JSON and readable reports, and retain the current completion-to-exit-status distinctions. CLI execution should compile validated IR through the pinned local compiler/runtime; do not add an arbitrary source-file execution command. Artifact hashes establish integrity, not a sandbox or authorization to execute untrusted native code.

Extend clean-package tests, focused CI, and the runnable documentation to exercise generated code from the packaged distribution without relying on the source checkout. Document generated-file ownership and removal through the maintenance workflow.

Completion criteria: a clean checkout and an installed package can compile and execute closure; generated output is reproducible and inspectable; failures and exhausted limits are reported correctly; CLI, packaging, and documentation checks pass.

## Integration and deferred work

Production context assembly continues to use its TypeScript kernel during this implementation scope. The generic production helper takes a map and callback; the IR workload takes portable graph records and applies a bounded execution contract. Whole-specification validation and kernel-level missing-reference checks also have different scopes. Replacing the caller requires explicit compatibility decisions, rather than a simple function substitution.

Four current source files are bound by historical whole-file hashes and byte ranges, as described in [repository maintenance](05-repository-maintenance.md). Production adoption must migrate that verification to an authenticated immutable historical source snapshot while preserving the recorded artifacts and checks. It must then evaluate the new implementation through fresh evidence. Historical files should not prevent future implementation changes, and new code should not rewrite old evidence to make it pass.

The subsequent production-adoption task must preserve public input behavior, ordering, failure mapping, and caller-visible resource policy. After adoption, a bounded agent-authored Program IR change can test the complete authoring, compilation, execution, evaluation, and self-use workflow.

Automatic contract synthesis, optimized or multiple backends, a bytecode VM, host capabilities, new language effects, compiler self-hosting, and matched agent-efficiency experiments are outside this implementation scope. Extend the language only when a subsequent real Clearings algorithm demonstrates a missing construct.

## Definition of done

The backend is complete when the four PRs establish deterministic compilation of the full supported Program IR language, compatible compiled execution, independent evaluation of compiled closure, and a reproducible library/CLI/package workflow. The evidence must show execution of generated computation and identify the tested scope. A completed backend enables production adoption; it does not by itself establish self-hosting or automatic synthesis from requirements.
