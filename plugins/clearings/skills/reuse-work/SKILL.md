---
name: reuse-work
description: Find or inspect saved Clearings routines when no complete invocation hint is available, or handle ambiguous matches, stale versions, failures, and handoffs. Complete matching hints already support direct execution without loading this skill.
---

When a hook provides a complete matching contract, call `clearings_run_routine` directly with the actual working-project `path`, hinted `id`, `expected_version` and `expected_capabilities`, and fresh `input`. The host selects the registered project and enforces its current grants. No preparatory tool or skill read is needed. Keep using that signature for later matching inputs.

When no complete hint is available, or applicability is ambiguous, connect to the actual working project with `clearings_open_project`. The trusted startup hook registers projects; do not fabricate registration input if it is missing.

For this inspection path, use `clearings_find_routines` if needed. Inspect a plausible match with `clearings_library_routine`. Check its requirements, examples, applicability, and resource names against the current request. Use `clearings_run_routine` on fresh input when it fits, with the inspected active version as `expected_version` and its contract capabilities as `expected_capabilities`. A stale-version error requires a fresh inspection; do not silently omit the version to bypass it. Source-project permissions never transfer to this project.

When the requirements fit, execute the routine to perform the repeatable intermediate work. Do not merely mention it and perform its steps again. Continue ordinary agent work for unmatched requests, explicit handoffs, and failures; never broaden requirements or grants just to force a match.

Do not ask to save each workflow or announce empty/unchanged searches. Keep the result focused on the user's work. If asked why a routine was used, explain the match and cite its run result. Missing usage is unknown, and fewer capability calls alone do not establish total token savings.

For requests to save or generalize recent work, use the bundled learn-from-conversations skill. Existing manual project servers can still discover and reuse their named routines with `clearings_discover`, `clearings_routine`, and `clearings_reuse`.

For file-backed routines, pass the current granted root alias and project-relative path. Let the runtime read fresh contents; do not read and paste the whole artifact first. Match the declared input schema: an inline-input routine does not accept a file reference unless a separate wrapper has been prepared and accepted. Keep genuine exports complete, but prefer a compact result when the user asks only for counts, changes, or exceptions.
