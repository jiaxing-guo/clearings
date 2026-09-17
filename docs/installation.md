# Install Clearings

Clearings runs through your existing Codex or Claude Code client. The packaged native executable includes its TypeScript transformer, JavaScript engine, and storage support. Installed users do not need Node, Python, npm, or a Rust compiler.

## Use a bundled preview package

The plugin's pinned public runtime is not published yet. Use a bundled artifact from a successful [Packages build](https://github.com/jiaxing-guo/clearings/actions/workflows/package.yml) for the revision you are reviewing. A source-only marketplace installation cannot download an unavailable release.

Ask your coding agent to handle the installation:

> Install the bundled Clearings package for this revision and my operating system. Verify its checksum and register it with my coding client.

The package contains `clearings.tar.gz` and `SHA256SUMS`. Its `build.txt` identifies the exact platform and compiler. Package checks run on Linux x86-64 and macOS; local runtime testing also covers Apple silicon. Use the artifact's actual target. Linux packages built on Ubuntu 24.04 need compatible system libraries. Windows isolation and Linux ARM release validation are not available.

The agent verifies the checksum, extracts the package, and registers the extracted directory as a local marketplace. The package carries the executable inside each plugin, so no runtime download is needed.

## Client registration

These are installation commands for the agent or a user already comfortable with the client CLI. Replace the path with the verified extracted package directory.

Codex:

```sh
codex plugin marketplace add /absolute/path/to/clearings
codex plugin add clearings@clearings
```

Claude Code:

```sh
claude plugin marketplace add /absolute/path/to/clearings
claude plugin install clearings@clearings --scope user
```

Use one Clearings marketplace registration at a time. Remove a conflicting registration before switching package sources. The package path is an installation detail; working projects need no setup.

Complete the client's normal plugin and hook trust. In Codex, `/hooks` reviews and trusts the installed hook definition. Clearings cannot approve client trust on your behalf. Start a new coding session after installation.

The extracted executable also supports `clearings install`, which registers a supported installed coding client and sets up the default learning schedule. `--no-service` keeps learning on request, and `--no-client` is available for standalone use. These are optional customizations, not setup questions.

## What installation enables

A trusted SessionStart hook registers the actual working directory, resolves its repository root, and creates a named `repo` read grant. Each MCP connection selects its own project. Worktrees and folders without Git are supported.

Installation authorizes recent local conversation reading, routine saving/reuse, and daily learning through the existing signed-in client. The first scheduled review is due after 24 hours. Existing narrower grants, exclusions, and preferences survive updates.

State is kept separately from the package:

- macOS: `~/Library/Application Support/Clearings/`
- Linux: `$XDG_DATA_HOME/clearings/`, or `~/.local/share/clearings/`

`CLEARINGS_DATA_DIR` selects an explicit private store for advanced hosting or isolated tests. Custom stores do not install the normal user schedule through plugin hooks.

## After installation

Work normally, then ask **“Make this workflow reusable”** or **“Open the Clearings workbench.”** Say **“Show Clearings status”** if a connection or schedule needs attention.

A source-installed plugin verifies and caches its pinned release on first start once that release is available. Bundled packages are the supported preview path now. Disabling or uninstalling the plugin stops its background learning checks; saved routines and evidence remain stored.

See [daily use](default-experience.md), [management](management.md), and [development](development.md). Publication requires a matching release tag and verified packages; opening or merging a normal PR does not publish a release.
