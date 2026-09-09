# Required dependency closure in Program IR

The [required-dependency-closure program](../../programs/clearings/required-dependency-closure.json) implements the ordered graph-closure kernel used by Clearings context assembly. Its worklist, visited values, record lookup, required-edge filtering, sorting, and failures are executable Program IR. The [reference interpreter](../03-reference/07-program-execution.md) supplies only general language operations.

This is one Clearings algorithm represented and executed in its own implementation language. The [production context assembler](../../src/specification/context.ts) now invokes its compiled Rust implementation. The [production adoption contract](../05-development/08-production-adoption.md) defines adapter behavior, finite execution limits, and separate whole-assembler validation.

## A concrete ordering case

| Record ID | Required targets, in supplied order |
| --------- | ----------------------------------- |
| `root`    | `z`, `a`                            |
| `z`       | `b`                                 |
| `a`       | `y`                                 |
| `y`       | None                                |
| `b`       | None                                |

Starting from `root`, the result is `["root", "a", "z", "y", "b"]`. Targets are sorted when each record is expanded. The children of `a` therefore precede the children of `z`. The result is neither a global ID sort nor a topological ordering; cycles are valid inputs.

## Invocation and value types

The program's entry function is `required_dependency_closure`. Invoke it through `executeProgram(program, [roots, records])`:

| Parameter | Program IR type | Meaning                                                                            |
| --------- | --------------- | ---------------------------------------------------------------------------------- |
| `roots`   | `list<string>`  | Seed IDs in requested order; duplicates and an empty list are permitted            |
| `records` | `list<Record>`  | Available records; declaration order does not determine successful traversal order |

`Record` and `Dependency` are structural types defined by the program's function signatures:

```text
Record = { id: string, dependencies: list<Dependency> }
Dependency = { target: string, required: boolean }
```

The result type is `list<string>`. Records have exactly the fields above. IDs are string values, not IR identifiers, object-property lookups, or aliases. Empty strings, Unicode, and names such as `__proto__` remain ordinary IDs. Comparisons use the [language's UTF-16 ordering](05-program-ir.md#types-and-values). Shape and type errors are interpreter preparation errors, not application failures.

The list representation requires unique record IDs to provide the single-valued lookup that the TypeScript kernel obtains from a map. The IR program checks that condition explicitly. Duplicate roots and dependency entries remain valid and do not duplicate returned IDs.

## Operation contract

Let `R` be the set of supplied roots. For each record, retain only edges whose `required` field is true. When all reached IDs resolve, let `C` be the least set containing `R` and closed under those edges.

| Obligation or decision   | Required behaviour                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input guards             | Arguments have the exact types above and satisfy interpreter preparation bounds. Record IDs must be unique for traversal to begin.                                                   |
| Duplicate-record failure | Before traversal, scan all record declarations. At the first repeated ID, produce `DUPLICATE_RECORD_ID` with that string as the failure payload. This also applies with empty roots. |
| Closure postcondition    | On return, the output contains exactly `C`, once per ID. Optional edges alone do not expand the closure.                                                                             |
| Root ordering            | Return distinct roots in first-occurrence order before newly discovered non-root records.                                                                                            |
| Expansion ordering       | Use breadth-first discovery, with each expanded record's required target IDs in ascending UTF-16 order.                                                                              |
| Missing-record failure   | When the next unvisited worklist ID has no record, produce `MISSING_REQUIRED_DEPENDENCY` with that ID as the failure payload. No partial closure is returned.                        |
| State frame              | Preserve supplied roots, records, and all dependency arrays. Returned data has the interpreter's owned value semantics.                                                              |
| Effects                  | The IR program performs no external I/O or host invocation. Loading the JSON artifact is the caller's responsibility.                                                                |
| Resource decision        | The interpreter may interrupt execution with resource exhaustion, distinct from both application failures and return.                                                                |

Duplicate-record validation precedes every lookup. After it succeeds, missing-record failures follow worklist order: supplied roots first, then required dependencies in discovery order. An absent required target in an unreachable record does not fail this kernel invocation. An absent optional target does not enter the worklist.

Whole-context assembly has additional guards: it validates all required references in the specification, checks the byte budget, and resolves a root ID or alias before invoking its closure kernel. The kernel's reached-reference rule does not relax those whole-specification requirements. A dependency's `required` Boolean is a representation of context inclusion, not a claim that the dependency executes at runtime.

### Equivalent order specification

For each reachable ID, consider all required paths from the roots. Rank paths by edge count, then the root's first input position, then the path's ID sequence in lexicographic UTF-16 order. Choose the least-ranked path for each ID and return IDs in that order. With one root this is shortest-path order with lexicographic tie-breaking over complete paths.

Every shortest path has a simple representative, so cycles do not require enumerating arbitrarily long paths. The independent test oracle uses this path characterization instead of reproducing the program's worklist algorithm.

## IR function decomposition

| Function                      | Implementation responsibility                                                               | Declared failures                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `required_dependency_closure` | Build the index, seed a unique FIFO, resolve each queued record, and return discovery order | Both failure codes                    |
| `record_index`                | Stably sort original record positions and reject the earliest repeated declaration          | `DUPLICATE_RECORD_ID: string`         |
| `block`                       | Sort a bounded initial run of record positions                                              | None                                  |
| `merge`                       | Merge two sorted runs of positions using UTF-16 record IDs                                  | None                                  |
| `lookup`                      | Find an exact ID in the sorted index using binary lifting                                   | `MISSING_REQUIRED_DEPENDENCY: string` |
| `targets`                     | Deduplicate required targets and sort their IDs                                             | None                                  |

All calls resolve to functions in the same artifact. The call graph is acyclic. Cyclic input graphs are handled by iteration and discovered-ID membership.

The index stores integer positions into the original input. It does not copy dependency-bearing records into constructed index values. Initial runs contain at most 16 positions; stable merges produce a sorted permutation. Equal IDs retain declaration order. The smallest original position among equal-ID successors identifies the first repeated declaration, preserving failure precedence even with empty roots.

The entry function constructs powers of two using integer addition. `lookup` uses those strides to find the lower bound of a requested ID in the permutation; no division or host lookup operation is required. Lookup remains delayed until an ID's FIFO position is expanded, preserving missing-reference failure order.

`q` is both the unique FIFO of discovered IDs and the eventual result. Distinct roots enter first in requested order. Each expansion appends previously undiscovered required targets in ascending UTF-16 order. Marking at enqueue time removes redundant pending entries while preserving first-visit order. Every finite record is expanded at most once; finite roots and dependency lists establish termination of the unbounded algorithm.

Index construction uses O(n log n) ID comparisons and each lookup uses O(log n) comparisons. Total logical work is not bounded by those comparison counts alone: immutable list append, queue membership, and target deduplication can still accumulate quadratic costs. A bounded execution may exhaust resources, and index setup can increase cost for some small graphs or early failures.

The [independent agent evaluation](../../benchmarks/agent-runs/closure-scale-001/RESULT.md) accepted this exact IR over its frozen domain. A 256-record chain used 79.4% less work than the preserved baseline, and both 512-record chain declaration orders returned under unchanged limits. These results establish a bounded improvement, not universal refinement or an asymptotic bound on the complete algorithm. Historical results remain bound to their original program identities.

## Execute the committed artifact

After `npm run build`, this example reads the program as JSON and executes it:

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeProgram } from 'clearings/program';
const program = JSON.parse(readFileSync('programs/clearings/required-dependency-closure.json', 'utf8'));
const arguments_ = JSON.parse(readFileSync('programs/clearings/required-dependency-closure.arguments.json', 'utf8'));
const result = executeProgram(program, arguments_);
assert.deepEqual(result.completion, { kind: 'return', value: ['root', 'a', 'z', 'y', 'b'] });
const missing = executeProgram(program, [['absent'], arguments_[1]]);
assert.equal(missing.completion.kind, 'application-failure');
assert.equal(missing.completion.code, 'MISSING_REQUIRED_DEPENDENCY');
assert.equal(missing.completion.details, 'absent');
assert.deepEqual(missing.completion.diagnostic.call_stack.map(frame => frame.function_id),
  ['required_dependency_closure', 'lookup']);
