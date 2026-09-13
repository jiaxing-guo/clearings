#!/usr/bin/env python3
"""Build-time packaging only; the installed executable has no Python dependency."""
import hashlib
import json
import re
import urllib.error
import urllib.request
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
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--format-version=1'], cwd=root))
licenses = package / 'licenses'
licenses.mkdir()
manifest = []
missing = []
for item in metadata['packages']:
    source = Path(item['manifest_path']).parent
    if item.get('source') is None:
        continue
    name = item['name'] + '-' + item['version']
    matches = [p for p in source.rglob('*') if p.is_file() and p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
    if item.get('license_file'):
        declared = source / item['license_file']
        if declared.is_file() and declared not in matches:
            matches.append(declared)
    upstream = []
    if not matches:
        # Some workspace crates omit their root license when published. Recover only
        # from the exact source commit recorded in the checksummed crate archive.
        vcs_file = source / '.cargo_vcs_info.json'
        vcs = json.loads(vcs_file.read_text()) if vcs_file.is_file() else {}
        commit = vcs.get('git', {}).get('sha1', '')
        repository = (item.get('repository') or '').removesuffix('.git').rstrip('/')
        match = re.fullmatch(r'https://github.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)', repository)
        if match and re.fullmatch(r'[a-f0-9]{40}', commit):
            for filename in ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'NOTICE']:
                url = f'https://raw.githubusercontent.com/{match.group(1)}/{commit}/{filename}'
                try:
                    with urllib.request.urlopen(url, timeout=15) as response:
                        body = response.read(1024 * 1024 + 1)
                except urllib.error.HTTPError as error:
                    if error.code == 404:
                        continue
                    raise
                if len(body) > 1024 * 1024:
                    raise RuntimeError('Oversized upstream license: ' + url)
                target = licenses / name / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
                upstream.append({'url': url, 'sha256': hashlib.sha256(body).hexdigest()})
        if not upstream:
            missing.append(name)

    for file in matches:
        target = licenses / name / file.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
    manifest.append({**{k: item.get(k) for k in ['name', 'version', 'license', 'repository']}, 'upstream_license_sources': upstream})
if missing:
    raise RuntimeError('No license material found for: ' + ', '.join(missing))
(package / 'dependencies.json').write_text(json.dumps(manifest, indent=2) + '\n')
(package / 'build.txt').write_text(subprocess.check_output(['rustc', '-vV'], text=True))
archive = output / 'clearings.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(package, arcname='clearings')
(output / 'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  clearings.tar.gz\n')
print(archive)
