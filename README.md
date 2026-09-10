# Clearings

**Make straightforward backend code run efficiently as workloads grow.**

Clearings is being designed to handle batching, scoped deduplication, concurrency and service limits underneath ordinary application logic. Engineers and coding agents describe operations and execution policies through TypeScript and Python SDKs, with reusable adapters connecting databases and services.

## Status

TypeScript and Python SDKs now execute finite read flows through a shared Rust scheduling core. They support dependencies, joins, bounded maps, local capacity, deadlines and cancellation. Read the [TypeScript guide](docs/typescript.md) or [Python guide](docs/python.md). Service adapters, batching, reuse, shared quotas, CLI and MCP are **not implemented yet**. Performance benefits remain unmeasured.

The earlier repository analyzer, specification engine, Program IR and Rust compiler have been retired from the active tree. Their code, tests and recorded experiments remain available at a pinned historical revision. See [project history and retrieval instructions](docs/history.md).

## Direction

| Application supplies                      | Clearings is intended to manage              |
| ----------------------------------------- | -------------------------------------------- |
| Business logic and operation dependencies | Scheduling compatible work                   |
| Adapter capabilities and result semantics | Batching and mapping results back to callers |
| Explicit reuse and authorization scopes   | Eligible deduplication                       |
| Resource policies and service limits      | Concurrency, admission and quota waiting     |

Execution policies are composable settings. Optional presets can provide defaults. The execution architecture is approved: one embedded Rust scheduling core with native Node and Python bindings, and host-owned I/O. See the [execution contract](docs/execution.md).

Read the [product requirements](docs/product.md) for proposed scope, acceptance scenarios and unresolved decisions. Performance benefits remain to be demonstrated.

## Work on the documentation

Use Node.js 24 and npm 11.9.0. From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix website ci --ignore-scripts
npm run docs:dev
```

Open the local address printed by the development server. Markdown in `docs/` is the authored reference; the Fumadocs site renders it through a generated projection.

Run all current checks:

```sh
npm run check
```

These checks cover formatting, the documentation build, types, links and static search. Runtime and installed-package checks have separate commands in the SDK guides. See the [development guide](docs/development.md) and [contribution guide](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md), including attribution for material in historical revisions.
