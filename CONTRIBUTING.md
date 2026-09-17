# Contributing

Clearings turns repeatable agent work into tested routines. Start with the [product](docs/product.md), [architecture](docs/architecture.md), and [development guide](docs/development.md).

A useful change has a concrete user need, a clear caller, and checks for its behavior. Keep grants, isolation, immutable acceptance criteria and explicit failures intact. Do not make users configure a model or write code to complete the normal installation and daily flows.

Keep `docs/` as the authored reference and Fumadocs as its presentation. Document implemented behavior in plain language. Mark measurements, test fixtures and proposed interfaces accurately.

Use Conventional Commits. Run the relevant runtime or browser tests and the maintained-content checks. A PR should explain the problem, resulting behavior, validation, and any migration or operational limit. Do not merge, publish a package, or deploy as an incidental step.

The source is licensed under [Apache License 2.0](LICENSE). Preserve applicable [third-party notices](THIRD_PARTY_NOTICES.md).
