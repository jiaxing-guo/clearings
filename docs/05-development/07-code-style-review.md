# Compiler code style review

This review applies the [CodeTaste rubric](https://github.com/xiaoshihou514/codetaste.skill/blob/main/SKILL.md), including its [TypeScript](https://github.com/xiaoshihou514/codetaste.skill/blob/main/references/typescript.md) and [Rust](https://github.com/xiaoshihou514/codetaste.skill/blob/main/references/rust.md) guidance, to the compiler workflow after the Rust emitter was merged. The main improvement is to make operand lowering, source construction, validation, and process execution easier to review independently.

## Scope and assessment

The baseline is commit `a1d9d4724b060b8138a4f90c2ae320b5b7bbf3bf`. The rubric was read on 2026-09-08. Detailed inspection covered the Rust emitter and artifact boundary, Program IR model and validator, reference interpreter, program reports and CLI, native test harness, and Rust value and execution primitives. Conformance capture and repository output were sampled for responsibility boundaries. Frozen historical implementations, recorded benchmark inputs, and generated output were excluded from refactoring.

The following scores are subjective maintainability assessments of that scope. They are neither automated measurements nor correctness or conformance results. The weighted score increases from **78.1/100 to 84.2/100**, within CodeTaste's **good** band in both cases.

| Dimension                            | Weight | Before | After | Concrete evidence                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ------ | ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstraction level                    | 20%    | 78     | 84    | `Emitter.prepareExpressionBody` groups each expression's operand lowering and body construction in one discriminated-union branch. It replaces a separate dispatch pass and an intermediate string-keyed operand map.                                                                                |
| Pattern matching and control flow    | 15%    | 76     | 85    | `writeBinary` separates short-circuit operators from eager operators with explicit switches. `programCommand` replaces nested conditional expressions for positional arity with an action-to-count table.                                                                                            |
| Naming                               | 15%    | 81     | 85    | `RustSourceBuffer`, `nextIdentifier`, `functionTargets`, `rustCodeUnits`, and `argumentsSource` identify responsibilities more precisely than `Source`, `next`, `functions`, `units`, and an embedded interpolation.                                                                                 |
| Duplication and structure            | 15%    | 68     | 82    | `nativeTestSource` owns authored Rust source construction; `nativeBatch` owns compilation and process execution. Expressions no longer repeat operand traversal and string-key lookup in separate switches. CLI numeric limits are converted once.                                                   |
| Language idioms and standard library | 15%    | 82     | 84    | Typed `map` operations construct operand collections; `Object.hasOwn` validates the action table. Existing Rust `match`, `Result`, `Option`, and iterator adapters already express most primitive behavior directly.                                                                                 |
| Efficiency awareness                 | 10%    | 80     | 81    | Operand maps and repeated CLI number conversions are removed. Source emission remains incrementally bounded. No execution-speed improvement is claimed; the change introduces deferred body callbacks and has not been evaluated as a performance optimization.                                      |
| Type safety                          | 10%    | 84     | 89    | Named operands replace non-null map lookups. A guarded function-target lookup retains its definition and index together. Declaring the validator's `invalid` function with return type `never` enables control-flow narrowing and removes four redundant non-null assertions and one type assertion. |

The total is the sum of each dimension's score multiplied by its weight, rounded to one decimal place.

## Existing strengths

- [Program IR](../../src/program/model.ts) represents expressions, statements, and types with discriminated unions. The validator, interpreter, and emitter can dispatch on the same closed set of language constructs.
- [Compiler artifacts](../../src/compiler/artifacts.ts) have a distinct preparation and identity boundary. Native process management remains outside the public source emitter.
- [Rust execution](../../runtime/rust/src/execution.rs) distinguishes application failure, runtime faults, and resource exhaustion through explicit types. [Value operations](../../runtime/rust/src/values.rs) use `Result` propagation and pattern matching instead of implicit exceptional control flow.
- [Conformance capture](../../src/conformance/capture.ts) records unavailable values explicitly. It preserves the distinction between missing evidence and a successfully captured value.
- Prettier and Rust formatting already provide consistent mechanical formatting. Structural review is more useful here than another formatting convention.

## Implemented refactors

### Operand lowering and source emission

In the [emitter](../../src/compiler/rust.ts), `prepareExpressionBody` recursively emits operand helpers in the established order and returns a callback that emits the parent body. `expression` owns the enclosing function and runtime-entry wrapper. The callback preserves the dependency between operand emission and parent emission without maintaining a second expression-kind switch or a map indexed by strings such as `left` and `arguments/0`.

Literal expansion still writes through `RustSourceBuffer`. Source bytes and output-fragment accounting are sensitive to write boundaries, so the refactor preserves those boundaries instead of assembling unrestricted intermediate source strings. Generated identifiers and source locations retain their established order.

### Native test responsibilities

[Native source construction](../../tests/native/source.mjs) now owns fixed-input encoding, per-case limits, and readable line-based Rust templates. The [harness](../../tests/native/harness.mjs) retains batch admission, temporary-file management, pinned compiler invocation, execution, result parsing, measurement, and cleanup.

The test-input encoder remains independently authored. Sharing the production literal emitter would weaken the tests' ability to expose a common encoding error. Private encoding functions are grouped in the test-source module because they implement that module's serialization responsibility; they are not part of the package API.

### Validation and CLI control flow

The [validator](../../src/program/validate.ts) now exposes the non-returning behavior of its error helper to TypeScript's control-flow analysis. Existing guards narrow list types, bindings, and declared failures without redundant assertions. Diagnostic messages, paths, rules, and validation order remain intact.

The [program CLI](../../src/cli/program.ts) uses one table for accepted actions and positional counts. It parses each numeric limit once, retains the selected example when locating authored arguments, and accepts a read-only positional array. Supported commands, output formats, exit codes, and validation precedence remain unchanged.

## Structures deliberately retained

CodeTaste's standard-library recommendations require semantic context in this codebase:

- UTF-16 strings are sequences of code units. Indexed `charCodeAt` encoding preserves isolated surrogates and cannot be replaced with code-point iteration.
- Runtime loops perform specified logical work and allocation charges. Short-circuit order and the point of resource exhaustion are observable behavior.
- The runtime's stable merge sort implements the specified comparison and write schedule. Substituting a standard sort solely for style could change accounting even if the final list were equal.
- Generic `Value` handles and explicit local slots are the current backend representation. Replacing them with specialized Rust types would be a compiler design change requiring separate evaluation.
- Some indexed-access assertions in validation and interpretation express relationships established by prior shape, arity, or scope checks. This review removes assertions where direct control-flow narrowing suffices; it does not introduce a new validated-IR type hierarchy.

## Remaining improvements

The emitter's statement and function templates still contain dense target-source strings. A future change can extract these where it materially improves review, with explicit checks for source bytes and output-fragment bounds. A general pretty-printing framework is not yet justified by the single backend.

The native test source builder still checks the accumulated case source size after each case. This is bounded test infrastructure, but repeated prefix scans could matter if the corpus expands substantially. Profile source construction before changing its buffering or admission policy.

`programCommand` still combines dispatch and presentation. Split command handlers when native execution introduces distinct command behavior, while keeping file admission and output creation as shared boundaries. Introducing a command framework for the current fixed catalog would add unnecessary indirection.

The next most important engineering action is systematic compiler conformance: expand independent expectations and resource-boundary coverage before optimizing the backend. Better structure makes semantic review easier; it does not establish refinement or complete conformance.

## Verification

The pre-refactor and post-refactor compiler outputs were compared by deep equality for all 14 programs in the current native corpus. The complete artifacts, generated source bytes, and identities were unchanged. The generated native harness source was also byte-identical for all 67 cases.

The native suite compiled and executed those 67 cases with the pinned Rust toolchain and passed its independently authored expectations and comparisons with reference execution, including logical usage, completion, and diagnostics. These checks cover the existing corpus; they do not establish equivalence for every well-formed program.

All 257 root tests passed, including validator diagnostics, CLI behavior, artifact validation, and compiler source/work bounds. No Rust runtime source changed, so its source identity remains unchanged.
