# Use Clearings with a coding agent

Choose a repeated task first: gathering repository context, grouping logs, or normalizing exported data are examples. The coding agent records its inputs and expected behavior, writes TypeScript, and evaluates it. Once activated, the same routine can run on fresh inputs. Unfamiliar cases return to the agent through `needs_agent` or `not_applicable`.

## Local CLI

Create a private directory for the SQLite store and a JSON policy file containing the file roots and named HTTP bindings you grant. `{}` grants no host capabilities. Paths in policies are resolved relative to the launching process; use absolute paths for agent integrations.

The commands share the same implementation as MCP:

```sh
clearings --store /absolute/private/state.db prepare-task task.json
clearings --store /absolute/private/state.db submit --task TASK_ID --source routine.ts
clearings --store /absolute/private/state.db evaluate VERSION_ID
clearings --store /absolute/private/state.db activate VERSION_ID
clearings --store /absolute/private/state.db run TASK_ID --input input.json --policy policy.json
clearings --store /absolute/private/state.db runs
```

Use the IDs returned by the previous commands. `list` discovers tasks, `inspect ID` shows requirements or version source and evaluation, and `sdk` prints the TypeScript declarations. Replacing an active version requires `activate VERSION_ID --expected-active PREVIOUS_VERSION_ID`. `deactivate TASK_ID --expected-active VERSION_ID` stops reuse while preserving history. Failed execution and rejected evaluation print their JSON result and return a nonzero exit status. Argument, configuration and lifecycle errors return a nonzero exit status with a diagnostic on stderr; they do not promise JSON on stdout. `run-source` retains its top-level run fields (`outcome`, `elapsed_ms`, `capability_calls`, `model_usage`); stored `run` results include the record metadata and a nested `run` object.

Task discovery returns up to 100 tasks per page. Continue a non-null `next_after` with `list --after TASK_ID` or `clearings_list` arguments `{"after": TASK_ID}`. The database query selects task summaries without loading acceptance bodies. Activation and deactivation advertise that they may replace or remove existing state through the MCP destructive hint.

History returns up to 100 records per page, with a byte budget applied while reading the database. When `next_before` is non-null, continue with `runs --before ID` or `clearings_runs` arguments `{"before": ID}`. A record larger than the page budget produces an explicit error; its ID can be used as `before` to retrieve earlier records. The MCP transport includes the terminating newline in its 4 MiB limit.

## MCP

Run this command as a local stdio MCP server:

```sh
/absolute/path/clearings --store /absolute/private/state.db mcp --policy /absolute/private/policy.json
```

The server exposes `clearings_list`, `clearings_inspect`, `clearings_sdk`, `clearings_prepare_task`, `clearings_submit`, `clearings_evaluate`, `clearings_activate`, `clearings_deactivate`, `clearings_run` and `clearings_runs`. Store location and grants come from server startup, not tool arguments. Restart the server to change its policy. Client approval controls remain in force; the runtime does not grant the outer coding agent additional permissions.

The transport implements the [MCP 2025-06-18 stdio lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) and tool calls. It advertises tools only and processes requests sequentially. Workers enforce deadlines. Cancellation notifications do not interrupt an already running operation in this first version; a client can terminate the server process. There is no HTTP listener, sampling, telemetry upload or model API dependency.

## Codex and Claude Code

The repository supplies small skill plugins in `integrations/codex/clearings` and `integrations/claude-code/clearings`. They teach the same prepare, submit, evaluate, activate and reuse workflow. Plugin installation does not register a server or alter permissions automatically. Register the executable separately using your client's local MCP settings and the command above, then enable the corresponding skill plugin. In clients without plugin support, the CLI works directly.

For Codex CLI, a standard registration is:

```sh
codex mcp add clearings -- /absolute/path/clearings --store /absolute/private/state.db mcp --policy /absolute/private/policy.json
```

For Claude Code, use its local stdio MCP registration or load the skill plugin during development with `claude --plugin-dir /absolute/path/to/integrations/claude-code/clearings`. Registration is a user setup step; this repository does not write client configuration while building or testing. See [Codex MCP configuration](https://developers.openai.com/codex/mcp) and [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference) for current installation behavior.

A useful first instruction is: “Make this repeated task reusable with Clearings. Preserve the inputs and rules we just agreed, and return unfamiliar cases to me.” A new conversation can discover the same stored task. Clearings does not scan other conversations or require a selected workflow to fit a built-in template.

## What has been checked

The CLI/MCP transport tests exercise initialization, task preparation, rejection before evaluation, activation, fresh input reuse, explicit handoff, and refusal of policy arguments supplied by a tool caller. These are deterministic integration tests, not a claim that a hosted Codex or Claude conversation has been run. Token savings require observed usage from real agent sessions; missing usage stays unknown.

Task and version objects are rejected before storage if they exceed the inspection budget (about 1.3 MiB). `inspect` returns the complete object and a compact evaluation summary; `evaluate` returns the immutable full evaluation report. This keeps accepted requirements inspectable through the same CLI/MCP interface.
