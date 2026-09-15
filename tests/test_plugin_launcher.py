import hashlib
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGINS = [ROOT / 'plugins/clearings', ROOT / 'integrations/claude-code/plugins/clearings']


class PluginLauncher(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.plugin = self.root / 'plugin with spaces'
        shutil.copytree(PLUGINS[0], self.plugin)
        self.home = self.root / 'home'
        self.home.mkdir()
        fake_bin = self.root / 'tools'
        fake_bin.mkdir()
        self.curl = fake_bin / 'curl'
        self.curl.write_text('''#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  case "$1" in
    https://*) url=$1 ;;
    -o) shift; destination=$1 ;;
  esac
  shift
done
/bin/cp "$FIXTURE_RELEASE/${url##*/}" "$destination"
''')
        self.curl.chmod(0o755)
        self.release = self.root / 'release'
        self.release.mkdir()
        self.environment = {**os.environ, 'HOME': str(self.home), 'XDG_CACHE_HOME': str(self.home / 'cache'),
                            'PATH': str(fake_bin) + os.pathsep + os.environ['PATH'], 'FIXTURE_RELEASE': str(self.release)}
        version = (self.plugin / 'runtime-version').read_text().strip()
        target = 'aarch64-apple-darwin' if platform.system() == 'Darwin' else 'x86_64-unknown-linux-gnu'
        self.asset = self.release / f'clearings-{version}-{target}.tar.gz'
        source = self.root / 'source'
        source.mkdir()
        binary = source / 'clearings'
        binary.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
        binary.chmod(0o755)
        (source / 'LICENSE').write_text('fixture notice')
        with tarfile.open(self.asset, 'w:gz') as archive:
            archive.add(source, arcname='clearings')
        (self.release / 'SHA256SUMS').write_text(hashlib.sha256(self.asset.read_bytes()).hexdigest() + f'  {self.asset.name}\n')

    def run_launcher(self):
        return subprocess.run(['/bin/sh', str(self.plugin / 'scripts/start.sh'), '--data-dir', '/path with spaces'],
                              env=self.environment, cwd=self.root, text=True, capture_output=True, timeout=15)

    def test_verified_download_then_offline_reconnect(self):
        first = self.run_launcher()
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(first.stdout, 'plugin-mcp\n--all-projects\n--data-dir\n/path with spaces\n')
        self.curl.write_text('#!/bin/sh\nexit 99\n')
        second = self.run_launcher()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(second.stdout, first.stdout)

    def test_corrupt_download_never_executes(self):
        with self.asset.open('ab') as output:
            output.write(b'corruption')
        result = self.run_launcher()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertFalse(list(self.home.rglob('runtime.*')))

    def test_concurrent_first_connections_publish_complete_runtime(self):
        args = ['/bin/sh', str(self.plugin / 'scripts/start.sh')]
        clients = [subprocess.Popen(args, env=self.environment, cwd=self.root, text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(2)]
        try:
            for client in clients:
                stdout, stderr = client.communicate(timeout=15)
                self.assertEqual(client.returncode, 0, stderr)
                self.assertEqual(stdout, 'plugin-mcp\n--all-projects\n')
        finally:
            for client in clients:
                if client.poll() is None:
                    client.kill()
                client.wait()

    def test_client_launchers_and_runtime_pins_match(self):
        for relative in ['scripts/start.sh', 'runtime-version', 'hooks/hooks.json']:
            self.assertEqual((PLUGINS[0] / relative).read_bytes(), (PLUGINS[1] / relative).read_bytes())

    def test_hook_uses_the_same_verified_runtime(self):
        self.assertEqual(self.run_launcher().returncode, 0)
        self.curl.write_text('#!/bin/sh\nexit 99\n')
        result = subprocess.run(['/bin/sh', str(self.plugin / 'scripts/start.sh'), '--register-session'],
                                env=self.environment, text=True, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'plugin-register\n--all-projects\n')


if __name__ == '__main__':
    unittest.main()
