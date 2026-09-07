#!/usr/bin/env bash
set -euo pipefail

# Run from the freshly extracted starter. Requires Git and GitHub CLI.
repo_owner='jiaxing-guo'
repo_name='clearings-semantic'
repo_full_name="$repo_owner/$repo_name"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"

for required_command in git gh; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing required command: $required_command" >&2
    exit 1
  fi
done

if [[ -e "$repo_root/.git" ]]; then
  echo 'This directory is already a Git checkout. Stopping without changing it.' >&2
  exit 1
fi

actual_login="$(gh api --hostname github.com user --jq .login)"
if [[ "$actual_login" != "$repo_owner" ]]; then
  echo "GitHub CLI must be authenticated as $repo_owner; current account is $actual_login." >&2
  exit 1
fi

if gh repo view "$repo_full_name" --json nameWithOwner >/dev/null 2>&1; then
  echo "$repo_full_name already exists. Stopping without changing it." >&2
  exit 1
fi

starter_files=(
  README.md
  AGENTS.md
  .gitignore
  docs/archive/2026-09-07/PROTOTYPE_PLAN.md
  docs/archive/2026-09-07/FIRST_IMPLEMENTATION_TASK.md
  benchmarks/targets/hono.json
  benchmarks/questions/hono.json
  scripts/create-private-repo.sh
)
for starter_file in "${starter_files[@]}"; do
  if [[ ! -f "$repo_root/$starter_file" ]]; then
    echo "Missing starter file: $starter_file" >&2
    exit 1
  fi
done

# Fail before initialization if a usable local Git identity is absent.
git -C "$repo_root" var GIT_AUTHOR_IDENT >/dev/null
git -C "$repo_root" init --initial-branch=main
git -C "$repo_root" add -- "${starter_files[@]}"
git -C "$repo_root" commit -m 'docs: define Clearings semantic comprehension prototype'

gh repo create "$repo_full_name" \
  --private \
  --description 'Evidence-backed semantic representations for understanding and maintaining codebases' \
  --source "$repo_root" \
  --remote origin

actual_visibility="$(gh repo view "$repo_full_name" --json visibility --jq .visibility)"
if [[ "$actual_visibility" != 'PRIVATE' ]]; then
  echo 'Private visibility was not confirmed. No local content has been pushed.' >&2
  exit 1
fi

git -C "$repo_root" push --set-upstream origin main
gh repo view "$repo_full_name" --json nameWithOwner,visibility,url
