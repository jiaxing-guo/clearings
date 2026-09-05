# Capability reading guides

Each capability has an overview and an engineer guide. Both are available as HTML and Markdown. They share the same semantic model and presentation plan.

The Hono examples use authored presentation data over the existing recorded semantic model. They are not fresh model analysis. The user accepted the report presentation. Independent claim-support review remains pending.

## Reading order

| View | Main reading path | Reference material |
| --- | --- | --- |
| Overview | Purpose → three main actions → simple case → possible outcomes → limits | Sources and full audit inside one expandable section |
| Engineer | Concrete case → ordered explanation with short source excerpts → alternatives and limits | Function summaries, specific questions, claims, exact flow, and evidence |

The [FastAPI SSE tutorial](https://fastapi.tiangolo.com/tutorial/server-sent-events/) informed the engineer reading order: explain a concept, show an example, then introduce variations. A repository explanation has a different purpose from a tutorial. It must also preserve uncertainty and source support.

Keep the existing calm colors. Reduce the number of decisions a reader must make before they understand the main behavior. Do not make every paragraph a card or a disclosure. Use a diagram when order or branching is easier to understand visually. The middleware example includes call and return arrows, with an equivalent text sequence.

Start a reader review with the overview. The CLI keeps the engineer default for compatibility with existing calls.

## Use the CLI

Build the package, then reproduce the example from the pinned checkout. Choose a new output directory.

```bash
npm run build
node scripts/replay-semantics.mjs benchmark-checkouts/hono.git benchmarks/results/local/audience-review
```

This writes eight pages: two capabilities × two audiences × two formats. Filenames use `<capability>.<audience>.html` or `.md`. It also writes the semantic model, presentation plans, source license, and replay measurements.

Open the HTML files directly in a browser. Each file contains its own CSS, JavaScript, source excerpts, and source license. It works without a server or network connection. Keep companion files in the same directory to use the audience tabs.

To render a supplied model and plan:

```bash
node dist/cli/main.js explain semantic.json --scan scan.json --repository /path/to/repository --capability request-dispatch --presentation request-dispatch.presentation.json --audience overview --format html --companion request-dispatch.engineer.html --out request-dispatch.overview.html
node dist/cli/main.js explain semantic.json --scan scan.json --repository /path/to/repository --capability request-dispatch --presentation request-dispatch.presentation.json --audience engineer --format html --companion request-dispatch.overview.html --out request-dispatch.engineer.html
```

Use `--format markdown` for Markdown. `--companion` is optional and accepts only a local report filename. The CLI does not create the companion. The output path must be new and outside the target repository. Invalid audience names, formats, source intervals, and stale plans fail before output is written.

## Use the library

```ts
import { renderCapability, validatePresentationPlan } from 'clearings-semantic'

validatePresentationPlan(plan, semantic, 'request-dispatch')
const html = renderCapability(semantic, 'request-dispatch', {
  format: 'html',
  audience: 'overview',
  presentation: plan,
  companion: 'request-dispatch.engineer.html',
  sourceNotice: licenseText,
})
```

`semantic`, `plan`, and `licenseText` are supplied values. The library returns text and leaves file I/O to the caller. Supply the appropriate source license when distributing excerpts. The benchmark replay embeds Hono's notice in each page.

`renderCapability(model, alias)` remains valid and defaults to engineer Markdown. Without a plan, it copies existing text into one stage per flow step. That fallback does not create a short explanation. An overview request requires an authored `overview`. An engineer plan without a `guide` uses the existing stage renderer.

## Keep responsibilities separate

| Part | Responsibility |
| --- | --- |
| Semantic model | Claims, flows, evidence, relationships, unknowns, and verification status |
| Presentation plan | Audience prose, reading order, stage groups, examples, and authored function summaries |
| Renderer | Format, navigation, source links, exact code slicing, and escaped text output |

`schemas/presentation.v0.1.json` defines the plan. The package exports it as `clearings-semantic/schemas/presentation`. Bind the plan to `semantic_artifact_id` and `capability_id`. A stale plan cannot render a changed model. New source interpretations require review; do not silently replace the binding.

The optional audience fields are:

- `overview`: purpose, main actions, example, outcomes, and limits.
- `guide`: introduction, example, ordered sections, source code focuses, and limits.
- `functions`: source symbol IDs, stage links, purpose, inputs, returns, state and effects, failures, and limits.

Each explanation refers to claim IDs, unknown indices, or exact evidence IDs. Unknown indices refer to the bound model. Every recorded flow step belongs to one stage. Every capability claim belongs to at least one stage. Guide sections cover each stage once. Function summaries can link several stages, and several functions can support one stage.

A code focus selects inclusive source line numbers inside one recorded excerpt. Prefer complete statements or branches where practical. When the focus omits surrounding lines, both formats label it as a partial excerpt and provide an expandable view of the full recorded excerpt beside it. HTML also links to the source record.

Rendering copies the recorded source text without changing indentation or adding braces or ellipses. Code blocks can be scrolled with the keyboard. Markdown fences preserve literal generics and backticks and do not add an extra blank source line when the excerpt already ends with a line break.

Function summaries are authored review data in this prototype. They show how a function layer could connect source units to behavior. They are not a new automatic function IR extractor or a complete call graph. Symbol and evidence checks establish identity and source-file consistency, not proof of a function's contract. Do not infer purity from the absence of recorded effects.

Each critical capability unknown must appear in the visible limits of both audience views. The full reference retains all critical unknowns, including those from related capabilities. It also retains original claim text, exact branch conditions, source text, entry points, provenance, coverage, and diagnostics.

Reference checks do not prove that prose follows from source. Titles, summaries, grouping, and assumptions require content review. A sequence describes possible behavior under stated assumptions. It is not an execution trace. Stage order is a reading order, not a claim that every stage always runs.

## Write and review the prose

Use `PRESENTATION_INSTRUCTIONS` when an external agent authors a plan. Supply the model and presentation schema with that prompt. The prompt includes the exact technical prose instruction from `AGENTS.md`. It does not run an agent or modify the recorded semantic request.

Use short sentences and one consistent term for each concept. Put conditions before their results. Introduce a domain term when the reader needs it. Preserve code, commands, identifiers, formal text, and source quotations.

Use ASD-STE100 writing rules and the approved dictionary during prose review. A prompt or word-count check alone does not establish full compliance. Review meaning as well as wording.

The recorded plans are under `benchmarks/presentations/hono`. Production code contains no Hono capability names or expected answers. Evaluator rubrics do not enter the renderer or presentation prompt.

## Interaction and access

HTML uses native expandable sections. JavaScript opens hidden ancestors when a reader follows a source, function, claim, or branch link. Without JavaScript, readers can open the sections manually. Printing opens reference details and restores their previous state afterward. Each audience version works independently; the optional tab links to its companion file.

Markdown follows the same narrative. It uses expandable reference sections and stable evidence anchors. Expand a section manually if the viewer does not reveal a linked hidden section. Viewers without details support can read the plain Markdown. The middleware sequence includes ordered text in both formats.

HTML escapes all supplied text, including source, source notices, and diagram labels. Only static renderer assets enter script and style blocks. No external assets or target scripts are loaded.

## Reader review

Ask a reader to use one view before opening the other. Record their answer, time, and sections opened.

| Reader | Task |
| --- | --- |
| Overview | Explain what this part of Hono does in one sentence. |
| Overview | Name one normal result and one possible failure result. |
| Overview | Identify what this view cannot tell you about your application. |
| Engineer | Explain why exactly one handler uses a different path. |
| Engineer | Find the difference between a missing direct result and a falsy Promise result. |
| Engineer | Explain middleware call and return order under the example assumption. |
| Engineer | Find when an existing finalized response can be replaced. |
| Either | Find the source for one explanation. |

Compare these tasks with the previous report. A shorter initial view is a design result. Better comprehension requires a reader trial.

## Verification

Typecheck and all 48 automated tests pass. The presentation regression checks cover the complete single-handler branch, source context, generics, backticks, tabs, CRLF line endings, and 200,000 separate backtick runs. Claim-review tests cover assessment values, review flags, and derived support status. The semantic tests and pinned replay also pass from a checkout path containing spaces, a percent sign, and a hash sign. The automated tests cover unchanged semantic content, claim and flow reachability, critical limits, stale bindings, invalid function references, bounded source focuses, and text escaping. Prior browser checks cover desktop and mobile layouts, keyboard controls and code scrolling, nested source links, exact source text, native details without JavaScript, and companion navigation. The four Markdown reports were also rendered with marked. Their code contents match the HTML reports, apart from the final line terminator required by a Markdown fence.

The latest review fixes add source and scope-note links beside engineer introductions, examples, and limits in both formats. Static checks verify all local links and exact source content. Browser policy blocked the local-file preview in this pass, so the browser results remain historical. Semantic output is unchanged. The pinned replay checks byte-stable semantic output and reports whether target files changed. See the [review record](../benchmarks/results/hono-audiences/review.json) and [browser checks](../benchmarks/results/hono-audiences/browser-review.json) for measured results. These checks do not establish independent claim support or reader comprehension.
