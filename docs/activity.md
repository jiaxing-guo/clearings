# Activity and performance records

Individual observations may record any supported outcome, including handoffs, unsupported work and failures. They still require valid schemas, inputs and fixtures. Preparing an acceptance task additionally requires at least one completed case.

`observe` imports complete JSONL lines from the project's selected sources. It filters sessions by their canonical working directory, stores checkpoints atomically with imported events, ignores partial final lines until completed, and deduplicates events after restart or rotation. Each poll has file, depth and byte limits. Missing files and malformed records produce explicit errors. No other project sessions are imported.

Codex session metadata and cumulative `token_count` records are supported. Claude Code message usage records are deduplicated by message identity. Imported counters retain their host-reported provenance and whether they are cumulative. Do not sum cumulative counters. Cached input, cache creation and reasoning fields retain their own categories; they are not universally additive across providers. Unsupported or missing counters stay unknown.

`activity` returns a bounded page; pass `--before` to continue. `performance NAME` groups executions by immutable routine version, including outcomes, elapsed execution time and capability calls. Session totals are not automatically assigned to a routine, and no token savings are inferred from them.

For behavioral observation, an integration can append a `clearings_workflow` record to an authorized JSONL source. The record includes `session_id`, `cwd`, a stable `event_id`, and `observation` containing a runtime `contract` and one recorded `case` (name, input, expected outcome and capability fixtures). The host validates its shape. These records describe supplied observations; a transcript summary does not become an exact tool recording. Ordinary free-text transcripts are not executable instructions.

Imports expire raw project activity using the configured retention period. Checkpoints include adapter identity, so changing adapters replays the selected file. File traversal and reads use held directory/file handles and reject symlinks. Structured workflow records require their own nonempty session, working-directory and event identifiers.

`performance NAME --after VERSION` continues the preceding `next_after` cursor. Each version reports separate completed, handoff (`needs_agent`), not-applicable and failed counts.
