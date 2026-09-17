# Manage Clearings

Use ordinary language in the coding client. The bundled management skill resolves names, reads current state, applies the requested change, and reports the result.

## Common requests

| Request                                      | Behavior                                                           |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Show Clearings status                        | Report learning, client access, recent results, and service health |
| What did you learn?                          | Show the working project's routine library                         |
| Open the workbench                           | Open the local visual library and test interface                   |
| Pause learning                               | Stop automatic learning; keep saved routines usable                |
| Learn twice daily, every two days, or weekly | Change the interval                                                |
| Stop suggestions                             | Disable prompt hints independently of learning                     |
| Exclude this project or workflow             | Remove it from learning scope                                      |
| Pause this routine                           | Preserve its records but stop reuse                                |
| Undo the last automatic change               | Restore the prior accepted version or deactivate the new routine   |

Workbench updates are user-directed changes. Use the named routine's undo control for them; the global automatic-change marker tracks automatic learning and improvement.

## Library and history

`clearings_library` and `library` expose a bounded, project-scoped view shared with the workbench. It includes names, examples, current versions, controls, recent calls, and whether undo is available. Follow `next_after` for more entries.

Run history is paginated and scoped to the receiving project. Large records and missing evidence remain explicit. A history record identifies the version used, not just the current routine name.

## Usage

Usage windows cover 7, 30, and 90 UTC calendar days, including today. `reuse_calls`, `test_calls`, and `unclassified_calls` are separate. These are caller-labelled observations, not a proof of savings. Acceptance evaluations are separate from real use.

Explicit trials use `run-routine --purpose test` or `purpose: test` through MCP. Test failures do not trigger automatic regression rollback. Only labelled reuse influences usage ranking and automatic-improvement eligibility.

Do not retire a routine merely because test or unclassified counts are low. Consider its purpose, age, recent real use, and whether another routine replaces it.

## Retention and retirement

`prune` previews expired activity and run records; `prune --apply` removes those records under the configured retention period. Compact usage totals, immutable requirements, versions, evaluations, budget records, and change history remain available. Pruning does not modify source conversations.

Retiring a routine deactivates it and preserves a paused, excluded record. It is not permanent data erasure. Pause, exclusion, and retirement never grant additional access.

## Advanced commands

The CLI and MCP also expose `routine`, `manage`, `digest`, `background-jobs`, `performance`, `model-usage`, and `runs`. Update operations use current revisions or versions where required. After a stale-state error, reread the target before retrying.

See [daily use](default-experience.md), [workbench](workbench.md), and [background learning](background.md).
