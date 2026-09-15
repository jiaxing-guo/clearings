#!/usr/bin/env python3
"""Name a verified package for the plugin's pinned release bootstrap."""
import hashlib
import re
import shutil
import sys
import tarfile
from pathlib import Path

archive, output, tag = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
if not re.fullmatch(r'v[0-9][A-Za-z0-9.-]*', tag):
    raise ValueError('Invalid release tag')
with tarfile.open(archive, 'r:gz') as package:
    for plugin in ['plugins/clearings', 'integrations/claude-code/plugins/clearings']:
        version = package.extractfile(f'clearings/{plugin}/runtime-version').read().decode().strip()
        if version != tag:
            raise ValueError(f'{plugin} runtime version {version} does not match {tag}')
    build = package.extractfile('clearings/build.txt').read().decode()
target = re.search(r'^host: (\S+)$', build, re.MULTILINE).group(1)
if target not in ['x86_64-unknown-linux-gnu', 'aarch64-apple-darwin']:
    raise ValueError(f'Unsupported release target: {target}')
output.mkdir(parents=True, exist_ok=True)
name = f'clearings-{tag}-{target}.tar.gz'
shutil.copyfile(archive, output / name)
(output / f'{name}.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + f'  {name}\n')
