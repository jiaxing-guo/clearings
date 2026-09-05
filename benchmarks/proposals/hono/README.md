# Recorded Hono proposal

These are actual request/response files for the pinned Hono snapshot, authored through an agent source-reading session. The response is a recorded interpretation with unreviewed acceptance and support status. Replaying it does not run an agent or produce fresh inference. The exact producing model identifier and token counts were unavailable and are recorded as null.

`request.json` contains upstream source excerpts under the accompanying MIT LICENSE. The selection configuration in `benchmarks/targets/hono-semantic.json` contains only scope, requested evidence IDs, budget, and task instruction. The replay script checks that a freshly source-verified request matches this recorded request before using the response.

The claim review is stored separately under `benchmarks/results/hono-semantics`; neither the analyzer nor the replay harness reads it. Source review and recorded corrections are not independent human adjudication.
