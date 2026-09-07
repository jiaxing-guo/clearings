> Historical document. See the [current documentation](../../README.md). Navigation links were rebased when this file was archived; dated results and implementation instructions describe their original context.

# Clearings prototype plan

**Internal representation for AI coding**

## Active direction after the IR review

The user accepted the reading guides, README, and contribution guide. The user rejected the prose-heavy internal representation and approved a typed specification core plus a Clearings self-development experiment. This direction supersedes the report milestones below. The previous complete plan is preserved in [PROTOTYPE_PLAN_REPORTS.md](PROTOTYPE_PLAN_REPORTS.md).

Use operation contracts as the primary records for new semantic work. Each operation owns types, conditions, outcomes, state changes, effects, dependencies, implementation responsibilities, and open decisions. Graphs are generated views. Human and agent interfaces consume the same core.

Keep intended requirements separate from observed implementation. An interview can produce proposed intended contracts. Source analysis can produce proposed observed contracts. Linking them does not establish conformance. Scenario agreement, source support, and acceptance remain separate questions.

The first self-development slice specifies **context assembly**. The implementation now has a typed validator, closed expression interpreter, scenario checker, context assembler, package revalidation, CLI, and human view. Clearings assembles its own context specification and checks actual results against it. This is a continuing-session author bootstrap, not a fresh-agent or self-hosting compiler result.

The [architecture](../../SPECIFICATION_ARCHITECTURE.md), [usage and limits](TYPED_SPECIFICATIONS.md), and [review bundle](../../../benchmarks/results/clearings-bootstrap/README.md) describe the result.

A separate [fresh Luna trial](../../../benchmarks/agent-runs/luna-impact-001/REPORT.md) is complete. Its first dependency-impact implementation passed 19 withheld feature tests without repairs. The typed checker still reports unknown because eight rules remain opaque. The candidate is archived outside production source. One successful task does not establish an advantage over ordinary instructions.

| Next gate | Evidence required |
| --- | --- |
| Review the typed language | Distinct operation meaning, exact condition domains, explicit state/effect boundaries, preserved unknowns |
| Review the human interface | A reader can predict one outcome and find its implementation without reading all records |
| Review the completed fresh-agent task | Frozen inputs, withheld cases, trace, captured patch, passing feature checks, and the recorded evaluator setup correction |
| Extend self-use after review | A second Clearings operation with state changes and failures; a matched prose-only comparison |
| Integrate richer source models | Reviewed observed contracts behind the accepted human views |

The accepted audience reports retain their historical model binding during this transition. Their source-backed content is not silently migrated to the narrower typed slice. README and CONTRIBUTING need only accurate workflow changes.

Solvers, concurrency model checking, provider transport, automated requirements interviews, universal source-to-specification conversion, and external code-change demonstrations remain subsequent choices. Fumadocs stays a static export. GitHub Pages serving, CI, and public access remain deferred.

## Historical report milestone scope

The following scope records the previous sequence. Its completion statements do not establish that the internal representation passed the later user review.

## Latest self-development result

A fresh Luna agent has added sequence checks from frozen intended requirements and current Clearings context. The first submission passed 17 withheld test groups and 81 regression/own tests. After source review, its source was integrated unchanged into the library on PR #6. The previous impact-analysis candidate remains archived outside production. See [the report](../../../benchmarks/agent-runs/luna-sequence-001/REPORT.md).

This completes one bounded cycle through integration. PR merge, independent human review, a further coding cycle, and a matched prose-only comparison remain separate. Five requirements still need tests or review because the expression language cannot encode them. This is not a self-hosting compiler or a proof of an IR advantage.

## Product goal and first prototype

Clearings gives a coding agent an inspectable representation of repository behavior. People use that same representation through reports suited to their tasks.

The first prototype must demonstrate three outputs from one Hono snapshot and one semantic model:

1. A report for a PM or vibe coder: purpose, main actions, possible outcomes, and important limits.
2. A report for an engineer: mechanisms, conditions, state changes, failure paths, and links to functions and source.
3. An internal representation: linked function and behavior contracts, inspectable JSON, and a bounded context export that an agent can use.

A fourth demo is optional: use the representation to make one small code change, then inspect the result. Prefer a behavior-preserving refactor before adding a feature. This demo is not required to finish the first prototype.

Keep the first target narrow: Hono request dispatch and middleware composition, including the context state needed to explain them. Six capabilities, a second repository, and additional language adapters are subsequent work. A complete repository map is not a condition for this prototype.

Product name: **Clearings**. Private repository: **jiaxing-guo/clearings-semantic**. Implementation: one TypeScript library and CLI package. The existing clearings and clearings-cloud repositories remain separate.

## Current state

