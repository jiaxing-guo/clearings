# Authored Program IR examples

These examples exercise the Program IR format, static validator, and reference interpreter. Their bodies are authored programs, not recorded execution evidence. Independent interpreter tests check the expected results below.

| Example | Constructs exercised | Expected result under the documented execution semantics |
| --- | --- | --- |
| [identity.json](identity.json) | Typed parameter reference and explicit return | The supplied string, including an empty string or Unicode text |
| [sum-nonnegative.json](sum-nonnegative.json) | Immutable parameters, mutable locals, indexing, length, branching, iteration, forward calls, arithmetic, and declared failure propagation | `[2, 0, 3]` yields `5`; `[]` yields `0`; `[2, -1, 3]` produces `NEGATIVE_VALUE` with details `-1` |

The sum example calls the IR-defined `nonnegative` function. It does not call host code. Its integer addition can also encounter an overflow runtime fault; that is distinct from the declared `NEGATIVE_VALUE` application failure. Static validation does not exclude either condition or prove termination.

`npm run test:program` validates these artifacts, checks malformed-program diagnostics, and executes independent language tests. The [execution reference](../../docs/03-reference/07-program-execution.md) shows how to run the sum example with `executeProgram` and inspect its result. Dependency closure remains reserved for its own implementation and evaluation change.
