"""Capture the pre-run source and tests, then create the coding workspace."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import io
from datetime import datetime, timezone

repo = Path(__file__).resolve().parents[4]
run = repo / 'benchmarks/agent-runs/luna-impact-001'
workspace = repo.parent / 'luna-impact-001-workspace'
if workspace.exists() or (run / 'freeze.json').exists():
    raise SystemExit('A frozen run must not be overwritten.')
sha = lambda data: hashlib.sha256(data).hexdigest()

def selected_files(roots):
    files = []
    for name in roots:
        path = repo / name
        if path.is_dir():
            files.extend(p for p in path.rglob('*') if p.is_file() and not p.is_symlink() and not p.is_relative_to(run) and 'local' not in p.relative_to(repo).parts)
        else:
            files.append(path)
    return sorted(set(files))

source_files = selected_files(['src', 'schemas', 'docs', 'AGENTS.md', 'package.json', 'package-lock.json', 'tsconfig.json'])
integration_files = selected_files(['tests', 'benchmarks', 'specifications'])

def archive(name, files):
    # Gzip time is fixed too; the files inside retain no working-tree mtimes.
    import gzip
    with (run / 'frozen' / name).open('xb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tar:
                for path in files:
                    data = path.read_bytes()
                    info = tarfile.TarInfo(path.relative_to(repo).as_posix())
                    info.size = len(data); info.mode = 0o644; info.mtime = 0
                    tar.addfile(info, io.BytesIO(data))

archive('source-baseline.tar.gz', source_files)
archive('integration-inputs.tar.gz', integration_files)
workspace.mkdir()
for path in source_files:
    target = workspace / path.relative_to(repo); target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, target)
(workspace / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
(workspace / 'tests').mkdir()
(workspace / 'input').mkdir()
for name in ['API.md', 'TASK.md', 'specification.json', 'context.json']:
    shutil.copyfile(run / 'frozen' / name, workspace / 'input' / name)
shutil.copyfile(run / 'frozen/record.mjs', workspace / 'record.mjs')
prompt = f'''You are the coding agent for frozen experiment luna-impact-001. Work only in {workspace}.
You have no prior project conversation. Do not inspect the parent repository, benchmark/evaluation assets, or other workspaces. This task has a separate evaluator. Do not spawn agents, install dependencies, commit, push, or use the network.
Read input/context.json first, then input/API.md, input/TASK.md, and AGENTS.md. Follow applicable repository instructions using the provided docs. Implement analyzeImpact as specified and add its public export. The frozen spec contains both executable and opaque requirements; opaque means not checked by the current expression kernel, not optional behavior.
Use the recorder for every read/list/command: node record.mjs read <paths>; node record.mjs files [dir]; node record.mjs run <npm|node|rg> <args>; node record.mjs note <purpose and paths>. All commands must set this workspace as workdir. Use apply_patch for edits after a recorder note. Change only src/specification/impact.ts, the related exports in src/index.ts, and your own tests/ files.
Run your own build/typecheck/tests. Withheld tests are unavailable and you will receive no feedback from them in this attempt. Submit a final report with files used, the role of the IR in your decisions, commands run, ambiguities, and remaining uncertainty. Stop after submission so the evaluator can capture unchanged code.
'''
(run / 'frozen/agent-prompt.txt').write_text(prompt)
source_hashes = {p.relative_to(repo).as_posix(): {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in source_files}
(run / 'frozen/source-files.json').write_text(json.dumps(source_hashes, indent=2) + '\n')
environment = {'node': subprocess.check_output(['node','--version'],text=True).strip(), 'npm': subprocess.check_output(['npm','--version'],text=True,stderr=subprocess.DEVNULL).strip(), 'baseline_git_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(), 'baseline_is_uncommitted_worktree': True, 'dependencies': 'Existing installed node_modules, shared by symlink; frozen package lock.', 'workspace_boundary': 'Protocol only; shared container, not OS-enforced isolation.'}
(run / 'frozen/environment.json').write_text(json.dumps(environment, indent=2) + '\n')
frozen_files = sorted(p for dirname in ['frozen','evaluation'] for p in (run / dirname).rglob('*') if p.is_file())
manifest = {'run_id':'luna-impact-001','frozen_at':datetime.now(timezone.utc).isoformat(),'requested_model':'gpt-5.6-luna','fork_turns':'none','native_token_usage':'unavailable','coding_started':False,'files':{p.relative_to(run).as_posix():{'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in frozen_files}}
(run / 'freeze.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'workspace':str(workspace),'frozen_files':len(frozen_files),'source_files':len(source_files),'freeze_sha256':sha((run/'freeze.json').read_bytes()),'prompt':prompt}))
