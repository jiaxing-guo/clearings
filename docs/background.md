# Background learning

Clearings reviews recent local coding-client conversations through the existing signed-in client. No separate API key or model-selection step is required for the default path.

## Schedule and scope

The user-session service checks hourly. Learning runs daily by default, beginning 24 hours after installation, with a seven-day initial lookback. Missed intervals coalesce into one due check rather than a burst of catch-up requests.

Scheduled review considers recent work across projects. An explicit request starts with the current project unless the user asks for broader scope. Persistent cursors let longer conversations and history backlogs progress across bounded cycles.

Repetition is judged within workflow episodes, not by the number of conversations. One long project conversation can contain enough repeated work. Explicit learning can also generalize one demonstrated mechanical step when its behavior and future inputs are clear.

## Candidate pipeline

1. Read bounded conversation evidence and preserve coverage limits.
2. Propose one reusable read/transform workflow with applicability and varied examples.
3. Validate the proposal before preparing an immutable task.
4. Author source with one acceptance case withheld.
5. Evaluate all cases and activate only a passing candidate.

Automatic candidates use file reading/listing or pure transformations. They cannot add shell, write, or arbitrary network effects. File-backed inputs keep artifact contents inside execution rather than model-generated call arguments.

## Stronger proposals

The response format has `schema_version: 1` and a structured `candidate`, or `candidate: null` when no workflow qualifies. Candidates contain a task and an applicability description. JSON-encoded candidate strings are not accepted as the structured response.

The host validates ownership fields, schemas, examples, capability requests and applicability. A malformed response gets one repair request with precise feedback and the original evidence. A second invalid response stops. Repair never edits already-frozen acceptance criteria.

A normal candidate uses two authoring requests, or three when proposal repair is needed. The default allowance is six requests per UTC day and three candidates per cycle. Repairs share that allowance and any configured spending ceiling. Request limits do not guarantee a particular dollar cost.

## Improvement and recovery

Automatic improvement considers accepted routines with recorded real reuse. Tests and unclassified usage do not establish eligibility. A replacement must preserve frozen criteria, pass evaluation, and demonstrate fewer capability calls or a consistent measured runtime improvement.

Failed candidates remain explicit and do not replace active work. Owning-project regressions after automatic replacement can restore the prior accepted version. Receiving-project permission failures must not roll back a shared definition globally.

## Controls and failures

“Pause learning,” “learn weekly,” and “exclude this project” use the existing preferences. `install --no-service` persists on-request operation. Saved routines remain usable while learning is paused.

Sign-in failures, unsupported history interfaces, incomplete coverage, exhausted allowance, and unavailable sources appear in status. Clearings does not silently select another provider. Disabling the plugin stops integration-bound background work before new authoring or promotion.

## Custom hosts

Operators can configure structured observation sources and a model connection for a project, then use `background` or `background --once`. This path has explicit project authorization, conservative spending reservations, cancellation, and retention. It does not change the default client-based setup.

Background learning creates and improves routines. It is not a general scheduler for running saved routines or monitoring arbitrary remote systems without a model.
