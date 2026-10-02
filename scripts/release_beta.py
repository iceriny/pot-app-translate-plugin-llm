#!/usr/bin/env python3
"""Publish exactly the already approved beta; never overwrite tags or assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REPO = 'iceriny/pot-app-translate-plugin-llm'
TAG = 'v4.0.0-beta.1'
SOURCE = '778a6e1a62f8d5f4ff55abdae37c76a713df232f'
ARCHIVE = 'com.iceriny.llm-4.0.0-beta.1.mplugin'
DIGEST = '3278ffa6565640d9347c3069ea1c655ef95e38bca497c460c8ff94cef66d202b'
TITLE = 'Manggo 原生 AI 翻译与词典 4.0.0-beta.1'
# Do not permit source, license or build inputs to drift from the accepted build.
INPUTS = ['main.js', 'lib', 'manggo.plugin.json', 'icon.svg', 'LICENSE',
          'pack.py', 'package.json', 'package-lock.json', 'scripts/build.mjs']


def safe_detail(text):
    token = os.environ.get('GH_TOKEN')
    if token:
        text = text.replace(token, '[redacted]')
    return text.strip()[-1500:]


def command(args):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'Command failed: {args[0]} {args[1]} (exit {result.returncode}): {safe_detail(result.stderr)}')
    return result.stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_local():
    marker = json.loads((ROOT / '.github/releases/v4.0.0-beta.1.json').read_text())
    expected = {'tag': TAG, 'version': '4.0.0-beta.1', 'source_commit': SOURCE,
                'archive': ARCHIVE, 'archive_size': 22141, 'archive_sha256': DIGEST,
                'prerelease': True}
    if marker != expected:
        raise RuntimeError('Release marker does not match the one approved beta')
    sha = command(['git', 'rev-parse', 'HEAD']).strip()
    if os.environ.get('GITHUB_SHA', sha) != sha or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise RuntimeError('Checkout does not match workflow commit')
    command(['git', 'merge-base', '--is-ancestor', SOURCE, sha])
    command(['git', 'diff', '--exit-code', SOURCE, sha, '--', *INPUTS])
    # Verify both committed inputs and the actual working tree used for the build.
    command(['git', 'diff', '--exit-code', '--', *INPUTS])
    command(['git', 'diff', '--cached', '--exit-code', '--', *INPUTS])
    manifest = json.loads((ROOT / 'manggo.plugin.json').read_text())
    if manifest['version'] != '4.0.0-beta.1':
        raise RuntimeError('Manifest version mismatch')
    archive = ROOT / 'dist' / ARCHIVE
    if archive.stat().st_size != 22141 or digest(archive) != DIGEST:
        raise RuntimeError('Built archive differs from the already delivered test package')
    checksum = ROOT / 'dist/sha256.txt'
    if checksum.read_text().strip() != f'{DIGEST}  {ARCHIVE}':
        raise RuntimeError('Checksum file does not match the approved archive')
    print(f'Approved package verified: {ARCHIVE} ({DIGEST})')
    return sha, [archive, checksum]


def api(endpoint, allow_missing=False):
    result = subprocess.run(['gh', 'api', endpoint], cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        if allow_missing and '(HTTP 404)' in result.stderr:
            return None
        raise RuntimeError(f'GitHub read failed: {endpoint}; refusing to infer missing state: {safe_detail(result.stderr)}')
    return json.loads(result.stdout)


def find_release(base):
    """Authenticated collection reads include drafts; tag lookup does not."""
    matches = []
    page = 1
    while True:
        releases = api(f'{base}/releases?per_page=100&page={page}')
        if not isinstance(releases, list):
            raise RuntimeError('Unexpected GitHub release listing')
        matches.extend(item for item in releases if item.get('tag_name') == TAG)
        if len(releases) < 100:
            break
        page += 1
    if len(matches) > 1:
        raise RuntimeError('Multiple releases use this beta tag; manual review required')
    return matches[0] if matches else None


def validate_metadata(release, sha, notes, release_id=None, require_draft=None):
    if (not release or release.get('tag_name') != TAG or not release.get('prerelease')
            or release.get('target_commitish') != sha or release.get('name') != TITLE
            or release.get('body') != notes
            or (release_id is not None and release.get('id') != release_id)
            or (require_draft is not None and release.get('draft') != require_draft)):
        raise RuntimeError('Release metadata changed or differs from this exact publication')


def validate_tag(ref, sha):
    if ref is not None and (ref.get('object', {}).get('type') != 'commit'
                            or ref['object']['sha'] != sha):
        raise RuntimeError('Existing tag does not point directly to the exact release commit')


def validate_assets(release, assets, require_all=False):
    expected = {path.name: path for path in assets}
    found = set()
    for asset in release.get('assets', []):
        name = asset['name']
        if name not in expected or name in found:
            raise RuntimeError('Unexpected or duplicate release asset; manual review required')
        path = expected[name]
        if (asset.get('state') != 'uploaded' or asset.get('size') != path.stat().st_size
                or asset.get('digest') != 'sha256:' + digest(path)):
            raise RuntimeError(f'Existing asset does not match approved bytes: {name}')
        found.add(name)
    if require_all and found != set(expected):
        raise RuntimeError('Release is missing a required asset')
    return found


def publish(sha, assets):
    if (os.environ.get('GITHUB_REPOSITORY') != REPO
            or os.environ.get('GITHUB_REF') != 'refs/heads/manggo'
            or os.environ.get('GITHUB_EVENT_NAME') != 'push'):
        raise RuntimeError('Publishing is allowed only by this repository Manggo push workflow')
    if not os.environ.get('GH_TOKEN'):
        raise RuntimeError('Workflow token unavailable')
    base = f'repos/{REPO}'
    # Never publish an obsolete commit if someone advanced the branch meanwhile.
    if api(f'{base}/branches/manggo')['commit']['sha'] != sha:
        raise RuntimeError('Manggo branch advanced; review newer changes before publishing')
    tag = api(f'{base}/git/ref/tags/{TAG}', allow_missing=True)
    validate_tag(tag, sha)
    release = find_release(base)
    notes = (ROOT / f'docs/releases/{TAG}.md').read_text()
    notes += f'\n\n源码提交： https://github.com/{REPO}/commit/{sha}\n'
    if release:
        validate_metadata(release, sha, notes)
        found = validate_assets(release, assets, require_all=not release['draft'])
        if not release['draft']:
            if tag is None:
                raise RuntimeError('Published release tag is missing')
            print(f'Already published and verified: {release["html_url"]}')
            return
    else:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.md') as handle:
            handle.write(notes)
            handle.flush()
            command(['gh', 'release', 'create', TAG, '--repo', REPO, '--target', sha,
                     '--title', TITLE, '--notes-file', handle.name, '--draft',
                     '--prerelease', '--latest=false'])
        release = find_release(base)
        validate_metadata(release, sha, notes, require_draft=True)
        found = validate_assets(release, assets)
    release_id = release['id']
    for path in assets:
        if path.name not in found:
            command(['gh', 'api', '--method', 'POST',
                     f'https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name={path.name}',
                     '--header', 'Content-Type: application/octet-stream', '--input', str(path)])
    release = api(f'{base}/releases/{release_id}')
    validate_metadata(release, sha, notes, release_id, require_draft=True)
    validate_assets(release, assets, require_all=True)
    # Final compare immediately before making the already uploaded draft public.
    validate_tag(api(f'{base}/git/ref/tags/{TAG}', allow_missing=True), sha)
    if api(f'{base}/branches/manggo')['commit']['sha'] != sha:
        raise RuntimeError('Manggo branch advanced before publication; draft left for review')
    command(['gh', 'api', '--method', 'PATCH', f'{base}/releases/{release_id}',
             '--field', 'draft=false', '--field', 'prerelease=true',
             '--raw-field', 'make_latest=false'])
    release = api(f'{base}/releases/{release_id}')
    ref = api(f'{base}/git/ref/tags/{TAG}')
    validate_tag(ref, sha)
    validate_metadata(release, sha, notes, release_id, require_draft=False)
    validate_assets(release, assets, require_all=True)
    print(f'Published and verified: {release["html_url"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    sha, assets = check_local()
    if not args.check_only:
        publish(sha, assets)


if __name__ == '__main__':
    try:
        main()
    except (OSError, KeyError, ValueError, RuntimeError) as error:
        print(f'Release stopped: {error}', file=sys.stderr)
        sys.exit(1)