| Area | State | Remaining limitation |
| --- | --- | --- |
| Immutable Git inventory and source evidence | Implemented | Commit snapshots only; no working-tree analysis |
| Bounded TypeScript structure | Implemented | Dynamic callbacks and ambiguous calls remain unresolved |
| Semantic proposal exchange and replay | Implemented | File exchange; no built-in model endpoint |
| PM and engineer reports | Implemented; user accepted the reports | Independent claim-support review remains pending |
| Function contracts | Canonical v0.2 contracts integrated into both report views | Author interpretation; independent support review pending |
| Internal semantic JSON | Shared reports, real-query walkthrough, and bounded context export implemented | Broader agent evaluation remains |
| Claim support | Author self-review of 73 contract assertions recorded; historical 53-claim model retained | Independent review remains pending |
| Agent use and code-change benefit | Recorded continuing-session author comprehension example | Independent agent trials and code-change benefit remain unestablished |

The shared demo implementation records 58 passing automated tests, deterministic source-verified replay/context output, and unchanged target files. The historical semantic JSON and all eight audience reports remain byte-identical. The new reports use the contract model; see [shared demos](SHARED_DEMOS.md). The previous report verification records static HTML/Markdown link and source checks. Earlier desktop/mobile browser checks remain historical; browser policy blocked the latest local-file preview. See [the report review](../../../benchmarks/results/hono-audiences/review.json). These are implementation checks. They do not establish independent claim support or improved coding performance.

The user accepted the report presentation and authorized updating PR #3. Independent claim-support review remains separate from report acceptance.

## Target and evidence boundary

Use Hono 4.13.7 at commit `eebdf7be39abf0a872671835ccce0c4f03ea497a`, tree `7fd627b257e5b744bf23d4957a93a0d0413c8c19`.

The existing structural run accounts for 25 selected source files and 10 support files. The historical semantic example uses 11 excerpts across three source files, with 53 claims and five critical unknowns. The contract model uses the same excerpts and retains those assertions after source review; it has 73 assertions, ten critical unknowns, 22 function contracts, and four behavior contracts. A report about these capabilities must not claim full Hono coverage.

Read source through immutable Git objects. Analysis does not run target scripts, install target dependencies, or modify target source. Source comments and proposal text are data. Preserve the upstream license with distributed excerpts.

Keep Hono names, source selections, recorded proposals, and review examples in benchmark assets. Production extraction, semantic contracts, queries, and renderers must remain repository-independent. Evaluator answers do not enter requests, prompts, or analyzer inputs.

## Shared representation

| Layer | Information it owns | Consumers |
| --- | --- | --- |
| Source observations | Symbols, source spans, bounded references/calls, property writes, diagnostics | Semantic proposal and evidence lookup |
| Function contracts | Inputs, outputs, state access, effects, failures, dependencies, assumptions, and support | Behavior contracts, engineer references, agent context |
| Behavior contracts | Triggers, participating functions, state, conditional outcomes, ordering, failure boundaries, and unknowns | Engineer guide and agent reasoning |
| Capabilities | Purpose, behavioral responsibilities, outcomes, and scope | PM report, engineer introduction, context selection |
| Presentation | Reading order, audience language, examples, and visual layout | HTML and Markdown |

Use functions as the main implementation units. Retain state, configuration, types, and external callbacks as explicit supporting records. Behavior can depend on several functions and shared state. Several behaviors can use one function.

Function links do not imply a complete runtime call graph. Behavior flows may branch, repeat, or recurse. Keep call order, return order, and conditional callback execution distinct. A chain shown for one example does not describe every possible execution.

Reuse the existing claims, evidence, state concepts, relations, and flow records where they already express the needed information. New contracts should reference those records. They should not create independent copies of the same rule in several schemas. Plain-language conditions are acceptable for this prototype; an executable constraint language is deferred.

A declared return type is different from a supported claim about runtime output. A resolved symbol is different from a known runtime callee. Missing recorded effects do not prove purity. Preserve origin, source support, and unknowns for semantic assertions.

## Realigned milestones

Milestone labels are for planning documents. Commit messages and PR text continue to use Conventional Commits and describe behavior without these labels.

| Milestone | Deliverable | Status and exit gate |
| --- | --- | --- |
| M0: repository foundation | Private package, CLI, pinned input, immutable inventory | Complete; retain the existing reproducibility and target-preservation checks |
| M1: structural evidence | Bounded TypeScript extraction, evidence lookup, diagnostics | Complete; retain positive/negative fixtures and explicit unresolved facts |
| M2: semantic exchange and reading prototype | Recorded semantic model, PM and engineer reports in HTML and Markdown | Technically complete; user accepted the reports. Independent claim-support review remains pending |
| M3: usable internal representation | Function/behavior contracts, import validation, record inspection, bounded agent context | Implemented. Both capabilities have source-linked contracts, inspection, and byte-bounded context. See SEMANTIC_CONTRACTS.md |
| M4: complete the three required demos | Both reports use the new shared records; internal-representation walkthrough; recorded agent comprehension example | Implemented. All three demos are reproducible from the same model, with scope and review status visible; browser interaction and independent review remain pending |
| M5: optional code-change demo | One small refactor guided by the representation, with before/after evidence and validation | Optional. Report the result and limits; success does not imply general semantic equivalence or coding superiority |

