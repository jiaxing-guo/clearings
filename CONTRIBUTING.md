# Contributing to Clearings

Start with the [product requirements](docs/product.md). Clearings is preparing a managed execution runtime for backend operations; the runtime and SDKs are not implemented yet.

The [development guide](docs/development.md) contains setup commands, validation and documentation conventions. The [historical revision](docs/history.md) preserves the earlier implementation and its evidence.

For a change:

1. Identify the user need and relevant requirement. Resolve API or behavior decisions before building abstractions around them.
2. Implement a coherent change with documentation that states what is available and what remains proposed.
3. Run the checks for the affected behavior and `npm run check`. Describe validation and any remaining limitations in the PR.

Use Conventional Commit messages and capability names in code and PR metadata. Keep dependencies and abstractions tied to current work. Add examples and tests with the feature they exercise, rather than copying the retired test corpus into new packages.

The repository is licensed under [Apache License 2.0](LICENSE). Preserve applicable [third-party attribution](THIRD_PARTY_NOTICES.md).
