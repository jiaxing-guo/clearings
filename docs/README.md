# Clearings documentation

Clearings is being designed to make straightforward backend code run efficiently as workloads grow. Its planned TypeScript and Python SDKs let an engineer or coding agent describe application operations, while adapters and execution policies supply the information needed to batch, reuse and schedule work.

## Current status

The active repository contains product requirements and the documentation site. The service runtime, SDKs, adapters, CLI and MCP interface are not implemented. The first workload and API examples are proposals; no performance benefit has been established for this product.

| Read                               | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| [Product requirements](product.md) | Approved direction, proposed interfaces, behavior requirements and open decisions      |
| [Development](development.md)      | Set up the repository and check documentation changes                                  |
| [History](history.md)              | Retrieve the earlier analyzer, specification engine, compiler and recorded experiments |

## Execution boundary

The intended model separates application logic, operation capabilities and execution policies. A runtime can combine calls only when the adapter and operation semantics permit it. It must preserve dependencies, output positions and authorization scopes while enforcing the documented resource limits.

The [product requirements](product.md) describe this intended behavior. They are the starting point for technical design, not an API reference for an existing implementation.