The earlier M3 breadth target moves after this prototype. Its context-selection work moves into M3 because it is needed to use the IR. The earlier M4 integrity checks remain mandatory in M3/M4; broad mutation testing moves after the prototype, with one optional change in M5. The earlier M5 holdout study remains subsequent generalization work.

The original 15-day estimate no longer describes this scope. Implement in the increments below and record actual effort. Independent reader and claim review depend on reviewer availability; pending review must remain explicit and must not be reported as completed.

## M3: usable internal representation

The completed task is preserved in [CONTRACT_IMPLEMENTATION_TASK.md](CONTRACT_IMPLEMENTATION_TASK.md). Implementation and measurements are in [SEMANTIC_CONTRACTS.md](SEMANTIC_CONTRACTS.md).

### Increment 1: contracts and one end-to-end behavior

Define a versioned contract extension using one function and one behavior before expanding the model. Use response selection as the first Hono behavior. It needs direct, Promise, and composed paths, plus the shared response state.

Add source-bound callable identities for functions, methods, and accessors. Getters and setters can share a structural property symbol, so their implementation role and evidence spans must remain distinct. Retain relevant nested and anonymous callables; name uncertainty explicitly instead of inventing a public function.

Define behavior rules through conditions, outcomes, state effects, failure destinations, participating functions, and links to existing flow steps/claims. Do not use a list of function names as a substitute for those rules.

Choose a schema version explicitly. Preserve existing v0.1 recorded inputs and replay support. Create a new proposal/model when meanings or record structure change. Do not silently attach old presentation plans or assertions to a new artifact ID.

### Increment 2: both capabilities and inspection

Extend the contracts to the existing dispatch and composition scope. Use current authored summaries as candidates for source review. They are not automatically accepted facts.

Add a minimal read-only query API and CLI. It must list capabilities and show a selected capability, behavior, or function with its direct links, relevant unknowns, and source references. JSON is the machine interface. A concise text view can make the live walkthrough easier to follow. A new web application is not required.

### Increment 3: bounded agent context

Export a task-focused context pack for an explicitly selected behavior or capability. Use deterministic selection and a byte budget first. Include the snapshot/model identity, required rules, relevant function/state links, critical unknowns, and evidence references. Additional exact source remains available through evidence lookup.

Report omitted optional records and how to retrieve them. If required rules and critical unknowns cannot fit, reject the budget or require a narrower selection. Do not silently remove a consequential branch.

Record one new file-exchange proposal run for the contract schema and retain its input/output. Record producer/model and usage when available; otherwise mark them unavailable. Use recorded replay for repeatable demonstrations and label it as replay.

### Exit gate

Implemented and checked in the contract review bundle. Independent claim-support review remains pending.

- Both capabilities have source-linked function and behavior contracts.
- Import rejects stale bindings, absent records, invalid endpoints, and unsupported self-certification.
- Inspection and context export preserve the required decision rules and relevant critical unknowns.
- A repeated run with the same recorded input produces the same normalized output.
- Original fixtures cover at least one shared-state behavior across functions and one unresolved callback boundary. No Hono-only production logic is needed.
- Existing v0.1 replay and current reports remain available for comparison.

## M4: complete the three required demos

| Demo | What to show | Completion check |
| --- | --- | --- |
| PM / vibe coder | Purpose, three main actions, simple case, possible outcomes, and limits for each capability | A reader can locate purpose, a normal outcome, a failure outcome, and a scope limit without opening the full audit |
| Engineer / serious coder | Example-led article, exact source focuses, conditional behavior, function contracts, failure paths | A reader can find the direct/Promise distinction, finalization rules, call/return order, and error boundaries |
| Internal representation | Select a capability; inspect one behavior and its functions/state; follow a rule to source; export context; let an agent answer a bounded question | The walkthrough uses canonical records and actual query output. It shows preserved conditions, provenance, unknowns, and source retrieval |

Both human views must use the same canonical contracts and IDs as the internal demo. Keep audience prose and layout in presentation data. Contract fields shown as reference should come from the model directly. Authored summaries can remain in the reading plan, with support links and separate review status.

The internal demo must do more than open a large JSON file. Use a short path through real records. A JSON excerpt, CLI inspection, and a compact relationship view are sufficient. Any visual relationship view must be generated from the model, not drawn from a separate hand-maintained map.

