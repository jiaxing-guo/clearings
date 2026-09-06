# Preregistered coding experiment

Run ID: `luna-impact-001`. Date: 6 September 2026.

Question: Can one Luna coding agent implement a bounded Clearings feature from a frozen intended operation specification, its generated context, an API mapping, and the existing library source?

The feature is potential change-impact analysis over declared operation dependencies. It is new functionality; no reference implementation exists in the coding workspace.

## Separation and freeze

The orchestrator authors the specification and evaluation tests before the coding agent starts. Test independence means separation from the coding agent and its implementation, not independent human authorship. The test oracle uses source-to-target path search and fixed-point membership; no candidate code informs it.

Freeze SHA-256 digests of the specification, generated context, API/task/protocol, evaluation files, allowed source snapshot, environment lockfile, and agent prompt before spawning the coding agent. Preserve the freeze manifest with its UTC creation time. Capture candidate code and own tests before evaluation. Verify frozen files and unallowed source files have not changed.

Spawn `gpt-5.6-luna` with `fork_turns: none`. Give it only the experiment prompt. Its general system/tool instructions still exist. It shares the container with the orchestrator. No claim of OS-level isolation or prevention of all filesystem access is made.

The coding workspace excludes repository history, project benchmarks, prior tests, and experiment evaluation assets. A recorder logs requested reads, commands, outputs, timing, and edit notes. Tool-level access outside the recorder is not independently audited. The final report must distinguish the recorded trace from a complete access audit.

## Submission and evaluation

One initial coding attempt is allowed. No hidden-test feedback or coaching is supplied before capture. The agent may inspect provided source and run its own tests. Clarification questions are recorded; the orchestrator may repeat an already frozen requirement but must not change the contract. A substantive ambiguity ends the frozen attempt for evaluation rather than silently changing the task.

After submission, copy its allowed changes into a separate evaluation copy of the frozen baseline. Run build/typecheck, the withheld suite, and the existing library tests for integration regressions. Record individual tests, generated-case coverage, errors, and elapsed time. A build failure or requirement failure remains a failure of the initial submission. Do not repair it before recording results. Any later revision needs a separately identified attempt.

Use the actual compiled candidate on input fixtures. Check deterministic serialization, no mutation/aliasing, endpoint validation, reverse reachability, mode filtering, shortest witnesses and stable ties, cycles, omissions, open decisions, and output provenance. Include a fixed-seed generated graph sweep and a bounded deep chain.

## Interpretation

Passing all tests means the candidate meets these concrete checks under this frozen task. It does not prove general correctness, source conformance, or that the IR outperforms ordinary instructions. There is no prose-only control, repeated-model comparison, or coding-speed/token advantage claim. Native token counts and a verified backend model revision may be unavailable; report them as unavailable rather than estimating them.

Report how much key behavior remained opaque in the typed language and what the agent used. Keep the candidate patch available for review. Do not merge it into the main working tree, commit, push, or publish as part of this experiment.
