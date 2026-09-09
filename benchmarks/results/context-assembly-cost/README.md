# End-to-end context assembly cost

The compiled state/source stage adds measurable cost to ordinary context assembly. On this host, Clearings’ own contract took a median **24.6 ms** in a prepared process, compared with **16.3 ms** for compiled closure followed by host selection. An empty native cache raised the corresponding medians from **3.20 s to 4.78 s**. The 512-state workload took **59.3 ms versus 21.8 ms** in a prepared process. These are local feasibility measurements, not a speedup result or a production latency guarantee.

The [raw report](report.json) contains every timing sample, the implementation inventories, both native audits, and input/harness hashes. The [inputs](inputs.json) contain the complete identical workloads and independently derived expected byte counts and output digests. The [verification record](verification.json) binds the report and records statistic recomputation and an intentionally wrong expected-output control. All **600 timed calls** matched the independent expected serialized context and retained the original input.

## Measured revisions

| Version | Commit | Production behavior |
| --- | --- | --- |
| Baseline | `ddd88d5a352c9919d788287b09660a36d54cd1f8` | Compiled dependency closure, TypeScript state/source selection |
| Candidate | `334463412b527d162f88691b7050b8b7e5636704` | Compiled dependency closure and compiled state/source selection |

The closure program and compiled-artifact identities are equal across the two revisions. The benchmark runs the unmodified public API from each built checkout. Only the benchmark and evidence are added on the follow-up branch; the measured PR revisions remain unchanged. The measured harness is preserved in commit `828aeb0f9d39d5b4b61aa6c06c4a8e7e557333ed`.

## Prepared-process calls

All values below are milliseconds for `assembleContext` plus final `serializeOperationContext`. Each version/workload has 50 measured calls, clustered as ten calls in each of five fresh Node processes. Explicit native preparation and three warmup calls per process are excluded. Added cost is the difference between the two reported medians.

| Workload | Context bytes | Baseline median | Candidate median | Added median cost | Candidate p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| own-contract | 29,489 | 16.33 | 24.59 | 8.26 | 29.92 |
| partial-32 | 52,866 | 19.20 | 31.33 | 12.13 | 35.58 |
| complete-64 | 104,597 | 25.44 | 42.20 | 16.77 | 50.56 |
| chain-128 | 109,898 | 27.33 | 39.56 | 12.23 | 45.26 |
| states-512 | 121,898 | 21.76 | 59.25 | 37.49 | 70.81 |

## First call in a fresh process

Each cell is the median of five fresh Node processes. Empty-cache calls prepare native code on demand; cached calls start with existing executables but have no prepared in-memory handles. Node startup, imports, and fixture reads occur before the timer.

| Workload | Empty cache baseline (s) | Empty cache candidate (s) | Cached baseline (ms) | Cached candidate (ms) |
| --- | ---: | ---: | ---: | ---: |
| own-contract | 3.201 | 4.781 | 81.17 | 108.83 |
| partial-32 | 3.211 | 4.767 | 83.31 | 114.03 |
| complete-64 | 3.294 | 4.810 | 108.16 | 141.93 |
| chain-128 | 3.241 | 4.786 | 89.58 | 118.96 |
| states-512 | 3.212 | 4.797 | 81.36 | 141.17 |

## Workload and timing boundaries

`own-contract` is Clearings’ actual four-operation context contract with one modeled state and one supporting source. The other cases are authored workloads: a 32-operation chain with 64 states/sources; a 64-operation complete-frame case with 128 states/sources, including states without explicit accesses; a 128-operation chain with no states/sources; and one operation reading 512 states with 128 sources. Full inputs are saved, so the report does not depend on remembering those descriptions.

The measured interval includes whole-specification validation, the host adapters, all native preparation required by the mode, both native processes in the candidate, native verification/admission/transport, complete object projection, byte accounting, and final serialization. Assembly and final serialization are also retained as separate raw metrics. The harness does not estimate host-adapter or process-startup cost by subtracting separate microbenchmarks.

The independent reference supplies semantic expectations; an independent recursive object-key ordering produces the expected wire bytes. Expected-result hashing, assertions, input-ownership comparisons, and benchmark output occur after the timer. Native diagnostic audits run separately; timed calls have no diagnostic subscribers. Before and after inventories confirm that implementation files and the benchmark harness did not change during measurement.

Runs are sequential, with version order alternating by sample and workload order rotating. The report retains upper-middle medians and nearest-rank p95 values, minima, maxima, and all raw observations. Five first-call samples are too few for a stable production tail estimate; resident samples share process/JIT/GC state within each ten-call group.

The host used v24.19.0, Rust 1.85.1, linux x64, and AMD EPYC 9V74 80-Core Processor (9 visible logical CPUs). Empty-cache means a fresh native executable cache, not a freshly booted machine: filesystem caches and the installed toolchain were retained. Installation, physical memory, event-loop delay, concurrent load, Node startup, and CLI parsing are excluded.

The valid 2,048-state input that exhausts the candidate’s work limit remains a separate compatibility regression. It is not included as a successful performance sample. No latency acceptance threshold was specified, and these results do not establish acceptable latency for every intended deployment.

## Engineering implication

The measurements support preparing native executables during setup and reusing prepared handles when embedding Clearings. Cached first calls still incur initialization cost. The wider-state case shows that the additional selection work matters beyond fixed process overhead. These results make the current synchronous cost explicit; they do not select an optimization, change the resource ceilings, or justify a new runtime mechanism by themselves.

## Reproduction

Use the benchmark harness commit above (or a later harness with the recorded hashes verified), built candidate and baseline checkouts, pinned npm dependencies, Rust 1.85.1, and a host linker. The saved comparison used the two exact production commits listed above. Run the following from the benchmark checkout after building it and both measured checkouts:

```bash
node scripts/profile-context-assembly.mjs \
  --baseline /path/to/built-baseline \
  --candidate /path/to/built-candidate \
  --samples 5 --repetitions 10 \
  --out /tmp/new-context-cost-run
```

The output directory must be new. The command fails on incorrect output, input mutation, an unavailable native execution, changed implementation/harness bytes, or an unexpected stage layout. Temporary native caches are removed after the run. Timings will vary across machines and runs; expected output identities should reproduce.
