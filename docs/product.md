# Product requirements

## Purpose

Turn user-selected repeated agent work into reusable programs. The initial experience is: select completed work, describe what should vary, have the active agent author a TypeScript routine, evaluate it, and reuse it with new inputs. Users customize behavior through their existing Codex or Claude Code conversation.

The same execution interface supports repository context gathering, log grouping, data normalization and other read-and-transform work. These are examples, not special cases in the runtime. The first release does not require a specific SaaS integration or a prescribed workflow template.

## Implementation sequence

| Change                              | Scope                                                                                                                  | Acceptance                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Embedded TypeScript execution       | Native Rust CLI, Oxc, QuickJS, OS-isolated worker, schemas, file capabilities                                          | Parameters, asynchronous routine results, denied access, timeouts, malformed results and worker failures |
| Reusable routine versions           | SQLite registry, immutable contracts and bundles, evaluation, activation, configured JSON HTTP operations, run records | Restart and revision, independent cases, failed-candidate isolation, credential scoping                  |
| Agent teaching and reuse            | CLI/MCP lifecycle and thin Codex/Claude integrations                                                                   | User-selected evidence leads to a submitted routine; the user revises it conversationally                |
| Complete workflows and distribution | Three distinct workflows, portable native packages and end-to-end verification                                         | New inputs, changed sources, explicit fallback, no user language-toolchain dependencies                  |

These are capability boundaries for dependent implementation PRs. Only implemented behavior should be described as available in the README.

## Routine contract

Each routine has a stable name, ABI version, input and output JSON schemas, a capability request list and execution limits. Executable versions contain original TypeScript, generated JavaScript, a source map and their preparation identity. Credentials and user grants live outside these bundles.

Outcomes are `completed`, `not_applicable`, `needs_agent` and `failed`. Completed output must satisfy the output schema. A timeout, unavailable source or incomplete observation must never become a successful empty result. Handoff carries structured context; it does not restore a model's internal state.

The agent can propose acceptance cases before authoring a candidate. Once a task contract is prepared, candidate submission cannot modify its acceptance criteria. Additional independent cases are necessary to demonstrate reuse; one successful trace only demonstrates that execution. Evidence supplied as an agent summary must be labeled accordingly.

## Runtime and installation

One Rust executable provides CLI, MCP and internal worker modes. Oxc transforms supported TypeScript to JavaScript. QuickJS is embedded through rquickjs. Runtime users need no Node, Python, npm or Rust compiler. Release builds still require Rust and a C compiler, and the existing documentation site retains its development dependencies.

The privileged host owns grants and tool operations. A separate worker runs each preparation or execution with OS isolation and resource limits. No generated routine executes inside the privileged host. The initial platform targets are Linux x86_64/aarch64 and macOS; unsupported isolation fails explicitly. Actual platform support requires passing its runtime gate.

The minimal authoring environment has one default-exported async function, ordinary TypeScript syntax and a small capability SDK. It has no ambient Node/OS APIs or dependency installer. Full TypeScript type checking is not supplied by the source transform. Only the embedded engine's compatible language features are supported.

## Initial capabilities

The first implementation reads and lists files under named, explicitly granted roots. The following implementation adds configured HTTP JSON operations: fixed endpoint, permitted query parameters, response schema, bounded timeout/body, and broker-owned credential reference. The host checks every request; routine declarations cannot widen grants. No arbitrary shell access is used as an integration shortcut.

Executing a routine against fresh inputs is different from caching its output. Cross-run result caching, automatic batching and write effects are later capabilities requiring their own semantics. Ordinary host projects and installed agents remain external dependencies; Clearings cannot make their tools disappear.

## User-directed learning

The active host agent supplies selected task evidence and authors source using a bundled SDK. Clearings provides the execution and evaluation lifecycle through the same interface in each host. Historical transcript access is limited to user-selected available evidence. Reconstructed summaries are not exact tool recordings.

The initial product runs on demand. Always-on transcript scanning, scheduled background synthesis, remote workers and routine distribution are later extensions. No separate model API key is needed merely to submit source authored by the existing agent.

## Success and limits

A complete release must show three materially different tasks using the same lifecycle, at least one previously unseen supported input for each, conversational revision, and an explicit unsupported or failing case. Runtime correctness is necessary but does not by itself show agent benefit.

Record elapsed time, capability requests and results, evaluation and preparation costs, and model usage when the host actually exposes it. Missing usage stays unknown. Distinguish user-supplied estimates from recorded usage. Interactive invocation still uses the host agent; report avoided intermediate work and count generation, repairs and fallback against savings.

No percentage saving or general correctness guarantee is claimed by this plan. The original Clearings implementation and its results remain in [history](history.md).
