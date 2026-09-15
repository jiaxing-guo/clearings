# Launch readiness

This review evaluates the default experience. The release candidate is `v0.1.0-alpha.4`; it is not a published release. The runtime and documentation checks are distinct from real coding-client acceptance.

## Decision

Public launch remains gated on live Claude Code acceptance and Linux user-service installation checks. A passing isolated runtime or fixture model does not establish that every host agent selects routines correctly, or that reuse reduces total model cost.

## Evidence

| Check                   | Evidence and limit                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native runtime          | Full Rust tests and strict Clippy cover isolation, grants, frozen acceptance, shared execution, history, quotas, recovery, and controls. Linux and macOS run in CI.                                                                                                                                   |
| Package installation    | Both cached plugins and the standalone executable pass with an empty PATH. Checks cover all three bundled skills, version pins, default controls, changed inputs, cross-project definitions, usage, unrelated lookup, and preserved grants.                                                           |
| macOS scheduling        | A real LaunchAgent registered in an isolated store, scheduled its first future review, and accepted repeat installation. It made no model requests and was unloaded after the check.                                                                                                                  |
| Conversation provenance | Real Codex history listing and reading succeeded. An independent agent used the learning skill with synthetic Claude history to create a nine-case contact routine and execute fresh input. Synthetic history is not a production-quality claim.                                                      |
| Client-backed learning  | Integration tests cover the client protocols, frozen interpretation/source separation, cache reuse, request exhaustion, missing sign-in, short conversations accumulated across scans, synchronous contention, and cancellation. These use controlled client responses.                               |
| Real Codex authoring    | A signed-in Codex client interpreted three synthetic Claude conversations, generated an email-domain counter, passed frozen acceptance, and executed unseen input correctly. This took two authoring requests; input evidence was synthetic.                                                          |
| Real Codex installation | The packaged plugin installed in a fresh client profile using existing sign-in. Both hooks were reviewed through the normal client UI. No hook-trust bypass was used.                                                                                                                                 |
| Real Codex reuse        | After the discovery fixes, ordinary requests executed contact cleanup, log grouping, and context gathering through saved routines. Cross-project reuse and pause/weekly controls passed. An unrelated request made no Clearings calls. These are bounded examples, not a general selection guarantee. |
| Claude Code             | The installed 2.1.78 CLI still reported signed out after the reported login. Its standard credential record was unavailable. Live authoring and ordinary-request acceptance remain unverified. No credentials were inspected or copied.                                                               |
| Linux user service      | Service definitions are tested; live user-session service installation still needs a Linux desktop/session check. Passing Linux runtime/package CI does not establish user-service availability.                                                                                                      |

## Findings from real use

The first isolated Codex request received hook suggestions but could not select the project through MCP. The client's filtered MCP environment omitted the custom Clearings data directory. The plugin now explicitly forwards the data and coding-client profile paths. A repeated ordinary contact request then executed the saved routine successfully.

Text matching originally counted common words and substrings. An unrelated question therefore caused unnecessary routine inspection. Matching now ignores common request words and scores whole words. The context routine was hidden because one acceptance example used a different directory grant. Discovery no longer treats example resource names as universal requirements. Execution still validates each requested resource against the receiving project’s grants.

Do not generalize timing measurements from fixture data into production savings. Client-reported token usage includes discovery, context, skill reads, inspection, and final composition. Cache hits are recorded separately. No matched direct-work baseline has established net savings.

## Final local acceptance

On September 15, 2026, Codex CLI 0.154.0 with its default model executed the three example workflow types after normal plugin installation and hook trust. User prompts did not name Clearings or a routine. Context gathering read text changed after activation; contact cleanup also ran in a newly opened second project. “Pause learning and switch the review schedule to weekly” persisted the requested preferences, and existing routines continued to execute.

The native authoring trial used three synthetic Claude transcript files with the real signed-in Codex client. It created an email-domain counter in two requests, then returned the correct counts for unseen addresses. Request usage was client-reported; this was not a live Claude authoring trial.

No Clearings tool was called for the final unrelated-question trial. Initial failures remain part of the evaluation record: custom data forwarding and discovery's example-grant filter required repairs. No trial establishes total token savings without a comparable direct-work baseline.

## Before publication

- Complete live Claude Code installation, authoring, ordinary-request reuse, and controls with working sign-in.
- Verify Linux user-service installation and disable/uninstall behavior in a real supported user session.
- Check the final PR heads and publish the verified native archives and checksums only after the release decision. Source-installed plugins cannot download an unpublished version.
- Keep source evidence and inferred acceptance examples distinct in user-facing results. Keep absent usage and untested host behavior explicit.
