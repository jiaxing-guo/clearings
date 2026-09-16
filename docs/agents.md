# Use Clearings with a coding agent

Choose a repeated task first: gathering repository context, grouping logs, or normalizing exported data are examples. The coding agent records its inputs and expected behavior, writes TypeScript, and evaluates it. Once activated, the same routine can run on fresh inputs. Unfamiliar cases return to the agent through `needs_agent` or `not_applicable`.

## Advanced local CLI

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

The transport implements the [MCP 2025-06-18 stdio lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) and tool calls. It advertises tools only and processes requests sequentially. Workers enforce deadlines. Cancellation notifications do not interrupt an already running operation in this first version; a client can terminate the server process. The MCP server has no HTTP listener, sampling or telemetry upload. Background model requests run through the separately started, project-authorized worker.

## Codex and Claude Code

Use the [plugin installation](installation.md) for the normal developer experience. The Codex plugin lives in `plugins/clearings`; the Claude Code plugin lives in `integrations/claude-code/plugins/clearings`. Each includes its MCP registration, native launcher, and focused skills for learning, reuse, and management. Install once at user scope, then open any project normally. There is no per-project server registration or policy file.

The client SessionStart hook automatically registers the working project from trusted host context. For a complete matching invocation hint, the agent calls `clearings_run_routine` directly with the actual project `path`, hinted routine `id`, `expected_version`, `expected_capabilities`, and fresh `input`. The host selects the already-registered project and checks its current grants. Other project-scoped operations start with `clearings_open_project`, which returns the canonical project, effective read grant and existing settings. It reconnects when the user changes projects; the MCP process's launch directory is irrelevant.

A useful first instruction is: “Make this repeated task reusable with Clearings. Preserve the inputs and rules we just agreed, and return unfamiliar cases to me.” A new conversation in that project can discover the same saved routine. To test continuity, change a source file and ask for the same task again: the reused routine should read fresh data. Open a second repository and verify its grants remain separate; shared definitions should be discoverable there. Return to the first repository and verify the original routine and history are still present.

For local plugin development, a packaged Claude plugin can also be loaded with `claude --plugin-dir /absolute/path/to/clearings/integrations/claude-code/plugins/clearings`. The standalone CLI and manually bound MCP configuration above remain available for advanced hosting and clients without plugins.

## What has been checked

The CLI/MCP transport tests exercise initialization, task preparation, rejection before evaluation, activation, fresh input reuse, explicit handoff, and refusal of policy arguments supplied by a tool caller. Plugin tests also exercise host registration, rejection of unregistered directories, automatic root selection from an unrelated launch directory, concurrent project isolation, persistent history, restricted grants, failed project switches, verified downloads and offline reconnection. Packaged plugins are copied into a simulated client cache and launched without language runtimes on `PATH`. These deterministic checks remain separate from the [real-client acceptance record](launch-readiness.md). Token savings require observed usage from real agent sessions; missing usage stays unknown.

Task and version objects are rejected before storage if they exceed the inspection budget (about 1.3 MiB). `inspect` returns the complete object and a compact evaluation summary; `evaluate` returns the immutable full evaluation report. This keeps accepted requirements inspectable through the same CLI/MCP interface.

## Project reuse and background work

The plugin sets up project reading and on-demand reuse automatically. For advanced manual hosting, configure [project authorization](projects.md), add `--project PROJECT_ID` to the server command and keep its policy equal to the configured grants. Both interfaces expose named discovery, saving, reuse, observation and management within the selected project. Use the management skill for default learning preferences; explicit project settings remain available for advanced hosts.

The host agent can record actual completed work with `clearings_record_observation` only when `record_conversations` is enabled. The project worker can then create routines without a save prompt on every workflow. Start that worker separately with `background`, or schedule `background --once`. See [background behavior](background.md), [activity formats](activity.md) and [management commands](management.md).

The automatic lifecycle has deterministic local HTTP-fixture tests, including withheld examples, reuse after reopening the database, measured read reduction and recovery from a live regression. These do not demonstrate a hosted model's routine quality or end-to-end token savings.

## Quiet discovery and shared routines

The plugin's prompt hook performs a bounded local lookup and supplies up to three matching accepted routines. It does not call a model, block ordinary work, or announce an empty result. A candidate is offered once per session/version. Complete hints include the input/output contract, applicability, version and available resource aliases, so a clear match needs only one execution call. The reuse-work skill handles missing hints, ambiguous matches and recovery. Matching remains an agent decision and requires real host-interaction testing.

`find_routines`, `library_routine`, and `run_routine` support this flow. After saving generic behavior, the agent can call `share_routine` with its applicability. The same definition and version then become discoverable in other projects. Source-project grants do not transfer: execution uses the receiving project's grants and named resources. `pause_shared` pauses use in one receiving project. The originating routine's pause/exclusion and active-version controls still apply.

Discovery uses a local full-text index of routine names, descriptions, and applicability. At most 500 eligible exact-token matches reach usage ranking, and only three are returned. The index is populated during migration and maintained when metadata changes; prompt hooks do not scan complete task bodies during ranking. The hook loads only the selected tasks to attach their contracts.

`library_routine` returns a compact requirements summary and usage. Its optional `part: task` or `part: version` returns one complete stored object, preserving shared/current-project authorization and transport limits. Large summaries explicitly request a detailed task read before reuse.

Direct invocation uses the same execution result and approval annotations as ordinary routine execution. Direct calls supply `expected_version` and `expected_capabilities` together. Both must match the selected active routine; stale or inconsistent hints fail before execution. The capability list restricts execution rather than granting access. Passing `path` is available only in the user-wide plugin and cannot register a new directory or accept grants from the caller. Pause, exclusion, shared-definition and current-project policy checks remain in force.

A hint whose contract and applicability exceed 16 KiB requests inspection instead of supplying a truncated contract. Detailed examples, provenance and usage remain available through inspection tools.

### Callable invocation hints

Complete hints include the argument declaration for the bundled Codex code-mode callable, `tools.mcp__clearings__clearings_run_routine`. The agent can invoke it without a separate declaration lookup. Other clients use their exposed MCP tool; a renamed or unavailable callable still requires client-side discovery. The hint supplies no new permission: host approval, version checks, capability matching and current project grants remain in force.
