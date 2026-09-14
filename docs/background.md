# Background execution

Hard-linked database files are rejected before opening SQLite and before acquiring a background lock, because SQLite WAL sidecars belong to a single database path. Symlink aliases resolve to the same canonical database and lock.

A cycle with observation errors is recorded as failed and retains the structured source errors, even when no records were imported. `background --once` returns an unsuccessful exit status for that result. A valid empty source can still complete successfully.

After project authorization, run `clearings --store /private/state.db --project PROJECT_ID background`. It remains a foreground process suitable for a service manager. `background --once` executes one due cycle, which also makes it suitable for an external timer. Neither command installs or enables a system service.

A kernel file lock prevents concurrent cycles for the same database and project. The lock is released on process exit, including a crash. The next cycle marks interrupted work explicitly. Checkpoints and deduplicated observations prevent duplicate capture. Missed schedule intervals coalesce into one catch-up cycle; they are not replayed repeatedly.

`background-cancel` stops current work at a bounded phase boundary. It does not permanently disable scheduling; update the project settings to turn off `automatic`. Changed authorization cancels an older job before it can promote a component. Ordinary agent work and already saved routines remain available when the optimizer is disabled, unavailable or out of budget.

`background-jobs` reports completion, interruption and failures. Model requests reserve a conservative amount against a persisted UTC daily budget before sending. Reservations survive crashes and uncertain responses. A reservation is a local spending bound using configured prices, not a provider invoice. Unknown token usage remains unknown.

## Automatic component creation

When `automatic` is enabled, each due cycle imports selected records and considers one eligible workflow. It requires at least three distinct inputs across at least `min_occurrences` distinct sessions, consistent outcomes, and a read-only file or pure transformation contract. It excludes configured names and existing named routines. Plain conversational text is not treated as behavioral evidence.

An integration may supply structured records through the selected trace files. If the project also explicitly enables `record_conversations`, the active agent can call `clearings_record_observation` after completing work, using actual input, output and tool results. This records evidence without asking the user to save each workflow. Agent-supplied observations retain that provenance. General automatic reconstruction of arbitrary shell commands or free-text histories is not supported.

Acceptance cases are stored before requesting source. One recorded example is withheld from the authoring request. The configured model returns a JSON source proposal; the isolated TypeScript runtime prepares and evaluates it. Passing candidates become discoverable and reusable in later project sessions. This establishes agreement on recorded cases, not general correctness or measured token savings.

A workflow has at most two authoring attempts, using the same frozen cases, across scheduled cycles. Failed attempts and their budget reservations remain visible. Model responses cannot change grants, acceptance cases or host settings. A configuration change, cancellation, concurrent manual replacement, pause or exclusion prevents automatic promotion.

Observation scans retain a cursor across bounded cycles so older groups remain reachable. Budget refusal does not consume an authoring attempt. `background-jobs` includes request reservations, status and reported usage. Cancellation or changed authorization fails the job explicitly.

MCP observation tools use one host-generated session identity per server connection; the caller cannot supply it. Transcript imports and the host CLI retain host-supplied session identities. These are provenance boundaries, not proof that supplied observations are true or that sessions are statistically independent.

Reconfiguration resets the due time, disabled ticks reconcile interrupted work, and failed `background --once` jobs return an unsuccessful exit status.

Learning groups matching contracts before applying its scan cursor, so unrelated records cannot split a workflow across pages. Each cycle reads at most 500 contract groups and 8 MiB of observations; each group supplies at most 500 records and 4 MiB. Groups without any completed case remain observations and cannot become acceptance tasks.

Oversized or otherwise invalid combined acceptance groups are reported and skipped before storage. A group that cannot reserve a model request yields to other eligible groups, so a cheaper request can still fit the remaining budget. No attempt is consumed before reservation.

Background coordination supports processes that share the same canonical database path within one filesystem namespace. Symlink aliases resolve to that path; hard-linked database files are rejected. Exposing one database through different bind-mount paths or filesystem namespaces is not a supported storage layout.

Observation sampling represents distinct input/outcome pairs and session identities within the existing per-group record and byte limits. Failed proposals retain bounded source diagnostics even when TypeScript preparation fails before a version is created.
