# Subsequent Clearings task

After independent acceptance, the submitted Program IR was copied unchanged into the ordinary production path. The authoring module received formatting only and reproduces the exact accepted JSON. The updated Clearings implementation then assembled its own `assemble-context` contract for integration review.

`record.json` captures that invocation and its source inventory, arguments, complete output, and observed native identity. `evaluation.json` independently accepts the invocation under the context profile. These two files use compact JSON to retain complete machine-readable observations without duplicating a large expanded source listing in the review. `summary.json` provides a readable index and SHA-256 bindings.

The recorded Git baseline is the preceding candidate/evidence PR. The inventory records the additional production JSON and built-file bytes actually used. The baseline commit alone does not describe those working-file changes. The native program identity must equal the independently accepted candidate's identity.

The assembled contract contains `assemble-context`, `measure-package`, `project-operation`, and `select-required`. Its explicit requirement to report insufficient capacity without truncating the required context informed the additional 512-operation byte-budget regression in `tests/native-context.test.mjs`. That test requires successful native closure computation followed by `CONTEXT_BUDGET`, separate from a larger workload's `CONTEXT_RESOURCE` failure.

Reproduce in a new output directory with a built checkout and the pinned toolchain:

```bash
node scripts/record-indexed-context.mjs followup-context
```

This records a subsequent context-assembly and integration-review task using the improved Clearings version. It is not a second independent coding-agent trial, an automated iterative development system, or compiler self-hosting. Captured source digests and local instrumentation establish the stated content bindings, not adversarial execution authentication.
