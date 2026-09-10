# Project history

The earlier Clearings implementation is preserved at commit [`a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93`](https://github.com/jiaxing-guo/clearings/tree/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93). This exact revision, rather than a moving branch, is the historical reference.

## What it contains

| Historical material                                      | Entry point at the preserved revision                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Repository analysis, semantic exchange and reports       | [Original README](https://github.com/jiaxing-guo/clearings/blob/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93/README.md)                       |
| Operation specifications and context assembly            | [Technical reference](https://github.com/jiaxing-guo/clearings/blob/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93/docs/README.md)              |
| Program IR and compiled execution                        | [Program guide](https://github.com/jiaxing-guo/clearings/blob/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93/docs/04-guides/05-run-programs.md) |
| Independent evaluations, Hono examples and saved results | [Benchmark corpus](https://github.com/jiaxing-guo/clearings/tree/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93/benchmarks)                     |
| Historical dependencies and validation commands          | [Contribution guide](https://github.com/jiaxing-guo/clearings/blob/a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93/CONTRIBUTING.md)              |

The work established a bounded computation language, interpreter and Rust compiler, independent evaluation, execution records and two algorithms used in context assembly. It did not implement the service-operation runtime now described in the [product requirements](product.md).

## Retrieve the earlier implementation

From a clone of this repository, create a separate historical worktree:

```sh
git fetch origin a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93
git worktree add --detach ../clearings-historical a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93
```

Follow that revision's README and contribution guide for its Node and Rust requirements, installation and evaluation commands. Its tests and benchmark claims apply to the historical implementation and recorded scope.

To extract the tracked historical files without installing anything:

```sh
git archive --format=tar --output=../clearings-historical.tar a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93
```

The commit tree is `43b20f5ae6e80bea5cccbb43ad7b44a8e94f65b2`. The historical files, embedded archives, manifests and third-party notices remain unchanged. Git history is retained, so a full clone can still contain the historical data even though those files are absent from the active checkout.

## Compatibility boundary

The cleanup removes the earlier library exports, CLI commands, schemas, source analyzer, specification engine, context assembler, IR compiler and their default CI gates. Existing consumers of those interfaces must use the pinned historical revision. No compatibility shim maps them to the planned service runtime.

The active repository retains licensing, documentation infrastructure and ordinary development tooling. Earlier documentation routes explain their historical status and link to their original source. Old demo downloads and reports are available from the historical revision.

No package or site release is implied by this cleanup. New API compatibility rules and performance claims will be established with the implementation that introduces them.
