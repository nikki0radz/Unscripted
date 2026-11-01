"""Version, verify and promote release candidates without rebuilding tested APKs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'com.nikki.unscripted'
CERT = '0cb6f82ec4dde5e85127afb3506cdd6068af56f77d64ed8127cd617b3c844c38'
BASE = 'https://nikki0radz.github.io/Unscripted/'


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def metadata(apk, code, version, notes):
    return dict(packageName=PACKAGE, versionCode=code, versionName=version,
                downloadUrl=BASE + 'downloads/' + apk.name,
                sha256=hashlib.sha256(apk.read_bytes()).hexdigest(),
                sizeBytes=apk.stat().st_size, notes=notes)


def validate(feed, apk, sdk):
    version = feed['versionName']
    if not re.fullmatch(r'1\.0\.[0-9]+', version):
        raise ValueError('Unexpected release version')
    if feed['packageName'] != PACKAGE or apk.name != f'Unscripted-{version}.apk':
        raise ValueError('Wrong package or APK filename')
    if feed['downloadUrl'] != BASE + 'downloads/' + apk.name:
        raise ValueError('Unexpected download URL')
    if not isinstance(feed['versionCode'], int) or not 13 < feed['versionCode'] < 2100000000:
        raise ValueError('Invalid version code')
    if metadata(apk, feed['versionCode'], version, feed['notes']) != feed:
        raise ValueError('Candidate checksum, size or metadata mismatch')
    signing = run(str(sdk / 'apksigner'), 'verify', '--print-certs', str(apk))
    digests = re.findall(r'Signer #\d+ certificate SHA-256 digest: (\w+)', signing)
    if digests != [CERT]:
        raise ValueError('APK must use the existing Unscripted signing certificate')
    badging = run(str(sdk / 'aapt'), 'dump', 'badging', str(apk))
    expected = f"package: name='{PACKAGE}' versionCode='{feed['versionCode']}' versionName='{version}'"
    if not badging.startswith(expected):
        raise ValueError('APK package/version does not match its feed')


def prepare(number):
    # Keep this offset stable. Every workflow run reserves a fresh code, including failures.
    code = 13 + number
    current = json.loads((ROOT / 'app-update.json').read_text())
    if code <= current['versionCode']:
        raise ValueError('Build number is not newer than stable; review the numbering offset')
    version = f'1.0.{code - 1}'
    manifest = ROOT / 'android/AndroidManifest.xml'
    source = manifest.read_text()
    source = re.sub(r'android:versionCode="[^"]+"', f'android:versionCode="{code}"', source)
    source = re.sub(r'android:versionName="[^"]+"', f'android:versionName="{version}"', source)
    manifest.write_text(source)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'version={version}\ncode={code}\n')


def promote(tag, sdk):
    if not re.fullmatch(r'v1\.0\.[0-9]+', tag):
        raise ValueError('Select a candidate tag such as v1.0.19')
    repo = os.environ['GITHUB_REPOSITORY']
    release = json.loads(run('gh', 'api', f'repos/{repo}/releases/tags/{tag}'))
    if release['draft']:
        raise ValueError('Draft releases cannot be promoted')
    candidate = ROOT / 'candidate'
    candidate.mkdir(exist_ok=True)
    run('gh', 'release', 'download', tag, '--dir', str(candidate), '--pattern', '*.apk', '--pattern', 'candidate-update.json')
    feed = json.loads((candidate / 'candidate-update.json').read_text())
    if tag != 'v' + feed['versionName']:
        raise ValueError('Candidate tag mismatch')
    apk = candidate / f"Unscripted-{feed['versionName']}.apk"
    validate(feed, apk, sdk)
    current = json.loads((ROOT / 'app-update.json').read_text())
    if feed['versionCode'] < current['versionCode']:
        raise ValueError('Cannot publish an older build over a newer stable release')
    if feed['versionCode'] == current['versionCode'] and feed != current:
        raise ValueError('Cannot replace an existing stable version with different bytes')
    if feed['versionCode'] > current['versionCode']:
        if not release['prerelease']:
            raise ValueError('Expected a tested pre-release candidate')
        destination = ROOT / 'downloads' / apk.name
        destination.write_bytes(apk.read_bytes())
        (ROOT / 'app-update.json').write_text(json.dumps(feed, indent=2) + '\n')
        run('git', 'config', 'user.name', 'github-actions[bot]')
        run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        run('git', 'add', 'app-update.json', 'downloads/' + apk.name)
        run('git', 'commit', '-m', f'Promote tested Android {tag}')
        # A normal push fails safely if main moved; rerun against current main, never force.
        run('git', 'push', 'origin', 'HEAD:main')
    # Token-generated commits do not automatically trigger Pages: explicitly request it.
    run('gh', 'api', '--method', 'POST', f'repos/{repo}/pages/builds')
    for attempt in range(36):
        try:
            request = urllib.request.Request(BASE + 'app-update.json', headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=15) as response:
                published = json.load(response)
            if published == feed:
                with urllib.request.urlopen(feed['downloadUrl'], timeout=30) as response:
                    data = response.read(feed['sizeBytes'] + 1)
                if len(data) == feed['sizeBytes'] and hashlib.sha256(data).hexdigest() == feed['sha256']:
                    break
        except (OSError, ValueError):
            pass
        time.sleep(10)
    else:
        raise RuntimeError('Pages feed/APK not confirmed live. Rerun publish for this tag; do not rebuild.')
    run('gh', 'release', 'edit', tag, '--prerelease=false', '--latest', '--title', f"Unscripted {feed['versionName']}")
    print(f'Published verified, unchanged candidate: {release["html_url"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('prepare').add_argument('number', type=int)
    check = sub.add_parser('verify')
    check.add_argument('apk', type=Path)
    check.add_argument('feed', type=Path)
    check.add_argument('sdk', type=Path)
    publish = sub.add_parser('promote')
    publish.add_argument('tag')
    publish.add_argument('sdk', type=Path)
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare(args.number)
    elif args.command == 'verify':
        validate(json.loads(args.feed.read_text()), args.apk, args.sdk)
    else:
        promote(args.tag, args.sdk)
