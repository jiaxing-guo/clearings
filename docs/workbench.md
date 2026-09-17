# Personal automation workbench

Ask your coding agent to **open the Clearings workbench**. It opens a private local page for the working project. The same library is available through `clearings_library`; the UI does not maintain a separate inventory.

## Try a routine

Select a routine, start from an example, and edit its input fields. **Try input** executes the active version with the project's existing grants and native isolation. It is recorded as a test, not real reuse. The result shows whether the routine completed, needs the agent, or failed. File-backed routines read current files.

Names, examples, pause state, recent calls and undo are visible together. Counts distinguish reuse, tests and older unclassified calls. They describe the current acceptance contract; changing requirements starts a new contract. Counts alone do not justify cleanup or establish savings.

## Expand its behavior

1. Enter the new input and desired result. A result can be a completed value or an explicit handoff.
2. Add the example and describe the change in ordinary language. The contract editor supports simple field types; custom schema rules remain in force.
3. Choose **Propose update**. The existing authoring connection drafts source under the current request allowance and optional spending limit.
4. Review the example results, then choose **Use update** to activate a passing proposal.

New requirements create a new immutable task. Existing examples remain intact, one new example is withheld from source authoring, and all examples must pass. A failed proposal leaves the active routine unchanged. Undo restores the previous contract and version. Shared routines retain receiving projects' pause settings across updates and undo.

Edit a shared definition from its owning project. Pausing it from another project affects that project's use only. Changing a routine never adds capabilities or changes grants through the workbench.

## Examples from file tests

A test can capture successful capability results as fixtures for a new example. Capture is bounded to 128 KiB. Failed reads and oversized captures are marked unavailable; they are not turned into empty successful fixtures. For these cases, ask the agent to construct a small representative example. Captured fixtures stay separate from the run result and are not evidence of general correctness.

## Local access

The workbench binds only to the loopback interface. Its link contains a random session token; API requests require that token, the expected host, and the same origin for changes. Pages load no external assets. The server stops after 30 minutes without connections or 12 hours of operation once requests finish. Open a fresh link if it expires or project settings change.

The page runs on the machine hosting Clearings. Remote workspaces need a browser on that host or a separately configured tunnel. The local runtime does not publish the page or expose a public endpoint.

## CLI and development

`clearings workbench` starts a workbench for the current project and returns its local link. Coding clients use `clearings_workbench` after selecting the actual project. Both return a local URL; the client can open it or present it as a link.

Browser checks use a disposable project and a local model fixture, with no account credentials or real model spending:

```sh
npx playwright install chromium
npm run test:workbench
```

`CLEARINGS_TEST_BROWSER` can select an existing Chromium-compatible browser. The tests cover inputs, file reads, examples, staged updates, undo, controls, untrusted result text, expired links, and the phone layout.
