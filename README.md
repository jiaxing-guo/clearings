# Clearings

**Turn repeated agent work into reusable TypeScript routines.**

Clearings gives Codex and Claude Code a local execution boundary for work that should not need to be rediscovered on every run. The agent writes a parameterized routine; Clearings prepares it, checks its behavior, and executes it through explicitly granted tool operations. Unfamiliar cases return to the agent with structured context.

The native Rust executable embeds the TypeScript transformer and JavaScript engine. Installed users do not need Node, Python, npm, or a Rust compiler. The project being worked on can use any language.

## Status

Isolated TypeScript execution, scoped file and HTTP GET capabilities, immutable routine storage, fixture evaluation, explicit activation and run records are implemented through the Rust API. The source-running CLI is available; CLI/MCP lifecycle operations, agent integrations and complete teach-and-reuse examples follow in the [product requirements](docs/product.md).

The implementation is under development. Passing runtime tests does not establish general-purpose task correctness or token savings. See [execution](docs/execution.md) for the supported boundary and [development](docs/development.md) for checks.

## Build and run

Building from source requires Rust and a C toolchain; these are developer dependencies. Rustup selects the pinned toolchain.

```sh
cargo build --locked --release
./target/release/clearings sdk
./target/release/clearings run-source --source examples/read-file/routine.ts --contract examples/read-file/contract.json --input examples/read-file/input.json --policy examples/read-file/policy.json
```

Routines default-export an async function and return an explicit outcome:

```typescript
export default async function (input: { root: string; path: string }) {
  const result = await clearings.call('files.read', input);
  return { status: 'completed', output: result.text };
}
```

The host grants named directory roots separately from the routine contract. File access cannot escape those roots. The worker has no Node APIs, direct network access, or package installation. TypeScript transformation does not perform full type checking; runtime schemas and behavioral cases serve different checks.

## Documentation

Authored reference lives in `docs/`; Fumadocs renders it. Documentation development retains its existing Node toolchain, independently of the distributed runtime.

```sh
npm ci --ignore-scripts
npm --prefix website ci --ignore-scripts
npm run docs:dev
npm run check
```

The earlier analyzer, Program IR and compiler remain at their [historical revision](docs/history.md). Their evidence does not describe the new runtime.

## License

[Apache License 2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md).
