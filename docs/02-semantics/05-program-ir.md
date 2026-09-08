# Program IR semantics

Program IR is a typed implementation language with explicit computation and structured control flow. A program contains function definitions and names one entry function. The static validator checks program artifacts, and the reference interpreter executes the entry function under finite resource limits. The execution rules below define its behaviour. Static validation alone establishes no program execution; the [execution reference](../03-reference/07-program-execution.md) defines the runner, result variants, and precise resource accounting.

The v0.3 operation contract continues to describe permitted behaviour. Program IR v0.1 describes an algorithm. These are separate artifact families and abstraction levels. A program's types do not establish that its algorithm satisfies an operation contract. Binding executions to contract observations remains separate work.

## Read a function body

This body returns the value of an immutable parameter named `value`:

```json
[
  { "kind": "return", "value": { "kind": "ref", "name": "value" } }
]
```

The complete [identity example](../../programs/examples/identity.json) declares its parameter and return type as `string`. The [sum example](../../programs/examples/sum-nonnegative.json) also contains mutable locals, iteration, an IR-defined call, and a typed application failure. Both are authored programs with independent interpreter tests. Their expected results are documented in [the example notes](../../programs/examples/README.md); the JSON artifacts themselves are program bodies, not recorded executions.

## Types and values

| Type | Domain |
| --- | --- |
| `null` | JSON `null`; a known value |
| `boolean` | `true` or `false` |
| `integer` | Integers from `-(2^53 - 1)` through `2^53 - 1`; negative zero is equivalent to zero |
| `string` | JSON strings; comparisons use lexicographic UTF-16 code-unit order, without locale or normalization |
| `list` | Ordered homogeneous values with a declared `element` type |
| `record` | Exactly the own fields in the declared `fields` map, with their respective types |

Type equality is structural. Record-field declaration order is irrelevant; names and field types must match exactly. List element types are invariant. There is no implicit conversion, numeric widening, subtype relation, optional field, or untyped empty list. Every literal declares its full type. A constructed empty list declares its element type explicitly.

Program IR has no pointers or observable object identity. Values are immutable. Literal evaluation, argument passing, collection construction, and returns have value semantics: a caller cannot observe storage shared with another value. An interpreter may share immutable storage internally when this preserves those semantics. Assigning a variable replaces its value; it cannot mutate a previously held list or record, a parameter, or an argument supplied by the caller.

An unavailable contract observation is distinct from a program value. Program IR has no `unknown`, `undefined`, opaque expression, or implicit missing-value result. Strings that resemble code and objects that resemble IR nodes remain data inside a literal.

## Expression evaluation

Expressions are evaluated in the current function's lexical environment. Operand expressions are evaluated once, from left to right in the order below. If an operand completes abruptly, later operands are not evaluated. `and` and `or` additionally short-circuit. Static checking still checks every operand and branch.

| Expression | Evaluation order and result |
| --- | --- |
| `literal { type, value }` | Produce the declared value. Static validation checks that it inhabits `type`. |
| `ref { name }` | Read the current value of the named parameter or local binding. |
| `record { fields }` | Evaluate each `{ name, value }` entry in array order and construct a record. Names must be unique. Field array order controls evaluation, not record equality. |
| `field { record, name }` | Evaluate `record`, then read its statically declared own field. Prototype properties are never fields. |
| `list { element_type, items }` | Evaluate `items` in array order and construct a list of the declared element type. |
| `index { list, index }` | Evaluate the list, then the integer index. Return the zero-based element; a negative or out-of-range index is a runtime fault. |
| `length { list }` | Evaluate the list and return its element count as an integer. String length is not supported by this operator. |
| `append { list, value }` | Evaluate the list, then the element; return a new list with that element at the end. |
| `contains { list, value }` | Evaluate the list, then the element; return whether an equal element occurs. Membership uses structural value equality. |
| `sort { list }` | Evaluate an integer or string list; return its elements in ascending order, retaining duplicates. Integers use numeric order; strings use the order above. |
| `not { value }` | Evaluate and negate a Boolean. |
| `binary { op, left, right }` | Follow the operator rules below. |
| `call { function_id, arguments }` | Evaluate arguments in array order, then invoke the named function with those values. |

`binary.op` is one of:

| Operators | Operand types | Result |
| --- | --- | --- |
| `add`, `sub` | Two integers | Exact sum or difference within the integer domain; otherwise a runtime fault |
| `eq`, `ne` | Two values of the same structural type | Structural equality or inequality; list order matters and record-key order does not |
| `lt`, `lte`, `gt`, `gte` | Two integers or two strings | Boolean comparison under the respective ordering |
| `and` | Two Booleans | Evaluate left; return false immediately if false, otherwise evaluate right |
| `or` | Two Booleans | Evaluate left; return true immediately if true, otherwise evaluate right |

