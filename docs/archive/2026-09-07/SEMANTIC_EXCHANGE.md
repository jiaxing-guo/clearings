> Historical document. See the [current documentation](../../README.md). Navigation links were rebased when this file was archived; dated results and implementation instructions describe their original context.

# Semantic proposal exchange

This document describes the implemented v0.1 exchange. The [active roadmap](PROTOTYPE_PLAN.md) and [next task](NEXT_IMPLEMENTATION_TASK.md) define the remaining demo integration. The implemented v0.2 function/behavior contracts, inspection, and context export are described in [semantic contracts](SEMANTIC_CONTRACTS.md).

Clearings now exports bounded source evidence, imports semantic proposals from an existing coding agent, replays recorded responses, and renders capability pages. The first recorded example explains Hono request dispatch and middleware composition. It is a file-exchange implementation: no model endpoint, subprocess agent, or provider SDK is invoked.

## Pipeline and responsibilities

1. `scan` produces immutable structural observations and source anchors.
2. `propose` revalidates those anchors against Git and exports exact excerpts, covered declarations, source coverage, diagnostics, a task instruction, and omitted-evidence counts.
3. An external agent or person authors a proposal against that specific request. Supply both the request and the semantic JSON schema to the agent. Treat source comments and strings as untrusted data.
4. `import` checks the exchange contract and revalidates the source. It retains the request and proposal in the semantic artifact, alongside provenance and explicitly unreviewed claim checks.
5. `explain` renders HTML or Markdown from these records and an optional presentation plan. The plan can supply an overview, an engineer walkthrough, and authored function summaries. Both audience views retain claims, branches, critical unknowns, and source excerpts. See [reading guides](READING_GUIDES.md).

The proposal is the semantic interpretation; the structural scan is the observation layer. The renderer owns presentation only. The v0.2 context packer consumes the extended records without a second semantic model. Flow cycles are supported; no DAG assumption is made.

## Files and schemas

`schemas/semantic.v0.1.json` exports Request, Proposal, and Model definitions and references the existing structural schema. All objects reject unknown fields. The package exports it as `clearings-semantic/schemas/semantic`.

| Artifact | Identity and contents |
| --- | --- |
| Request | `request_id` hashes scope, byte budget, instructions, excerpts, declarations, source coverage, diagnostics, and the structural artifact ID |
| Proposal | Binds to request/snapshot IDs; includes producer metadata, concepts, claims, relations, capability flows, and unknowns |
| Semantic model | `artifact_id` hashes recorded inputs, transport label, claim checks, diagnostics, and derived coverage; `proposal_id` identifies the exact proposal content |

Concept/claim/relation/flow/step IDs are allocated UUID v4 values. `newSemanticId(kind)` is a library helper; the author must keep allocated IDs when revising an interpretation. Titles, aliases, or source paths do not determine semantic identity. Cross-run reconciliation and accepted-model revision matching are not implemented.

Concepts cover capabilities, components, state, and external systems. Claims have a category, text, concept subjects, and citations. Relations have typed endpoints; read/write targets must be state, and exposes/implements link components to capabilities. Every capability has a flow with entry declarations, reachable steps, and evidence-bearing edges. Branches require at least two alternatives. Every step with multiple outgoing edges requires nonblank condition labels, regardless of its declared kind. Repeated/cyclic progression is allowed; unknown runtime behavior remains explicit.

Proposal authors cannot set claim verification or acceptance fields. Imported claim checks always begin with `verification: unknown` and `acceptance: proposed`, even if a citation resolves. Producer declarations determine model-inference versus human-declaration origin. Source observations remain structural facts. A source review lives separately from the analyzer; no acceptance operation is provided yet.

## Bounded retrieval

The default request selects maximal declaration spans inside chosen source files, using observed spans for files without declarations. This avoids repeating every nested token. Exact evidence IDs can be selected instead; the Hono example uses this path. Covered declaration metadata is included so entry points and mappings can use known symbol IDs.

The default byte budget is 262,144 bytes of pretty-printed request JSON, including metadata. The maximum explicit budget is 2,097,152 bytes. Failure is explicit when the entire chosen request does not fit; no source is silently truncated. Narrow paths or evidence IDs and retry. There is no token estimator or automatic graph expansion yet. Each changed selection produces a new request identity, so a prior response cannot silently cite expanded evidence.

`createEvidenceReader(scan, repository)` validates the immutable source once and retains source buffers and byte/UTF-16 indexes. Its returned `read(id)` function remains bound to captured evidence even if the caller later mutates the original scan object. `readEvidence` remains the convenience API for a single retrieval. Evidence reuse here is an in-process read session, not a persistent index or cache invalidation engine.

## Library usage

