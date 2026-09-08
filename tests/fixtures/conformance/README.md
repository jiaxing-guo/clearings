# Context conformance controls

The positive control is a separately authored, dependency-free implementation of the scoped synchronous API. It imports neither the production implementation nor the independent reference. The reference uses shortest-path relaxation and a decimal-width equation; the positive control uses a FIFO queue and iterative serialization.

`faults.json` defines executable source mutations and their designated detecting check before candidate execution. Each mutation must apply exactly once to the positive-control source. The changed source is written into a separate built Git checkout and executed through the production recorder. Record editing is confined to separate evaluator fidelity tests.

The full suite contains all 512 directed graphs on three labeled operations, including self-loops, for all three roots. Targeted cases cover optional edges, aliases, traversal order, state frames, evidence metadata, Unicode, budget boundaries, and exception precedence. The suite manifest binds the generated inputs and these control files. A timeout detects nontermination but does not establish an application-level contract violation.

This is bounded conformance testing. It is not a fresh-agent experiment, a proof of universal refinement, or a complete external-effect monitor.
