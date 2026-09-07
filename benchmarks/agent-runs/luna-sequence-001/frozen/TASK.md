# Add sequence checks to Clearings

A single operation record cannot show whether the resulting state is the starting state of the next record. Add a library function that checks the operation records and compares explicitly selected shared state across adjacent records. Use the exact API and requirements in API.md and the generated context.json.

Allowed source edits: create src/specification/sequence.ts and update exports in src/index.ts. Add your own runnable tests under tests/. Do not modify existing source modules, schemas, package files, dependencies, supplied specifications, or requirements. Do not inspect any evaluator or other workspace. No network, extra agents, or target execution.

Use record.mjs for every source/document read, file listing, and test command. Edits may use apply_patch. Record the purpose of an edit with `node record.mjs note ...`. Run actual node:test cases; a command that reports zero tests does not count. Build, typecheck, and run your own tests before finishing. You may repair your work using your own tests only.

When finished, state changed files, commands, actual test counts, and remaining limits. Do not commit or push. Your first completed submission will be captured before withheld evaluation. No evaluator feedback is available during implementation.
