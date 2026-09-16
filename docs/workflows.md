# Learn and reuse a workflow

Start with work that has a stable mechanical part and useful future inputs. The agent can use a routine to collect and check evidence, then interpret the result itself.

## Research-run audit

A useful request is:

> Check this batch of experiment results. What changed, what failed, and what evidence is missing?

The reusable portion reads manifests and receipts, checks identities and completeness, compares observations, and returns counts and exceptions with source paths. The agent explains unexpected failures and scientific implications. A completed job is not automatically a positive scientific result.

Start from explicit local artifacts. Live cluster access requires a separate authorized source; the runtime does not provide arbitrary SSH or shell execution.

## Known-source monitoring

For recurring checks, code can normalize identifiers, deduplicate records, compare observations, and return changes. The agent handles unfamiliar sources and ambiguous meaning.

Competitor research fits this pattern when sources and comparison fields are established. Open-ended discovery is less suitable. A repeatable subtask is the target, not every part of a complex request.

## Bundled examples

| Example                  | Behavior                                             |
| ------------------------ | ---------------------------------------------------- |
| `repository-context`     | Collect selected project files with fresh reads      |
| `group-logs`             | Group bounded JSONL records by level and message     |
| `normalize-contacts`     | Normalize inline contact rows and deduplicate emails |
| `normalize-contact-file` | Apply contact normalization to a granted JSON file   |

Each example has a frozen task, TypeScript source, input and policy. File examples include fixtures and local sample data. The examples exercise the same lifecycle as user-authored routines. The standalone package check prepares all four routines and verifies eight executions with an empty runtime PATH.

The contact examples perform basic field validation, not email deliverability checks. The log example hands unsupported formats and samples above 5,000 nonblank lines back to the agent.

## File-backed inputs

When data already exists in a file, pass `{root, path}` and read it with `files.read` inside the routine. The agent should not copy a large document into tool arguments. The SDK includes a complete wrapper example.

Wrapping an inline-input helper requires a new task with a file-input contract, the declared read capability, and fixtures. It does not change the existing helper's interface or grants.

Keep results suited to the request. Counts, changes and exceptions are often enough for an audit; a requested export may need complete data. Moving input into the runtime does not automatically reduce output tokens.

## Test the boundary

Use fresh supported inputs and relevant unsupported cases. Include missing or malformed evidence. Record explicit trials as tests. When the routine returns a handoff, let the agent continue instead of widening the requirements or permissions to force a match.

See [routines](routines.md), [execution](execution.md), and [performance](performance.md).
