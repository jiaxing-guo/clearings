# Agent integration

Clearings exposes one lifecycle through CLI and MCP. The Codex and Claude Code plugins add user-wide installation, trusted project startup, prompt hints, and focused skills.

## Normal client flow

A trusted SessionStart hook registers the actual working project and its read grant. `clearings_open_project` selects an existing registered path. Tool arguments cannot register an arbitrary directory or grant new access.

The UserPromptSubmit hook performs a bounded local lookup. It offers up to three accepted routines and stays quiet when nothing fits. Matching uses a local full-text index and recorded real reuse. A complete hint includes the contract, version, capability signature, resource aliases and callable declaration.

For a clear match, call `clearings_run_routine` directly with the actual project path, hinted identity/version/capabilities, and fresh input. No preparatory open, inspection, skill read, or declaration lookup is needed. Inspect when the hint is incomplete, the match is ambiguous, or the version is stale.

An explicit example trial uses `purpose: test`. Normal task execution uses `reuse`. These labels do not change grants or isolation.

## Teaching and management

- `learn-from-conversations` reads relevant evidence, defines criteria, prepares the task, authors source, and saves a passing routine.
- `reuse-work` handles discovery when a complete hint is unavailable, plus ambiguity and recovery.
- `manage-clearings` handles status, library/workbench access, preferences, pause, exclusion, and undo.

The user has already authorized the requested learning or saving work. Agents should not ask for confirmation at every reversible step or make the user manage IDs and configuration files.

## SDK and lifecycle

Read `clearings_sdk` before authoring. It supplies TypeScript declarations, task examples, capability fixture shapes, and a file-backed wrapper.

The lifecycle operations are prepare, submit, evaluate and activate. Friendly named operations include `save` and `reuse`. Runtime execution returns explicit outcomes and retained run evidence. Replacement and rollback use expected versions to protect concurrent changes.

MCP also exposes conversation reading, library inspection, usage, background status and controls. The local workbench uses the same project API and permissions.

## Advanced CLI hosting

A manual host can choose a private store and fixed policy:

```sh
clearings --store /private/state.db prepare-task task.json
clearings --store /private/state.db submit --task TASK_ID --source routine.ts
clearings --store /private/state.db evaluate VERSION_ID
clearings --store /private/state.db activate VERSION_ID
clearings --store /private/state.db run TASK_ID --input input.json --policy policy.json
```

The agent uses IDs returned by those commands. Project-bound stores also select the owning project. `mcp` serves a manually bound interface; `plugin-mcp` serves registered working projects. Standalone `run-source` is useful for development and diagnostics.

History, library, and task lists are bounded and paginated. Follow the returned cursor. The transport's 4 MiB message limit includes framing, and oversized records produce explicit errors.

The coding client owns its approval policy. Remembered tool consent belongs to that client; Clearings keeps enforcing its own grants and version checks independently.
