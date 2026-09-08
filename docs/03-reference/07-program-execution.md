# Program execution

`executeProgram(program, arguments, options?)` synchronously executes the entry function of a statically valid Program IR artifact. It implements the [Program IR execution semantics](../02-semantics/05-program-ir.md) with finite work, allocation, value-size, and evaluation-depth limits. Execution can return a value, propagate a declared application failure, encounter a runtime fault, or exhaust a resource. These completions have distinct representations.

## Execute an authored program

Run `npm run build` from the repository root, then use the `clearings/program` library entrypoint:

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeProgram } from 'clearings/program';
const program = JSON.parse(readFileSync('programs/examples/sum-nonnegative.json', 'utf8'));
const result = executeProgram(program, [[2, 0, 3]], { work: 10_000 });
assert.deepEqual(result.completion, { kind: 'return', value: 5 });
assert.equal(result.program_id, program.artifact_id);
const failed = executeProgram(program, [[2, -1, 3]]);
assert.equal(failed.completion.kind, 'application-failure');
assert.equal(failed.completion.code, 'NEGATIVE_VALUE');
assert.equal(failed.completion.details, -1);
const overflow = executeProgram(program, [[Number.MAX_SAFE_INTEGER, 1]]);
assert.equal(overflow.completion.kind, 'runtime-fault');
assert.equal(overflow.completion.code, 'INTEGER_OVERFLOW');
```

The outer array supplies positional arguments; the inner array is the sum function's one list argument. The interpreter follows the example's IR-defined loop and `nonnegative` call. This example executes through the library. Program inspection and execution commands remain planned CLI work.

## Operation contract

| Condition or obligation | Behaviour |
| --- | --- |
| Input guards | Options are supported finite limits. Program and arguments are portable bounded data. The program passes static validation, including its content identity. Positional arguments exactly inhabit the entry signature. |
| Invalid input | Throw a preparation or validation error before evaluating any function body. No execution result is fabricated. |
| Return postcondition | `completion.kind` is `return`; `value` is the entry function's returned value under the language semantics. |
| Application-failure postcondition | `completion.kind` is `application-failure`; `code` and `details` preserve the declared failure propagated from the executing `fail` statement. |
| Runtime-fault decision | Invalid indexing or arithmetic overflow produces `runtime-fault` with a code and source diagnostic. It does not satisfy a declared failure signature. |
| Resource decision | An attempted charge exceeding a limit produces `resource-exhaustion`, with the resource and location. No partial return value or failure payload is exposed. |
| State frame | Preserve caller-owned program, arguments, and options. Exported collections are owned copies, including repeated occurrences of a shared internal value. |
| Effects | No IR operation performs external I/O, imports a module, evaluates source, or invokes caller-supplied code. The module uses the bundled static validator and schema. |

These requirements define the library operation. The result is not a contract observation, conformance record, source-refinement proof, or acceptance decision. There is no general host-effect monitor or operating-system sandbox. The public JavaScript boundary expects ordinary portable data; reflective operations on adversarial JavaScript proxies are outside that input model.

## Library interfaces and result fields

| Export | Meaning |
| --- | --- |
| `executeProgram(input: unknown, arguments: unknown, options?: ProgramExecutionOptions)` | Validate, prepare, and execute the artifact's declared entry function; return `ProgramExecutionResult` |
| `ProgramExecutionOptions` | Partial `ProgramExecutionLimits`; omitted fields take their defaults |
| `PROGRAM_INTERPRETER_VERSION` | `0.1.0`; identifies this execution-result and resource-accounting implementation |
| `PROGRAM_EXECUTION_DEFAULT_LIMITS`, `PROGRAM_EXECUTION_MAX_LIMITS` | Frozen defaults and hard ceilings for per-execution limits |
| `PROGRAM_EXECUTION_INPUT_LIMITS` | Frozen preparation bounds, independent of execution limits |

The other public types are `ProgramExecutionLimits`, `ProgramExecutionUsage`, `ProgramExecutionDiagnostic`, `ProgramRuntimeFaultCode`, and `ProgramExecutionCompletion`. The [execution interfaces](../../src/program/execution.ts) define the discriminated union exactly. The interpreter version is independent of the Program IR schema version. Changes to observable accounting or result semantics require an interpreter-version change; a change to the language itself also requires the appropriate language compatibility decision.

Each result contains:

| Field | Meaning |
| --- | --- |
| `program_id` | The validated program's content identity |
| `interpreter_version` | The interpreter version above |
| `limits` | The complete effective limits, including defaults |
| `usage` | Cumulative admitted work and allocation; peak admitted value size and evaluation depth |
| `completion` | Exactly one of the completion variants below |

| `completion.kind` | Additional fields |
| --- | --- |
| `return` | `value: ProgramValue` |
| `application-failure` | `code: string`, `details: ProgramValue`, `diagnostic` |
| `runtime-fault` | `code: INTEGER_OVERFLOW` or `INDEX_OUT_OF_BOUNDS`, `message`, `diagnostic` |
| `resource-exhaustion` | `resource: keyof ProgramExecutionLimits`, `limit: number`, `diagnostic` |

Results are ordinary owned JavaScript data, with no timestamp or nondeterministic identifier. Repeated execution with the same canonical program, arguments, interpreter version, and limits produces the same result, including usage and diagnostics. Input object-key order is normalized; array order is preserved. These fields are informational execution output, with no execution-record schema, argument digest, content seal, or authentication claim.

## Preparation and rejected invocations

Preparation validates options, bounds the program, runs static program validation, bounds the argument array, takes canonical owned copies, and checks entry arity and argument types. All these steps precede runtime argument import. A low execution limit cannot admit an invalid program or skip checking an argument. Preparation does not consume execution work; its own fixed bounds apply instead.

The program and the complete argument array each permit at most 50,000 visited portable values, nesting depth 64, and 1,000,000 input units. Input units count one per value plus string and record-field-name UTF-16 code units. Repeated references are counted repeatedly. Size checking precedes identity hashing and canonical copying, including for strings in unused functions or metadata. [Static validation bounds](06-program-artifacts.md#resource-bounds) also apply to the program.

Portable input excludes cycles, sparse arrays, named array properties, accessors, hidden or symbol properties, functions, nonfinite numbers, and host objects. Accessor properties are rejected without invoking their getters. Argument typing additionally rejects noninteger or unsafe numeric values and requires exactly the declared own record fields. Negative zero is normalized to zero.

Static program defects retain `INVALID_PROGRAM`. Other preparation defects throw `ClearingsError` with `code: INVALID_PROGRAM_EXECUTION`, `exitCode: 2`, and `details: { path, rule }`:

| Rule | Meaning |
| --- | --- |
| `portability` | Nonportable input or the fixed structural preparation bound is exceeded |
| `input-limit` | Program or argument input units exceed the preparation cap |
| `limits` | Options are not an object, contain an unsupported field, or specify an invalid limit |
| `arity` | Arguments are not an array of the required length |
| `type` | An entry argument does not inhabit its declared type |

Preparation paths start at `/program`, `/arguments`, or `/options`; nested argument type errors use JSON Pointers below `/arguments`. Static `INVALID_PROGRAM` paths remain relative to the program artifact. Preparation rejection is distinct from resource exhaustion after execution begins. Neither a preparation bound nor execution exhaustion proves behavioural incorrectness or nontermination. Unexpected host exceptions indicate an implementation or host failure and propagate to the caller; they are not converted into a language completion.

## Execution limits

Each option must be a safe integer from 1 through its hard ceiling. Zero, negative, fractional, infinite, and unknown options are rejected. Limits may be raised independently within the ceilings.

| Resource | Default | Hard ceiling | Measurement |
| --- | ---: | ---: | --- |
| `work` | 1,000,000 | 10,000,000 | Cumulative charged evaluation and primitive work |
| `allocation_units` | 1,000,000 | 10,000,000 | Cumulative logical allocation reservations |
| `value_units` | 100,000 | 1,000,000 | Maximum expanded size of a materialized value |
| `evaluation_depth` | 128 | 256 | Simultaneously active function, block, and expression evaluations |

A charge equal to the remaining budget succeeds. A charge exceeding it stops execution before committing that charge. Usage counters never exceed their limits. Earlier accepted charges are retained if a later charge fails. When entering an evaluation, work is charged before checking depth. When materializing a value, shallow construction work is charged before checking value size and then cumulative allocation. Value-size usage increases only after both size and allocation checks succeed.

These are deterministic logical limits, not elapsed-time limits or exact JavaScript heap measurements. Preparation, control environments, diagnostics, and result metadata have bounded implementation overhead outside `allocation_units`. Work and depth bound the control structures; the fixed input limits bound preparation. Cumulative allocation is intentionally conservative and is not reclaimed when a local variable leaves scope.

### Value size and allocation

Define the expanded size `U` recursively:

| Value | `U(value)` |
| --- | --- |
| Null, Boolean, integer | `1` |
| String `s` | `1 + s.length`, in UTF-16 code units |
| List | `1 + sum(U(element))` |
| Record | `1 + sum(fieldName.length + U(fieldValue))` |

Sharing does not reduce expanded size. Constructing `[value, value]` counts both occurrences even if their internal storage is shared. This prevents compact internal graphs from producing unbounded expanded outputs.

Every new internal value reserves its full expanded size against cumulative allocation. Importing a literal or argument constructs each constituent value, so child allocations and the composite's reservation both count. For example, importing a list of three integers costs `3 + 4 = 7` allocation units. Exporting that list reserves another four units before copying. This is a logical materialization budget, not a count of physical bytes allocated.

References, field/index projections, argument passing within IR, variable replacement, callee returns, and `and`/`or` selection may reuse immutable internal values without a new value reservation. Newly computed scalars and constructed collections reserve their size. Sorting reserves the output list's size and, for a list of at least two elements, an additional temporary array of `list.length` allocation units. That temporary reservation does not increase the peak value size.

Output export reserves the expanded return value or failure payload once, then copies every occurrence into an owned JSON value. Copying also consumes work. If either budget is exhausted during export, the result is `resource-exhaustion` in the `result` phase; no partial value or previously recognized application-failure payload is returned.

### Work accounting

Work is charged before the corresponding bounded primitive action. The normative rules for interpreter version `0.1.0` are:

| Action | Work charge |
| --- | --- |
| Enter a function, block, or expression | `1` |
| Start a statement | `1`; a `while` statement starts once, while its condition and body are evaluated on every iteration |
| Resolve an invoked function | Function ID code-unit length, in addition to its entry charge |
| Create a parameter or local binding | `1 + name.length` |
| Look up a binding for reference or assignment | `name.length`, then `1` per lexical scope examined |
| Look up a record field | `1 + name.length`, after evaluating the record |
| Check an index or perform integer addition/subtraction | `1`, after evaluating operands |
| Construct a scalar | `1`, plus string code-unit length for a string |
| Construct/import a list | `1 + element count`, in addition to evaluating or importing its children |
| Construct/import a record | `1 + field count + sum(fieldName.length)`, in addition to its children |
| Append to a list | `2 + old element count`, after evaluating the list and element |
| Compare integers or begin a string comparison | `1` |
| Compare string characters | `1` per pair of code units inspected, stopping at the first difference or shorter length |
| Compare values structurally | `1` per pair of values visited; strings use the comparison charges above; each inspected record field adds `1 + name.length` |
| Test membership | Structural comparison charges until the first equal element or end, then scalar construction for the Boolean result |
| Export output | Visit every occurrence; per scalar/list/record visit, use the same shallow charges as construction above |

Equality visits lists in element order. Records imported from canonical input or literals use canonical key order; constructed records retain their field-array order for traversal. Record equality still depends only on field names and structurally equal values. Equality does not bypass traversal when internal storage happens to be shared. Scalar equality treats negative zero as zero.

Sorting uses bottom-up stable merge sort with run widths `1, 2, 4, ...`. It first charges `1 + length` to reserve and copy the input; for two or more elements it also charges `length` for the temporary buffer. Each merge pass scans adjacent runs from left to right, charges `1` for each output slot, and charges the comparison rules above when both runs have a candidate. Equal elements are taken from the left run first. The two buffers alternate between passes. Sorting does not delegate metering to an engine-dependent native comparator schedule.

`length`, `not`, and comparison results construct their scalar result after evaluating operands. Short-circuit operators evaluate only the selected operands and reuse the selected Boolean value. Unselected branches and unevaluated later operands incur no execution charge, although static validation checks them. Empty loop bodies still incur block-entry work, and conditions are reevaluated, so a nonterminating loop cannot avoid exhaustion.

### Depth and diagnostics

Evaluation depth counts active function, block, and expression evaluations. Statements, scalar/value traversal, and loop iteration count are not separate depth increments. A completed evaluation releases its depth. Each loop body has a fresh lexical scope; iterations do not accumulate depth. The hard depth ceiling prevents a valid but deeply nested acyclic call chain from exhausting the host call stack.

Each diagnostic contains `phase`, `path`, and an entry-to-current `call_stack`. A frame contains `function_id` and `call_path`. The entry frame has `call_path: /entry_function`; other call paths identify the invoking expression. A frame may identify an attempted callee entry whose depth charge was rejected.

| Phase | Path meaning |
| --- | --- |
| `arguments` | Value being imported below `/arguments`; call stack is empty |
| `execution` | JSON Pointer into the program, including a literal's data when import exhausts a limit |
| `result` | `/result/value` or `/result/details`; IR calls have unwound and the call stack is empty |

Application failures retain the original `fail` statement's diagnostic through all callers. Runtime faults identify the indexing or arithmetic expression. Resource diagnostics identify the first rejected charge. Diagnostic messages and source positions aid inspection; they do not alter the application's declared failure code or payload.

## Verification and remaining scope

`npm run test:program` checks static validation and independent execution expectations. The [interpreter tests](../../tests/program-execution.test.mjs) cover scalar and collection semantics, operand order, short-circuiting, lexical scope, loop completion, calls, declared failures, faults, ownership, deterministic resource accounting, and exhaustion within primitives and output copying.

[Required dependency closure](../02-semantics/06-required-dependency-closure.md) is an authored Program IR workload whose traversal, lookup, ordering, and failures execute through this interpreter. Independent graph-domain expectations evaluate the algorithm separately from the language tests. The production context assembler continues to use its TypeScript kernel. Program CLI integration is the next step in the [implementation plan](../05-development/04-program-ir-plan.md); self-hosting and source backends remain subsequent work.
