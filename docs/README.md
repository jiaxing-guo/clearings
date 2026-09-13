# Clearings documentation

Clearings turns user-selected repeated agent work into reusable TypeScript routines. A Rust host prepares and executes each routine in an isolated worker with explicit inputs, outputs and capabilities.

## Current status

The embedded execution boundary supports parameterized TypeScript, JSON schemas, bounded file capabilities and explicit handoff outcomes. Routine persistence and coding-agent integration are planned next. Oxc removes TypeScript syntax; it does not perform full type checking. Token savings remain unmeasured.

| Read                               | Purpose                                          |
| ---------------------------------- | ------------------------------------------------ |
| [Product requirements](product.md) | Product direction and implementation boundaries  |
| [Execution](execution.md)          | Implemented runtime, capabilities and limits     |
| [Development](development.md)      | Build and check the repository                   |
| [History](history.md)              | Retrieve earlier implementations and experiments |
