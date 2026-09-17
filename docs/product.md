# Product

## Purpose

Reduce repeated model work by turning authorized, repeatable agent steps into reusable routines. The agent chooses suitable work, helps establish its requirements, and handles interpretation. Clearings prepares, evaluates, stores, and executes the code.

The product targets users of local Codex and Claude Code. Installation uses defaults. Users customize behavior through conversation or the [workbench](workbench.md), without writing source or managing routine IDs.

## Choose the right work

Use a skill for instructions, decision rules, and context that an agent needs to understand. Use a routine for a repeatable sequence that code can perform with explicit inputs and checkable results.

Strong candidates collect and validate research receipts, normalize file-backed data, group logs, or compare observations from known sources. Open-ended research, writing, and strategic judgment remain agent work. Complex tasks often benefit from a routine for one mechanical part, rather than code for the whole task.

Savings depend on the work replaced. Discovery, approval, tool invocation, and the final model answer still have costs. [Performance](performance.md) separates those costs from native execution.

## Default experience

- One user-wide plugin installation serves working projects.
- Trusted client startup registers the actual project and its read grant.
- An explicit learning request starts with the current project.
- Daily learning reviews recent local conversations across projects through the existing coding client.
- A bounded local prompt lookup supplies relevant accepted routines. A clear match can run directly.
- Empty and unchanged checks stay quiet.
- Natural-language controls cover status, frequency, pause, exclusion, and undo.

The defaults are daily learning, a seven-day initial lookback, up to three candidate workflows per cycle, and six authoring requests per UTC day. One candidate repair uses the same allowance. Request counts are not a dollar spending guarantee.

## Routine lifecycle

A routine has a contract: its name, behavior, JSON input/output schemas, requested capabilities, and resource limits. Acceptance cases define expected outcomes independently of candidate source. Preparation freezes those criteria. Source submission cannot change them.

Oxc transforms TypeScript and QuickJS runs the derived JavaScript. Transpilation does not provide full TypeScript type checking. Evaluation and runtime schemas establish different parts of the boundary.

Only a passing version can be activated. Replacements check the version they expect to replace. Requirement changes create another immutable task; the workbench preserves existing cases, stages a tested proposal, and lets the user apply or undo it.

## Execution boundary

Generated code runs outside the privileged host. It has no ambient Node APIs, package installation, direct filesystem access, or direct network access. Named capabilities pass through a broker that checks the manifest, the current project's grants, input shape, limits, and deadline. Failure to establish OS isolation stops execution.

The runtime supports bounded file reading/listing and configured JSON HTTP GET operations. It does not provide arbitrary shell execution, general browser automation, or file writes to routines.

Saved code runs against fresh inputs. Reuse is not output caching. Test runs, real reuse, and unclassified calls are reported separately. Missing usage remains unknown.
