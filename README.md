# Clearings

**Turn repeated agent work into reusable routines.**

Clearings helps your coding agent save the parts of a workflow that can run as code: collecting files, parsing records, checking results, and comparing changes. The next time that work comes up, the agent can run a tested routine on fresh inputs.

Use a **skill** for instructions and judgment. Use a **routine** for executable steps. Skills bundled with Clearings help the agent learn, find, run, and manage those routines.

## Start with useful repetition

Good candidates include research-run audits, log summaries, file-backed data cleanup, and recurring checks against known sources. A routine is most useful when it replaces several model-driven steps. A tiny calculation may be faster without one.

Tell your agent:

> Make this workflow reusable with Clearings.

Or:

> Review recent work in this project and find a useful routine to save.

Clearings reads supported local Codex and Claude Code conversations, prepares acceptance examples, and checks generated TypeScript before activation. Daily learning uses your existing coding client. No separate model connection or setup interview is required.

## Inspect and improve your routines

Ask **“Open the Clearings workbench.”** The local UI brings together examples, test inputs, results, recent use, pause controls, and undo. Describe an extension, add an example, review the test results, and apply the update. You do not need to edit source or manage IDs.

The agent can also handle these requests directly:

- “What did you learn?”
- “Pause learning.”
- “Learn weekly.”
- “Undo the last automatic change.”

## Install

Use a bundled package from a successful [Packages build](https://github.com/jiaxing-guo/clearings/actions/workflows/package.yml) for the revision you want to try. Your coding agent can download, verify, and install it. The plugin's pinned public runtime is not published yet, so a source-only marketplace installation cannot complete its first download.

[Installation](docs/installation.md) explains the working preview-package path and client trust steps. Installed packages include the runtime; users do not need Node, Python, npm, or a Rust compiler.

## How it runs

Rust owns permissions, storage, and process supervision. Oxc prepares TypeScript; QuickJS executes it in a separate OS-isolated worker. Routines request named file or HTTP operations, while the host supplies the actual grants. Changed inputs are read again. Saved code is reused; results are not silently cached.

Acceptance checks establish behavior on recorded examples. They do not prove general correctness or guarantee savings on every task. See [performance](docs/performance.md) for workload selection and measurement.

## Learn more

- [Website](https://jiaxing-guo.github.io/clearings/) · [Online documentation](https://jiaxing-guo.github.io/clearings/docs/)
- [Documentation](docs/README.md)
- [Daily use](docs/default-experience.md)
- [Personal workbench](docs/workbench.md)
- [Runtime and permissions](docs/execution.md)
- [Development](docs/development.md)
- [Contributing](CONTRIBUTING.md)

[Apache License 2.0](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
