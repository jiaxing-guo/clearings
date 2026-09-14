# Project authorization

Configure a project once through the host CLI. The saved identity uses the canonical project directory. A rename keeps that identity. Settings updates require the current revision, so concurrent changes cannot silently overwrite each other.

```sh
clearings --store /private/state.db project-configure --root /work/project --name "My project" --settings /private/settings.json
clearings --store /private/state.db --project PROJECT_ID project-status
```

A minimal settings file is `{}`. Automatic reuse starts disabled. Settings can select `trace_sources` (adapter and existing file or directory path), a `model` connection, `daily_budget_microusd`, `interval_seconds`, `min_occurrences`, `exclusions`, `retention_days`, and runtime `grants`. Model connections contain `url`, `model`, `bearer_token_env`, `max_output_tokens`, `input_price`, and `output_price`. Prices are conservative operator-supplied micro-USD per million tokens; the budget is micro-USD per day. These settings establish authorization; background execution is introduced separately.

To update, repeat `project-configure` with `--expected-revision` from the status response. Conversation tools can inspect settings but cannot enable observation, choose a model endpoint, increase spending, or grant file and HTTP access. Project MCP and run commands require the supplied policy to match the configured grants.

Project authorization covers reuse within the selected scope. It does not authorize unrelated tasks or new external effects. Missing sources or unavailable model credentials must remain explicit, and ordinary on-demand routine execution remains available.

The database migration preserves existing tasks, versions, evaluations and run history. Use a private directory for the database and settings. Credentials stay in the host environment rather than routine source or stored settings.