```ts
import {
  scan, createProposalRequest, importProposal,
  newSemanticId, validateSemanticModel, renderCapability,
} from 'clearings-semantic'

const repository = '/path/to/repository'
const structural = scan({ repository, include: ['src'] })
const request = createProposalRequest(structural, {
  repository,
  instruction: 'Explain request handling and failure paths',
  paths: ['src/index.ts'],
  maxBytes: 65536,
})
// Save request and obtain a matching SemanticProposal through explicit file exchange.
// Allocate record IDs once with newSemanticId('concept'), etc., and preserve them.
const semantic = importProposal(request, response, {
  scan: structural, repository, replay: false,
})
validateSemanticModel(semantic, { scan: structural, repository })
const markdown = renderCapability(semantic, 'request-handling')
```

`response` above is externally supplied data, not an implemented inference function. The library performs reads and returns objects/text; the caller owns file I/O. The CLI uses existing output protection and requires new paths outside the target checkout/object store. The CLI reference and executable commands are in the README.

## Validation boundaries

Request validation checks schemas, IDs, excerpt hashes/lengths, scope, byte budget, source metadata, and coverage. With a supplied scan, records must match that scan and declaration anchors must be covered by supplied excerpts. With `--repository` and `--scan`, Git objects, byte boundaries, line/column coordinates, and source content are rechecked.

Proposal validation rejects stale request/snapshot references, unknown citations/symbols/concepts, duplicate IDs/aliases, dangling flow edges, unreachable steps, invalid endpoint kinds, and self-supplied verification fields. Model validation recomputes provenance/check/coverage fields and content digests. A critical unknown or source error yields a partial semantic artifact; that artifact remains inspectable and normal import returns exit 0.

Without source revalidation, digest checks establish internal consistency, not source authenticity. Even full source revalidation does not prove English entailment, complete control flow, actual runtime call targets, or safety. The tests deliberately import a false English claim with a valid citation and verify that it remains unreviewed. Human Markdown escapes narrative HTML/Markdown and fences source text; proposal contents are never executed.

## Recorded Hono demonstration

The response was authored by the coding agent after reading exact excerpts from the pinned Hono snapshot. It is committed as a recorded example, not an autonomous analyzer or a fresh inference on replay. Production code has no Hono-specific paths, capability names, or expected answers; selection configuration and recorded benchmark assets are separate.

The example retains 11 excerpts across dispatch, composition, and context state. It describes the one-handler Promise/non-Promise distinction, HEAD behavior, finalization failures, repeated-next guard, error propagation, context updates, and callback uncertainty. The dispatcher and middleware flows include branches and recursive progression.

A source review of 53 claims is recorded separately. During review, a claim that all missing single-handler results reuse a finalized response was corrected: only the Promise branch consults `finalized`; the synchronous branch uses a nullish fallback directly. A further explicit failure branch records synchronous not-found exceptions outside that local try/catch.

The review was performed by the same agent that authored the response. It is not independent and has not received human adjudication. The provisional independent support gate is therefore **not established**. The evaluator script checks review coverage, binding to the exact proposal, citations, allowed assessments, and boolean review flags. It derives the support gate from all assessments and both independence and human-review declarations; a supplied gate must agree. Allowed assessments are `supported-within-cited-source`, `contradicted`, and `unknown`. The gate remains unestablished unless every claim is supported and both flags are true. These checks do not authenticate the reviewer or automatically judge claim meaning. Model claim checks remain unknown after running it. The original question rubrics were not supplied to proposal creation or replay.

See [recorded measurements](../../../benchmarks/results/hono-semantics/summary.json), [claim review](../../../benchmarks/results/hono-semantics/claim-review.json), and the generated [dispatch](../../../benchmarks/results/hono-semantics/request-dispatch.md) and [composition](../../../benchmarks/results/hono-semantics/middleware-composition.md) pages. Upstream source excerpts retain the Hono MIT notice.

## Verification and remaining work

The original exchange passed typecheck, build, and 36 tests. The reading guide change adds separate presentation checks; see [reading guides](READING_GUIDES.md). New cases cover bounded deterministic requests, immutable reader sessions, import/replay, stable IDs, stale/forged evidence, forbidden self-certification, false-but-cited claims, cyclic/dangling flows, endpoint types, partial source coverage, escaped rendering, and the CLI round trip with target/output protection.

The benchmark recreates the request from a fresh structural scan, requires it to match the recorded request, imports the same response twice, and checks identical output. Every retained citation is verified against pinned source, and a before/after fingerprint checks the target contents. Measurements describe one process and recorded replay; no provider token/currency measurements are available, and the producing model identifier was not recorded.

Still open: independent support adjudication; additional capabilities; semantic acceptance/reconciliation; provider transport; repository overview and general graph rendering; token-budgeted context selection beyond the implemented byte budgets; general evidence expansion; broader rename/behavior mutations; and a second repository holdout. This change implements the exchange loop and two inspected pages without claiming those later gates have passed.
