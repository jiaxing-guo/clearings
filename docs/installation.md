# Installation and packages

Clearings is one Rust executable containing its TypeScript transformer, JavaScript engine and SQLite support. Installed users do not need Node, Python, npm or a Rust compiler. Validated platforms are Linux x86-64 and the macOS architecture exercised by CI. Linux aarch64 remains an unvalidated target; it is not yet advertised as supported. Windows isolation is not implemented.

## Review builds

The Packages workflow creates platform-specific review artifacts containing `clearings.tar.gz` and `SHA256SUMS`. These are CI artifacts, not a published release. Download the artifact matching your OS and inspect its `build.txt` for the exact target and compiler. Linux packages are built on Ubuntu 24.04 and require compatible system libraries; they are not advertised as portable to older glibc systems. macOS packages target the runner's architecture and are not universal binaries or notarized releases.

Verify the archive checksum and extract it. The `clearings/` directory contains the executable, examples, SDK declarations, skill integrations, documentation, project license and dependency licenses. Put the executable in a location on your `PATH`, or use its absolute path. Keep your state database and policy in a private directory outside the disposable package directory.

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
