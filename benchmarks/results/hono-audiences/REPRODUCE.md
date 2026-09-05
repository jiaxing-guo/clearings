# Reproduce the reading reports

Clearings — Internal representation for AI coding.

This package contains two Hono capabilities, each with a PM / vibe coder overview and an engineer guide. Each view is available in HTML and Markdown. Open the HTML files directly. Keep all files in one directory to use the audience links.

## Regenerate from the full Clearings repository

Use the source on the `feat/semantic-proposals` branch of the Clearings repository, as updated in PR #3. The ZIP contains report artifacts; it does not contain the full Clearings implementation or the Hono checkout.

Run these commands from the Clearings repository root, with its dependencies and pinned Hono checkout available. Use a new output directory.

```bash
npm run build
node scripts/replay-semantics.mjs benchmark-checkouts/hono.git benchmarks/results/local/reading-review
```

The script verifies the pinned source, replays the recorded proposal, and renders all eight reports. It checks repeatability and verifies that the Hono files remain unchanged. It does not call a model.

Hono commit: `eebdf7be39abf0a872671835ccce0c4f03ea497a`.

## Package records

- `semantic.json`: the shared semantic model, including 53 claims and five critical unknowns.
- `*.presentation.json`: authored reading plans and function summaries.
- `summary.json`: the latest replay measurements and report hashes.
- `review.json`: current automated verification, prior browser results, user acceptance, and the latest regeneration checks.
- `browser-review.json`: prior desktop, mobile, keyboard, and rendered Markdown checks. Later source-link additions passed static checks. Browser policy blocked the latest local-file preview; these browser results remain historical.
- `LICENSE-HONO`: the source license.
- `SHA256SUMS`: hashes for all other packaged files.

The user accepted the reports for this prototype. Independent claim-support review remains pending. Function summaries are authored prototype data; automatic function contracts and agent context export remain future work.
