---
name: reuse-work
description: Save, reuse, revise or manage repeated read and transform work with Clearings, including observation under existing project authorization.
---

Use the configured Clearings MCP server or executable with the user's chosen store and project. Do not change project settings, selected sources, model connection, budget or grants merely to make a task pass.

For a configured project, read `clearings_project_status`, discover named routines with `clearings_discover`, and inspect the relevant one with `clearings_routine`. Match its requirements to the current request. `clearings_reuse` runs fresh inputs; `needs_agent`, `not_applicable` or failure returns ordinary work to you within existing authorization. Honor pause and exclusion controls. A failure does not authorize new access or unlimited retries.

When the user asks to save work, identify changing inputs, expected outputs and boundaries. Read `clearings_sdk`. Prepare requirements and independently determined acceptance examples with `clearings_prepare_task` before authoring source. Write one default-exported async TypeScript function using the bundled capability SDK. Generated routines have no Node APIs, imports, arbitrary URLs or shell execution. Read current data on each run. Oxc transforms syntax without full type checking.

Use `clearings_save` with the prepared contract name and source to evaluate and activate it. For a revision, include the current `expected_active` version. Failed evaluation leaves the prior version active. Do not change acceptance criteria merely to make a candidate pass; changed requirements need a new named task. In an unscoped legacy store, use list/inspect and the separate prepare, submit, evaluate, activate and run operations.

When project status explicitly enables both `automatic` and `record_conversations`, record suitable completed work with `clearings_record_observation`. Supply a real stable session identity and actual input, expected outcome and capability fixtures under a stable contract. Do not invent missing results, session identities, examples or inferred rules. This is evidence collection, not immediate activation. Existing project authorization can cover it without a new save prompt for every workflow. If the required evidence is unavailable, continue ordinary work. Clearings labels these as agent-supplied observations.

The authorized background process handles candidate selection, source proposals, withheld-case checking, bounded retries and measured replacement. Do not imitate its scheduling by repeatedly calling tools. Read `clearings_digest` when a status update is useful; `clearings_manage` supports pause, exclusion, retirement and rollback. Retirement retains source and immutable acceptance evidence.

Report observed outcomes and measured usage only. Use `clearings_model_usage` and `clearings_performance` when relevant. Provider counters, session totals, budget reservations and user estimates are different evidence. Missing usage is unknown, and runtime speed or fewer calls does not establish total token savings. No account setup, deployment or outgoing notification is implied by this skill.
