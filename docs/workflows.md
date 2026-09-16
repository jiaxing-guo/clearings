# Three user-defined workflows

These examples use the same task format, TypeScript worker and capability interface. None is built into the runtime. Their behavior is deliberately small enough to review before reuse.

| Example              | Repeated work replaced                                                | Varying inputs                            | Boundary                                                                   |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `repository-context` | Read selected files, deduplicate paths and collect their current text | Granted root and file paths               | More than 20 unique files returns to the agent                             |
| `group-logs`         | Parse JSON lines and count repeated level/message pairs               | Granted log file and its current contents | Unsupported records, read failures or over 5,000 lines return to the agent |
| `normalize-contacts` | Trim fields, normalize email casing, deduplicate and sort             | Contact rows                              | Missing or visibly invalid fields return to the agent                      |

The context example hands off above 20 unique files. The log example hands off for read failures and its stated record/line boundaries. Other configured resource limits, including an oversized combined context result, return an explicit `failed` outcome without partial output; the examples do not duplicate the runtime's byte-budget enforcement.

Each example directory contains `task.json`, `routine.ts`, `input.json` and `policy.json`. The task records acceptance inputs and independent expected outcomes. File-reading examples include fixtures for evaluation and sample data for live runs. Tests also exercise input changes after activation, handoff, version replacement and restoration of an earlier version.

## Try one

From the checkout or extracted package, create a private directory for your state database. Use the commands below with a chosen absolute store path. Substitute the IDs printed by the first two commands.

```sh
./clearings --store /absolute/private/state.db prepare-task examples/normalize-contacts/task.json
./clearings --store /absolute/private/state.db submit --task TASK_ID --source examples/normalize-contacts/routine.ts
./clearings --store /absolute/private/state.db evaluate VERSION_ID
./clearings --store /absolute/private/state.db activate VERSION_ID
./clearings --store /absolute/private/state.db run TASK_ID --input examples/normalize-contacts/input.json --policy examples/normalize-contacts/policy.json
```

In a source checkout, replace `./clearings` with `target/release/clearings` after building. Sample file policies use paths relative to the package or repository root. Configure absolute roots when connecting an agent.

Change the input and run again. For a real task, ask your existing coding agent to record the rules you want, prepare acceptance cases, and write the small routine. Use ordinary reasoning for work that still requires judgment.

## Evidence and limits

The package check teaches all four routines using the CLI, evaluates and activates them, then makes eight executions. It verifies a file changed after activation, an unseen log sample, an unseen contact input and an explicit handoff. Each executable invocation receives an empty `PATH`, with no Node, Python, npm or Rust compiler available. Python orchestrates the build-time check outside the installed runtime.

`runs` records results, elapsed execution time and capability-call counts. Missing model usage is `null`; token savings are not inferred from a successful run or a shorter output. The runtime itself calls no model, while authoring, choosing a routine and interpreting its result still consume agent work. These examples establish reusable execution, not a measured reduction in total agent cost.

## Normalize a file-backed contact export

`examples/normalize-contact-file/` wraps the contact transformation around a granted JSON file. The caller supplies only `{root, path}`. The worker reads the current document, validates its shape, and transforms its rows. Missing files and malformed JSON return to the agent explicitly.

This keeps the input document out of model-generated tool arguments. A routine still returns the complete requested output; file-backed input alone does not guarantee fewer output tokens. For audits and monitoring, design a compact result with counts, exceptions and source paths when that matches the user's request.

The SDK exposes the wrapper source and a small acceptance task. Prepare a new task for a wrapper rather than changing an existing inline-input contract. The existing `files.read` capability supplies all required access; no search, shell, or new grant is introduced.
