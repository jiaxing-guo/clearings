# Embedded routine execution

## Interface

`clearings run-source` reads a source file, contract, input and host policy. Source preparation and execution each start a fresh internal worker. Preparation returns generated JavaScript and a source map; the source-running command prepares on each invocation. The [routine store](routines.md) saves prepared versions and reuses them through the Rust API; CLI/MCP lifecycle commands follow separately.

The routine default-exports an async function. Its result is one of the four outcomes in the [product requirements](product.md). JSON schemas validate inputs and completed outputs. Numbers must be finite and within JavaScript's safe numeric magnitude; use strings for large identifiers. Undefined values, functions and symbols are outside the interchange contract.

`clearings sdk` prints the bundled authoring declarations. TypeScript annotations are transformed, not fully type-checked. Syntax and transformation errors are reported before execution. Module imports requiring a loader fail; no Node package resolution or runtime dependency installation is provided.

## Grants

The routine's `capabilities` list is a request. The caller independently supplies a policy mapping root names to local directories. `files.read` accepts `{root, path}` and returns `{text}`. `files.list` accepts the same input and returns sorted immediate entry names. Paths must be relative and contain no parent traversal. Capability-scoped directory handles prevent symlinks from escaping the granted root. Only regular UTF-8 files are read; nonblocking opens prevent a named pipe from blocking the broker.

A caught capability error cannot be turned into a completed run; an explicit handoff or non-applicable outcome remains available.

Reads and directory listings are bounded by output bytes; directories also have an entry limit. No project scripts are executed. Grants are supplied per invocation and never stored inside generated source.

## Process boundary

The host launches its own executable in worker mode with a cleared environment and anonymous input/output pipes. Worker stdout carries only bounded protocol messages. The worker cannot access the host database or credentials. On Linux, a syscall allowlist permits computation and existing descriptors, while denying file opens, sockets, child processes and filesystem mutation. On macOS, a Seatbelt profile restricts the worker after executable loading. Failure to install the sandbox prevents execution.

QuickJS heap and stack limits supplement parent-enforced wall deadlines and protocol/output limits. Linux applies an address-space limit to the worker; macOS does not claim an equivalent whole-process memory limit. The supervisor kills and reaps its worker on completion or failure. OS isolation and library correctness require platform-specific tests; merely using Rust or a subprocess is not a sandbox.

Capability calls cross the pipe to the broker. File operations use a process-wide pool of four I/O threads with at most four queued requests. Waiting for a result respects the remaining invocation deadline. An operating-system file call already in progress may outlive its caller; its pool slot remains occupied until it returns. Saturation fails explicitly, and queued work whose deadline has expired is skipped. This bounds lingering read-only work without creating a thread for every timed-out call. Opening granted roots during policy construction is setup work outside the invocation deadline. The initial implementation services calls serially, including calls written through `Promise.all`; it does not yet claim concurrent dispatch or batching. The host applies the declaration and its own grants independently for each operation.

## Measurement

Each run returns an outcome, elapsed milliseconds, a capability request count and optional model usage. This execution engine makes no model calls. Usage of the surrounding agent session is unknown unless captured separately. Source preparation is outside the run interval for this command and must be included separately in an end-to-end comparison.

## Technical references

- [Oxc transformation](https://oxc.rs/docs/guide/usage/transformer/typescript.html)
- [rquickjs embedding](https://docs.rs/rquickjs/latest/rquickjs/)
- [QuickJS runtime controls](https://bellard.org/quickjs/quickjs.html)
- [Capability-scoped filesystem API](https://docs.rs/cap-std/latest/cap_std/fs/struct.Dir.html)
