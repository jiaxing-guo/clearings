# Clearings

[![CI](https://github.com/jiaxing-guo/clearings/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jiaxing-guo/clearings/actions/workflows/ci.yml?query=branch%3Amain)
[![Rust coverage](https://codecov.io/gh/jiaxing-guo/clearings/branch/main/graph/badge.svg)](https://app.codecov.io/gh/jiaxing-guo/clearings)
[![Documentation](https://img.shields.io/badge/docs-clearings.ai-blue)](https://clearings.ai/docs/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue)](LICENSE)

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

Download [v0.1.0-beta.1](https://github.com/jiaxing-guo/clearings/releases/tag/v0.1.0-beta.1) for Apple-silicon macOS or Linux x86-64. Ask your coding agent to verify the checksum and install the bundled plugin for your client.

> Install Clearings v0.1.0-beta.1 for my operating system and coding client. Verify the release checksum and help me complete the normal client trust steps.

[Installation](docs/installation.md) covers the release packages and client trust steps. Installed packages include the runtime; users do not need Node, Python, npm, or a Rust compiler. This is a beta release; Windows and Linux ARM packages are not available.

## How it runs

Rust owns permissions, storage, and process supervision. Oxc prepares TypeScript; QuickJS executes it in a separate OS-isolated worker. Routines request named file or HTTP operations, while the host supplies the actual grants. Changed inputs are read again. Saved code is reused; results are not silently cached.

Acceptance checks establish behavior on recorded examples. They do not prove general correctness or guarantee savings on every task. See [performance](docs/performance.md) for workload selection and measurement.

## Learn more

- [Website](https://clearings.ai/) · [Online documentation](https://clearings.ai/docs/)
- [Documentation](docs/README.md)
- [Daily use](docs/default-experience.md)
- [Personal workbench](docs/workbench.md)
- [Runtime and permissions](docs/execution.md)
- [Development](docs/development.md)
- [Contributing](CONTRIBUTING.md)

[Apache License 2.0](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
