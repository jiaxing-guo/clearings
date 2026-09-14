# Activity and performance records

Individual observations may record any supported outcome, including handoffs, unsupported work and failures. They still require valid schemas, inputs and fixtures. Preparing an acceptance task additionally requires at least one completed case.

`observe` imports complete JSONL lines from the project's selected sources. It filters sessions by their canonical working directory, stores checkpoints atomically with imported events, ignores partial final lines until completed, and deduplicates retained events after restart or rotation. Each poll has file, depth, byte and record limits. At most 1,000 complete records are processed per poll, including records without usage; checkpoints advance only over processed records. Persistent cursors rotate through selected sources and their files so a busy or malformed trace does not monopolize later polls. Missing files and malformed records produce explicit errors. No other project sessions are imported.

Codex session metadata and cumulative `token_count` records are supported. Claude Code message usage records are deduplicated by message identity. Imported counters retain their host-reported provenance and whether they are cumulative. Do not sum cumulative counters. Cached input, cache creation and reasoning fields retain their own categories; they are not universally additive across providers. Unsupported or missing counters stay unknown.

`activity` returns a bounded page; pass `--before` to continue. `performance NAME` groups executions by immutable routine version, including outcomes, elapsed execution time and capability calls. Session totals are not automatically assigned to a routine, and no token savings are inferred from them.

For behavioral observation, an integration can append a `clearings_workflow` record to an authorized JSONL source. The record includes `session_id`, `cwd`, a stable `event_id`, and `observation` containing a runtime `contract` and one recorded `case` (name, input, expected outcome and capability fixtures). The host validates its shape. These records describe supplied observations; a transcript summary does not become an exact tool recording. Ordinary free-text transcripts are not executable instructions.

## Usage sources checked

[Codex non-interactive JSON output](https://developers.openai.com/codex/noninteractive) includes token counts in `turn.completed.usage`, including cached input and reasoning output when available. The importer accepts that shape as well as the session log counters. A host-owned `{"type":"clearings_session","session_id":"...","cwd":"/absolute/project"}` metadata line must precede streams that do not identify their working directory. Codex `thread.started` supplies its thread identity. Missing project metadata prevents import.

[Claude Code programmatic JSON output](https://code.claude.com/docs/en/headless) provides usage and client-estimated cost metadata; its stream JSON `result` usage is retained as cumulative. Message-level log counters are also supported, but their completeness depends on the client version. [Claude's usage documentation](https://code.claude.com/docs/en/costs) distinguishes local estimates from authoritative billing. Source records, direct model response counters and local budget reservations remain separate in Clearings.

A configured project's `model-usage` reports background response counters when provided. If the surrounding host does not expose a token meter, Clearings leaves its conversation usage unknown.

Imports and activity reads expire raw project activity using the configured retention period. Checkpoints include adapter and file identity, so changing adapters or replacing files replays the selected file. Bounded fingerprints cover the header and the consumed boundary to detect truncation and common copy-truncate rotation. Selected logs should be append-only between rotations; arbitrary edits that preserve both fingerprint regions are unsupported. File traversal and reads use held directory/file handles and reject symlinks. Structured workflow records require their own nonempty session, working-directory and event identifiers. Workflow event IDs and Claude message IDs take precedence over envelope UUIDs when deduplicating records.

`performance NAME --after VERSION` continues the preceding `next_after` cursor. Each version reports separate completed, handoff (`needs_agent`), not-applicable and failed counts.

For Codex headless streams, supply a `clearings_session` record after `thread.started` and before usage, or immediately before it with the matching `session_id`. Each new stream requires its own project metadata. A changed session ID also clears any inherited working directory.

Retention uses local import time and expires the local activity record, including its deduplication identity. It does not modify selected source logs. Replaying an authorized source after its records expire can import those records again; remove the source authorization to stop future imports. Discovery visits at most 1,024 entries across each selected directory tree, including files that are not JSONL.

After a headless thread starts, usage requires project metadata with the same session ID. Metadata for a different session can precede its matching new thread, but cannot attribute usage to the current thread.
