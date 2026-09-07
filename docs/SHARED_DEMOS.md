# Shared reports, internal walkthrough, and documentation

Planning label: M4. The three required demos now use the same v0.2 semantic artifact. The implementation preserves the accepted overview and engineer reading order and the historical v0.1 artifacts.

## What changed

`ContractPresentationPlan` binds audience prose to the contract model. It references canonical functions through `function_bindings` and retains each capability's behavior IDs. The renderer generates contract fields from their records, including inputs, outputs, state access, effects, failures, dependencies, assumptions, and unknowns.

The report reference scope includes required function dependencies and related functions in their components. This keeps local defaults and supporting accessors reachable. Component membership is labeled as a reference relationship; it does not establish that a function runs on a particular path. Context export retains its existing required-selection rules and byte budget.

All 73 assertions and 22 function contracts remain reachable across the two capabilities. The dispatch reference contains 22 functions and 73 assertions; the composition reference contains 12 functions and 41 assertions. The article remains short; the contract audit is expandable. Exact source and partial-range labels are preserved.

`createSemanticWalkthrough` uses actual inspection and context APIs. It follows a selected behavior through a participating function, shared state, an assertion, and an attached source excerpt. Its relationship table is generated from the behavior. JSON-only use reports `source_rechecked: false`; the reproduced bundle supplies the scan and repository and rechecks source.

## Recorded comprehension example

The active Codex session answered six questions from two context packs totaling 166,178 bytes. The answer phase read assertions, state-access function fields, state concepts, and unknowns. It requested no extra source. The author then reviewed the 11 supplied excerpts and made one condition exact: the composition assignment tests `finalized === false`.

The [run record](../benchmarks/agent-runs/hono-comprehension/README.md) preserves inputs, initial answers, final answers, review, and hashes. Expected distinctions remain outside the input. They were written after the initial answers, so this is a post-hoc author assessment.

Five behavior questions are assessed as supported within scope. One expected-unknown question preserves the callback boundary. The agent already had project and source exposure and also authored the implementation. No blind, independent, efficiency, or coding-performance result is established. Exact model and token usage are unavailable.

## Reproduce and review

```bash
npm ci --ignore-scripts
npm run build
npm run benchmark:fetch
node scripts/replay-contracts.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts
node scripts/build-shared-demo.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts benchmarks/results/local/my-demo
python3 scripts/package-shared-demo.py benchmarks/results/local/my-demo
node scripts/check-shared-demo.mjs benchmarks/results/local/my-demo
```

Skip fetch when the pinned bare Hono checkout exists. Use new output directories. Open `index.html` in the generated demo. The bundle contains four audience HTML reports, four Markdown reports, the internal HTML/Markdown walkthrough, semantic JSON, actual query output, sample context, the agent trace and assessment, source notices, and reproduction instructions.

The source pin remains `eebdf7be39abf0a872671835ccce0c4f03ea497a`. The semantic artifact remains `semantic:879ce0fdb5dee3f6f406bfa87e28f0d2f48b65fb58026479f9172bbd54b8c3f0`. Rebuilding copies the agent record; it does not run inference.

## Static documentation

The Fumadocs site is in `website/`, with its own private dependency manifest and lockfile. The library package retains its existing runtime dependencies. The site contains 12 MDX pages: introduction, quickstart, demos, four task guides, two concept pages, two reference pages, and contribution instructions.

```bash
npm ci --prefix website --ignore-scripts
npm run docs:build
npm run docs:check
```

The site exports to `website/out`. Default base path: `/clearings-semantic`. Use `DOCS_BASE_PATH=''` for a root export. The build clears generated Next.js/output directories so removed routes and earlier prefixes cannot survive. Search loads `search-index.json` and runs locally. Fonts and other assets are local. No deployment, GitHub Pages setup, CI, public access, or package publication is included.

The README now starts with purpose and a runnable inspection. CONTRIBUTING.md covers useful changes, setup, source-backed review, writing, and PR conventions. [Writing approach](DOCUMENTATION_STYLE.md) records how the requested examples informed the structure.

## Verification and limits

- Library typecheck and all 58 tests pass. New cases cover canonical reference reachability, stale plans, omitted contracts, exact code, actual walkthrough queries, generic shared-state/callback fixtures, and CLI target-write protection.
- Contract replay verifies all 11 retained excerpts and leaves target bytes unchanged. Repeated report renders are identical.
- Historical semantic replay remains intact. The original model and all eight audience reports are byte-identical after the adapter change.
- The demo static check validates file hashes, all local report links, 1,792 fragment links, source/agent bindings, keyboard code attributes, and local assets.
- The Fumadocs static export checks 22 HTML pages, 2,113 links, and three search queries at both `/clearings-semantic` and the empty root path, with no external assets. Build-time examples use the actual library and CLI.
- Package inspection excludes the website and benchmark assets and includes the new presentation schema.

Browser policy blocked local preview earlier in this session. No alternate browser route was used. Desktop/mobile interaction, focus behavior, and reader comprehension still need review. Static checks do not establish those results. Independent claim-support review remains pending. The prototype is technically integrated and reviewable; stronger reliability and coding-benefit claims remain outside this result.

## Review fixes

The documentation development command now prepares demo assets before starting the server. Download archives are checked for exact membership and content before they enter the site, and the exported copy is checked again. The walkthrough selects evidence from the chosen assertion and state from the chosen function. Source replay retains all 11 excerpts, leaves the target unchanged, and preserves the eight accepted reports. Typecheck and all 61 library tests pass.

The static documentation build passes. The exported site check covers 22 HTML pages, 2,113 links, and three local search queries. It also verifies the downloadable archive and finds no external assets.

A follow-up source review found missing destination IDs in canonical contract fields. Failure and dependency destinations now retain their canonical IDs and link to the relevant function in HTML and Markdown. The main reading text and semantic model remain unchanged. All six focused presentation tests pass, and the rebuilt bundle passes source, link, and archive checks.

The static asset check now rejects protocol-relative URLs and any asset reference that resolves to an external origin. Archive checks use an explicit `python3` command and require Python 3.9 or newer, with a prerequisite check and a clear error. This runtime is documented for archive tests and documentation work.

Verification of the final documentation fixes: the archive regression test passes; a process with only `python3` verifies the archive; missing Python reports the prerequisite. Four altered asset references are rejected, and the restored static export passes. The documentation build and check pass for 22 pages and 2,215 links.
