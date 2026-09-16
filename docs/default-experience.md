# Default experience

This page records the agreed product requirements. The local runtime implements the defaults below; real-client installation and selection remain explicit launch acceptance gates. See [installation](installation.md) and [background execution](background.md) for the current implementation.

## Install and work

Install Clearings through the coding client or its supported command-line installation. Start an ordinary session and work. Clearings supplies working defaults. There is no setup questionnaire, required model selection, copied project ID, settings file, or manual background-process installation.

The normal path assumes the coding client is already installed and signed in. Clearings uses that existing client for authoring where its supported interface permits it. A standalone Clearings installation detects a supported local client. Missing client authentication is a connection problem to report once, not a reason to invent credentials or silently switch to a billable endpoint.

Installation must accurately describe the default recent-conversation reading and background work. Client-required plugin and hook trust remains part of the client's installation flow. Existing pauses, exclusions, and deliberate restrictions survive updates.

## Two paths from conversations to routines

### On request

When the user asks to make recent work reusable, the active agent reads recent conversations. The current project is the default starting scope. The agent may choose a relevant session, time range, or broader set of projects within existing authorization, based on the request.

The agent identifies variable inputs, expected outputs, applicable conditions, and exceptions. It prepares the task and independent acceptance examples before writing source. It then evaluates and saves suitable routines. It asks about missing task rules only when the available evidence cannot establish them. It does not ask the user to locate transcript files or write code.

A conversation is a container, not an occurrence count. One long project conversation can contain many repeated workflows. The agent must inspect relevant content pages rather than reject a project because it has only one conversation. On request, one demonstrated mechanical step can justify a useful parameterized routine; inferred generality and constructed examples must remain distinct from observed repeated use.

### Scheduled learning

Background learning runs once every 24 hours by default and considers recent conversations across projects. The initial lookback is seven days. Later runs use persistent cursors, revisit unresolved candidates within that window, and avoid reprocessing completed work. A configurable wider historical review remains available on request.

Users can change the schedule conversationally, including every 48 hours, twice daily, or weekly. A missed interval produces one catch-up run when the machine and client are available. It does not replay every missed interval.

Cheap filtering identifies promising repeated work before requesting model work. The default is at most three candidate workflows per daily cycle and at most two model requests per candidate. Each request and cycle has a bounded duration and output size. These are workload limits; they must not be described as a dollar spending guarantee. Any provider-specific spending limit needs a separate accurate implementation.

The worker uses the installed coding client's supported authoring interface and existing sign-in. Explicit model/provider configuration is optional. Failure, missing authentication, or exhausted allowance does not start another provider or an unlimited retry loop. Already saved routines remain executable when learning is unavailable.

## Conversation access

Codex access should use its supported local conversation interface where available, with client-version checks for experimental pagination. Claude Code access should use client-provided transcript locations and a session index. Both adapters need bounded reads, incremental cursors, provenance, and explicit partial-coverage results.

The importer must read useful conversation and tool evidence, beyond usage counters and specially prepared workflow records. Repository-root and subdirectory sessions must resolve consistently. User-wide scheduling includes relevant recent sessions regardless of which project is currently open.

Clearings stores its normalized records in its own database. Host databases and transcript files remain read-only implementation inputs. Reading one transcript segment must not be presented as reading a complete paginated conversation. Cloud conversations require their own supported access path; local history support does not imply cloud access.

Conversation interpretation can propose useful generalizations. It must preserve which examples were observed, inferred, or constructed. A source proposal cannot alter its frozen acceptance criteria. Unsupported or uncertain cases return control to the agent.

## Reuse across tasks and projects

Maintain a user-wide library of reusable routine definitions. Each definition includes its input/output requirements, applicability, examples, capability requests, source history, and origin. Generic transformations should be available in later projects. Project-specific assumptions must remain visible and constrain matching.

A routine definition does not carry execution grants from its source project. Execution binds to the current task's permitted resources. Cross-project learning does not turn one project's filesystem grant into a user-wide runtime grant. Routines must not embed credentials or private example data merely to reproduce an observed answer.

The structure should describe useful behavior without forcing every task into a single narrow template. The agent may generalize inputs and organize work into suitable functions. The runtime continues to enforce capabilities, schemas, limits, and explicit outcomes.

## Quiet automatic use

Routine reuse is a default part of the agent's workflow. Users should not need to mention Clearings or remember routine names.

At session start, the plugin connects the project and provides a short availability hint when useful. Before suitable work, a cheap relevance check supplies a small set of matching routines to the agent. The bundled skill directs the agent to inspect requirements and use a suitable active routine on fresh inputs. The agent handles unmatched work and exceptions normally.

Hook-based discovery makes candidates available predictably. Skill guidance handles semantic applicability. Neither mechanism proves that every host model will always choose correctly, so host interaction tests must measure actual selection and execution.

Do not ask to save every workflow. Do not announce empty or unchanged results. Do not inject the entire library into each request or call a model merely to check an empty queue. Keep progress and evidence available when requested. Surface meaningful failures and changes without repeated reminders. Muting suggestions and pausing learning are separate controls from routine execution.

## Bundled skills

The plugin should provide focused guidance for four related activities:

- Reuse work: choose a suitable active routine and handle its result.
- Save work: turn a selected workflow into an evaluated, reusable routine.
- Review recent work: find useful repeated behavior in authorized conversations.
- Manage Clearings: inspect status, change preferences, pause learning, and restore an earlier version.

Skills should guide decisions and use supported tools. The runtime owns capture, scheduling, limits, state, and execution. Do not require the user to install a separate skill for each generated routine.

## Usage and maintenance

Record actual executions by stable routine identity, version, project, and time. Report counts over seven, 30, and 90 days, last use, successful outcomes, handoffs, failures, elapsed time, and capability calls. Preserve compact aggregates beyond raw-run retention.

Also record when a routine was offered, selected, or rejected where the host exposes that information. Execution counts alone cannot distinguish an unnecessary routine from one the agent failed to discover. Missing selection evidence must remain unknown.

Use these records to prioritize worthwhile improvements and reduce redundant routines. Low use should initially reduce discovery priority. Do not delete a useful or user-pinned routine solely because it was unused for a short period. Any automatic retirement should preserve an inspectable record and a restore path. Permanent deletion and its retention rules require a separate product decision.

## Natural-language controls

Users can ask for operations such as:

- Pause learning, or resume it.
- Learn weekly instead, or review recent work now.
- Show what was learned and what is actually being used.
- Exclude a project or task from learning.
- Stop using a routine.
- Undo the last automatic change.
- Explain why learning stopped or a routine did not run.

The agent resolves names, versions, and scope through the tool interface. Users do not need storage IDs or configuration files. A requested preference change persists and is reflected in status immediately.

## Acceptance before launch

A clean installation must work with the client's existing sign-in and default settings. Test both coding clients on supported platforms, including restart, changed working directories, two concurrent projects, and missing connectivity.

Demonstrate both learning paths with real conversation evidence. Background learning must inspect more than the currently open project and keep source evidence distinct from inferred examples. A paused or excluded source must remain excluded after restart and upgrade.

In fresh sessions, ordinary requests must cause correct routine selection and actual runtime execution without routine names. Unrelated requests must not produce repeated suggestions. Test changed inputs, unfamiliar cases, changed requirements, and recovery after an automatic replacement.

Measure total time and available model usage, including discovery, creation, checking, repairs, and fallback. Confirm that execution counts and retained aggregates agree. Passing runtime tests alone does not establish this user experience or net savings.
