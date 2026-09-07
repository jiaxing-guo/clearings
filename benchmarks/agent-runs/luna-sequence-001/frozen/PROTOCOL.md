# Fresh-agent sequence experiment

The active author freezes requirements, the intended typed model, generated Clearings context, baseline source, and independent tests before the coding agent starts. The coding agent is a fresh gpt-5.6-luna session with no inherited conversation. It receives the coding workspace only. The evaluator's tests remain outside that workspace and are not given to the agent.

The agent can read baseline source, prose requirements, and the typed context. This tests whether an independent coding session can deliver a bounded addition with those inputs. It does not compare typed context with prose-only instructions. The shared filesystem and access recorder provide a protocol record, not OS isolation. Test independence means separate authorship from the coding agent; the test author is an AI agent, not an independent human reviewer.

Capture the candidate source, its own tests, recorded reads/commands, final response, and patch before evaluation. Score the first submission without repairs. Run frozen feature tests and the existing regression suite in a separate workspace. Preserve setup failures separately from implementation failures. Do not alter tests or requirements after the freeze. If a defect needs repair, keep the original result and record a separate revision.

After evaluation, review the candidate source. Integrate only a passing, reviewed implementation into production source on the PR branch. Preserve the first submission unchanged. Integration does not mean the PR has merged. A further development cycle that uses the improved version is outside this experiment.

The checker evaluates supplied records. Neither passing examples nor state continuity establish that source code ran in this order or implements all intended behavior. A modeled failure can be a valid result. Missing observations stay unknown. The caller chooses which fields refer to the same shared storage.

Frozen baseline is recorded in baseline.json. Reproduction uses that Git commit for full regression fixtures. The source-baseline archive contains the exact coding inputs without historical tests or benchmark answers. The prior luna-impact-001 experiment remains unchanged.
