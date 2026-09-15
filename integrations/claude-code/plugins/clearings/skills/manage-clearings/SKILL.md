---
name: manage-clearings
description: Inspect Clearings learning and routine use, change its schedule or preferences, pause or resume learning, exclude work, and undo an automatic change through conversation.
---

Read `clearings_learning_status` to resolve the current preferences, service health, recent learning results, and actual routine use. This works before selecting a project. Explain only the information relevant to the request. Missing usage is unknown; execution counts do not prove savings.

Use `clearings_learning_preferences` with the returned revision and only the requested changes. Preserve all other settings and list entries. The defaults already work; do not ask users to choose a model, budget, source, or schedule during setup.

| User intent                                | Change                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Pause or resume learning                   | `learning_enabled: false` or `true`                                                                   |
| Stop or resume suggestions                 | `suggestions_enabled: false` or `true`                                                                |
| Daily, twice daily, every two days, weekly | `interval_seconds: 86400`, `43200`, `172800`, or `604800`                                             |
| Stop automatic optimization                | `improve_enabled: false`                                                                              |
| Exclude a project or workflow              | Add its known name/path to `excluded_projects`, or its routine name/prefix to `excluded_workflows`    |
| Use a different client or model            | Set the explicitly requested `client` (`codex`/`claude`) or `model`; `null` restores automatic choice |

An installation with `--no-service` keeps `service_enabled: false` across updates and startup. To restore automatic learning when requested, set `service_enabled: true`; the next trusted client session installs its schedule.

Pausing learning preserves saved routine execution. Muting suggestions preserves learning. After a stale-revision error, reread status and apply the requested change to the new settings. Do not retry a changed or ambiguous target blindly.

For “undo the last automatic change,” take `service.latest_automatic_change.version` from status and call `clearings_undo_learning` with that `expected_version` and `scope: all`. This restores the prior accepted version, or deactivates a newly created routine. Definitions and evidence remain available. For a named routine, inspect its current state first; use `clearings_manage` for owner-project controls or `clearings_pause_shared` to stop using a shared routine only in the current project. Resolve IDs through the tools; do not ask users for IDs or configuration files.

For an immediate review, connect to the actual project with `clearings_open_project`, then call `clearings_learn_now`. Its default scope is the project; use `all` when the request covers recent work across projects. The call queues work, so report completion only after status records it. The bundled learn-from-conversations skill supports an active-agent review without another background authoring request.

Keep empty or unchanged checks quiet. Report a connection or service failure once when it affects the user's request, with the specific client action needed. Do not invent credentials, clear existing restrictions, or switch providers to bypass a failed sign-in.
