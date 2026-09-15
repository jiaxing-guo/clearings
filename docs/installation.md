# Installation and packages

Clearings is one Rust executable containing its TypeScript transformer, JavaScript engine and SQLite support. Installed users do not need Node, Python, npm or a Rust compiler. Validated platforms are Linux x86-64 and the macOS architecture exercised by CI. Linux aarch64 remains an unvalidated target; it is not yet advertised as supported. Windows isolation is not implemented.

## Install once for all projects

Plugin onboarding starts with **v0.1.0-alpha.3**. While that release is pending, use a Packages review artifact as described below. Alpha.2 does not provide `plugin-mcp` or automatic project setup.

With a Codex version that supports plugins, install the Clearings marketplace and plugin once:

```sh
codex plugin marketplace add jiaxing-guo/clearings
codex plugin add clearings@clearings
```

For Claude Code, install at user scope so it is available in every project:

```sh
claude plugin marketplace add jiaxing-guo/clearings
claude plugin install clearings@clearings --scope user
```

In Codex, use `/hooks` to review and trust the installed Clearings SessionStart hook once, then start a new session. Codex requires this client-level trust before plugin hooks run; plugin installation cannot approve it on your behalf. Claude Code applies its own plugin/hook trust controls. This is part of installation, with no Clearings setup for each project. See [Codex hook trust](https://developers.openai.com/codex/hooks).

Start a new coding session in any project and work normally. Ask “Make recent work reusable” for an immediate review. The plugin registers its MCP server. A SessionStart hook registers the actual working directory supplied by the client. Clearings finds the repository root, creates a stable project identity and private state, and supplies a `repo` read grant. The agent then connects to that registered project; its tool arguments cannot create grants for an arbitrary directory. You do not configure IDs, policy files, storage locations or MCP entries for individual projects. Git worktrees and folders without Git are supported.

Installation authorizes Clearings to read working projects and recent local coding-client conversations, and to save and reuse routines within each project. It does not crawl all projects at installation. Each MCP connection has its own selection, and routines cannot use that read grant to escape the selected root. Existing narrowed grants and controls are preserved. The coding client's own sandbox, workspace trust and tool approval settings still apply. Installation also enables quiet daily review through the signed-in coding client. The first review is due after 24 hours, with three candidate workflows per cycle and six authoring requests per UTC day. Users can change these defaults through conversation; provider billing and client limits still apply.

On its first start, a source-installed plugin downloads its pinned native release from GitHub, verifies SHA-256, and caches it privately. Later starts work offline. Review packages include the executable and license notices inside each plugin, so they need no bootstrap download. The supported downloads are Linux x86-64 and macOS Apple silicon; no language runtime is needed. The SessionStart hook can also populate the runtime cache. If a client times out during the initial download, let the hook finish and restart the MCP connection, or install the bundled package.

Disable old manually registered Clearings MCP entries after installing the plugin, so the agent sees one Clearings integration. Existing lab databases are kept; the plugin uses its own persistent store unless you deliberately select an existing store directory with `CLEARINGS_DATA_DIR`. Uninstalling or disabling the plugin stops its background learning at the next service check and before any new authoring or promotion. Saved routines and evidence remain stored.

See [Codex plugins](https://developers.openai.com/codex/plugins) and [Claude Code plugin installation](https://code.claude.com/docs/en/plugin-marketplaces) for client support and marketplace management.

## Review builds

The Packages workflow creates platform-specific review artifacts containing `clearings.tar.gz` and `SHA256SUMS`. These are CI artifacts, not a published release. Download the artifact matching your OS and inspect its `build.txt` for the exact target and compiler. Linux packages are built on Ubuntu 24.04 and require compatible system libraries; they are not advertised as portable to older glibc systems. macOS packages target the runner's architecture and are not universal binaries or notarized releases.

Verify the archive checksum and extract it. The `clearings/` directory contains the executable, examples, SDK declarations, installable plugins and marketplace catalogs, documentation, project license and dependency licenses. For plugin review, register the extracted `clearings/` directory as a local marketplace once, then install `clearings@clearings` with the client commands above. For example:

```sh
codex plugin marketplace add /absolute/path/to/extracted/clearings
codex plugin add clearings@clearings
```

Claude Code accepts the same local marketplace directory with `claude plugin marketplace add`. Its plugin install command stays the same. Register one Clearings marketplace source at a time; remove an older marketplace registration before switching between review and release installs. The absolute package path is needed only for this review installation; working projects need no setup. Client caches receive a self-contained plugin, and its state stays outside the package.

For standalone use, run the extracted package’s `clearings install`. It registers the plugin with an installed coding client and installs the user schedule. Ordinary CLI commands select private storage and the current project automatically. Advanced hosts may still supply an explicit store or project.

```sh
tar -xzf clearings.tar.gz
./clearings/clearings --version
./clearings/clearings sdk
```

Use `sha256sum -c SHA256SUMS` on systems that provide it, or `shasum -a 256 -c SHA256SUMS` on macOS. Packaging uses a fresh staging directory and copies only tracked, regular files from its source allowlist. Ignored and untracked files are excluded; source symlinks are rejected. Tracked working-file edits are included. Packaging collects license material from resolved dependencies, including bundled native sources. When a published workspace crate omits its root license, the build retrieves it from the exact upstream commit recorded in that crate. Two pinned SIMD crate publications declare MIT but supply no standalone license notice. Their complete published source and original declarations are included alongside the standard MIT terms; no copyright holder or year is invented. `dependencies.json` distinguishes this case from original license files and records the URLs and hashes of retrieved license files.

## Build from source

Development needs the pinned Rust toolchain and a C compiler for bundled native components:

```sh
rustup show
cargo build --release --locked --workspace
```

The Node-based documentation toolchain is separate from the installed runtime. See [Development](development.md) for repository checks, [Workflows](workflows.md) for the three example routines, and [Agent integration](agents.md) to connect Codex or Claude Code.

## Daily operation

The trusted startup hook installs the default schedule automatically. There is no service file to edit. Say “pause learning,” “learn weekly,” “show what you learned,” or “undo the last automatic change” in the coding client. The bundled management skill performs the change and reads back its result. Saved routines remain usable while learning is paused.

The default is daily review of recently updated local conversations across projects, using a seven-day initial lookback. Missing sign-in, unsupported history interfaces, service failures, and exhausted request allowance remain visible in status. They do not trigger another provider. macOS and Linux user-session services check hourly and coalesce missed intervals. Existing preferences survive installation updates.

Advanced standalone options are `install --no-client` for CLI-only integration and `install --no-service` for on-request operation. This preference survives subsequent startup and installation. Ask the management skill to enable the service again; the next trusted session installs it. An explicit data directory isolates records; plugin hooks with custom data directories skip service installation. The older configured project worker remains available through `background`; see [background execution](background.md).

PR and main-branch checks do not publish releases or modify an actual user’s client configuration. Pushing a matching release tag publishes the verified native archives and checksums. See [management](management.md) for controls and [development](development.md) for checks.
