# Project authorization

## Plugin projects

Installing the plugin authorizes project read access across working projects. At the start of a session, the agent calls `clearings_open_project` with the session's actual absolute directory. The server finds the nearest enclosing Git repository or worktree, or uses the chosen directory when no Git marker exists. It resolves directory symlinks and rejects a home directory or filesystem root as a project. The MCP process may start from the installed plugin directory; its process directory never determines the working project.

Clearings creates the project record and a `repo` file-read grant automatically. Existing records retain their name, grants, exclusions and other settings. Selection belongs to the MCP connection, so concurrent conversations in different repositories do not change each other's project. A failed selection clears the previous binding. Runtime file capabilities remain confined to the selected project's grants; installation does not give a routine arbitrary filesystem access.

The default shared SQLite store is `~/Library/Application Support/Clearings/state.db` on macOS, or `$XDG_DATA_HOME/clearings/state.db` on Linux, falling back to `~/.local/share/clearings/state.db`. Clearings creates its private directory with permissions `0700`. `CLEARINGS_DATA_DIR` overrides that directory for migration or advanced hosting. Each project has its own routines and history within the store; state survives plugin updates and reinstalls. A directory move creates a different canonical identity; changing a project's display name preserves it.

The installation grants project reading and routine saving/reuse. It does not enable conversation recording, background generation, model spending or HTTP bindings. Existing manual settings remain available for those features. Project status reports the effective grants and settings.

If an operator changes grants, existing operational calls fail until the connection refreshes them. Plugin sessions can call `clearings_open_project` again; manually bound MCP sessions need a restart with the matching policy. Project status remains readable, and `runs` stays filtered to the selected project.

## Advanced manual configuration

Configure a project once through the host CLI. The saved identity uses the canonical project directory. A display-name change keeps that identity. Settings updates require the current revision, so concurrent changes cannot silently overwrite each other.

```sh
clearings --store /private/state.db project-configure --root /work/project --name "My project" --settings /private/settings.json
clearings --store /private/state.db --project PROJECT_ID project-status
```

A minimal settings file is `{}`. Background automation starts disabled; on-demand saving and reuse are available. Settings can select `trace_sources` (adapter and existing file or directory path), a `model` connection, `daily_budget_microusd`, `interval_seconds`, `min_occurrences`, `exclusions`, `retention_days`, and runtime `grants`. Model connections contain `url`, `model`, `bearer_token_env`, `max_output_tokens`, `input_price`, and `output_price`. Prices are conservative operator-supplied micro-USD per million tokens; the budget is micro-USD per day. Set `record_conversations: true` only when authorizing the connected agent to submit completed workflow observations. Set `automatic: true` to enable the separately started background worker; `improve: true` also permits measured replacement. See [background execution](background.md).

To update, repeat `project-configure` with `--expected-revision` from the status response. Conversation tools cannot enable observation, choose a model endpoint, increase spending, or alter existing file and HTTP grants. The plugin-only connection tool provisions a new project under installation authorization. Manually bound project MCP and run commands require the supplied policy to match the configured grants.

Project authorization covers reuse within the selected scope. It does not authorize unrelated tasks or new external effects. Missing sources or unavailable model credentials must remain explicit, and ordinary on-demand routine execution remains available.

The database migration preserves existing tasks, versions, evaluations and run history. Use a private directory for the database and settings. Credentials stay in the host environment rather than routine source or stored settings.

Project-bound tasks require their owning project on every CLI/MCP operation. The unscoped interface lists and operates on legacy tasks only.
