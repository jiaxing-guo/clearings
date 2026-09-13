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
import tempfile
from package_sources import copy_sources
from pathlib import Path

binary = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
root = Path(__file__).resolve().parents[1]
output.mkdir(parents=True, exist_ok=True)
staging = tempfile.TemporaryDirectory(prefix='clearings-package-', dir=output)
package = Path(staging.name) / 'clearings'
package.mkdir(exist_ok=True)
licenses_only = '--licenses-only' in sys.argv[3:]
if not licenses_only:
    shutil.copy2(binary, package / 'clearings')
    copy_sources(root, package)
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--format-version=1'], cwd=root))
licenses = package / 'licenses'
licenses.mkdir(exist_ok=True)
manifest = []
missing = []
for item in metadata['packages']:
    source = Path(item['manifest_path']).parent
    if item.get('source') is None:
        continue
    name = item['name'] + '-' + item['version']
    matches = [p for p in source.rglob('*') if p.is_file() and (p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'AUTHORS')) or any(part.upper() in ('LICENSES', 'LICENCES') for part in p.relative_to(source).parts[:-1]))]
    if item.get('license_file'):
        declared = source / item['license_file']
        if declared.is_file() and declared not in matches:
            matches.append(declared)
    upstream = []
    material = 'archive'
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
        material = 'pinned-upstream'
        if not upstream:
            # These two checked publications declare MIT but contain no standalone
            # license or copyright notice, including in their recorded upstream tree.
            # Preserve their complete published source and original declaration;
            # supply standard MIT terms without inventing a copyright holder or year.
            declaration_only = name in ('escape-simd-0.1.0', 'json-escape-simd-3.1.2') and commit == '4f54347555d2f520ac38b406cf69ff66d9570a57' and item.get('license') == 'MIT'
            if declaration_only:
                target = licenses / name
                target.mkdir(parents=True, exist_ok=True)
                shutil.copytree(source, target / 'published-source', dirs_exist_ok=True)
                shutil.copy2(root / 'scripts/license-texts/MIT.txt', target / 'MIT.txt')
                (target / 'NOTICE.txt').write_text('Upstream declares SPDX MIT in Cargo.toml. No standalone license or copyright notice was supplied. The complete published source and its declaration are included; MIT.txt provides the standard license terms. Source: https://spdx.org/licenses/MIT.html\n')
                material = 'spdx-declaration-and-complete-source'
            else:
                missing.append(name)


    for file in matches:
        target = licenses / name / file.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
    manifest.append({**{k: item.get(k) for k in ['name', 'version', 'license', 'repository']}, 'upstream_license_sources': upstream, 'license_material': material})
if missing:
    raise RuntimeError('No license material found for: ' + ', '.join(missing))
(package / 'dependencies.json').write_text(json.dumps(manifest, indent=2) + '\n')
if licenses_only:
    print('Dependency license preflight passed.')
    sys.exit(0)
(package / 'build.txt').write_text(subprocess.check_output(['rustc', '-vV'], text=True))
archive = output / 'clearings.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(package, arcname='clearings')
(output / 'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  clearings.tar.gz\n')
print(archive)
