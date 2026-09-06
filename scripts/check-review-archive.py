"""Verify archive membership and bytes against the generated directory manifest."""
import hashlib
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile


def check_archive(directory, filename):
    root = Path(directory).resolve()
    expected = {'SHA256SUMS': (root / 'SHA256SUMS').read_bytes()}
    for line in expected['SHA256SUMS'].decode('utf-8').splitlines():
        digest, name = line.split('  ', 1)
        path = PurePosixPath(name)
        if (not name or path.is_absolute() or path.as_posix() != name
                or '\\' in name or '..' in path.parts or name in expected):
            raise ValueError('Invalid or repeated manifest path: ' + name)
        source = root / name
        if not source.is_file() or source.is_symlink() or not source.resolve().is_relative_to(root):
            raise ValueError('Expected a regular file inside the review directory: ' + name)
        content = source.read_bytes()
        if hashlib.sha256(content).hexdigest() != digest:
            raise ValueError('Directory content differs from its manifest: ' + name)
        expected[name] = content
    archive_path = root / filename
    if archive_path.is_symlink() or not archive_path.is_file():
        raise ValueError('Expected a regular review archive.')
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or set(names) != set(expected):
            raise ValueError('Archive entries differ from the reviewed directory.')
        for entry in entries:
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if entry.is_dir() or kind not in (0, stat.S_IFREG) or entry.flag_bits & 1:
                raise ValueError('Archive entries must be unencrypted regular files.')
            content = expected[entry.filename]
            if entry.file_size != len(content) or archive.read(entry) != content:
                raise ValueError('Archive content differs from the reviewed directory: ' + entry.filename)
    return len(expected)


if __name__ == '__main__':
    directory = sys.argv[1]
    filename = sys.argv[2] if len(sys.argv) > 2 else 'clearings-shared-review.zip'
    print(f'Archive verified: {check_archive(directory, filename)} files in {filename}')
