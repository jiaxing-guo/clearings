---
name: reuse-work
description: Use saved Clearings routines for matching read and transform tasks, including repeated context gathering, log summaries, and data normalization on fresh inputs.
---

Connect to the actual working project with `clearings_open_project`. The trusted startup hook registers projects; do not fabricate registration input if it is missing.

When a hook supplies candidate routines, or the request involves a repeated read/transform task, use `clearings_find_routines` if needed. Inspect a plausible match with `clearings_library_routine`. Check its requirements, examples, applicability, and resource names against the current request. Use `clearings_run_routine` on fresh input when it fits. Source-project permissions never transfer to this project.

A matching routine should replace the repeatable intermediate work. Do not merely mention it and perform all its steps again. Continue ordinary agent work for unmatched requests, explicit handoffs, and failures; never broaden requirements or grants just to force a match.

Do not ask to save each workflow or announce empty/unchanged searches. Keep the result focused on the user's work. If asked why a routine was used, explain the match and cite its run result. Missing usage is unknown, and fewer capability calls alone do not establish total token savings.

For requests to save or generalize recent work, use the bundled learn-from-conversations skill. Existing manual project servers can still discover and reuse their named routines with `clearings_discover`, `clearings_routine`, and `clearings_reuse`.
