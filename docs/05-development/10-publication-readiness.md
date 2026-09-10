# Publication readiness

Clearings is public. The pre-publication exposure review and local validation completed on 9 September 2026 at main revision `b6a9f15260f51964c8d9691e7f749c1cf76f8e3a`, after [PR #31](https://github.com/jiaxing-guo/clearings/pull/31). An anonymous clone subsequently retrieved that exact revision. Repository visibility, package publication, and documentation hosting remain separate actions; the packages remain non-publishable and no site was deployed.

## Review scope

The initial historical review used main at `7d9142a9b4618a2baa84dffa58754be1826c3778`, after the evaluator closeout. The final review added the complete merged publication tree and metadata, refreshed discussion and Actions inventories, and repeated the secret scan.

| Surface                       | Final pre-publication scope                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Merged source tree            | All 641 tracked files and the root tree checked against Git object hashes                                                             |
| Prior Git history             | 92 commits through main, four branch heads, and 28 recorded PR heads; 64 distinct root trees                                          |
| Historical file content       | All 1,439 distinct blob versions, including deleted and superseded files                                                              |
| Embedded archives             | All 20 distinct ZIP and compressed tar versions, inspected recursively without executing archived code                                |
| Publication change            | Complete merged tree and metadata for both publication commits; PR head and merge trees agree                                         |
| Discussion inventory          | 29 PR records, 104 submitted reviews, 45 conversation comments, and 126 inline comments                                               |
| Actions inventory             | 174 retained runs and 176 jobs, including earlier reruns; all 78 available job logs retrieved; 98 jobs failed without executing steps |
| Artifacts, releases, and tags | No retained artifacts in the reviewed inventory; no releases or tags                                                                  |
| Other surfaces                | Pages and Discussions disabled; signed-in inspection confirmed the empty wiki welcome screen                                          |

History is part of the publication surface. Removing a file from main does not remove its earlier contents. This review does not claim to enumerate unknown unreachable server objects or deleted GitHub material that the API no longer returns.

## Source and archive findings

Gitleaks 8.30.1, using its default rules with full redaction and inline allow comments disabled, reported **zero findings** in the historical content corpus. The release binary's SHA-256 was checked against the official release checksum. Blob contents were recovered through the authenticated repository API and checked against their Git object IDs. Archives were read in memory, with size and recursion limits; none failed extraction. The historical corpus contained 1,445 distinct contents including archive members. The final combined scan covered 6,945 distinct contents, approximately 39.5 MB before scanner filtering, including merged files, metadata, and logs, and again reported zero findings. Metadata was scanned as both JSON and decoded string values. Scanning individual contents avoids excluding a historical file merely because its original path is now ignored.

Supplemental checks found no private-key files, environment files, committed dependency/build directories, private-network addresses, or personal home-directory paths in the inspected source and archive corpus. These checks and the secret scanner are evidence of a bounded review, not a guarantee that every possible secret format would be detected.

The repository intentionally retains original prompts, agent activity traces, patches, source excerpts, test output, and evaluation results. Public access also exposes commit authorship, including author and committer email fields, technical discussions, historical repository names, tool versions, and development-directory references. These are provenance records and should be treated as an intentional part of source publication.

## Retained evidence and cleanup

The baseline `benchmarks/` directory accounts for 285 files and 11,046,245 bytes, about 80% of tracked content. Its large archives contain frozen evaluation inputs and review packages. Their manifests, byte bindings, and reproduction procedures make them evidence rather than disposable build products. Deleting them would weaken the project's recorded claims.

No tracked build output, dependency installation, credential file, or unrelated temporary file was identified for deletion. Local dependencies, native caches, and generated documentation are already ignored. Use [repository maintenance](05-repository-maintenance.md) to remove generated local output; do not regenerate frozen evidence as cleanup.

The merged preparation change removes obsolete private-access wording from maintained onboarding pages, corrects the formatting-exclusion description, shortens the README, and updates the experiment index. Historical reports retain their original wording and source bytes, including earlier private-access instructions and review-time status.

## License and attribution

Clearings source is covered by the root [Apache License 2.0](../../LICENSE), using the standard text from the [Apache Software Foundation](https://www.apache.org/licenses/LICENSE-2.0.txt). Root npm metadata, documentation package metadata, and the Rust crate declare `Apache-2.0`. The npm packages remain `private: true` and the crate remains `publish = false`; public repository access does not authorize registry publication.

Bundled Hono excerpts remain MIT-licensed. [Third-party notices](../../THIRD_PARTY_NOTICES.md) retain the upstream notice and explain the scope. Existing license files inside benchmark directories and archives are preserved. Installed npm dependencies retain their own licenses. The npm package file list includes the third-party notices alongside the automatically included root license.

## GitHub Actions and other publication surfaces

The four current workflows use standard `ubuntu-24.04` GitHub-hosted runners, commit-pinned actions, `contents: read`, and checkout with persisted credentials disabled. They contain no package publishing, deployment, self-hosted runners, or `pull_request_target` execution.

The retained logs and discussion metadata were included in the final redacted Gitleaks scan, completing the automated check that was pending in the preparation PR. The inventory above describes the pre-publication snapshot; the successful reruns below are later validation evidence.

The wiki feature is enabled. After authentication, browser inspection on 9 September 2026 showed the empty-wiki welcome screen and **Create the first page**. This resolved the final exposure check. A logged-out 404 was not treated as evidence of emptiness.

GitHub documents free standard hosted-runner usage for public repositories. This does not mean all runner classes and storage are free, or that a visibility change fixes every workflow-start failure. See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [visibility consequences](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility). Past Actions logs and artifacts can become public too.

## Completed validation

The unchanged merged revision passed clean root and website dependency installations with lifecycle scripts disabled, formatting, root type checking, and all 286 root tests. README inspection, reference execution, Rust source export, native execution, and conformance examples passed. The conformance example accepted all 36 scoped cases while retaining its broader unknown contract status.

The documentation production build and website type checking passed. Static validation checked 65 HTML pages, 38 technical-reference pages, 5,840 links, and six search queries. Markdown validation checked 61 documents, 507 local links, and 12 executable examples. The development server returned HTTP 200 for home, quickstart, and the corrected `/docs/technical/guides/run-programs` route. The package-content preview contained 280 entries, including the root license, third-party notices, CLI assets, and Rust runtime. Historical source bindings and frozen review archives remained unchanged.

These counts apply to the audited revision, not to future documentation or test inventories. Local tests do not by themselves establish hosted CI success.

## Public baseline and hosted CI

Live repository metadata reports public visibility and Apache-2.0. An anonymous clone, with Git credential helpers disabled, succeeded at the audited main revision. All four previously failed main workflows were rerun at that revision after publication. Their second attempts are recorded here:

| Workflow            | Rerun                                                                                     | Result |
| ------------------- | ----------------------------------------------------------------------------------------- | ------ |
| Formatting          | [Attempt 2](https://github.com/jiaxing-guo/clearings/actions/runs/34327906346/attempts/2) | Passed |
| Program IR          | [Attempt 2](https://github.com/jiaxing-guo/clearings/actions/runs/34327906259/attempts/2) | Passed |
| Rust backend        | [Attempt 2](https://github.com/jiaxing-guo/clearings/actions/runs/34327906318/attempts/2) | Passed |
| Context conformance | [Attempt 2](https://github.com/jiaxing-guo/clearings/actions/runs/34327906392/attempts/2) | Passed |

The jobs now execute on hosted runners; the earlier workflow-start blocker no longer prevents this validation. The main branch is unprotected and the ruleset inventory is empty, as before publication. No review protections were changed during these checks. Required review and status-check protection remains an explicit repository-policy decision.

The subsequent implementation adds [compiled context selection](../02-semantics/07-context-selection.md) with independent evaluation and explicit resource compatibility. Package publication, public documentation hosting, and a supported-version or vulnerability-response commitment remain separate decisions. Verify a reporting route before advertising one.

## Repeat the review

Use a separate audit checkout. Fetch every current branch and PR head, enumerate their complete parent graphs and trees, and check file versions absent from main. Include archive members, commit messages, PR and review bodies, and all retained Actions attempts and artifacts. Check pagination and report inaccessible or expired material explicitly. Never execute archived scripts to inspect an archive.

Run a pinned secret scanner with redacted output, supplement it with path and publication-content review, and inspect findings privately. Keep downloaded logs, scanner reports, and temporary extraction files outside the repository. If a real credential is found, arrange revocation before publication; deleting the current file is insufficient.

For the preparation change, verify the README commands, Markdown navigation, documentation export, package license contents, formatting, and unchanged frozen evidence. These checks do not substitute for a runtime release qualification.
