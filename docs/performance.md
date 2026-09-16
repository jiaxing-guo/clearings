# Performance

Clearings aims to reduce repeated model work. It helps when a saved routine replaces enough reading, parsing, checking, or comparison to outweigh discovery and invocation overhead.

## Choose a suitable workload

Good targets have stable inputs, repeated mechanical steps, a checkable output, and enough future use to repay authoring and maintenance. Research-run audits and recurring checks against known artifacts are stronger candidates than a single short calculation.

A complex task can still need substantial judgment. Keep that work with the agent and extract the repeatable portion. A skill can preserve instructions; a routine can execute the mechanical steps.

## Separate the clocks

Measure these parts independently where the client exposes them:

1. Client startup and context preparation.
2. The model producing a tool call and its arguments.
3. Client approval or automatic review.
4. Source I/O and native execution.
5. The model interpreting and presenting the result.

Native execution can be much shorter than a full agent turn. Removing a model round trip can matter more than making an already-fast transformation faster. Direct workbench tests do not need an authoring-model request.

## Compare against useful baselines

Use three approaches:

- Ordinary agent execution, allowed to batch work and write helpers.
- An existing saved script implementing the same behavior.
- The Clearings routine through its normal integration.

The saved-script baseline distinguishes the value of reusable code from Clearings' discovery, validation, permissions and management. Do not weaken the ordinary baseline or require the model to use a routine in the main comparison.

Keep inputs, model, effort, permissions, required output and machine conditions fixed. Rotate order, retain failures and timeouts, and report per-workload results. Use independent examples for authoring and evaluation.

## Count tokens carefully

Report total input, cached input, uncached input, output and reasoning counters where available. Cached input is already included in input. Reasoning output is already included in output. Sum per-response usage once, not repeated cumulative counters.

Fewer total input tokens do not establish proportional billing savings. Report authoring, repair, installation and maintenance separately from reuse. If a routine is never selected, that is a product outcome, not a trial to discard.

## Preserve correctness

Check exact results, evidence coverage, fresh reads, schema/version checks, permissions, missing-data handling, and appropriate handoffs. A shorter incomplete answer is not a performance improvement.

Routine execution does not cache outputs. File-backed inputs avoid copying artifacts through model arguments, but a large requested final export can still dominate latency and tokens.

## Interpretation

Passing runtime tests establishes specific execution properties, not universal savings. A positive local replay supports that workload and setup. Broader performance claims require broader evidence.

If Clearings matches a ready script, its value can still be automatically finding, creating, validating and reusing that script. It should not be presented as a faster JavaScript engine merely because the surrounding agent workflow became shorter.