All supported operations are general value or control-flow operations. There are no imports, host calls, arbitrary source evaluation, graph traversal primitives, or context-assembly intrinsics. Required dependency closure must be expressed using the language's collections, bindings, loops, and calls.

## Bindings and blocks

A function starts with immutable parameter bindings. Each block introduces a lexical scope. A name becomes visible only after its initializer has completed successfully. Names must be unique among all active bindings; shadowing is rejected. Sibling blocks may reuse a name. A block-local name leaves scope when that block completes, including at the end of each loop iteration.

| Statement | Semantics |
| --- | --- |
| `let { name, type, value }` | Evaluate and bind an immutable local value of the declared type. |
| `var { name, type, value }` | Evaluate and bind a mutable local value of the declared type. |
| `assign { name, value }` | Evaluate the expression, then replace an existing `var` binding. The binding's type remains invariant. An abrupt expression leaves that binding unchanged. |
| `if { condition, then, else }` | Evaluate a Boolean condition and execute exactly one branch in a nested scope. Both branch arrays are explicit; either may be empty. Assignments to outer variables persist. |
| `while { condition, body }` | Evaluate the Boolean condition before each iteration. If true, execute the body in a fresh nested scope and repeat. If false, complete normally. |
| `return { value }` | Evaluate the expression and complete the current function with its value. |
| `fail { code, details }` | Evaluate the payload and complete with the named application failure. |

Statements execute in array order. A return, application failure, runtime fault, or resource exhaustion immediately leaves the enclosing blocks. A loop's normal completion continues with the next statement. There are no implicit returns, `break`, `continue`, exception handlers, or shared mutable global state in this version.

## Calls and application failures

Each function declares an ordered parameter list, a return type, and zero or more failure signatures `{ code, details }`. Parameter names and failure codes must each be unique within their function. Calls use canonical function IDs from the same program; IDs are not file paths or dynamic import instructions. Forward references are allowed. The entire call graph must be acyclic, including functions not reachable from the entry. Cyclic graphs represented as input data remain valid; they can be traversed by iteration.

A call requires exactly the declared number of arguments in parameter order and exactly compatible types. Arguments are evaluated in the caller's environment. The callee then receives a fresh environment containing its parameters, with no access to the caller's local bindings. Returning from the callee supplies the call expression's value and resumes evaluation in the caller.

A `fail` statement must name a failure declared by its function and supply a payload of its declared type. The abstract failure consists of `code` and `details`. When a callee fails, the same code and payload propagate through the call; they do not become a return value. Every caller must declare all of its callees' possible failures with identical payload types, even if the call is conditional. Declared but unused failures are permitted. There is no implicit catch or conversion into another failure code.

Application failures and interpreter failures are separate. Integer overflow and invalid indexing are runtime faults, not declared application failures. Work, storage, and value limits interrupt execution as resource exhaustion. Such interruption does not prove that the unbounded program would fail or fail to terminate. None of these conditions can be substituted with `null`, `false`, a partial return, or an application `fail` result.

## Static completion analysis

The validator checks a conservative syntactic control-flow property: a function must not have a path that falls through its body without an explicit return or failure.

- A `return` or `fail` prevents normal fallthrough.
- An `if` prevents fallthrough only when both branches prevent it.
- A `while` may execute zero times, regardless of the condition's literal value.
- A statement after a block that prevents fallthrough is rejected as unreachable.

All function bodies are checked, including unused functions. Constant conditions, short-circuit values, and always-failing callees do not suppress static checking. Calls do not supply an interprocedural proof that a following statement is unreachable. This analysis establishes neither termination nor absence of runtime faults.

## Validation contract and implementation boundary

`validateProgram(value)` accepts an unknown caller value and returns no value when portability, schema, content identity, names, types, completion paths, and call/failure constraints validate. A rejected value produces `INVALID_PROGRAM` with a diagnostic rule and JSON Pointer. The operation preserves the supplied value. Its fixed bundled schema is loaded by the module; validation does not read paths or execute code selected by a program. `sealProgram` returns an owned normalized copy and has the same static requirements. [Artifact interfaces](../03-reference/06-program-artifacts.md) define identity and resource bounds.

The language has no external I/O operation. That restriction does not authenticate the interpreter's host behaviour or establish complete effect monitoring. Static validity is separate from execution evidence, contract conformance, refinement, and acceptance.

The reference interpreter enforces execution-work, cumulative logical allocation, expanded value-size, and evaluation-depth limits. Work includes collection primitives and output copying. Its [execution contract and accounting rules](../03-reference/07-program-execution.md) distinguish preparation rejection, declared application failure, runtime faults, and resource exhaustion. Independent language tests exercise these distinctions; the required-dependency-closure program and its graph-domain evaluation remain subsequent work.
