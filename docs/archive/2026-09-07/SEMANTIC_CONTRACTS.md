> Historical document. See the [current documentation](../../README.md). Navigation links were rebased when this file was archived; dated results and implementation instructions describe their original context.

# Semantic contracts and bounded context

Clearings can now describe functions and behavior through source-linked contracts. Engineers and coding agents can inspect these records and export a bounded selection. The contracts are agent or human proposals. Import checks their structure and source anchors; it does not prove their English assertions.

## Version and responsibilities

The contract exchange uses `schemas/semantic.v0.2.json`, exported as `clearings-semantic/schemas/contracts`. The v0.1 exchange, recorded replay, and reports continue to work. There is no implicit migration or rebinding of historical artifacts.

A v0.2 request contains a fresh v0.1 source attachment and a list of callable observations. The attachment reuses the source schema and evidence reader. Its instructions direct the author to the enclosing v0.2 protocol. The outer request ID binds the entire attachment, callable observations, instructions, and byte budget.

| Record | Contents and origin |
| --- | --- |
| Callable observation | Syntax role, structural symbol when available, enclosing symbol, exact byte range, hash, and enclosing evidence ID. Produced deterministically from pinned TypeScript source. |
| Function contract | A semantic UUID, callable role and implementation link, assertion IDs for inputs/outputs/effects/assumptions, state access, failure conditions/destinations, dependencies, and unknown IDs. Proposed interpretation. |
| Behavior contract | Capability owner, trigger assertions, participating functions/state, flow and step links, conditional outcomes, failure boundaries, constraints, and unknowns. Proposed interpretation. |
| State | Existing state concepts retain shared response storage, finalization, middleware progression, and error state. Contracts link to these concepts. |
| Context pack | Selected canonical records, source references, scope, producer, review limits, retrieval instructions, omissions, and measured byte accounting. Derived deterministically. |

Getters and setters have distinct implementation IDs and byte spans. The structural symbol is an anchor, not the semantic identity. Relevant anonymous arrows have their own observations; a missing structural symbol remains null. External callback contracts have no implementation anchor and must reference a critical unknown. Their role does not identify a runtime callee.

Contracts reuse assertion IDs instead of copying assertion text into each field. For example, a behavior outcome has a plain-language `condition` plus `claim_ids`. Those claims hold the explanation and evidence. A failure has `condition`, `destination_id`, and `claim_ids`. A null destination means propagation beyond the represented boundary; it does not mean the failure cannot be handled elsewhere.

Allocate semantic IDs with `newSemanticId('function')`, `newSemanticId('behavior')`, or `newSemanticId('unknown')`. Preserve them on an explicit revision when identity is unchanged. Snapshot-wide identity matching and semantic acceptance remain future work.

## CLI workflow

Run `npm ci --ignore-scripts` and `npm run build` first. Use new output paths outside the target repository.

```bash
node dist/cli/main.js propose scan.json --repository repo \
  --schema-version 0.2.0 --instruction 'Describe response selection and failures.' \
  --max-bytes 131072 --out request.json

node dist/cli/main.js import response.json --request request.json \
  --scan scan.json --repository repo --out semantic.json

node dist/cli/main.js inspect semantic.json --format json
node dist/cli/main.js inspect semantic.json --capability request-dispatch
node dist/cli/main.js inspect semantic.json --behavior response-selection
node dist/cli/main.js inspect semantic.json --id '<function-id>'

node dist/cli/main.js context semantic.json --capability request-dispatch \
  --max-bytes 131072 --no-neighbors --repository repo --out context.json

node dist/cli/main.js evidence scan.json --repository repo --id '<evidence-id>'
```

`inspect` without a selection lists capability, behavior, and function IDs. A selected inspection includes direct dependencies, assertions, state, relevant unknowns, and evidence metadata. It can also retrieve a claim, state, relation, flow, unknown, callable, or structural symbol by its exact ID. Dependent contracts are returned as references with their own IDs; use another inspection or context export to expand them fully.

Inspection validates model integrity. Add both `--scan scan.json` and `--repository repo` to revalidate source. The output reports `source_rechecked`. A repository path used only to protect `--out` does not imply a source recheck. JSON-only inspection does not authenticate the repository.

