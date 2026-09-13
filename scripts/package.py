#!/usr/bin/env python3
"""Build-time packaging only; the installed executable has no Python dependency."""
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

binary = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
root = Path(__file__).resolve().parents[1]
output.mkdir(parents=True, exist_ok=True)
package = output / 'clearings'
package.mkdir()
shutil.copy2(binary, package / 'clearings')
for name in ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']:
    shutil.copy2(root / name, package / name)
for name in ['sdk', 'examples', 'integrations', 'docs']:
    shutil.copytree(root / name, package / name)
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--offline', '--format-version=1'], cwd=root))
licenses = package / 'licenses'
licenses.mkdir()
manifest = []
for item in metadata['packages']:
    source = Path(item['manifest_path']).parent
    if item.get('source') is None:
        continue
    name = item['name'] + '-' + item['version']
    matches = [p for p in source.rglob('*') if p.is_file() and p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
    if not matches:
        raise RuntimeError('No license material found for ' + name)
    for file in matches:
        target = licenses / name / file.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
    manifest.append({k: item.get(k) for k in ['name', 'version', 'license', 'repository']})
(package / 'dependencies.json').write_text(json.dumps(manifest, indent=2) + '\n')
(package / 'build.txt').write_text(subprocess.check_output(['rustc', '-vV'], text=True))
archive = output / 'clearings.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(package, arcname='clearings')
(output / 'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  clearings.tar.gz\n')
print(archive)
