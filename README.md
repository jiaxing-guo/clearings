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

The pack retains each required operation, its conditions, decisions, and source. Its byte count covers exact compact JSON plus its final newline. Read [typed specifications](docs/TYPED_SPECIFICATIONS.md) to check a concrete case or use the API.

Clearings also has a proposed specification for its own context assembler. [Review the self-use demo](benchmarks/results/clearings-bootstrap/README.md) or download [its review package](benchmarks/results/clearings-bootstrap/clearings-specification-review.zip). Intended requirements and observed source behavior remain separate artifacts.

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

The documentation uses Fumadocs and Next.js static export. It includes guides, concepts, API and CLI references, and the three demos.

```bash
npm ci --prefix website --ignore-scripts
npm run docs:build
npm run docs:check
```

Documentation commands require Python 3.9 or newer, available as `python3`, to verify the demo archives. The static output is in `website/out`. The default base path is `/clearings-semantic` for a future GitHub Pages project site. Set `DOCS_BASE_PATH=''` for a root-path build. Search uses a local static index. CI, serving, and public access are deferred; no hosted documentation URL is claimed.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, focused changes, documentation work, and source-backed reviews.

```bash
npm run typecheck
npm test
```

The archive tests require Python 3.9 or newer under the `python3` command.

The [active plan](docs/PROTOTYPE_PLAN.md) records scope and remaining work. Historical artifacts and their replay stay available. Distributed Hono excerpts include the upstream [MIT notice](benchmarks/results/hono-shared/LICENSE-HONO).
