# Three user-defined workflows

These examples use the same task format, TypeScript worker and capability interface. None is built into the runtime. Their behavior is deliberately small enough to review before reuse.

| Example              | Repeated work replaced                                                | Varying inputs                            | Boundary                                                     |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `repository-context` | Read selected files, deduplicate paths and collect their current text | Granted root and file paths               | More than 20 unique files returns to the agent               |
| `group-logs`         | Parse JSON lines and count repeated level/message pairs               | Granted log file and its current contents | Unsupported records or oversized samples return to the agent |
| `normalize-contacts` | Trim fields, normalize email casing, deduplicate and sort             | Contact rows                              | Missing or visibly invalid fields return to the agent        |

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

The package check teaches all three routines using the CLI, evaluates and activates them, then makes seven executions. It verifies a file changed after activation, an unseen log sample, an unseen contact input and an explicit handoff. Each executable invocation receives an empty `PATH`, with no Node, Python, npm or Rust compiler available. Python orchestrates the build-time check outside the installed runtime.

`runs` records results, elapsed execution time and capability-call counts. Missing model usage is `null`; token savings are not inferred from a successful run or a shorter output. The runtime itself calls no model, while authoring, choosing a routine and interpreting its result still consume agent work. These examples establish reusable execution, not a measured reduction in total agent cost.
