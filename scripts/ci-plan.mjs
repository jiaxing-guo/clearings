import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classifyChanges(files, full = false) {
  const plan = { runtime: full, workbench: full, packages: full };
  for (const file of files) {
    if (
      /^(crates\/|plugins\/|integrations\/|sdk\/|examples\/|\.agents\/plugins\/|\.claude-plugin\/|\.cargo\/|Cargo\.(toml|lock)$|rust-toolchain)/.test(
        file,
      )
    ) {
      plan.runtime = plan.workbench = plan.packages = true;
    } else if (
      /^scripts\/(package|package_sources|release-asset|verify-package)\.py$|^scripts\/license-texts\//.test(
        file,
      ) ||
      /^(LICENSE|THIRD_PARTY_NOTICES\.md)$/.test(file)
    ) {
      plan.packages = true;
    } else if (/^tests\/workbench-browser\.mjs$/.test(file)) {
      plan.runtime = plan.workbench = true;
    } else if (/^tests\/test_(package|plugin)/.test(file)) {
      plan.packages = true;
    } else if (
      /^(website\/|docs\/|README\.md$|CONTRIBUTING\.md$|AGENTS\.md$|\.gitignore$|\.prettierignore$|\.prettierrc\.json$|eslint\.config\.mjs$|ruff\.toml$|requirements-dev\.txt$|\.husky\/|tests\/(?:check-hooks\.test\.mjs|website-browser\.mjs|sdk-types\.ts)$|scripts\/(?:prepare-docs|check-docs|check-site|dev-docs|checks|lint|pre-commit|setup-dev|clean)\.mjs$)/.test(
        file,
      )
    ) {
      // Documentation and development tooling are covered by quality and Website.
    } else {
      // Workflow, shared dependency, test, and unknown changes fail open to full testing.
      plan.runtime = plan.workbench = plan.packages = true;
    }
  }
  return plan;
}

export function changedFiles(base, head = 'HEAD', cwd) {
  if (!/^[0-9a-f]{40,64}$/.test(base) || /^0+$/.test(base))
    throw new Error('No usable base commit');
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head, '--'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let full = process.env.CI_FULL === 'true';
  let files = [];
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const kind = process.env.GITHUB_EVENT_NAME;
    if (!['push', 'pull_request'].includes(kind)) full = true;
    if (!full)
      files = changedFiles(kind === 'pull_request' ? event.pull_request.base.sha : event.before);
  } catch (error) {
    full = true;
    console.log(`Full validation: ${error.message}`);
  }
  const plan = classifyChanges(files, full);
  const output = Object.entries(plan)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(JSON.stringify({ full, files, plan }, null, 2));
}
