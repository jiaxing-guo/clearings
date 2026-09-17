# Third-party notices

Clearings source is licensed under Apache License 2.0, except material carrying a separate notice. Dependency licenses and notices apply to their respective material.

## Native packages

Packages include license texts collected from locked Rust dependencies and bundled native sources, plus a `dependencies.json` inventory. Dependencies include Oxc, rquickjs/QuickJS, rusqlite/SQLite, JSON Schema validation, cap-std, reqwest and rustls.

The inventory identifies original license files, files recovered from pinned upstream commits, and explicitly recorded license declarations distributed with their complete source and standard terms. Consult those included materials for redistribution terms.

## Documentation and development tools

The documentation site uses Next.js, React, Fumadocs and Tailwind CSS. Development checks use tools including TypeScript, Prettier, ESLint, Ruff and Playwright. Installed npm and Python dependencies retain their own licenses. These toolchains are separate from the native runtime distributed to users.

The workbench UI is authored in this repository and embedded in the native executable. Its browser tests use Playwright as a development dependency.

The documentation site bundles Geist and Geist Mono, distributed under the SIL Open Font License 1.1. The complete notice is in [website/fonts/OFL.txt](website/fonts/OFL.txt).
