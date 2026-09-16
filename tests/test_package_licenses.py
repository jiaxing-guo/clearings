"""Exercise license fetching through the real packaging entry point."""

import contextlib
import io
import http.client
import json
import runpy
import ssl
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))


class PackageLicenses(unittest.TestCase):
    def package(self, fetch):
        temporary_directory = tempfile.TemporaryDirectory
        with temporary_directory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            source = root / 'crate'
            source.mkdir()
            (source / '.cargo_vcs_info.json').write_text(json.dumps({'git': {'sha1': 'a' * 40}}))
            metadata = {
                'packages': [
                    {
                        'name': 'example',
                        'version': '1.0.0',
                        'source': 'registry',
                        'manifest_path': str(source / 'Cargo.toml'),
                        'repository': 'https://github.com/example/example',
                        'license': 'MIT',
                    }
                ]
            }

            def staging(*args, **kwargs):
                temporary = temporary_directory(*args, **kwargs)
                stack.enter_context(temporary)
                return temporary

            with (
                patch.object(
                    sys,
                    'argv',
                    [
                        str(SCRIPTS / 'package.py'),
                        'unused',
                        str(root / 'output'),
                        '--licenses-only',
                    ],
                ),
                patch('subprocess.check_output', return_value=json.dumps(metadata).encode()),
                patch('tempfile.TemporaryDirectory', side_effect=staging),
                patch('urllib.request.urlopen', side_effect=fetch) as request,
                patch('time.sleep') as sleep,
                contextlib.redirect_stdout(io.StringIO()) as output,
                contextlib.redirect_stderr(io.StringIO()),
            ):
                with self.assertRaises(SystemExit) as exit_result:
                    runpy.run_path(str(SCRIPTS / 'package.py'), run_name='__main__')
                self.assertEqual(exit_result.exception.code, 0)
                self.assertIn('Dependency license preflight passed.', output.getvalue())
                manifest_path = next((root / 'output').rglob('dependencies.json'))
                manifest = json.loads(manifest_path.read_text())
                self.assertEqual(manifest[0]['license_material'], 'pinned-upstream')
                self.assertEqual(len(manifest[0]['upstream_license_sources']), 1)
                self.assertEqual(
                    (manifest_path.parent / 'licenses/example-1.0.0/LICENSE').read_bytes(),
                    b'License text',
                )
                return request.call_args_list, sleep.call_args_list

    def test_connection_reset_recovers_without_skipping_license(self):
        attempts = []

        def fetch(url, timeout):
            attempts.append(url)
            if len(attempts) == 1:
                raise urllib.error.URLError(ConnectionResetError(104, 'Connection reset by peer'))
            if url.endswith('/LICENSE'):
                return io.BytesIO(b'License text')
            raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)

        requests, sleeps = self.package(fetch)
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(len(requests), 8)
        self.assertEqual(len(sleeps), 1)

    def test_transient_statuses_and_read_errors_recover(self):
        class InterruptedBody(io.BytesIO):
            def read(self, size):
                raise http.client.IncompleteRead(b'partial', 100)

        failures = [
            TimeoutError('timed out'),
            ConnectionResetError(104, 'reset during read'),
            InterruptedBody(),
            *[
                urllib.error.HTTPError('https://example.test', code, 'Temporary', {}, None)
                for code in (408, 429, 500, 502, 503, 504)
            ],
        ]
        for failure in failures:
            with self.subTest(failure=str(failure)):
                attempts = []

                def fetch(url, timeout):
                    attempts.append(url)
                    if len(attempts) == 1:
                        if isinstance(failure, Exception):
                            raise failure
                        return failure
                    if url.endswith('/LICENSE'):
                        return io.BytesIO(b'License text')
                    raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)

                _, sleeps = self.package(fetch)
                self.assertEqual(len(sleeps), 1)
                self.assertEqual(attempts[0], attempts[1])

    def test_persistent_network_failure_is_bounded_and_names_url(self):
        requests = []

        def fetch(url, timeout):
            requests.append(url)
            raise urllib.error.URLError(ConnectionResetError(104, 'Connection reset by peer'))

        with self.assertRaisesRegex(
            RuntimeError, 'failed after 4 attempts: https://raw.githubusercontent.com/'
        ):
            self.package(fetch)
        self.assertEqual(len(requests), 4)
        self.assertEqual(len(set(requests)), 1)

    def test_missing_licenses_still_fail(self):
        requests = []

        def fetch(url, timeout):
            requests.append(url)
            raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)

        with self.assertRaisesRegex(RuntimeError, 'No license material found for: example-1.0.0'):
            self.package(fetch)
        self.assertEqual(len(requests), 7)

    def test_permanent_http_and_certificate_errors_are_not_retried(self):
        failures = [
            urllib.error.HTTPError('https://example.test', 403, 'Forbidden', {}, None),
            urllib.error.URLError(ssl.SSLCertVerificationError('invalid certificate')),
        ]
        for failure in failures:
            with self.subTest(failure=str(failure)):
                requests = []

                def fetch(url, timeout):
                    requests.append(url)
                    raise failure

                with self.assertRaises(type(failure)):
                    self.package(fetch)
                self.assertEqual(len(requests), 1)

    def test_oversized_license_is_rejected_without_retry(self):
        requests = []

        def fetch(url, timeout):
            requests.append(url)
            return io.BytesIO(b'x' * (1024 * 1024 + 1))

        with self.assertRaisesRegex(RuntimeError, 'Oversized upstream license'):
            self.package(fetch)
        self.assertEqual(len(requests), 1)


if __name__ == '__main__':
    unittest.main()
