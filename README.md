# Clearings

**Internal representation for AI coding.**

Clearings connects repository code to behavior. It keeps the conditions, state changes, failure paths, and source evidence behind an explanation in linked semantic records. People read those records through reports. Coding agents receive a bounded selection for a specific question.

- **Overview reports** explain purpose, main actions, outcomes, and limits.
- **Engineer guides** explain mechanisms with exact code and canonical function contracts.
- **Typed operation records** keep conditions, outcomes, state, effects, and open decisions together for inspection and context export.

This is a private, unpublished review prototype. The included Hono example covers request dispatch and middleware composition. Independent claim-support review is pending.

## Try it

Use Node.js 24, npm 11, and Git 2.51 or later. Run these commands from an authorized checkout on Linux or macOS. Windows support is pending.

```bash
npm ci --ignore-scripts
npm run build
node dist/cli/main.js inspect specifications/hono/response-selection.json --operation response-selection
```

The result contains typed operations with individual function responsibilities and exact attached source. No Hono checkout or API key is needed. This is an authored source interpretation; hash checks establish integrity, not source authenticity or claim support.

Export the rules for an agent:

```bash
node dist/cli/main.js context specifications/hono/response-selection.json --operation response-selection --max-bytes 131072
```

The pack retains each required operation, its conditions, decisions, and source. Its byte count covers exact compact JSON plus its final newline. Read [the typed specification guide](docs/04-guides/01-check-a-case.md) to check a concrete case or use the API.

Clearings also has a proposed specification for its own context assembler. [Review the self-use demo](benchmarks/results/clearings-bootstrap/README.md) or download [its review package](benchmarks/results/clearings-bootstrap/clearings-specification-review.zip). Intended requirements and observed source behavior remain separate artifacts.

Record and independently evaluate the current context assembler:

```bash
npm run conformance
```

The command builds the CLI and writes raw evidence, JSON evaluations, and `report.md` for 36 cases to a unique directory under `../clearings-conformance-runs`. It prints the output path. Scoped acceptance remains separate from the broader contract's unknown obligations. [Evaluate and replay conformance](docs/04-guides/04-evaluate-context-conformance.md) explains the full domain, independent controls, saved-evidence replay, and failure reports.

Program IR v0.1 defines typed implementation bodies with static validation and a reference interpreter through `clearings/program`. It supports collections, bindings, branching, iteration, IR-defined calls, and typed application failures. `executeProgram` executes the declared entry function with finite resource limits and distinct return, application-failure, runtime-fault, and exhaustion results. Clearings now expresses [ordered required dependency closure](docs/02-semantics/06-required-dependency-closure.md) in IR and checks it against independent graph-domain expectations. `npm run test:program` checks validation, execution semantics, and the closure algorithm. See [Program IR semantics](docs/02-semantics/05-program-ir.md), [artifact interfaces](docs/03-reference/06-program-artifacts.md), and [program execution](docs/03-reference/07-program-execution.md). The integrated program CLI remains planned.

## Explore the three demos

Download [the review package](benchmarks/results/hono-shared/clearings-shared-review.zip), extract it, and open `index.html`. All reports contain their own assets. You can also read the Markdown files on GitHub.

| View | Request dispatch | Middleware composition |
| --- | --- | --- |
| Overview | [Purpose and outcomes](benchmarks/results/hono-shared/request-dispatch.overview.md) | [Purpose and outcomes](benchmarks/results/hono-shared/middleware-composition.overview.md) |
| Engineer | [Conditions and source](benchmarks/results/hono-shared/request-dispatch.engineer.md) | [Conditions and source](benchmarks/results/hono-shared/middleware-composition.engineer.md) |

[Inspect the typed response decisions](benchmarks/results/hono-shared/internal.md) to compare conditions, state changes, function responsibilities, and source. Agents receive `operation.context.json`; HTML is the human view. The typed slice is bound to checked source from the historical model. The accepted reading guides retain that original model; the [legacy walkthrough](benchmarks/results/hono-shared/internal-legacy.md) remains available.

The model has 22 function contracts, four behavior contracts, 73 assertions, and ten critical unknowns. The [recorded agent demonstration](benchmarks/agent-runs/hono-comprehension/README.md) answers six questions from selected IR. It is an author demonstration with prior source exposure, not an independent evaluation or an efficiency benchmark.

## Build a model from source

Clearings provides this workflow:

1. **Scan** a Git commit for bounded TypeScript structure and exact evidence.
2. **Export** a request for an external authoring agent or person.
3. **Import** the proposal after checking its schema, source, and references.
4. **Inspect, export context, or render** the resulting model.

The library has no built-in model endpoint. Scans read immutable Git objects; they do not run target scripts, install target dependencies, or modify target files. Semantic assertions remain proposed interpretations. A citation resolving does not prove a claim.

[Start with the quickstart](website/content/docs/quickstart.mdx), [use the library API](website/content/docs/reference/library.mdx), or [read the validation limits](website/content/docs/concepts/limits.mdx).

## Documentation

Start with [Your first operation contract](docs/00-learn/01-first-contract.md), use the [practical guides](docs/04-guides/01-check-a-case.md), or consult the [technical reference](docs/README.md). Fumadocs presents the canonical Markdown in four reading paths: learning, guides, reference, and architecture. The operation-contract page compares passing, failing, and incomplete observations.

To read and edit the documentation locally, use Node.js 24, npm 11, and Python 3.9 or newer under `python3`. From the repository root:

```bash
npm ci --ignore-scripts
npm --prefix website ci --ignore-scripts
npm run docs:dev
```

Open [http://localhost:3000](http://localhost:3000). The command builds the library, prepares the documentation assets, and starts Next.js. Changes under the canonical numbered `docs/` directories regenerate automatically. Use `npm run docs:dev -- --port 3001` if you need another port, and stop with Ctrl+C.

For a production export and validation:

```bash
npm run docs:check:markdown
npm run docs:build
npm run docs:check
```

Output is written to `website/out`. Production builds default to `/clearings`; local development defaults to `/`. Set `DOCS_BASE_PATH=''` for a root production export and use the same value for `docs:check`. [Documentation maintenance](docs/05-development/02-documentation.md) describes the authoring conventions, watcher scope, and verification checks. Public hosting and package publication remain separate scope decisions.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, focused changes, documentation work, and source-backed reviews.

```bash
npm run typecheck
npm test
```

The archive tests require Python 3.9 or newer under the `python3` command.

The [status and roadmap](docs/05-development/01-status-and-roadmap.md) records scope and remaining work. Historical artifacts and their replay stay available. Distributed Hono excerpts include the upstream [MIT notice](benchmarks/results/hono-shared/LICENSE-HONO).
