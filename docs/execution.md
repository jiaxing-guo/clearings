# Execution and permissions

A saved routine is a default-exported async TypeScript function. It receives JSON input and returns an explicit outcome. Oxc prepares the source; QuickJS executes the derived JavaScript in an OS-isolated worker.

## Outcomes

| Status           | Meaning                                             |
| ---------------- | --------------------------------------------------- |
| `completed`      | Output satisfies the routine's output schema        |
| `needs_agent`    | The routine needs interpretation or additional work |
| `not_applicable` | The input is outside the routine's intended scope   |
| `failed`         | Execution could not complete correctly              |

A completed execution is not proof that a task is correct for every possible input. A failed read, timeout, missing observation, or unsupported format must not become an empty successful result.

## Capabilities

A capability is a named operation a routine can request through `clearings.call`. The host checks both the routine's declaration and the current project grant.

### Read and list files

`files.read` accepts a granted root alias and a relative path, then returns UTF-8 text. `files.list` lists bounded entries under a granted directory. Absolute paths, parent traversal, and escapes through symlinks are rejected. Files must remain within the granted roots.

Prefer `{root, path}` inputs when the source is an artifact. Read and parse it inside the routine instead of copying its contents into model-generated arguments. Returned data still needs to fit the task and output limits.

### Configured HTTP operations

A named binding permits JSON GET requests to a fixed endpoint. The policy specifies allowed query keys, response schema, timeout/body bounds, and an optional credential environment-variable reference. Query values must be strings. The routine cannot select another URL or supply credentials.

HTTPS is required except for explicit loopback endpoints. Redirects and environment proxies are disabled. Missing credentials, bad responses, and schema failures remain explicit.

## Isolation

Generated code has no ambient Node APIs, module imports, package installer, direct filesystem access, or direct network access. A separate native worker enforces the supported OS boundary. If isolation cannot be established, Clearings fails closed.

The host owns the capability broker and grants. The worker can request operations, but it cannot create permissions. Approval from the coding client and permission from the Clearings policy are separate checks.

## Limits

A contract sets wall time, JavaScript heap size, output bytes, and capability-call count. Runtime ranges are enforced when the contract is prepared and used. IPC messages are bounded to 4 MiB, including their framing; source is bounded to 256 KiB. The same invocation deadline covers validation, execution, and broker work.

JSON boundaries reject values that cannot be represented safely, including non-finite numbers and unsafe integer values. Output schemas are checked separately from TypeScript transpilation. Transpilation does not perform full TypeScript type checking.

## Run evidence

A run records the active version, input digest, outcome, elapsed native time, capability count, and purpose. Normal use is labelled `reuse`; explicit trials are `test`. Test failures do not trigger automatic regression rollback. Test fixture capture is bounded and reports unavailable evidence rather than inventing it.

Runtime timing does not include the whole coding-agent conversation. See [performance](performance.md) and [activity](activity.md) for the measurement boundary.
