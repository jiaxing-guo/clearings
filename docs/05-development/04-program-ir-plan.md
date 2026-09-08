# Program IR implementation plan

The objective is a small typed language and reference interpreter that execute one real Clearings algorithm: ordered required dependency closure. The algorithm must be represented in Program IR using values, collection operations, bindings, branching, iteration, calls, and explicit failure. Its traversal must not be delegated to a host call or a graph-specific primitive.

## Four pull requests

| Sequence | Larger purpose | Concrete scope | Status |
| --- | --- | --- | --- |
| 1 | Define an implementation language with precise semantics | Program types and schema; expression, statement, call, and failure semantics; static validation; authored validation examples | Implemented |
| 2 | Establish the reference VM | Interpreter, work/storage limits, diagnostic completions, and independent tests of each language construct | Implemented; [execution API and accounting](../03-reference/07-program-execution.md) |
| 3 | Express a real Clearings algorithm in its own IR | Ordered dependency closure, including worklist, visited values, lookup, ordering, missing references, and IR-defined calls; independent exhaustive three-node tests and targeted cases | Implemented; [algorithm contract and evaluation](../02-semantics/06-required-dependency-closure.md) |
| 4 | Make the result reproducible and usable | Concise CLI commands, readable program inspection and execution results, worked documentation, and focused CI | Planned |

Each change includes its own tests and documentation. The final change integrates the developer workflow. The [conformance implementation](03-conformance-plan.md) provides existing independent graph-domain expectations; its historical records and frozen evaluation inputs retain their original meanings.

## Initial language boundary

The [language semantics](../02-semantics/05-program-ir.md) define safe integers, strings, Booleans, null, typed lists and records, immutable values, mutable local bindings, structured conditionals and loops, statically resolved acyclic calls, and typed application failures. Lexical scope, operand order, value ownership, completion, and failure propagation are explicit.

There are no host calls, imports, source evaluation, graph intrinsics, external I/O, shared mutable state, recursive calls, exception handlers, or implicit conversions. Iteration supports cyclic graph data without recursive function calls. Runtime arithmetic/indexing faults and resource exhaustion remain distinct from application failures.

## Completion criteria

The milestone completes when a validated Program IR artifact implements required dependency closure, the reference interpreter executes it, and independent tests establish agreement over the declared evaluation domain. Tests must cover function calls and failure propagation as well as graph closure, ordering, duplicates, cycles, and missing references. Validation fixtures alone do not satisfy execution criteria.

Production replacement, a general execution-record framework, full context-assembler integration, deterministic source generation, optimization passes, and automated agent synthesis remain subsequent work. The resulting capability will be execution of one Clearings algorithm expressed in its own IR; it will not establish self-hosting or universal refinement.
