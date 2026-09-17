# Install Clearings

Clearings runs through your existing Codex or Claude Code client. The packaged native executable includes its TypeScript transformer, JavaScript engine, and storage support. Installed users do not need Node, Python, npm, or a Rust compiler.

## Install the beta release

Download the matching archive and `SHA256SUMS` from [v0.1.0-beta.1](https://github.com/jiaxing-guo/clearings/releases/tag/v0.1.0-beta.1). Ask your coding agent to handle the installation:

> Install Clearings v0.1.0-beta.1 for my operating system and coding client. Verify the release checksum, extract the package, and register it with my coding client.

| Platform            | Release archive                                           |
| ------------------- | --------------------------------------------------------- |
| Apple-silicon macOS | `clearings-v0.1.0-beta.1-aarch64-apple-darwin.tar.gz`     |
| Linux x86-64        | `clearings-v0.1.0-beta.1-x86_64-unknown-linux-gnu.tar.gz` |

Each archive extracts to a `clearings` directory containing the executable, both plugins, and `build.txt` with the exact platform and compiler. Linux packages are built on Ubuntu 24.04 and require compatible system libraries. Intel macOS, Windows, and Linux ARM are not included in this release.

The agent verifies the archive against `SHA256SUMS`, extracts it, and registers the extracted directory as a local marketplace. Both plugins contain the executable, so they do not need a separate runtime download. Keep the extracted package in a permanent location while it is registered as the marketplace.

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

A source-installed plugin verifies and caches its pinned release on first start. The bundled release packages include that runtime and support offline restart after installation. Disabling or uninstalling the plugin stops its background learning checks; saved routines and evidence remain stored.

See [daily use](default-experience.md), [management](management.md), and [development](development.md). The beta supports evaluated routines on fresh inputs; acceptance examples do not establish general correctness. Client tool approval can still be required, including on first use.
