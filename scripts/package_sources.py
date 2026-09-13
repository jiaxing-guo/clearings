"""Copy the tracked, regular source files selected for a runtime package."""
import shutil
import subprocess
from pathlib import Path

PACKAGE_PATHS = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'sdk', 'examples', 'integrations', 'docs']


def copy_sources(root: Path, package: Path) -> None:
    root = root.resolve()
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--', *PACKAGE_PATHS], cwd=root)
    for encoded in paths.split(b'\0'):
        if not encoded:
            continue
        relative = Path(encoded.decode())
        source = root / relative
        # Do not follow a tracked symlink or a replaced parent directory into
        # ignored files, credentials, or files outside the working checkout.
        if any((root / partial).is_symlink() for partial in [relative, *relative.parents]):
            raise RuntimeError(f'Package source must not use symlinks: {relative}')
        if not source.is_file():
            raise RuntimeError(f'Tracked package source is not a regular file: {relative}')
        target = package / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
