# Publication readiness

This review prepares Clearings for public source development. Repository visibility, package publication, and documentation hosting are separate actions. The preparation change does not perform them. **The final validation and exposure checks listed below remain open.**

## Review scope

The baseline is main at `7d9142a9b4618a2baa84dffa58754be1826c3778`, after the evaluator closeout.

| Surface                 | Scope                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current source tree     | 638 tracked files, 13,785,153 bytes before this change                                                                                                   |
| Git history             | 92 commits reachable through main, the four current branch heads, and all 28 recorded PR heads; 64 distinct root trees, with no truncated tree responses |
| Historical file content | All 1,439 distinct blob versions in those trees, including deleted and superseded files                                                                  |
| Embedded archives       | All 20 distinct ZIP and compressed tar versions identified in those blobs; members read recursively without executing archived code                      |
| Discussion inventory    | 28 PR records, 43 conversation comments, 126 inline review comments, and 103 submitted review summaries retrieved; final automated metadata scan pending |
| Actions inventory       | 165 retained workflow runs, 167 jobs including reruns, 78 job logs retrieved, and no retained artifacts                                                  |
| Releases and tags       | None at the review snapshot                                                                                                                              |

History is part of the publication surface. Removing a file from main does not remove its earlier contents. This review does not claim to enumerate unknown unreachable server objects or deleted GitHub material that the API no longer returns.

## Source and archive findings

Gitleaks 8.30.1, using its default rules with full redaction and inline allow comments disabled, reported **zero findings** in the historical content corpus. The release binary's SHA-256 was checked against the official release checksum. Blob contents were recovered through the authenticated repository API and checked against their Git object IDs. Archives were read in memory, with size and recursion limits; none failed extraction. Deduplication produced 1,445 distinct contents including archive members. Scanning individual contents avoids excluding a historical file merely because its original path is now ignored.

Supplemental checks found no private-key files, environment files, committed dependency/build directories, private-network addresses, or personal home-directory paths in the inspected source and archive corpus. These checks and the secret scanner are evidence of a bounded review, not a guarantee that every possible secret format would be detected.

The repository intentionally retains original prompts, agent activity traces, patches, source excerpts, test output, and evaluation results. Public access also exposes commit authorship, including author and committer email fields, technical discussions, historical repository names, tool versions, and development-directory references. These are provenance records and should be treated as an intentional part of source publication.

## Retained evidence and cleanup

The baseline `benchmarks/` directory accounts for 285 files and 11,046,245 bytes, about 80% of tracked content. Its large archives contain frozen evaluation inputs and review packages. Their manifests, byte bindings, and reproduction procedures make them evidence rather than disposable build products. Deleting them would weaken the project's recorded claims.

No tracked build output, dependency installation, credential file, or unrelated temporary file was identified for deletion. Local dependencies, native caches, and generated documentation are already ignored. Use [repository maintenance](05-repository-maintenance.md) to remove generated local output; do not regenerate frozen evidence as cleanup.

The preparation change instead removes obsolete private-access wording from maintained onboarding pages, corrects the formatting-exclusion description, shortens the README, and updates the experiment index. Historical reports retain their original wording and source bytes, including earlier private-access instructions and review-time status.

## License and attribution

Clearings source is covered by the root [Apache License 2.0](../../LICENSE), using the standard text from the [Apache Software Foundation](https://www.apache.org/licenses/LICENSE-2.0.txt). Root npm metadata, documentation package metadata, and the Rust crate declare `Apache-2.0`. The npm packages remain `private: true` and the crate remains `publish = false`; public repository access does not authorize registry publication.

Bundled Hono excerpts remain MIT-licensed. [Third-party notices](../../THIRD_PARTY_NOTICES.md) retain the upstream notice and explain the scope. Existing license files inside benchmark directories and archives are preserved. Installed npm dependencies retain their own licenses. The npm package file list includes the third-party notices alongside the automatically included root license.

## GitHub Actions and other publication surfaces

The four current workflows use standard `ubuntu-24.04` GitHub-hosted runners, commit-pinned actions, `contents: read`, and checkout with persisted credentials disabled. They contain no package publishing, deployment, self-hosted runners, or `pull_request_target` execution.

The Actions inventory includes both attempts of the two rerun workflows. Each run has at most two jobs, below the API page size. Of the 167 jobs, 89 failed without executing steps and 78 completed successfully. The 78 logs were retrieved and checked for explicit private-key, GitHub-token, AWS-key, Slack-token, model-key, and credential-bearing-URL patterns; there were no matches. **This supplemental check does not replace the pending Gitleaks scan of logs and discussion metadata.** No retained artifacts were returned for any of the 165 runs.

Repository metadata reports that Discussions and Pages are disabled and the wiki feature is enabled. The available repository API could not inspect wiki contents. An enabled feature flag does not establish that pages exist; inspect the wiki separately before changing visibility. This is an unresolved exposure check.

GitHub documents free standard hosted-runner usage for public repositories. This does not mean all runner classes and storage are free, or that a visibility change fixes every workflow-start failure. See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [visibility consequences](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility). Past Actions logs and artifacts can become public too.

## Validation and remaining work

Before the local execution environment disconnected, the preparation working tree passed Prettier, the Markdown check (61 files, 507 local links, and 12 executable examples), the documentation production build, and website type checking. The build also verified both review archives, historical source bindings, and context reproduction.

The exported-site link check identified an incorrect guide route in the onboarding edit. The route is corrected here to `/docs/technical/guides/run-programs`, consistent with the generator's removal of numeric filename prefixes. The final site check, formatting check, README command verification, and package-content check could not be rerun after the environment became unavailable. The preparation PR remains a draft until those checks and the remaining automated exposure scan complete.

Before publication:

1. Finish the log and discussion-metadata secret scan, inspect wiki contents, and complete validation on the final PR commit.
2. Review and merge the preparation change, then repeat the exposure check for intervening commits, comments, and Actions output.
3. Confirm that publishing the recorded authorship, technical discussions, and frozen agent/evaluation evidence is intended. Do not rewrite evidence or history merely to make it appear cleaner.
4. Check repository and organization Actions policies and the latest failure annotation. Enable and verify a private vulnerability-reporting route before advertising one; the repository currently makes no supported-version or response-time commitment.
5. Change visibility as a separate owner-authorized action. Verify a fresh checkout and a standard-runner workflow afterward, and confirm the expected review protections remain in effect.

## Repeat the review

Use a separate audit checkout. Fetch every current branch and PR head, enumerate their complete parent graphs and trees, and check file versions absent from main. Include archive members, commit messages, PR and review bodies, and all retained Actions attempts and artifacts. Check pagination and report inaccessible or expired material explicitly. Never execute archived scripts to inspect an archive.

Run a pinned secret scanner with redacted output, supplement it with path and publication-content review, and inspect findings privately. Keep downloaded logs, scanner reports, and temporary extraction files outside the repository. If a real credential is found, arrange revocation before publication; deleting the current file is insufficient.

For the preparation change, verify the README commands, Markdown navigation, documentation export, package license contents, formatting, and unchanged frozen evidence. These checks do not substitute for a runtime release qualification.