The report renderer accepts both v0.1 and v0.2 models with matching presentation versions. New contract-bound reports and an actual-query walkthrough are described in [shared demos](SHARED_DEMOS.md). Historical plans remain bound to their original artifacts.

## Library API

```ts
import {
  createContractRequest, importContractProposal,
  inspectSemantic, createContextPack, serializeContextPack,
} from 'clearings-semantic'

const request = createContractRequest(structural, {
  repository,
  instruction: 'Describe response selection and failures.',
  maxBytes: 131072,
})
// Obtain response through explicit file exchange with an agent or author.
const model = importContractProposal(request, response, {
  scan: structural, repository, replay: false,
})
const inspection = inspectSemantic(model, { behavior: 'response-selection' })
const pack = createContextPack(model, { capability: 'request-dispatch' }, {
  maxBytes: 131072, includeNeighbors: false,
})
const json = serializeContextPack(pack)
```

The API returns portable objects. Callers own I/O. `validateContractRequest`, `validateContractProposal`, and `validateContractModel` are available for external input. Validation rejects unknown schema fields, duplicate IDs, invalid endpoint kinds, missing assertions/unknowns, incompatible callable roles, invalid flow membership, stale source binding, and author-supplied certification. Full source validation re-derives callable observations from pinned Git objects.

## Context selection and byte accounting

Context selection starts with an explicit capability, behavior, or record ID. A capability selects its behaviors and assertions. The required set follows function dependencies, state links, assertions, flow records, implementation anchors, and critical unknowns. Complete referenced flows remain in the pack, including every branch and failure step. This is conservative and can include more flow context than one behavior alone needs.

Assertion subjects are attribution metadata. A shared assertion that names another capability does not itself request expansion of that capability. The selection does retain constraints and critical unknowns for the functions, state, and capabilities that participate in the selected contract. It does not treat unresolved dependencies as known implementations.

Optional neighboring behaviors share a capability, function, or state. The packer tries them in stable ID order and adds a complete dependency closure only if it fits. `--no-neighbors` or `includeNeighbors: false` keeps only the required set. Omissions list exact record and evidence IDs. Retrieval instructions identify the original model and scan. Structural symbol anchors not present in the supplied excerpts appear in `deferred_evidence_ids`; the existing evidence command can retrieve them from the bound scan.

The maximum budget is 2,097,152 bytes. Context serialization is compact JSON plus one newline. `used_bytes` measures that exact UTF-8 output, including metadata and the accounting fields. `required_bytes` measures the same pack before optional neighbors. Use `serializeContextPack`; pretty-printing changes the size. This is a byte budget, not a token estimate.

If the required set cannot fit, `CONTEXT_BUDGET` gives its measured size and asks for a narrower selection or a larger budget. The exporter does not drop a condition, state rule, failure boundary, or applicable critical unknown to force a fit. Broad capability packs can therefore be substantial. No context-efficiency claim is made.

## Hono review and reproduction

```bash
node scripts/replay-contracts.mjs benchmark-checkouts/hono.git \
  benchmarks/results/local/my-contract-review
```

The script scans the pinned source, recreates and compares the request, imports the recorded response twice, checks deterministic context selection, and records a before/after target fingerprint. It produces:

- `semantic.json`: the v0.2 canonical model.
- `inspection.json`: a catalog and actual capability inspections.
- Two capability context packs and one focused response-getter pack.
- `source-walkthrough.json`: capability → behavior → function/state → assertion → exact source, with actual query results.
- `scan.json`, source license, measurements, and output hashes.

The checked-in review bundle omits the large reproducible scan. Run the command above to obtain it. The source review records retained and new assertions separately. It remains an author self-review. Neither citation checks nor this narrow example establish complete runtime behavior, independent support, or better coding performance.

## Remaining demo integration

The next task adapts both audience reports to these canonical contracts and produces the internal-representation walkthrough from the same artifact. It must also record an agent answering bounded questions from selected context, including any extra source lookup. The current source walkthrough is query output, not an agent comprehension result. Optional code rewriting, broader repository coverage, and provider SDKs are outside this change.
