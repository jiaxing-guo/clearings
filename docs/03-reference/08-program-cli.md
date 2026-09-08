# Program CLI and reports

The `clearings program` command group validates, inspects, and executes [Program IR artifacts](06-program-artifacts.md). It provides file input/output around the existing reference interpreter and deterministic Markdown projections. It does not alter the language, interpreter version, or resource-accounting rules.

From a source checkout, use `npm run program -- demo`. The script builds the CLI and forwards the arguments after `--`. For a worked graph example, read [Run and inspect a Program IR algorithm](../04-guides/05-run-programs.md).

## Commands

| Command                                                       | Input and behavior                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `clearings program` or `clearings program --help`             | Display group help; no program execution                                                        |
| `clearings program list`                                      | List bundled names, descriptions, and entry functions; JSON also includes program identities    |
| `clearings program validate <name\|program.json>`             | Check static validity and content integrity; report `valid: true` and `executed: false` in JSON |
| `clearings program inspect <name\|program.json>`              | Validate and display every function; JSON emits the complete validated artifact                 |
| `clearings program run <name\|program.json> <arguments.json>` | Execute the entry function with an explicit JSON array of positional arguments                  |
| `clearings program demo [name]`                               | Execute a bundled program with authored example arguments; defaults to `closure`                |

Names are case-sensitive. `closure`, `identity`, and `sum` resolve to packaged program JSON files. A name takes precedence over a same-named local file; use `./sum` to select that file explicitly. Other sources are local file paths relative to the working directory. `demo` accepts only bundled names. `run` requires an arguments file, including `[]` for an entry without parameters.

| Name       | Program                                                                                  | Authored arguments                                                                   | Expected return                |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| `closure`  | [Required dependency closure](../../programs/clearings/required-dependency-closure.json) | [Graph example](../../programs/clearings/required-dependency-closure.arguments.json) | `["root", "a", "z", "y", "b"]` |
| `identity` | [String identity](../../programs/examples/identity.json)                                 | [One string](../../programs/examples/identity.arguments.json)                        | `"Clearings"`                  |
| `sum`      | [Sum nonnegative integers](../../programs/examples/sum-nonnegative.json)                 | [One integer list](../../programs/examples/sum-nonnegative.arguments.json)           | `5`                            |

Named assets are loaded from paths relative to the installed package. Program validation checks their content identities on each invocation. The CLI does not load the closure's JavaScript authoring module or delegate traversal to a host implementation.

## Formats and file output

All five actions accept `--format markdown|json` and `--out new-file`. Markdown is the default. Unsupported actions, positional counts, formats, or action-specific options are rejected.

| Action        | JSON stdout                                                                                    | Markdown stdout                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `list`        | Array of `{ name, description, program_id, entry_function }`                                   | Catalog table                                                                  |
| `validate`    | `{ program_id, valid: true, executed: false }`                                                 | Static-validation result and identity                                          |
| `inspect`     | Complete `Program` artifact, retaining its identity                                            | Metadata and typed pseudocode for all functions                                |
| `run`, `demo` | Exact [`ProgramExecutionResult`](07-program-execution.md#library-interfaces-and-result-fields) | Completion, value or failure details, diagnostic, identity, and resource table |

`demo` labels its authored input and fresh execution in Markdown. In JSON mode, the label goes to stderr so stdout remains the exact interpreter result. To parse stdout through npm, use `npm run --silent program -- demo --format json`; an installed `clearings` command does not add npm headings.

Input files must be regular UTF-8 JSON files of at most 8 MiB each. The CLI bounds bytes read before parsing and rejects directories, devices, and FIFOs. The interpreter's separate portability, preparation, and execution limits still apply. Reading a small enough file does not guarantee acceptance by those limits.

`--out` creates missing parent directories and opens the destination exclusively. Existing files and symlinks, including dangling symlinks, are rejected. It can name a new file inside the working checkout; Program IR execution does not scan a target repository. Validation or execution-preparation errors create no report. A completed interpretation, including failure or exhaustion, can be saved with its corresponding nonzero exit status.

Successful file output is UTF-8 with a final newline and the same bytes as non-terminal stdout. Terminal output escapes control characters; piped output and saved files retain their data. Diagnostic input errors use the CLI's existing JSON failure envelope, with `details: { path, rule }` retained for Program IR validation and execution-preparation errors. Stderr also receives a concise error message.

## Execution limits and exit status

Only `run` and `demo` accept resource options. Values must be positive decimal integers without signs, fractions, exponents, or leading zeroes. Omitted limits use the [interpreter defaults](07-program-execution.md#execution-limits).

| CLI option             | Library option     |
| ---------------------- | ------------------ |
| `--work n`             | `work`             |
| `--allocation-units n` | `allocation_units` |
| `--value-units n`      | `value_units`      |
| `--evaluation-depth n` | `evaluation_depth` |

The CLI uses `PROGRAM_EXECUTION_MAX_LIMITS` for the ceilings and passes admitted options directly to `executeProgram`. A limit cannot be raised beyond that ceiling. Static inspection has validator bounds and the CLI file-size bound, without interpreter execution charges.

| Exit status | Meaning                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `0`         | Help, listing, successful static validation/inspection, or returned value                                |
| `1`         | Application failure, runtime fault, or an unexpected operational failure                                 |
| `2`         | Invalid command/options, unreadable or invalid input, preparation failure, or output-file conflict/error |
| `3`         | Resource exhaustion during interpretation                                                                |

Application failure and runtime fault share a process status but retain distinct completion kinds. Invalid input is a rejected invocation, not a program completion. Exhaustion retains the resource, limit, phase, JSON Pointer path, and call stack specified by the interpreter.

## Inspection notation and library renderers

`clearings/program` exports two deterministic Markdown renderers:

| API                                                              | Contract                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `renderProgram(program: Program): string`                        | Validate the artifact, preserve caller data, and display its metadata and complete typed function bodies without execution |
| `renderProgramExecution(result: ProgramExecutionResult): string` | Format an interpreter result without mutation or re-execution; expects a result produced by the library                    |

The listing renders parameter, return, local-binding, list-element, literal, and failure-payload types. `let` declares an immutable binding; `var` declares a mutable binding. Braces preserve block structure, assignment updates bindings, and `if`, `while`, `return`, and `fail` retain their control-flow meanings. Binary expressions are parenthesized. Record-constructor fields and other operand arrays retain evaluation order.

`call f(...)` denotes an IR-defined function invocation. `length`, `append`, `contains`, and `sort` denote language primitives. `literal<T>(value)` distinguishes a typed literal from expression syntax. Function comments identify their `/functions/<index>` locations in the canonical artifact. String data and metadata are quoted inside fences that remain valid even when the data contains backticks.

This notation is a presentation projection with no parser or source-backend contract. JSON remains the full implementation representation. The execution report preserves every returned value or failure payload and labels cumulative work/allocation separately from peak admitted value size/depth. Renderers do not validate saved evidence, authenticate executions, or establish conformance. The program CLI provides no replay command or new execution-record schema.
