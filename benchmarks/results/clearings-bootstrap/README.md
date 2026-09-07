# Review the typed specification core

Open index.html. The pages and Markdown copies come from the same operation records as the context JSON. HTML is a human view; agents receive clearings.context.json or hono.context.json.

Start with the cycle case in clearings.html. Does the requirement explain why shared dependencies and blocking decisions must remain? In hono.html, compare direct and Promise fallbacks, then inspect the getter. Each function has its own responsibility.

The Clearings contract expresses intended behavior. Hono is a separately authored source interpretation over a bounded decision domain. These are proposed records. Scenario checks establish agreement with supplied observations, not source equivalence or complete execution behavior. Hono is not executed.

## Reproduce

From the Clearings repository, after npm ci --ignore-scripts:

```bash
npm run bootstrap:demo -- benchmarks/results/local/new-bootstrap
node scripts/check-bootstrap-demo.mjs benchmarks/results/local/new-bootstrap
python3 scripts/package-shared-demo.py benchmarks/results/local/new-bootstrap
```

Use a new output directory. The author-development-record.json describes the continuing-session process and its limits. implementation-bindings.json contains exact working-source spans and file hashes. It is an explicit author mapping, not proof that code implements the specification.

The runner checks actual Clearings outputs, byte counts, nonmutation, deterministic serialization, and closure membership against a separate fixed-point algorithm. Effects are recorded from the known pure test path and author source review; the runner does not instrument arbitrary I/O. Counterexamples inject faulty output observations, not compiled implementation variants. Hono cases are authored examples checked against its model, not runtime traces.

The observation adapter summarizes full packages as IDs and counters. Separate equality checks compare complete included operation records with the input. Source hashes establish content integrity; independent support review remains pending. No fresh-agent benefit or performance claim is made.

Browser interaction has not been tested in this pass. Local links, escaped text, keyboard scroll controls, viewport metadata, and self-contained assets are checked statically.
