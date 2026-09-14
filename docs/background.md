# Background execution

After project authorization, run `clearings --store /private/state.db --project PROJECT_ID background`. It remains a foreground process suitable for a service manager. `background --once` executes one due cycle, which also makes it suitable for an external timer. Neither command installs or enables a system service.

A kernel file lock prevents concurrent cycles for the same database and project. The lock is released on process exit, including a crash. The next cycle marks interrupted work explicitly. Checkpoints and deduplicated observations prevent duplicate capture. Missed schedule intervals coalesce into one catch-up cycle; they are not replayed repeatedly.

`background-cancel` stops current work at a bounded phase boundary. It does not permanently disable scheduling; update the project settings to turn off `automatic`. Changed authorization cancels an older job before it can promote a component. Ordinary agent work and already saved routines remain available when the optimizer is disabled, unavailable or out of budget.

`background-jobs` reports completion, interruption and failures. Model requests reserve a conservative amount against a persisted UTC daily budget before sending. Reservations survive crashes and uncertain responses. A reservation is a local spending bound using configured prices, not a provider invoice. Unknown token usage remains unknown.

## Automatic component creation

When `automatic` is enabled, each due cycle imports selected records and considers one eligible workflow. It requires at least three distinct inputs across at least `min_occurrences` distinct sessions, consistent outcomes, and a read-only file or pure transformation contract. It excludes configured names and existing named routines. Plain conversational text is not treated as behavioral evidence.

An integration may supply structured records through the selected trace files. If the project also explicitly enables `record_conversations`, the active agent can call `clearings_record_observation` after completing work, using actual input, output and tool results. This records evidence without asking the user to save each workflow. Agent-supplied observations retain that provenance. General automatic reconstruction of arbitrary shell commands or free-text histories is not supported.

Acceptance cases are stored before requesting source. One recorded example is withheld from the authoring request. The configured model returns a JSON source proposal; the isolated TypeScript runtime prepares and evaluates it. Passing candidates become discoverable and reusable in later project sessions. This establishes agreement on recorded cases, not general correctness or measured token savings.

A workflow has at most two authoring attempts, using the same frozen cases, across scheduled cycles. Failed attempts and their budget reservations remain visible. Model responses cannot change grants, acceptance cases or host settings. A configuration change, cancellation, concurrent manual replacement, pause or exclusion prevents automatic promotion.

## Measured improvement and recovery

With `improve` enabled, cycles without an eligible new workflow consider one existing active routine. The optimizer uses the same immutable task and capability requirements. It evaluates a source proposal, then runs three alternating baseline/candidate measurement pairs. Replacement requires fewer capability calls without a material median latency increase, or equal calls with at least 20 percent and more than 2 ms improvement in every pair. This is local fixture evidence; it is not a claim about end-to-end agent cost.

Each active version gets one improvement trial. The next improved version can receive a later trial. A cycle has a 120-second phase budget, checked between bounded operations and individual measurement cases. Current bounded work can finish after cancellation or the phase deadline. Candidate creation and improvements share the same daily model budget.

Promotion checks the current project revision, cancellation, task identity, activation state and pause/exclusion controls in one database transaction. The previous active version remains available. A failed live run after automatic replacement restores that previous version for subsequent runs and returns the failed result with recovery details. It does not conceal the failure or silently rerun the task. Intentional handoffs do not trigger rollback. No cross-routine call graph exists in the current runtime; dependency checks concern the engine, immutable task and configured capability bindings.
