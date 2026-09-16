# Manage reusable work

Ask the coding agent to pause or resume learning, change the schedule, inspect what was learned or used, exclude a project, or undo the last automatic change. The bundled manage-clearings skill resolves names and revisions; users do not need IDs or configuration files.

`learning-status` is user-wide. `pause-learning`, `resume-learning`, `learning-schedule weekly`, `exclude-learning PROJECT`, `include-learning PROJECT`, and `undo-learning` use the default private store. The management tools update only requested preferences. Pausing learning preserves routine execution; muting suggestions preserves learning. Undo compares the currently active version before restoring a previous accepted version or deactivating a new automatic routine.

For agent authors and advanced hosts, ordinary CLI commands select the current project automatically. Explicit `--store` and `--project` remain available:

| Command                                                   | Result                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `discover`                                                | Names, active versions, origins and pause/exclusion status        |
| `routine NAME`                                            | Requirements, source, acceptance and controls                     |
| `save NAME --source routine.ts --expected-active VERSION` | Evaluate and activate a source revision                           |
| `manage NAME pause` / `resume`                            | Stop or resume routine execution                                  |
| `manage NAME exclude` / `include`                         | Exclude or restore participation in reuse and improvement         |
| `manage NAME retire --expected-active VERSION`            | Deactivate and leave an excluded, paused tombstone                |
| `manage NAME rollback --expected-active VERSION`          | Restore the previous automatic version                            |
| `digest --after CHANGE_ID`                                | Changes since the preceding digest cursor and latest job status   |
| `background-jobs`                                         | Job progress and failures                                         |
| `performance NAME`                                        | Version-linked retained runtime measurements                      |
| `model-usage`                                             | Provider usage when present, request failures and reserved budget |
| `prune` / `prune --apply`                                 | Preview or remove expired observation and run records             |

Pause and exclusion controls do not alter the routine's source or grant additional access. Resume does not remove an exclusion. Retirement keeps immutable evidence and prevents automatic rediscovery under the same name. It is not permanent erasure of stored source or acceptance cases. Requirements, versions, evaluations, change history and budget accounting remain available; an explicit future erasure feature would need to account for their references.

Authorized background cycles apply the configured retention period to raw observations and runtime reports. This does not delete the original transcript files or the examples already frozen into an accepted task. Performance reports describe retained run records. Compact routine-use aggregates survive raw-run pruning and report seven-, 30-, and 90-day windows. Digests and usage reports are local; no email, Slack message or telemetry is sent.

`model-usage` distinguishes provider-reported counters from conservative operator-priced budget reservations. A credential availability flag checks only whether the configured host environment variable exists. Session usage in `activity` remains separate because surrounding conversation tokens cannot reliably be assigned to a routine. Missing usage and total savings remain unknown.

Rollback compares the current active and previous versions atomically, clears the consumed previous-version pointer and records the manual change in the digest. Digests expose job reports as structured JSON. Ungranted observation groups are reported as blocked while other eligible work and retention continue; evidence records identify the exact cases selected after deduplication.

Retirement records the last active version in the component digest, so its source remains discoverable even without run history. Authorized background cycles apply retention before learning or improvement; a later optimization error remains explicit and cannot indefinitely block expiry.

## Routine library

Ask “what did you learn?” to see the project library. `clearings_library` and the `library` CLI command return the same bounded view: names, examples, active versions, pause state, undo availability, and recent calls. Follow `next_after` to continue.

`run-routine --purpose test` and `clearings_run_routine` with `purpose: test` try fresh inputs under the same grants and isolation as normal reuse. Tests do not trigger automatic regression rollback. Usage reports separate `reuse_calls`, `test_calls`, and `unclassified_calls`; older records remain unclassified. These caller-labelled counts do not prove savings. Only labelled reuse influences matching frequency and eligibility for automatic improvement.

Open the [personal workbench](workbench.md) to inspect the same library, try inputs, and propose tested updates without editing source or managing IDs.