```

The [authoring module](../../programs/clearings/required-dependency-closure.mjs) constructs typed syntax records. The [build script](../../scripts/build-required-closure-program.mjs) seals and serializes those records. Neither receives an invocation graph or computes a closure. Runtime execution reads the committed JSON artifact and does not load the authoring module.

## Independent evaluation

Run `npm run test:program` to validate the artifact, reproduce its bytes, and execute its tests. The [closure tests](../../tests/program-closure.test.mjs) cover every directed graph on three labeled vertices, including self-loops: `2^9 = 512` graphs, with all three single-root selections, for 1,536 exhaustive cases. Record and edge declarations are deliberately reversed.

The [independent oracle](../../tests/helpers/program-closure-reference.mjs) enumerates simple required paths, ranks them as specified above, and removes repeated terminal IDs. It imports no candidate, production traversal, or interpreter helper. The tests compare both the IR program and the existing TypeScript kernel with this oracle on all 1,536 exhaustive cases. This independence concerns the expected-result computation; it is not a separate-agent or blinded authoring experiment.

Targeted cases cover multiple and duplicate roots, duplicate edges, optional edges, self-loops and larger cycles, diamonds, shortest-path tie-breaking, breadth-first ordering across parents, declaration permutations, Unicode IDs, missing roots and targets, duplicate-record precedence, value ownership, and resource exhaustion. Larger finite examples exercise the program under default limits. Five well-typed IR mutations check that the expectations detect incomplete closure, omitted target sorting, optional expansion, global output sorting, and missing-record substitution.

Agreement establishes the declared bounded evaluation domain. The tests do not establish universal refinement, a self-hosting compiler, or a general contract-to-program translation. Production integration separately checks use of the accepted IR through ordinary context assembly. The [program workflow](../04-guides/05-run-programs.md) exposes this algorithm through `npm run program -- demo` and `npm run program -- inspect closure`. Focused CI runs the algorithm evaluation alongside language, CLI, and packaging tests.
