# Clearings: three views of one model

Open index.html. The overview gives purpose and outcomes. The engineer article adds conditions and source. internal.html follows real query output through a behavior, function, shared state, assertion, and evidence. Markdown copies are included.

Artifact: semantic:879ce0fdb5dee3f6f406bfa87e28f0d2f48b65fb58026479f9172bbd54b8c3f0

All views are recorded replay from pinned Hono source. The model has 22 functions, 4 behaviors, and 73 assertions. Contracts and prose need independent support review.

The agent answers are a continuing-session author demonstration, not a blind or independent evaluation. Rebuilding copies the recorded answers; no model is called. Input context files are the adjacent request-dispatch.context.json and middleware-composition.context.json. See agent/input.json and agent/questions.json.

Reproduce from the Clearings repository root after npm ci --ignore-scripts and npm run build:

```bash
node scripts/replay-contracts.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts
node scripts/build-shared-demo.mjs benchmark-checkouts/hono.git benchmarks/results/local/my-contracts benchmarks/results/local/my-demo
python3 scripts/package-shared-demo.py benchmarks/results/local/my-demo
```

Use new output directories. Fetch the pinned bare checkout first with npm run benchmark:fetch if absent. The scan is produced by replay and kept outside this smaller bundle.

Review source fidelity, conditions, callback unknowns, and the assertion links. review.json records source checks and hashes. Browser policy blocked local preview in the current session history. No new browser pass is claimed. Native details, responsive CSS, keyboard code scrolling, internal links, and local assets are checked statically; desktop/mobile interaction review remains pending.

Source excerpts retain the upstream notice in LICENSE-HONO. Reports include that notice.
