# Documentation maintenance

Author the technical reference under `docs/` as ordinary Markdown. Use standard technical terminology for compiler architecture, programming-language semantics, abstraction, refinement, and validation. Define terms when their meaning is specific to Clearings.

## Structure

The numbered directories separate architecture, language semantics, interface reference, practical guides, and development status. Numeric prefixes determine reading order, not schema versions or maturity levels. Add each current page to [the documentation index](../README.md).

Keep semantic definitions in one reference location. Guides should link to those definitions and demonstrate them with concrete cases. Status documents should cite frozen results rather than duplicating mutable test counts throughout the reference. Historical plans belong in [the archive](../archive/README.md).

Use relative repository links, Markdown tables for exact mappings, and fenced code blocks. Avoid MDX imports, framework components, required frontmatter, and site-specific routing. The Fumadocs integration derives navigation from this organization and preserves one source for the technical content.

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

Use `npm run docs:dev` for local preview. Restart this command after changing the canonical Markdown; it regenerates the technical pages before starting Next.js. The default deployment base path is `/clearings-semantic`. Set `DOCS_BASE_PATH=''` for a root deployment, and use the same value for `docs:build` and `docs:check`.

For a runtime semantics change, also run relevant library tests and typecheck.

## Historical source preservation

Do not rewrite [SPECIFICATION_ARCHITECTURE.md](../SPECIFICATION_ARCHITECTURE.md) as part of routine editorial cleanup: its exact text is embedded in the authored context-assembly specification. If that specification changes intentionally, regenerate and review the resulting identities and artifacts explicitly.

Do not alter frozen experiment manifests, source snapshots, prompts, first submissions, or evaluation inputs to match current documentation. Their original paths remain meaningful inside their own archived baselines. The [archive index](../archive/README.md) explains the relocated Markdown history.
