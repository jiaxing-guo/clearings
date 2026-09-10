# Clearings documentation

Clearings is being designed to make straightforward backend code run efficiently as workloads grow. Its TypeScript and Python SDKs describe operations and dependencies through a shared embedded Rust core. Batching, reuse and shared admission remain subsequent capabilities.

## Current status

The current executable slice supports finite read flows, joins, bounded maps, local capacity, cancellation and deadlines in both SDKs. The product-card examples use fake adapters. Real service adapters, batching, reuse, shared quotas and CLI/MCP remain subsequent work; no performance benefit has been established.

| Read                               | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| [Product requirements](product.md) | Approved direction, proposed interfaces, behavior requirements and open decisions      |
| [Development](development.md)      | Set up the repository and check documentation changes                                  |
| [History](history.md)              | Retrieve the earlier analyzer, specification engine, compiler and recorded experiments |

## Execution boundary

The intended model separates application logic, operation capabilities and execution policies. A runtime can combine calls only when the adapter and operation semantics permit it. It must preserve dependencies, output positions and authorization scopes while enforcing the documented resource limits.

The [product requirements](product.md) describe this intended behavior. They are the starting point for technical design, not an API reference for an existing implementation.

## Execute flows

- [Execution contract](execution.md)
- [TypeScript SDK](typescript.md)
- [Python SDK](python.md)
