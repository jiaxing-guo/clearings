# Program artifacts and validation

Program IR v0.1 is a standalone implementation artifact with `kind: program`. Its [JSON Schema](../../schemas/program.v0.1.json) and [TypeScript interfaces](../../src/program/model.ts) define its portable syntax. The [language reference](../02-semantics/05-program-ir.md) defines typing, evaluation, control flow, calls, and failure propagation. The APIs on this page check static validity. The separate [execution API](07-program-execution.md) invokes the reference interpreter after validation.

## Validate an authored example

Build with `npm run build`, then use the dedicated package entrypoint:

```js runnable
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProgram, sealProgram, programIdentity } from 'clearings/program';
const program = JSON.parse(readFileSync('programs/examples/sum-nonnegative.json', 'utf8'));
const original = structuredClone(program);
assert.equal(validateProgram(program), undefined);
assert.equal(programIdentity(program), program.artifact_id);
assert.deepEqual(sealProgram(program), original);
assert.deepEqual(program, original);
assert.equal('acceptance' in program, false);
```

This example invokes the validator. Use [`executeProgram`](07-program-execution.md#execute-an-authored-program) to execute the program. Program IR CLI commands remain planned; existing `clearings validate` dispatch does not accept this artifact family.

## Program and function records

| Program field | Meaning |
| --- | --- |
| `schema_version` | Exactly `0.1.0`; independent of the v0.3 contract format |
| `kind` | Exactly `program` |
| `artifact_id` | `program:` followed by the SHA-256 digest of canonical content excluding this field |
| `name` | Nonempty descriptive text; included in identity |
| `entry_function` | ID of a function defined in this artifact |
| `functions` | One through 128 function definitions; IDs unique across the program |

| Function field | Meaning |
| --- | --- |
| `id` | Canonical function ID |
| `parameters` | Ordered `{ name, type }` declarations; at most 64, with unique names |
| `returns` | Exact return type; required even for a function whose body only fails |
| `failures` | At most 64 unique `{ code, details }` declarations; `details` is a payload type |
| `body` | Nonempty array of typed statements with explicit completion |

Function IDs, binding names, field names, and failure codes match `[A-Za-z_][A-Za-z0-9_]*`. They are resolved through own fields or maps, including names such as `constructor` and `__proto__`. Record values must contain exactly their declared fields. Unknown artifact fields, statement kinds, expressions, operators, and types are rejected.

The call graph is derived from actual `call` expressions, never from strings inside literal values. Functions and calls express implementation behaviour. They do not acquire an implicit relation to a contract operation merely by sharing its name. There is no contract-to-program synthesis or observation adapter in this change.

## Library interfaces

| API | Contract |
| --- | --- |
| `programIdentity(program)` | Check portability and an object root, then compute identity. Does not validate syntax, references, or types. Accepts a `Program` or a program without `artifact_id`. |
| `sealProgram(program)` | Check portable input before copying, compute identity, normalize, statically validate, and return an owned `Program`. An existing stale identity is replaced. |
| `validateProgram(value)` | Assert portable syntax, identity, lexical scope, types, completion paths, failure propagation, and an acyclic call graph. Returns `undefined` on success. |
| `PROGRAM_VALIDATION_LIMITS` | Frozen limits for portable values, declared type depth, and static semantic work. |

The library subpath is `clearings/program`; the schema subpath is `clearings/schemas/program`. Public types are `Program`, `ProgramFunction`, `ProgramType`, `ProgramValue`, `ProgramExpression`, and `ProgramStatement`. TypeScript's `number` in `ProgramValue` represents runtime storage; validation restricts it to safe integers. Historical root exports, contract types, and evaluation artifacts retain their existing interfaces.

Identity uses the project's existing canonical JSON serializer. Object-key order is insignificant, while function, parameter, statement, operand, and record-constructor field arrays retain order. All other fields contribute to identity. A changed algorithm, signature, failure declaration, or name changes the identity. Hashes establish content integrity, not author authentication, conformance, or execution.

## Diagnostics

Errors have `code: INVALID_PROGRAM`, `exitCode: 2`, and `details: { path, rule }`. `path` is a JSON Pointer into the caller's program; an empty path names the document root. Portability errors also use `INVALID_PROGRAM`, wrapping the shared guard's message without evaluating accessor fields. The validator reports the first detected defect, not an exhaustive diagnostic collection.

| Rule | Defect |
| --- | --- |
| `portability`, `schema`, `identity` | Invalid portable data, unsupported shape/domain/version, or stale content identity |
| `duplicate-function`, `duplicate-binding`, `duplicate-field`, `duplicate-failure` | Nonunique declarations or shadowing of an active binding |
| `reference`, `scope`, `field`, `arity` | Unresolved function/entry, unavailable binding/field, or incorrect call argument count |
| `type`, `literal`, `immutable` | Incompatible structural types, invalid typed literal, or assignment to an immutable binding |
| `failure`, `failure-propagation` | Undeclared application failure or missing caller failure declaration |
| `fallthrough`, `unreachable`, `recursive-call` | Missing explicit completion, a statement after guaranteed completion, or a recursive call cycle |
| `type-depth`, `work-limit` | A static validation resource bound is exceeded |

Validation proceeds through portability, schema, identity, signature declarations, function bodies, and call-cycle checks. Syntactically valid arithmetic overflow, dynamic indexing faults, and nontermination remain runtime concerns. A program rejected because of a validator resource limit has not been classified as behaviourally incorrect.

## Resource bounds

Portable input is limited to 50,000 visited values and the shared guard's nesting depth of 64. Repeated object references are visited again; cycles are rejected. Declared types permit 16 constructor edges from root to leaf. The schema limits function, parameter, failure, and argument counts as above.

Static semantic checking permits 200,000 charged operations. Charges cover visits to type constructors, expression/statement nodes, literal-value validation, recursive type comparisons, copied lexical bindings, and call-graph edges. The bound prevents repeated comparisons of large declared types from growing without a cumulative limit. These are validator bounds, not execution fuel, a wall-clock guarantee, or a byte-size cap on strings or input files.

## Reproduce the schema and checks

```bash
python3 scripts/generate-program-schema.py
npm run test:program
```

The generator writes only `schemas/program.v0.1.json`. Its reproducibility test compares a separately generated schema with the committed bytes. Validation examples and tests are separate from the later dependency-closure implementation and its independent execution tests. See the [Program IR implementation plan](../05-development/04-program-ir-plan.md).
