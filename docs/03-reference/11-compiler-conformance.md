# Compiler conformance evaluation

The compiler conformance gate evaluates generated Rust against the [reference execution contract](07-program-execution.md) and independently specified outcomes. It extends the [initial native tests](10-rust-code-generation.md#native-validation) with a reproducible graph domain, a fixed-seed language corpus, resource boundaries, and faulty-program controls.

The gate is development test infrastructure. It does not add an implementation IR, a public execution-record schema, a general native runner, or a compiler-correctness proof.

## Run the gate

Use Node.js 24 and the pinned Rust 1.85.1 toolchain with rustup on `PATH`. From the repository root:

```bash
npm run test:compiler
```

The command builds TypeScript, tests artifacts and the comparison machinery, and runs both the initial native tests and the expanded conformance suites. Test files run sequentially to bound concurrent Rust compilation. A missing toolchain, compilation error, native panic, timeout, or malformed result fails the command. There is no interpreter fallback or silent skip.

The [Rust CI workflow](../../.github/workflows/rust.yml) runs this command together with Rust formatting, Clippy, and primitive tests. `npm test` includes the comparison-machinery tests and the existing language tests without requiring Rust. The separate context-conformance gate retains its established evaluation domain.

## Observable comparison

The [evaluator](../../tests/native/conformance.mjs) invokes the same source program and positional arguments with the same limits in each implementation. Native observations are associated with the exact artifacts returned by fresh compilation.

| Observation         | Comparison                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| Return              | Exact semantic value, including list order and UTF-16 code units                    |
| Application failure | Exact code, payload, diagnostic phase, IR path, and call stack                      |
| Runtime fault       | Exact code, message, diagnostic phase, IR path, and call stack                      |
| Resource exhaustion | Exact resource, limit, admitted counters, and first rejected operation's diagnostic |
| Limits and usage    | Every effective limit and admitted cumulative or peak counter                       |
| Rejected arguments  | Exact input-error code, rule, and path before metered execution                     |
| Unexpected fields   | Rejected by structural comparison rather than discarded                             |

Backend metadata and interpreter metadata differ by construction. The evaluator records both identities and versions as reproduction context; it compares the corresponding semantic fields defined by the [backend contract](09-rust-backend.md#backend-result-and-comparison-contract). Object field insertion order is not semantic record inequality. Array order, missing fields, and extra fields are significant.

Independent application expectations omit diagnostics and accounting when those are not independently derived. The exact differential comparison still retains them. The authored accounting suite additionally checks complete observations against manually derived counters and diagnostics.

## Evaluated domain

The [suite entry point](../../tests/native/conformance.test.mjs) requires the declared case counts so an accidentally empty or smaller domain cannot pass silently.

| Suite                                              | Native executions | Independent basis                                                                                                                                 |
| -------------------------------------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exhaustive three-node closure                      |             1,536 | Existing simple-path enumeration oracle: 512 directed graphs, including self-loops, times three single roots                                      |
| Targeted closure                                   |                34 | Explicit outcomes for multiple roots, duplicates, optional edges, missing references, cycles, ordering, UTF-16 identifiers, and 32-node workloads |
| Fault controls and corresponding positive controls |                10 | Five predefined incorrect IR algorithms, each paired with the unmodified algorithm on the same counterexample                                     |
| Fixed-seed language combinations                   |               192 | 24 generated program variants with eight argument cases each; collection and closed-form expectations                                             |
| Language boundaries                                |                58 | Authored operand order, abrupt completion, aliasing, equality, sorting, integer, index, and argument-validation cases                             |
| Preparation boundaries                             |                 9 | Exact portable-value count, nesting depth, input-unit limits, and validation precedence                                                           |
| Independent accounting                             |                28 | Explicit charge ledger and full expected observations for argument import, execution, calls, and return/failure export                            |
| Resource sweeps and deep calls                     |               387 | Independent application outcomes with reference-derived limit selection; exact differential instrumentation checks                                |
| **Expanded gate total**                            |         **2,254** | Includes five executions of faulty programs that must be rejected                                                                                 |

The initial 67 native cases remain separate, for **2,321 native executions** in the combined command. Case counts describe the authored test domain, not the number of arbitrary programs for which correctness has been established.

### Graph expectations

The [closure corpus](../../tests/native/closure-corpus.mjs) uses the existing [path-enumeration oracle](../../tests/helpers/program-closure-reference.mjs). The oracle enumerates simple required paths and orders them by path length, root position, and UTF-16 labels. It does not call the production worklist traversal, the Program IR implementation, or either execution runtime.

The exhaustive domain covers all nine possible directed edges among three labeled vertices. Records and edges are supplied in reverse label order to expose accidental dependence on declaration order. The targeted cases extend this domain with multiple and duplicate roots, record and edge permutations, missing-reference precedence, unreachable missing references, optional edges, shared descendants, and longer chains, cycles, and fan-out.

### Fixed-seed language combinations

The [generator](../../tests/native/seeded-corpus.mjs) uses xorshift32 with seed `0xc1ea1203`. It generates bounded variants of three templates:

1. Filter, transform, and fold a list through iteration, branching, closed calls, local mutation, and immutable collection construction. The expectation uses host collection operations and summation.
2. Compare multisets through sorting and structural equality, then combine Boolean conditions. Independent frequency maps establish multiset equality; ordinary numeric or UTF-16 sorting supplies expected list values.
3. Compute an alternating sum with loop-local bindings, sibling scopes, calls, and explicit failure for a negative count. A closed-form sum supplies the expected result.

The corpus bounds lists at eight elements and nonnegative iteration counts at eight. Its seed, templates, generated IR, arguments, and case names are deterministic. This is template-based bounded generation, not uniform sampling of all well-formed Program IR or an unrestricted grammar fuzzer.

### Accounting and preparation boundaries

The [authored ledger](../../tests/native/resource-corpus.mjs) derives the charges of `main(x) { return x; }` from the normative rules. With one integer argument and a one-character parameter name, it consumes 15 work units, two allocation units, peak value size one, and peak evaluation depth three. Tests cover every work limit from one through 15, including rejected multi-unit charges, statement/expression locations, and export after calls unwind. Separate exact observations cover string materialization, depth rejection after the entry work charge, once-only call evaluation, and exhaustion replacing a recognized application failure during result copying.

The resource sweeps vary one limit at a time. They cover every work limit up to the smaller of the observed total and 96, every other resource limit up to the smaller of the observed peak/total and 24, and the total or peak minus one, equal to it, and plus one. Invalid zero limits are excluded. The limits are selected from successful reference observations; this selection is not an independent derivation of the accounting schedule. Independent expected application outcomes and the separate authored ledger address different aspects of that risk.

The [preparation cases](../../tests/native/language-corpus.mjs) distinguish the complete-input portability pass from input-unit checking, arity, exact argument types, and metered import. Large repeated inputs use compact Rust vector construction in the test-only encoder, preserving the expanded values that the runtime validates and charges. This avoids expanding tens of thousands of identical source expressions just to exercise a preparation bound.

## Fault controls

The five wrong programs skip traversal, omit per-parent target sorting, expand optional edges, globally sort the output, or substitute a record instead of reporting a missing dependency. Each mutation is resealed and statically validated, then freshly compiled and executed.

The interpreter and native implementation must agree on each mutant's actual observation. Its independent expectation must disagree with the application outcome. The corresponding unmodified program must satisfy that same expectation. A compilation failure, timeout, crash, or differential mismatch does not count as successful fault detection.

These controls demonstrate why interpreter agreement alone is insufficient: both execution engines can correctly execute the same incorrect algorithm. They establish detection of the listed defects on their authored counterexamples, not a general mutation score for compiler defects.

The [comparison-machinery tests](../../tests/compiler-conformance.test.mjs) separately alter observation fields to confirm detection of corrupted counters, diagnostics, error rules, order, and additional fields. These are checker tests, not executions of mutated compiler implementations.

## Mismatch reports and reproduction

A semantic mismatch throws `CompilerConformanceError`. Its JSON diagnostic records the suite and case name, optional generator seed, complete source Program IR, arguments, effective limits, compiled-artifact identity, module digest, compiler/runtime/semantics versions, toolchain/options, interpreter version, differing JSON Pointer paths, and expected and actual observations. The comparison label distinguishes differential disagreement, independent expectation failure, independent accounting failure, and an undetected fault control.

Reproduce a reported case with the recorded source program, arguments, and limits through the development harness, then compare the recorded compiler/runtime bindings with the rebuilt artifact. The ordinary gate regenerates the complete deterministic corpus. Reports are test diagnostics, not sealed execution records or authenticated evidence.

The evaluator partitions cases into batches of at most 96 cases and 32 referenced programs. It preserves every case exactly once and retains the [native harness bounds](10-rust-code-generation.md#native-validation), including timeouts and source/output limits. Generated executables receive fixed authored inputs and run in an isolated temporary directory with an empty `PATH`. The runner does not receive a Program AST or depend on Node.js to execute the represented algorithm.

## Deep-call regression

The expanded gate exposed a compiler defect: a valid 91-function acyclic program exceeded Rust's generic-instantiation recursion limit before native execution. Compiler `0.1.1` emits ordinary body functions and four fixed frame adapters using function pointers. The adapters retain the existing runtime entry, statement, function-call, and diagnostic discipline while avoiding one closure type and `FnOnce` shim per IR node. IR call targets remain statically selected; no AST dispatch or additional implementation IR is introduced.

The permanent regression uses the schema maximum of 128 functions and verifies execution-depth exhaustion at limits 128 and 256, including the attempted IR call frame and exact diagnostic. Rust's compiler recursion limit is not raised. The runtime source, ABI, and execution-semantics version remain unchanged; generated source bytes and compiler version change, so prior compiled artifacts must be regenerated.

## Scope and exclusions

Agreement supplies bounded evidence for semantic preservation under the existing resource policy. It does not establish universal compiler correctness, arbitrary contract satisfaction, production adoption, self-hosting, or an agent coding advantage.

The fixed-input native interface cannot represent JavaScript accessors, proxies, functions, cyclic objects, sparse arrays, or nonfinite numbers. Existing frontend tests retain those admission checks; this gate does not claim end-to-end native JSON transport coverage. The runtime and emitter's separate tests retain invalid compiler input, options, source bounds, and primitive checks.

General native process transport, CLI backend selection, installed-package execution, optimization, other targets, and production context-assembly replacement remain subsequent work. Host timing, memory consumption, stack traces, and native-binary reproducibility are outside the semantic comparison.
