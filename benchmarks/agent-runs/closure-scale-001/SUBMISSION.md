# Final candidate submission

Program identity: `program:e08458748756b1d965490a1bda8572814b468e7f1868a2222ff7a3faad0cc1d8`

Delivered files:

- `programs/clearings/required-dependency-closure.mjs`
- `programs/clearings/required-dependency-closure.json`
- `SUBMISSION.md`

The authoring module constructs typed Program IR syntax only. It imports `sealProgram` from the supplied `clearings/program` package and accepts no invocation arguments. All graph processing is executable IR. The language, runtime, compiler, limits, and accounting rules are unchanged.

## Algorithm

1. Build a stable ID-sorted permutation of the original record positions. Sort blocks of at most 16 positions and merge their runs, using only lists of integers; dependency-bearing records remain immutable input values. Small initial blocks avoid repeatedly materializing an inventory of one-element lists.
2. Validate uniqueness before traversal. Stable sorting keeps equal IDs in declaration order. Among positions whose ID equals the preceding sorted ID, select the smallest original position. Its ID is exactly the first repeated declaration, including when roots are empty.
3. Build a powers-of-two list and use binary lifting to look up each expanded ID in the sorted permutation. This implements lower-bound search using IR addition and subtraction, without division or host computation.
4. Maintain one unique FIFO list of discovered IDs. Insert distinct roots in first-occurrence order before processing the queue. On expansion, resolve the current ID, collect distinct required targets, sort those strings using the language's UTF-16 ordering, and enqueue targets absent from the queue. The completed queue is the returned order.

Marking at enqueue time removes repeated pending entries while preserving the baseline order of first visits. Missing IDs are resolved only when their queue position is expanded, so missing-root and missing-target failure precedence remains unchanged. Optional and unreachable references do not trigger lookup failures. IR value semantics preserve all caller inputs.

## Checks completed

- Read the supplied operation contract, IR semantics, execution accounting, artifact validation, and native execution references.
- Reproduced the committed JSON with `node scripts/build-required-closure-program.mjs` and verified exact byte equality against the authoring module's serialized result.
- Passed `validateProgram` and verified `programIdentity` matches the artifact identity.
- Verified repeated `compileRustProgram` calls produce equal compiled artifacts.
- Passed 2,871 reference-execution cases in `development-checks.mjs`, using the existing maximum limits. These include all 512 directed graphs on three vertices with each single root (1,536 cases); 120 additional seeded cases checked against independent simple-path ranking; all 1,092 declaration sequences of lengths one through six over three IDs for first-duplicate precedence; 100 seeded failure comparisons with the supplied baseline; targeted ordering, optional/missing references, Unicode including lone surrogates, reserved-looking IDs, duplicate roots/edges, and input/output ownership; and 11 larger workloads below.
- Used the supplied native preparation/execution interface with Rust 1.85.1 (`PATH=/root/.cargo/bin:$PATH node development-checks.mjs`). All 61 native cases exactly matched reference completion and logical usage, including low-work exhaustion checks and all larger workloads below.

For the 256-record chain, logical work fell by 79.42% in forward declaration order and 79.37% in reverse order relative to the supplied baseline. Both 512-record chain orders returned under the existing maximum limits. No limit was raised beyond the published ceilings.

| Own workload | Candidate work | Candidate allocation | Baseline work or exhaustion |
| --- | ---: | ---: | --- |
| chain-256-forward | 850,897 | 303,091 | 4,134,308 |
| chain-256-reverse | 853,048 | 303,330 | 4,134,308 |
| chain-512-forward | 2,258,797 | 1,076,353 | Exhausted work |
| chain-512-reverse | 2,263,234 | 1,076,846 | Exhausted work |
| star-128 | 465,952 | 202,101 | 1,164,285 |
| cycle-128 | 346,606 | 93,668 | 1,086,962 |
| star-512 | 4,049,217 | 2,824,957 | Exhausted work |
| cycle-512 | 2,263,416 | 1,076,945 | Exhausted work |
| duplicate-edges-2000 | 222,946 | 162,676 | 4,967,659 |
| small-closure-in-1024 | 2,368,101 | 1,293,522 | 3,048,706 |
| small-closure-in-2048 | 6,947,234 | 4,834,196 | Exhausted allocation_units |

## Limits and scope

The index uses O(n log n) ID comparisons, and each record lookup uses O(log n) comparisons. Immutable list append still creates quadratic aggregate work/allocation in the merge output and queue; discovered-ID membership and per-record target deduplication remain linear scans. Extremely large inventories, dense graphs, long IDs, or stricter caller budgets may still exhaust resources. This is a bounded performance improvement, not an unbounded resource guarantee or universal refinement proof.

Local development files (`development-checks.mjs`, `development-results.json`, and `baseline.local.json`) are supporting checks/notes only and are outside the delivered change set. No sibling workspace, repository history, network resource, benchmark archive, or withheld evaluation material was accessed. This final candidate was completed without independent-evaluation feedback and will not be revised using that feedback.
