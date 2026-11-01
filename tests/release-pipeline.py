"""Exercise candidate identity checks and promotion recovery without network or secrets."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_tools', root / 'android/release-tools.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'android').mkdir()
        (self.root / 'downloads').mkdir()
        self.apk = self.root / 'Unscripted-1.0.19.apk'
        self.apk.write_bytes(b'signed candidate bytes')
        self.feed = release.metadata(self.apk, 20, '1.0.19', 'Try notifications')
        (self.root / 'app-update.json').write_text(json.dumps(dict(self.feed, versionCode=13)))
        (self.root / 'android/AndroidManifest.xml').write_text('<manifest android:versionCode="13" android:versionName="1.0.12"/>')
        self.calls = []

    def command(self, *args):
        self.calls.append(args)
        if args[0].endswith('apksigner'):
            return 'Signer #1 certificate SHA-256 digest: ' + release.CERT
        if args[0].endswith('aapt'):
            return "package: name='com.nikki.unscripted' versionCode='20' versionName='1.0.19'"
        if args[:2] == ('gh', 'api'):
            return json.dumps(dict(draft=False, prerelease=True, html_url='https://github.com/example'))
        if args[:3] == ('gh', 'release', 'download'):
            candidate = self.root / 'candidate'
            (candidate / self.apk.name).write_bytes(self.apk.read_bytes())
            (candidate / 'candidate-update.json').write_text(json.dumps(self.feed))
        return ''

    def test_numbering_and_stale_number_rejection(self):
        with patch.object(release, 'ROOT', self.root), patch.dict(os.environ, GITHUB_OUTPUT=str(self.root / 'out')):
            release.prepare(7)
            self.assertIn('versionCode="20"', (self.root / 'android/AndroidManifest.xml').read_text())
            self.assertIn('version=1.0.19', (self.root / 'out').read_text())
            with self.assertRaises(ValueError):
                release.prepare(0)

    def test_signature_package_and_tamper_checks(self):
        with patch.object(release, 'run', side_effect=self.command):
            release.validate(self.feed, self.apk, Path('/sdk'))
        with patch.object(release, 'run', return_value='wrong certificate'):
            with self.assertRaises(ValueError):
                release.validate(self.feed, self.apk, Path('/sdk'))
        with patch.object(release, 'run', side_effect=['Signer #1 certificate SHA-256 digest: ' + release.CERT, "package: name='wrong'"]):
            with self.assertRaises(ValueError):
                release.validate(self.feed, self.apk, Path('/sdk'))
        self.apk.write_bytes(b'changed bytes')
        with self.assertRaises(ValueError):
            release.validate(self.feed, self.apk, Path('/sdk'))

    def response(self, request, **kwargs):
        import io
        return io.BytesIO(json.dumps(self.feed).encode() if not isinstance(request, str) else self.apk.read_bytes())

    def test_promotion_preserves_bytes_and_rerun_does_not_commit(self):
        with patch.object(release, 'ROOT', self.root), patch.object(release, 'run', side_effect=self.command), patch.dict(os.environ, GITHUB_REPOSITORY='nikki0radz/Unscripted'), patch.object(release.urllib.request, 'urlopen', side_effect=self.response):
            release.promote('v1.0.19', Path('/sdk'))
            self.assertEqual((self.root / 'downloads' / self.apk.name).read_bytes(), self.apk.read_bytes())
            self.assertEqual(sum(c[:2] == ('git', 'commit') for c in self.calls), 1)
            release.promote('v1.0.19', Path('/sdk'))
            self.assertEqual(sum(c[:2] == ('git', 'commit') for c in self.calls), 1)
            self.assertEqual(sum(c[:3] == ('gh', 'release', 'edit') for c in self.calls), 2)

    def test_older_candidate_and_invalid_tag_rejected(self):
        (self.root / 'app-update.json').write_text(json.dumps(dict(self.feed, versionCode=21)))
        with patch.object(release, 'ROOT', self.root), patch.object(release, 'run', side_effect=self.command), patch.dict(os.environ, GITHUB_REPOSITORY='nikki0radz/Unscripted'):
            for tag in ['v1.0.19', '--bad-tag']:
                with self.assertRaises(ValueError):
                    release.promote(tag, Path('/sdk'))
        self.assertFalse(any(c[:2] == ('git', 'push') for c in self.calls))


unittest.main()
