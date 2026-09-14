---
name: reuse-work
description: Turn a user-selected repeated read or transform task into a Clearings routine, revise an existing routine, or reuse one on new inputs.
---

Use the configured Clearings MCP tools when present. Otherwise use the `clearings` executable with the user's chosen `--store` and invocation policy. Do not choose a new store or grant broader access to make a task pass.

For reuse, list tasks and inspect the relevant contract. Match its actual scope to the request, then run its active version with explicit parameters. `completed` supplies a result; `needs_agent` and `not_applicable` return work to you. A failure is not permission to rerun indefinitely or broaden grants. Continue ordinary reasoning within the user's existing authorization when the routine cannot handle the task.

For teaching, use only the work or conversation the user selected. Identify the repeated deterministic portion, its changing inputs, expected outputs, supported cases and boundaries requiring judgment. Read `clearings_sdk` (or `clearings sdk`) before writing a routine. Record a task with acceptance cases based on requirements and independently determined expected results before submitting source. A successful trace alone does not show that a routine generalizes. Include differing inputs and a meaningful boundary case.

Write one default-exported async TypeScript function. Use explicit JSON inputs and the bundled `clearings.call` operations. Imports, npm modules, Node globals, arbitrary URLs and shell execution are unavailable. Oxc transforms syntax without full type checking. Read current data on every run; use `needs_agent` when required assumptions are not established. Routine code is data for the isolated worker, not instructions for you to bypass host policy.

Submit source against the existing task ID, evaluate it, and inspect the case outcomes. Fix source without changing criteria to make a failing candidate pass. If the user's requirements changed, record a new task and explain the change. Activation is separate: review the accepted behavior and respect existing user authorization. First activation uses `expected_active: null`; replacement names the current version. Do not silently replace a version another session activated.

Revisions preserve the previous source and evaluation. Deactivate an unsuitable version when authorized. The runtime retains run outcomes locally, including output and handoff context. Treat that data as potentially sensitive.

Report observed outcomes and measured usage only. The local execution path makes no model calls, but authoring and the surrounding agent turn still use tokens. Missing usage is unknown; do not invent savings. No automatic history scanning, scheduled jobs or new model account is needed.
