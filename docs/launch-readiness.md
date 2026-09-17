# Release validation

A release needs evidence for installation, ordinary use, failure handling and the packaged runtime. A passing documentation build is not a runtime or product acceptance test.

## Distribution

The plugin's pinned public runtime must have matching native archives and checksums. Until that release is published, installation uses bundled Packages artifacts. Check the package's exact target, native dependencies and license inventory.

Validate first installation and offline restart without Node, Python, npm or a Rust compiler. Test the package copied into a real client cache, not only the source checkout.

## Coding clients

Test supported Codex and Claude Code versions through their normal interfaces:

- Plugin discovery, registration and client-level trust.
- Project selection, worktrees, and folders without Git.
- Conversation reading, including long conversations and partial coverage.
- Default learning, on-request learning, pause, schedule changes and status.
- Natural routine selection and fresh execution without preparatory model calls.
- Appropriate fallback when a hint is stale or a routine does not fit.

Keep client approval modes explicit in latency comparisons. Do not attribute a permission-mode change to the runtime.

## Workbench

Validate library state, test/reuse counts, examples, input forms, failure states, proposed changes, explicit activation, undo, and shared pause controls. Check browser access boundaries and responsive layouts. The automated browser suite uses a local authoring fixture; live client acceptance remains a separate check.

## Runtime

Run isolation and protocol checks on every advertised platform. Preserve fail-closed behavior, fixed grants, deadlines, byte limits, version binding, immutable criteria and explicit outcomes. Check denied access, malformed data, source failures and interrupted workers.

## Learning quality

Keep proposal validation and source acceptance separate. Confirm that one bounded repair can fix a malformed candidate, shares the existing allowance, and cannot rewrite frozen criteria. Test that failed candidates leave the active version intact.

A routine should work on a fresh supported input and return an explicit handoff for relevant unsupported inputs. Successful examples alone do not prove generality.

## Performance evidence

Use the [performance protocol](performance.md): compare ordinary agent execution, a saved script, and Clearings with the same task and output. Retain selection failures and retries. Report cached and uncached tokens, authoring cost, native time, and complete turn time separately.

Publish only claims supported by the measured workload and setup. Keep release decisions separate from source builds, UI concepts, fixture results and future product ideas.
