# Architecture

Clearings has four boundaries: the coding client, the privileged host, the isolated worker, and local storage.

## Coding client

Codex or Claude Code supplies conversation access and source authoring. Bundled skills guide learning, reuse, and management. Hooks register the actual project and supply bounded routine suggestions. MCP exposes the same lifecycle as the CLI.

The client owns its sandbox and tool-approval policy. Clearings does not replace those controls. A normal agent invocation includes model work before and after the routine call.

## Native host

One Rust executable owns project identity, grants, immutable task/version records, evaluation, run accounting, scheduling, and the local workbench. It prepares a request, starts an isolated worker, brokers named operations, and enforces message limits and a shared deadline.

A manifest requests capabilities. Only the host's project policy grants access. Shared routine definitions use the receiving project's grants; source-project permissions do not transfer.

The workbench is a loopback-only UI over the project API. Its local token and origin checks protect the session. Test inputs execute without an authoring request. Proposals use the existing authoring connection and allowance.

## Isolated worker

Oxc prepares TypeScript as JavaScript. QuickJS executes the prepared program in a separate process. The worker cannot directly read files, open network connections, launch programs, or install packages. The only host bridge is `clearings.call`.

Input and output validation run across the supervised process boundary. Native isolation is mandatory. The host records explicit failures when validation, isolation, a capability, or a deadline fails.

## Storage

SQLite stores immutable task criteria, prepared versions, evaluations, active selections, run records, conversation progress, proposals, controls, and usage. Transactions protect activation and compare-and-swap updates. Stored object hashes detect accidental corruption.

Acceptance records are separate from candidate source. The first evaluation of a version is retained. Changing requirements creates another task rather than modifying the prepared record. Workbench revisions retain prior definitions and can restore them through undo.

The database is trusted local state, not a security boundary against its owner. Raw run retention is separate from compact usage totals and immutable criteria.

## Source map

| Module                                                  | Responsibility                               |
| ------------------------------------------------------- | -------------------------------------------- |
| `api`, `mcp`, `main`                                    | Shared operations and transports             |
| `store`, `project`, `reuse`, `library`, `catalog`       | Persistence, scope, discovery and inspection |
| `execute`, `worker`, `isolation`, `capabilities`        | Supervision and runtime boundary             |
| `conversations`, `native_learning`, `proposal`, `model` | Conversation learning and authoring          |
| `management`, `service`, `background`, `improvement`    | Controls, scheduling and improvement         |
| `revision`, `workbench`                                 | User-directed updates and local UI           |
| `prompts`                                               | Build-time embedded authoring instructions   |

The installed runtime requires no external language toolchain. The documentation site uses a separate Next.js/Fumadocs development toolchain.
