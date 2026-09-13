# Clearings documentation

Clearings turns user-selected repeated agent work into reusable TypeScript routines. A Rust host prepares and executes each routine in an isolated worker with explicit inputs, outputs and capabilities.

## Current status

The embedded execution boundary supports parameterized TypeScript, JSON schemas, bounded file capabilities and explicit handoff outcomes. SQLite persistence, recorded acceptance cases, version activation, CLI/MCP and Codex/Claude Code skill plugins are implemented. Three user-defined workflows exercise reuse and handoff. Oxc removes TypeScript syntax; it does not perform full type checking. Token savings remain unmeasured.

| Read                               | Purpose                                          |
| ---------------------------------- | ------------------------------------------------ |
| [Product requirements](product.md) | Product direction and implementation boundaries  |
| [Execution](execution.md)          | Implemented runtime, capabilities and limits     |
| [Development](development.md)      | Build and check the repository                   |
| [Routine versions](routines.md)    | Acceptance, activation and run records           |
| [Agent integration](agents.md)     | CLI, MCP and coding-agent setup                  |
| [Workflows](workflows.md)          | Three complete examples                          |
| [Installation](installation.md)    | Packaged binaries and source builds              |
| [History](history.md)              | Retrieve earlier implementations and experiments |