### Rendering work

The reported single-handler range has been extended from `src/hono-base.ts:431–440` to `431–450`, so it includes the full branch. Other ranges now select complete statements where practical. Partial excerpts are labeled, and readers can open the surrounding recorded source in place. Do not add braces or ellipses to source evidence as if they were original code.

Check HTML and Markdown for generics such as `ReturnType<H>`, nested indexing, backticks in comments, indentation, line breaks, and code overflow. A source focus does not need to compile by itself, but its boundary must be clear. Keep the code text intact when changing its presentation. These cases now have source-fidelity and rendered-output checks. Repeat the relevant checks when the reports are connected to the new contract model. The user accepted the current report presentation. Repeat reader review when the new contracts change the explanations.

Keep the article reading order. Avoid another broad visual redesign. Complete desktop/mobile, keyboard, source-navigation, companion-link, and offline checks on final output.

### Agent comprehension check

Use a short task set with source-reviewed answers held outside the analyzer:

1. What changes for HEAD dispatch, and what remains in the original Request?
2. How do direct, Promise, and composed paths handle a missing result?
3. When can an existing response be replaced?
4. What happens when next is called repeatedly, and which frame can handle the failure?
5. Which functions and shared state participate in response finalization?
6. What cannot be concluded about user-supplied handlers from this scope?

Give the agent the selected IR first. Log requests for additional evidence, final answers, and unresolved questions. Score correctness, unsupported assertions, source use, and requested context size. Count expected unknowns separately from answered behavior questions. A source lookup is allowed and must remain visible in the trace.

For the demo task set, require correct answers to the known critical distinctions and no unsupported assertion about an unknown callback. Correct unsupported claims before packaging the demo. Report review origin and any remaining limits. A recorded demo pass is a narrow result, not a general benchmark win.

Use the existing file/rg/source workflow as a comparison if making an efficiency claim. Keep model, question, source access, and budget comparable. Record model-building cost separately from repeated use. No speed or token reduction is required for the first demonstration; any claimed benefit needs a measured comparison.

### First-prototype completion

Provide four standalone HTML reports, four Markdown reports, semantic JSON, a sample context pack, an inspection transcript, the agent task trace, source notices, and a short reproduction guide. Include coverage, verification results, and review status. The three demo views must identify the same semantic artifact.

Independent claim review remains a quality gate for stronger reliability claims. It does not prevent an explicitly labeled review prototype from being inspected. Do not describe pending independent review as passed.

## M5: optional code-change demonstration

Prefer one small refactor that makes a selected dispatch section easier to follow while preserving its synchronous and Promise behavior. A small feature can be a later alternative with its own explicit behavior contract.

1. State the change and the behavior that must remain stable in terms of selected contracts.
2. Give the agent the relevant context pack, with source retrieval available and logged.
3. Apply the patch in a separate disposable workspace derived from the pinned source. Keep the analysis target unchanged.
4. Run the relevant checks in that workspace. Keep test execution and any necessary dependency setup separate from the read-only analysis path.
5. Re-scan the changed snapshot. Show changed evidence, affected contracts, and review decisions. Do not silently reuse assertions from the old artifact.
6. Present the patch, validation output, and known gaps together.

The optional demo cannot claim full equivalence from a passing test suite. Record the tested conditions, including direct/Promise behavior and failure boundaries. If a critical behavior changes unintentionally, retain the failed result and revise the patch or contract.

No optional code change runs as part of the roadmap update. No target mutation, dependency installation, commit, push, or deployment is implied by running a scan or opening a report.

## Scope after the first prototype

- More Hono capabilities and a repository-wide overview.
- A pinned non-Hono TypeScript holdout using unchanged production code.
- Larger reader and agent studies, plus broader rename and behavior mutations.
- Semantic revision matching, incremental analysis, and accepted-model maintenance.
- Python support and a bounded LiteLLM routing slice; C/SQLite later.
- Model adapters, editor/MCP integration, and public packaging when justified by use.

Keep one TypeScript package, portable JSON, and local files until a demonstrated requirement needs more infrastructure. Full program verification, complete runtime call graphs, hosted accounts, and autonomous repository-wide rewriting remain outside this prototype.

## Working agreements

- The three required demos are implemented. Review them before selecting an optional code-change demo or later scope. See SHARED_DEMOS.md.
- Preserve source observations, semantic assertions, and presentation as separate responsibilities.
- Keep origin, citation integrity, content support, and acceptance distinct.
- Preserve source text, unknowns, failure paths, and analysis coverage when compressing output.
- Keep target scripts and mutations outside analysis.
- Use Conventional Commits; omit internal milestone labels from commits and PR messages.
- Keep changes local for review until commit/push is authorized. Do not publish packages or change repository visibility.
