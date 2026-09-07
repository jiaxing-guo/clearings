# Documentation maintenance

Author the technical reference under `docs/` as ordinary Markdown. Use standard technical terminology for compiler architecture, programming-language semantics, abstraction, refinement, and validation. Define terms when their meaning is specific to Clearings.

## Structure

The numbered directories separate learning material, architecture, language semantics, interface reference, practical guides, and development status. The website groups these pages into reading paths while preserving their source order and existing URLs. Numeric prefixes determine reading order, not schema versions or maturity levels. Add each current page to [the documentation index](../README.md).

Keep semantic definitions in one reference location. Guides should link to those definitions and demonstrate them with concrete cases. Status documents should cite frozen results rather than duplicating mutable test counts throughout the reference. Historical plans belong in [the archive](../archive/README.md).

Use relative repository links, Markdown tables for exact mappings, and fenced code blocks. Avoid MDX imports, framework components, required frontmatter, and site-specific routing. The Fumadocs integration derives navigation from this organization and preserves one source for the technical content.

## Run the documentation locally

Use Node.js 24, npm 11, and Python 3.9 or newer available as `python3`. From the repository root:

```bash
npm ci --ignore-scripts
npm --prefix website ci --ignore-scripts
npm run docs:dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The command builds the library, prepares validated documentation assets, and starts Next.js. Canonical Markdown changes regenerate the technical pages automatically; refresh the browser if navigation changes are not reflected immediately. Existing website pages and components use Next.js hot reload.

Both `npm run docs:dev` from the repository root and `npm run dev` from `website/` use the same preparation and watch workflow. The default local base path is empty. If port 3000 is occupied, use `npm run docs:dev -- --port 3001` and open [http://localhost:3001](http://localhost:3001). The terminal reports the actual address. Stop the server with Ctrl+C.

Restart after changing the library, specification fixtures, or asset-generation scripts. Those inputs are prepared at startup; the watcher covers the canonical Markdown reference. If you set `DOCS_BASE_PATH` explicitly, include that prefix in the browser URL. The startup output prints the effective documentation path. If `/` and `/docs/` return 404, check this prefix; for `DOCS_BASE_PATH=/clearings-semantic`, the documentation is at `/clearings-semantic/docs/`. To force root-path development, stop the server and run `DOCS_BASE_PATH='' npm run docs:dev` from the repository root.

## Page conventions

| Page type | Presentation order | Required distinction |
| --- | --- | --- |
| Learning material | Concrete question, small example, progressive explanation, next action | What the learner observes versus what the system establishes |
| Practical guide | Goal, prerequisites, steps, expected result, troubleshooting | Application outcomes versus check verdicts |
| Semantics or API reference | Definition, minimal example, exact rules, boundary cases, enforcement limits | Valid input, failed constraints, and unknown results |
| Architecture explanation | Responsibility, worked path, design rationale, limits, related reference | Implemented behavior versus proposed abstractions |

Use the same example through related pages when it clarifies the concept. Keep tables for exact comparisons, code blocks for inputs and outputs, and prominent prose for semantic requirements and limitations. Supplementary raw records may be expandable; required rules must remain visible.

The operation explorer reads generated JSON computed from the existing Hono specification by the public checker. Its selectable cases are authored observations, not recorded executions of Hono. [The generator](../../scripts/prepare-operation-explorer.mjs) retains exact operation records and individual results. The static check recomputes them against the original specification; the UI does not maintain another evaluator.

## Change procedure

1. Identify the affected schema/type, runtime consumer, and semantic distinction.
2. Update the canonical definition and relevant examples together.
3. State whether behavior is implemented, proposed, partially checked, or externally assumed.
4. Preserve literal identifiers, commands, formal expressions, and exact source quotations.
5. Rebase relative links when moving Markdown files.
6. Check links and executable examples before committing.

Avoid replacing established technical terms with informal substitutes. Distinguish well-formedness, integrity, source authentication, claim support, observation agreement, refinement, and acceptance. A passing predicate must not be described as proof of a broader prose obligation.

## Verification

From the repository root:

```bash
npm run docs:check:markdown
```

This command builds the library, checks local inline Markdown link targets and document fragments in `docs/`, README, CONTRIBUTING, and AGENTS, and executes trusted `js runnable` blocks in the current numbered reference. Archived documents and compatibility records are checked for links but never executed. The checker does not fetch external URLs, evaluate ordinary code fences, or compile proposal/source strings as documentation.

The link checker supports the documentation's inline links, ATX heading fragments, and explicit HTML IDs. It does not claim to implement a full Markdown parser or verify external sources. Use that supported syntax for navigation in this directory. Executable examples test behavior through the exported library, without modifying analyzed target source.

Build and check the rendered reference as well:

```bash
npm --prefix website ci --ignore-scripts
npm run docs:build
npm run docs:check
```

The build runs [the technical documentation generator](../../scripts/prepare-technical-docs.mjs). It reads this index and the numbered Markdown files, derives titles from their first headings, and writes ignored Markdown pages and navigation metadata under `website/content/docs/technical/`. Current reference links become local routes. Other repository links point to the Git revision selected by `DOCS_SOURCE_REF`, which defaults to the current commit. Code fences remain literal documentation; the site build does not execute `js runnable` examples.

The generated `technical-reference.json` records source paths, content digests, and routes. The static checker verifies those digests, rendered page titles, local links and fragments, assets, and search results. This detects stale generated documentation as well as broken navigation.

The default production base path is `/clearings-semantic`; local development defaults to the root path. Set `DOCS_BASE_PATH=''` for a root deployment, and use the same value for `docs:build` and `docs:check`.

For a runtime semantics change, also run relevant library tests and typecheck.

## Historical source preservation

Do not rewrite [SPECIFICATION_ARCHITECTURE.md](../SPECIFICATION_ARCHITECTURE.md) as part of routine editorial cleanup: its exact text is embedded in the authored context-assembly specification. If that specification changes intentionally, regenerate and review the resulting identities and artifacts explicitly.

Do not alter frozen experiment manifests, source snapshots, prompts, first submissions, or evaluation inputs to match current documentation. Their original paths remain meaningful inside their own archived baselines. The [archive index](../archive/README.md) explains the relocated Markdown history.
