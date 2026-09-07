# Typed specifications for coding agents

The v0.3 specification is the primary interface for new semantic work. An operation contains its meaning in place: types, conditional outcomes, postconditions, state, effects, dependencies, implementation responsibilities, and decisions. JSON is the agent interface. HTML and Markdown render the same records for people.

## Start with one case

The Hono model distinguishes a direct missing result from a Promise that resolves without a result. A direct nullish result calls not-found without consulting `finalized`. A falsy Promise result can use a finalized context.

```bash
npm ci --ignore-scripts
npm run build
node dist/cli/main.js inspect specifications/hono/response-selection.json
node dist/cli/main.js context specifications/hono/response-selection.json --operation response-selection --max-bytes 131072
node dist/cli/main.js explain specifications/hono/response-selection.json --operation read-response --format markdown
```

No checkout of the target or model endpoint is needed. These commands read an authored recorded specification. They do not infer behavior from source or run Hono.

Save this observation as `case.json`:

```json
{
  "input": { "path": "direct", "value": "nullish" },
  "before": { "finalized": true },
  "outcome": "outcome:direct-missing",
  "output": "not-found"
}
```

```bash
node dist/cli/main.js check specifications/hono/response-selection.json --operation response-selection --observation case.json
```

The check passes for the stated rules. Change `output` to `context-response` and it fails. Omit `output` and the result is unknown. Exit codes are 0 for pass, 1 for a failed rule, 3 for unknown, and 2 for invalid input. A `pass` covers this observation and these rules. Partial state/effect boundaries remain visible in `limitations`.

The Hono input is an abstract decision domain. `path` records which source branch has already been chosen. `value` groups runtime values by the relevant condition. These are not the original function parameters. The checker cannot execute an arbitrary Hono request from this record.

## Keep intent separate from observations

| Artifact | Perspective | Meaning |
| --- | --- | --- |
| `specifications/clearings/context-assembly.json` | `intended` | Proposed requirements for context assembly |
| `specifications/hono/response-selection.json` | `observed` | Proposed interpretation of pinned Hono source |
| `benchmarks/results/hono-contracts/semantic.json` | Historical v0.2 | Source-linked English assertions and contracts |

All remain proposed. Approval of a design direction does not approve every precise contract. No acceptance operation is provided. Content hashes bind the specification and provenance. Source hashes establish integrity, not authenticity or entailment.

## The typed language

Types are booleans, strings, safe integers, finite numbers, null, string enums, homogeneous lists, and exact records. State fields have stable IDs and an explicit scope. Operations declare reads, writes, and complete or partial state/effect boundaries.

Conditions use a closed expression tree: literals, scoped references, boolean operators, equality, numeric comparisons, length, uniqueness, membership, subsets, bounded universal quantification, and bounded reachability over explicit string-ID edges. `opaque` retains an unsupported boolean condition and returns unknown. The interpreter uses no `eval`, generated JavaScript, or target code.

References use `input`, `before`, `after`, `output`, or quantified `local` values. Outcome guards can use only inputs and initial state. Postconditions can inspect the resulting output and state. State assignments must match the declared type, including nested enum and integer constraints.

`exclusive` outcomes require one applicable guard for the observed case. `allowed` outcomes can overlap; postconditions constrain their permitted results. Neither setting performs exhaustive satisfiability or coverage analysis. A `complete` coverage declaration is checked against the supplied case only. Partial coverage must record an open boundary.

A complete state frame preserves every modeled field outside the write set. A writable field without an update or postcondition remains unconstrained. Complete effects forbid unlisted effects for the selected outcome. Partial effects do not establish purity. Missing observations stay unknown when a rule requires them.

Dependencies specify why another contract is required. Transitions specify an outcome's declared handoff to a dependency. Cycles are valid. These links are not an execution trace. The checker does not execute transitions, compose proofs across operations, or model concurrency.

## Library API

```ts
import {
  validateSpecification, assembleContext, serializeOperationContext,
  validateOperationContext, checkOperation, renderSpecification,
} from 'clearings-semantic'

validateSpecification(specification)
const context = assembleContext(specification, 'response-selection', {
  maxBytes: 131072,
})
validateOperationContext(context, specification)
const json = serializeOperationContext(context)
const result = checkOperation(specification, 'response-selection', observation)
const html = renderSpecification(specification, 'response-selection', {
  format: 'html',
})
```

`specification` and `observation` are parsed input data. Callers own file I/O. `sealSpecification` assigns content identity to an authored model and validates it. `specificationIdentity` computes that identity. The schema is exported at `clearings-semantic/schemas/specification`.

`assembleContext` expands required dependencies in stable breadth-first order. Each operation appears once. It attaches full selected records, applicable state, exact referenced source, provenance, decisions, deferred optional links, and omitted operation IDs. Complete frames require all modeled state fields. A missing required operation rejects the specification, even if outside the selected root.

The budget is compact UTF-8 JSON plus one newline, including the byte counters. Use the serializer; pretty-printing changes the size. The range is 1–2,097,152 bytes. Insufficient budget produces `CONTEXT_BUDGET` with the required size. It never removes an outcome or decision to fit. The required closure can be large. This is not a token budget or an efficiency result.

