"""Package a generated review directory with stable ZIP metadata."""
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1]).resolve()
if not (root / 'review.json').is_file() or not (root / 'SHA256SUMS').is_file():
    raise SystemExit('Expected a generated shared demo directory.')
output = root / 'clearings-shared-review.zip'
if output.exists():
    raise SystemExit('Package already exists; use a new generated directory.')
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_dir():
            continue
        if path == output:
            continue
        if path.is_symlink() or not path.is_file():
            raise SystemExit('Package accepts regular generated files only.')
        info = zipfile.ZipInfo(path.relative_to(root).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
print(output.name)
