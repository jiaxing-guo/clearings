# Projects and grants

Clearings registers a working project from trusted client startup context. It finds the enclosing repository or worktree, or uses the selected folder when there is no Git marker. Home directories and filesystem roots are not accepted as implicit projects.

## Identity and selection

Project identity comes from the canonical directory. A display-name change keeps the identity. A directory move creates a different identity. Each MCP connection selects its own project, so concurrent conversations do not change one another's selection.

`clearings_open_project` selects an already registered path and returns effective settings and grants. It cannot register an arbitrary directory. Direct routine calls can select a registered project by `path`; the host checks that selection before execution.

The agent handles these details. Users do not need project IDs or per-project configuration files.

## File grants

The normal plugin setup provides a `repo` read grant for the working root. A routine also needs the corresponding declared capability. Neither its source nor its manifest can widen the grant.

Existing narrowed grants and exclusions are preserved. If a policy changes, a connection must refresh it before operational calls. Runtime access stays within the effective receiving-project policy.

## Shared definitions

A routine can be shared across the user's projects. Sharing transfers its accepted code and requirements, not the source project's credentials or file permissions. Input assumptions and applicability must be explicit.

The source owner controls the definition. A receiving project can pause its own use without affecting other projects. The workbench preserves those pause settings when requirements change or are undone.

## Advanced hosting

The CLI supports an explicit private SQLite store and host-configured project settings. Settings can declare named file roots, HTTP bindings, activity sources, a model connection, spending limits, retention, and automatic-work options. Configuration changes require the expected current revision.

```sh
clearings --store /private/state.db project-configure --root /work/project --name "My project" --settings /private/settings.json
```

This is an operator interface. MCP tools cannot add grants, choose arbitrary model endpoints, or increase a configured spending ceiling. Credentials stay in the host environment and are referenced by name.

Project operations require the selected project. Standalone unscoped tasks are separate from the project library. See [agent integration](agents.md) for the manual transport and [management](management.md) for everyday controls.
