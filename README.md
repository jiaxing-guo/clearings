# Clearings

**A compiler and execution runtime for agentic coding.**

Clearings is building a way for coding agents to change programs against explicit behavioral requirements. It separates what a program should do from its implementation, then validates, compiles, executes, and evaluates that implementation.

Today, Clearings can execute typed programs, compile them to Rust, and check their behavior against independently defined expectations. It runs two of its own algorithms this way: selecting required operation dependencies, then selecting the modeled states and supporting sources for context assembly. The dependency algorithm includes a separately evaluated agent improvement.

**Status:** early development. The compiler and runtime work within a documented, bounded language. Automatic translation from natural-language requirements to programs is future work.

[Documentation](docs/README.md) · [Program guide](docs/04-guides/05-run-programs.md) · [Roadmap](docs/05-development/01-status-and-roadmap.md) · [Contributing](CONTRIBUTING.md)

## Quickstart

Use Node.js 24, npm 11, and Git 2.51 or later. Development targets Linux and macOS; verification currently runs on Linux. Windows support is pending. Build from source; there is no published npm release.

```bash
git clone https://github.com/jiaxing-guo/clearings.git
cd clearings
npm ci --ignore-scripts
npm run program -- demo
```

The demo runs required dependency closure through the reference interpreter. Its result contains the ordered operation IDs:

```json
["root", "a", "z", "y", "b"]
```

The algorithm is represented in [Program IR](programs/clearings/required-dependency-closure.json), a typed intermediate representation with values, collections, bindings, branches, loops, calls, and explicit failure. Inspect its functions as typed pseudocode:

```bash
npm run program -- inspect closure
```

No model provider or API key is required. See [Run and inspect a program](docs/04-guides/05-run-programs.md) for custom inputs and execution reports.

## Compile and run with Rust

Export deterministic Rust source:

```bash
npm run program -- compile closure --out compiled/closure
```

Source export needs no Rust installation and requires a new output directory. To execute the generated code, install [rustup](https://rust-lang.org/tools/install/), the pinned Rust 1.85.1 toolchain, and a host linker:

```bash
rustup toolchain install 1.85.1 --profile minimal
npm run program -- demo --backend rust
```

The reference interpreter and Rust runtime enforce the same defined value semantics and logical resource limits. [Compile and run with Rust](docs/04-guides/06-compile-and-run-rust.md) covers the compiler API, native execution, and artifact validation.

## What works today

| Capability             | What it provides                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Operation contracts    | Typed inputs, outcomes, state changes, effects, and explicit unresolved requirements                      |
| Program IR             | Static validation and reference execution of typed algorithms                                             |
| Rust backend           | Deterministic source generation and native execution with bounded resources                               |
| Production use         | Context assembly executes compiled closure and state/source selection with verified reusable executables  |
| Independent evaluation | Frozen cases, separately defined expectations, faulty-program controls, and replayable execution evidence |
| Source inspection      | Bounded TypeScript analysis, source references, agent context, and human-readable reports                 |

The accepted dependency-closure candidate was evaluated over **1,561 frozen cases**. It used **79.4% fewer logical work units** on the recorded 256-operation chain and completed the 512-operation chains under unchanged limits. These are bounded algorithm results, not a general latency or agent-productivity claim. The state/source selector passes 4,632 frozen cases with matching reference/native results and accounting; see its [contract and evaluation](docs/02-semantics/07-context-selection.md). Read the [closure evaluation and its limitations](docs/05-development/09-agent-ir-improvement.md) and the [recorded experiments](benchmarks/agent-runs/README.md).

Clearings does not yet synthesize complete applications, prove arbitrary programs correct, or replace a general coding agent. Native execution is synchronous and requires a trusted local toolchain; its resource accounting is not a security sandbox. The compiler is not self-hosting. [Architecture](docs/01-architecture/01-system.md) and [validation limits](website/content/docs/concepts/limits.mdx) describe the boundaries.

## Explore contracts and evidence

The [first operation contract](docs/00-learn/01-first-contract.md) follows one requirement through passing, failing, and incomplete observations. The [conformance guide](docs/04-guides/04-evaluate-context-conformance.md) shows how to capture and independently evaluate context assembly:

```bash
npm run conformance
```

This workflow requires Rust 1.85.1 and a host linker when preparing the native executable. It writes evidence and a readable report to a new directory and prints its path.

The earlier [Hono demonstrations](benchmarks/results/hono-shared/README.md) illustrate source interpretation and report presentation. They remain historical examples with their original evidence and limitations.

## Read the docs locally

Documentation preparation also requires Rust 1.85.1, a host linker, and Python 3.9 or newer as `python3`. After the root dependency install above:

```bash
npm --prefix website ci --ignore-scripts
npm run docs:dev
```

Open [localhost:3000](http://localhost:3000). To use another port, run `npm run docs:dev -- --port 3001`. Changes to the numbered Markdown reference regenerate automatically.

The authoritative documentation lives in [docs/](docs/README.md); Fumadocs renders it for the browser. See [documentation maintenance](docs/05-development/02-documentation.md) for production builds and validation.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [roadmap](docs/05-development/01-status-and-roadmap.md). Small, reproducible improvements to the language, compiler, runtime, evaluation, and documentation are useful.

```bash
npm run format:check
npm run typecheck
npm test
```

The full test suite requires the pinned Rust toolchain, a host linker, and Python. Maintained TypeScript and Markdown use Prettier; Rust uses rustfmt. Preserve frozen experiment records when making changes.

## License

Clearings is licensed under [Apache License 2.0](LICENSE). Bundled Hono source excerpts retain their MIT license; see [third-party notices](THIRD_PARTY_NOTICES.md).
