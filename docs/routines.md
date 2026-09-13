# Routine versions and acceptance

A task contains a contract and acceptance cases. Record it before submitting candidate source. Changing either creates a different task ID. Each candidate refers to that task and contains its source, prepared JavaScript, source map and engine identity. IDs are SHA-256 digests of canonical JSON objects; records live in a local SQLite database using WAL transactions.

The `store` module exposes preparation, submission, evaluation, activation, execution, inspection and deactivation. The command and MCP interfaces build on this same implementation.

## Acceptance

Each case supplies input, an exact expected outcome and an ordered list of expected capability calls and fixture results. Evaluation has no live credentials or filesystem grants. Wrong, extra or missing calls reject the candidate, even if the code catches the fixture error. Acceptance cases must include at least one completed result. Passing these cases is evidence for those cases, not proof of general correctness.

The first evaluation of a version is retained. Activation is a separate operation, and requires that evaluation to pass. Replacing an active version requires the caller to name the version it expects to replace; a concurrent change causes an error. Deactivation has the same requirement. Submitting a revision does not change the active version.

Stored object hashes are checked when loaded for execution. This protects against accidental corruption. The database is trusted local state, not a security boundary against its owner modifying both records and hashes. Engine identity changes require source re-submission and evaluation.

## Live capabilities

Each invocation receives its own policy. Stored code can request capabilities but cannot grant them. File roots work as described in [Execution](execution.md).

A named HTTP binding allows a GET request to a fixed endpoint, with explicitly listed query keys whose values must be strings. The policy declares the expected JSON response schema. HTTPS is required except for explicitly configured loopback endpoints. Redirects are rejected. Requests inherit the remaining execution deadline and response byte limit. Credentials are referenced by an environment variable name and are attached only by the host.

```json
{
  "roots": {},
  "http": {
    "tickets.list": {
      "url": "https://api.example.com/tickets",
      "query_keys": ["status"],
      "output_schema": { "type": "array" },
      "bearer_token_env": "TICKETS_READ_TOKEN"
    }
  }
}
```

The matching routine requests `tickets.list` in its contract and calls `clearings.call('tickets.list', {status: 'open'})`. Endpoint administrators must choose read operations: HTTP GET alone cannot guarantee an arbitrary service has no effects. Clearings does not expose arbitrary URLs, shell execution or write methods to routines.

## Run records

Runs retain the selected version, input digest, outcome, elapsed execution time and capability-call count. Policy failures and runtime failures remain visible. Input bodies and credentials are not recorded; returned output and handoff context are recorded and may contain sensitive data. Keep the database in a private directory. It is local to the user and is not uploaded.

`model_usage: null` means no measured model usage is attached. It does not mean the surrounding coding-agent turn cost zero tokens. Routine reuse is executable reuse; results are read and computed again for each invocation.

HTTP endpoints and output schemas are validated during policy construction, before any request. One redirect-disabled client reuses its connection pool for that broker; each request has the remaining invocation timeout. Fixture inputs and results must both fit the JSON numeric range.

The execution identity includes a semantics revision. Versions prepared under the previous identity must be resubmitted and evaluated before activation.

Repeated evaluation of a version returns its immutable existing report without running cases again. New evaluations enforce an aggregate report budget while collecting cases; exceeding it returns an explicit error and does not persist or activate a partial evaluation. The SDK retains input/output types for built-in file operations, with JSON input/output for user-named operations. SDK type checking uses TypeScript 5.4 or later.
