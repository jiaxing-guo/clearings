# Background execution

After project authorization, run `clearings --store /private/state.db --project PROJECT_ID background`. It remains a foreground process suitable for a service manager. `background --once` executes one due cycle, which also makes it suitable for an external timer. Neither command installs or enables a system service.

A kernel file lock prevents concurrent cycles for the same database and project. The lock is released on process exit, including a crash. The next cycle marks interrupted work explicitly. Checkpoints and deduplicated observations prevent duplicate capture. Missed schedule intervals coalesce into one catch-up cycle; they are not replayed repeatedly.

`background-cancel` stops current work at a bounded phase boundary. It does not permanently disable scheduling; update the project settings to turn off `automatic`. Changed authorization cancels an older job before it can promote a component. Ordinary agent work and already saved routines remain available when the optimizer is disabled, unavailable or out of budget.

`background-jobs` reports completion, interruption and failures. Model requests reserve a conservative amount against a persisted UTC daily budget before sending. Reservations survive crashes and uncertain responses. A reservation is a local spending bound using configured prices, not a provider invoice. Unknown token usage remains unknown.
