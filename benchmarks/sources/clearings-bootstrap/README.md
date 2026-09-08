# Preserved bootstrap source

These four files reproduce the exact bytes referenced by the original bootstrap implementation bindings. The manifest records matching Git blobs from revision `73f4ef3cc656777ec5368f8590bf9ba9e95c5e70`, verified against the repository when this snapshot was created. That revision locates the preserved bytes; it is not a new claim about the revision that produced the historical execution.

`scripts/check-bootstrap-demo.mjs` checks these files against the original whole-file hashes, excerpt hashes, and byte ranges. It separately evaluates the current implementation against the saved context examples. The source check requires no Git history or network access. It checks local content integrity; it does not independently authenticate the repository or retroactively authenticate historical executions.

Keep this snapshot and the original result artifacts unchanged. Subsequent production changes require fresh execution evidence.
