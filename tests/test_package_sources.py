import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from package_sources import copy_sources


class PackageSources(unittest.TestCase):
    def test_only_tracked_sources_are_copied(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'repo'
            package = Path(tmp) / 'package'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'docs').mkdir()
            (root / '.gitignore').write_text('.env\n')
            (root / 'docs/guide.md').write_text('original')
            (root / 'docs/.env').write_text('TEST_TOKEN=must-not-package')
            (root / 'docs/private.txt').write_text('untracked')
            subprocess.run(['git', 'add', 'docs/guide.md'], cwd=root, check=True)
            (root / 'docs/guide.md').write_text('current tracked edit')
            copy_sources(root, package)
            self.assertEqual((package / 'docs/guide.md').read_text(), 'current tracked edit')
            self.assertEqual([p.relative_to(package).as_posix() for p in package.rglob('*') if p.is_file()], ['docs/guide.md'])

    def test_source_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'repo'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'docs').mkdir()
            (root / 'docs/guide.md').write_text('tracked')
            subprocess.run(['git', 'add', 'docs/guide.md'], cwd=root, check=True)
            (root / 'docs/guide.md').unlink()
            (root / '.env').write_text('TEST_TOKEN=must-not-package')
            (root / 'docs/guide.md').symlink_to('../.env')
            with self.assertRaisesRegex(RuntimeError, 'symlinks'):
                copy_sources(root, Path(tmp) / 'package')
            (root / 'docs/guide.md').unlink()
            (root / 'docs').rmdir()
            (root / 'private').mkdir()
            (root / 'private/guide.md').write_text('untracked through parent link')
            (root / 'docs').symlink_to('private', target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, 'symlinks'):
                copy_sources(root, Path(tmp) / 'package')


if __name__ == '__main__':
    unittest.main()
