# Routines and acceptance

A routine consists of frozen requirements and one or more executable versions. Its contract declares inputs, outputs, requested capabilities, limits, and behavior. Acceptance cases pair inputs with exact expected outcomes and recorded capability fixtures.

## Prepare before authoring

The agent prepares the task before submitting candidate source. This fixes the criteria the source must satisfy. Cases may be user-defined or constructed from conversation evidence; interpretations must be labelled and must not be presented as authenticated traces.

A fixture contains the capability name, input, and result. Fixture data is not a grant. Evaluation uses fixtures without live credentials or filesystem permissions.

`exact_calls` requires the recorded call sequence. `read_only_behavior` allows reordering, repetition, or omission of recorded file reads while requiring the same expected outcome. It supports only `files.read` and `files.list`; unrecorded reads and conflicting fixtures are rejected.

## Submit, evaluate, activate

Submission stores original TypeScript, prepared JavaScript, source map, and engine identity as an immutable version. Evaluation runs the frozen cases. The first evaluation for that version and engine is retained.

Only a passing version can be activated. Replacing an active version requires the expected current version, so concurrent updates cannot silently overwrite one another. Failed evaluation preserves the existing active version.

Runtime input/output schemas and bounded execution are separate from behavioral acceptance. Passing a few examples does not establish generality. Use independent cases, fresh inputs, and relevant failure conditions.

## Reuse

Run the active version on fresh input. Complete invocation hints include the contract and expected version/capabilities, so a matching request needs no preparatory lookup. The host checks the registered project, active version, current grants, and pause/exclusion state before execution.

A stale hint produces an error. Inspect the current routine before retrying; do not omit version checks to force a call through.

## Change requirements

The [workbench](workbench.md) can add examples and revise input/output schemas without editing source. It creates a new immutable task, preserves existing cases, withholds one new case from authoring, and stages the evaluated version. The user applies a passing update explicitly.

Undo restores the preceding task and version. Shared pause controls move with the definition. Prior records remain inspectable to their owning project; read access does not grant activation rights to an unbound definition.

For active-agent authoring, a new requirement set also needs a new prepared task. Repair source against its criteria rather than changing frozen expected results to make a candidate pass.

## Persistence and recovery

Tasks and versions have content-derived IDs. Stored hashes are checked when records are loaded. The database owner can edit local data, so these checks detect corruption rather than defend against that owner.

Automatic improvement preserves the contract and its cases. A candidate must pass evaluation and measured benefit checks before replacing the baseline. Only an owning project's qualifying execution failures can trigger automatic regression recovery; narrower receiving-project grants must not undo a shared definition globally.