`validateOperationContext` reconstructs a received package from its exact specification. It rejects stale identity, altered meaning, missing rules, changed source, forged review status, and incorrect accounting. Checking an artifact ID alone is insufficient.

`inspect` lists operations or returns a selected package. `context` exports a package. Both support JSON, Markdown, and HTML for selected operations. Selected `inspect` uses the 2 MiB maximum; `context` and `explain` default to 128 KiB and accept `--max-bytes`. `explain` defaults to Markdown. `check` requires JSON observations. CLI `--out` requires `--repository` to protect source paths. This path does not authenticate specification source; legacy `--scan` options are rejected for v0.3.

## Self-development experiment

```bash
npm run bootstrap:demo -- benchmarks/results/local/my-bootstrap
node scripts/check-bootstrap-demo.mjs benchmarks/results/local/my-bootstrap
python scripts/package-shared-demo.py benchmarks/results/local/my-bootstrap
```

Use a new directory. Open `index.html`. The bundle contains both specifications, actual agent contexts, two human views and Markdown copies, nine actual Clearings cases, nine authored Hono cases, eight rejected output faults, exact implementation source bindings, and an author development record.

The Clearings design preceded the refactor. The active author implemented the kernel and assembler and used the typed rules to check actual results, including assembly of its own specification. A separate fixed-point reference checks minimal dependency membership. Full-record equality checks prevent loss of operation fields. The adapter measures bytes and input digests outside the expression kernel.

This is a continuing-session author bootstrap. There is no fresh model call, independent trial, generated implementation, or formal source-refinement proof. Counterexamples inject incorrect output observations; they are not separately compiled faulty implementations. The adapter is trusted test code. Effects are not monitored through general I/O instrumentation. Hono cases are model scenarios, not observed executions.

## Historical compatibility

The original inventory, scans, v0.1/v0.2 exchange, replay, and accepted audience reports remain available. The old query code now shares budget accounting and has a separate graph module. `createContractBrief` and legacy `context --format readable-json` resolve assertion prose in place without inventing typed predicates. The result explicitly says `legacy-prose-only`.

The shared Hono bundle opens the typed slice at `internal.html` and retains the old walkthrough at `internal-legacy.html`. The reading guides still bind to the original model. They are not claimed to come from the narrower v0.3 slice. Typed source records are compared with source-verified legacy excerpts when the bundle is rebuilt.

## Fresh-agent coding result

The separate [Luna experiment](../benchmarks/agent-runs/luna-impact-001/REPORT.md) implemented potential dependency-impact analysis from a frozen specification, generated context, API mapping, and source snapshot. Tests were authored before coding and withheld from the agent. The initial candidate passed all 19 feature tests without repairs. The oracle self-check and build/typecheck also passed. All 73 existing tests passed across an initial run and a targeted rerun after a recorded evaluator setup correction.

The result supports feasibility for this bounded task. It does not establish an advantage over ordinary instructions: the agent read prose and source, eight rule records remained opaque, and the typed checker returned unknown. The captured candidate stays outside production source. See the report for the weak agent-authored checks, observation-adapter limits, and exact frozen inputs.

A second fresh-agent task now adds sequence checks to the production API on the PR branch. See [sequence checks](SEQUENCE_CHECKS.md) and the [experiment report](../benchmarks/agent-runs/luna-sequence-001/REPORT.md). It passed frozen tests and source review before integration. A matched prose-only comparison remains pending. Automatic requirement interviews, arbitrary code generation, source-to-specification inference, general behavior equivalence, and formal proof remain future work.

## Review corrections

Operation guarantees are checked even when the observation omits its outcome. Missing values still return unknown; a known guarantee violation returns fail. Selected inspection uses the supported 2 MiB limit. Both demo archives are verified before the site copies them and after static export. Legacy walkthrough evidence follows the selected assertion, and state inspection follows the selected function. The accepted audience reports and semantic model remain unchanged.

Verification after these corrections: typecheck and all 78 library tests pass. Both rebuilt archives pass exact-content checks. The documentation build and static checks pass for 27 HTML pages, 2,292 links, and three local search queries. Browser interaction was not run.

## Check consecutive observations

`checkOperationSequence(spec, steps, { stateIds })` checks each supplied operation and compares selected shared state between adjacent records. It accepts 1–256 steps and preserves missing observations as unknown. A valid rejected write can pass its contract. See [the API guide](SEQUENCE_CHECKS.md) for state selection, result fields, and errors. The model in `specifications/clearings/sequence-check.json` is the frozen intended requirement used by the fresh coding agent.

Equality validation rejects impossible enum comparisons, including misspelled string literals. `reachable` takes a string root and an explicit list of `{ from, to }` edges. It returns the unique reachable IDs, including the root, in default string order. Missing input or an exhausted work budget returns unknown. The context model now checks both required closure and minimal membership. It rejects an unrelated available operation even when omission accounting remains consistent.
