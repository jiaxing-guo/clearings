# Activity and evidence

Clearings separates conversation evidence, routine executions, acceptance evaluations, and model usage. They answer different questions and should not be combined into an unsupported savings claim.

## Conversation access

`recent_conversations` lists recent supported local work; `read_conversation` returns bounded content pages. The default is the current project and seven days. All-project scope is explicit for manual requests and used by scheduled learning.

Codex history is read through its client interface. Claude Code history is read from local project transcripts. Cloud ChatGPT conversations are outside this local interface. Private model reasoning is omitted.

Reads preserve conversation and item references, label truncation, report partial coverage, and use client continuation cursors. An incomplete page is not a complete recording. The agent should follow relevant pages when the newest messages do not contain enough evidence.

## Acceptance evidence

A conversation can support a proposed workflow, but an agent's interpretation is not an exact authenticated tool recording. Prepared tasks retain that distinction. Capability fixtures are test data and never grant permissions.

Workbench tests can capture successful capability results for an example. Capture is bounded; failed or oversized observations are marked unavailable. The user chooses the desired result, and preparation freezes the new criteria before source authoring.

## Run records

Runs record the receiving project, version, input digest, outcome, native elapsed time, capability count, and purpose. Detailed history is paginated and subject to retention. Compact daily totals survive run pruning.

Run outcomes include completed output and handoff context. This returned data remains in the local SQLite store until run-history pruning removes it. An input digest does not hide sensitive data returned by a routine. Keep the state directory private and return only the data needed for the task.

Acceptance examples and captured file fixtures remain with immutable tasks. Pruning run history does not remove that acceptance data.

Purposes distinguish real reuse, explicit tests, and unclassified records. A routine suggestion is not an execution. An attempted call rejected before execution is not successful use. A passing acceptance case is not real reuse.

## Model usage

Direct authoring responses retain provider- or client-reported counters when available. Failed requests and conservative budget reservations are reported separately. Session usage imported from a coding client cannot always be attributed to a particular routine.

Codex counters can be cumulative: cached input is part of input, and reasoning output is part of output. Do not add those subcounts again. Preserve counter identities and distinguish deltas from cumulative observations. Claude client estimates are not authoritative billing records.

Unknown usage stays unknown. Native runtime time does not include agent reasoning, approval review, context processing, network wait, or final-answer generation.

## Structured imports

Advanced project sources can import JSONL activity and workflow observations. Imports process complete records, keep file/checkpoint identity, deduplicate retained records, and bound scanning and parsing. Missing sources and malformed data remain errors. Source logs are expected to be append-only between rotations.

Retention uses local import time and does not delete original transcripts. Replaying a source after local retention expires can import it again. Remove its authorization to stop future imports.
