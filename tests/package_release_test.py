"""Offline safety tests for the narrowly scoped beta publisher.

All GitHub access and publication subprocesses are mocked. These tests never
contact GitHub, read credentials, create tags, or publish releases.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts/release_beta.py'
SPEC = importlib.util.spec_from_file_location('beta_publisher', MODULE_PATH)
beta = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(beta)

SHA = 'a' * 40
OTHER_SHA = 'b' * 40


class AssetSafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.assets = [root / beta.ARCHIVE, root / 'sha256.txt']
        self.assets[0].write_bytes(b'approved package bytes')
        self.assets[1].write_text('approved checksum\n', encoding='utf-8')
        self.metadata = [dict(name=p.name, state='uploaded', size=p.stat().st_size,
                              digest='sha256:' + beta.digest(p)) for p in self.assets]

    def test_accepts_exact_assets(self):
        self.assertEqual(beta.validate_assets({'assets': self.metadata}, self.assets, True),
                         {p.name for p in self.assets})

    def test_allows_partial_draft_for_resuming_upload(self):
        self.assertEqual(beta.validate_assets({'assets': self.metadata[:1]}, self.assets),
                         {self.assets[0].name})

    def test_missing_asset_blocks_published_release(self):
        with self.assertRaisesRegex(RuntimeError, 'missing'):
            beta.validate_assets({'assets': self.metadata[:1]}, self.assets, True)

    def test_no_assets_blocks_published_release(self):
        with self.assertRaisesRegex(RuntimeError, 'missing'):
            beta.validate_assets({}, self.assets, True)

    def test_rejects_duplicate_assets(self):
        with self.assertRaisesRegex(RuntimeError, 'duplicate'):
            beta.validate_assets({'assets': self.metadata + [self.metadata[0]]}, self.assets)

    def test_rejects_unexpected_assets(self):
        metadata = copy.deepcopy(self.metadata)
        metadata[0]['name'] = 'unapproved.zip'
        with self.assertRaisesRegex(RuntimeError, 'Unexpected'):
            beta.validate_assets({'assets': metadata}, self.assets)

    def test_rejects_untrusted_asset_state_size_and_digest(self):
        cases = [('state', 'starter'), ('size', 0), ('digest', None),
                 ('digest', 'sha256:' + '0' * 64)]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                metadata = copy.deepcopy(self.metadata)
                metadata[0][field] = value
                with self.assertRaisesRegex(RuntimeError, 'match approved bytes'):
                    beta.validate_assets({'assets': metadata}, self.assets)


class TagSafetyTests(unittest.TestCase):
    def test_missing_tag_is_allowed_for_unpublished_draft(self):
        beta.validate_tag(None, SHA)

    def test_accepts_exact_lightweight_tag(self):
        beta.validate_tag({'object': {'type': 'commit', 'sha': SHA}}, SHA)

    def test_rejects_wrong_tag_target(self):
        with self.assertRaises(RuntimeError):
            beta.validate_tag({'object': {'type': 'commit', 'sha': OTHER_SHA}}, SHA)

    def test_rejects_annotated_tag_without_peeling_or_overwriting(self):
        with self.assertRaises(RuntimeError):
            beta.validate_tag({'object': {'type': 'tag', 'sha': SHA}}, SHA)

    def test_rejects_malformed_tag(self):
        with self.assertRaises(RuntimeError):
            beta.validate_tag({}, SHA)


class ApiSafetyTests(unittest.TestCase):
    def test_returns_json_on_success(self):
        result = subprocess.CompletedProcess([], 0, '{"ok":true}', '')
        with patch.object(beta.subprocess, 'run', return_value=result):
            self.assertEqual(beta.api('repos/test/example'), {'ok': True})

    def test_404_requires_explicit_missing_permission(self):
        result = subprocess.CompletedProcess([], 1, '', 'gh: Not Found (HTTP 404)')
        with patch.object(beta.subprocess, 'run', return_value=result):
            self.assertIsNone(beta.api('repos/test/example', allow_missing=True))
            with self.assertRaisesRegex(RuntimeError, 'refusing to infer'):
                beta.api('repos/test/example')

    def test_authentication_and_network_errors_never_imply_missing(self):
        for error in ('gh: Unauthorized (HTTP 401)', 'gh: Forbidden (HTTP 403)',
                      'dial tcp: network unavailable', 'gh: Server error (HTTP 500)'):
            with self.subTest(error=error):
                result = subprocess.CompletedProcess([], 1, '', error)
                with patch.object(beta.subprocess, 'run', return_value=result):
                    with self.assertRaisesRegex(RuntimeError, 'refusing to infer'):
                        beta.api('repos/test/example', allow_missing=True)

    def test_invalid_json_is_not_missing(self):
        result = subprocess.CompletedProcess([], 0, 'not json', '')
        with patch.object(beta.subprocess, 'run', return_value=result):
            with self.assertRaises(ValueError):
                beta.api('repos/test/example', allow_missing=True)


class PublicationGuardTests(unittest.TestCase):
    def environment(self):
        return {'GITHUB_REPOSITORY': beta.REPO, 'GITHUB_REF': 'refs/heads/manggo',
                'GITHUB_EVENT_NAME': 'push', 'GH_TOKEN': 'offline-test-placeholder'}

    def test_wrong_repository_branch_event_or_missing_token_cannot_write(self):
        cases = [('GITHUB_REPOSITORY', 'other/repository'),
                 ('GITHUB_REF', 'refs/heads/main'),
                 ('GITHUB_REF', 'refs/tags/v4.0.0-beta.1'),
                 ('GITHUB_EVENT_NAME', 'pull_request'),
                 ('GITHUB_EVENT_NAME', 'workflow_dispatch'), ('GH_TOKEN', '')]
        for field, value in cases:
            env = self.environment()
            env[field] = value
            with self.subTest(field=field, value=value):
                with patch.dict(os.environ, env, clear=True), \
                     patch.object(beta, 'api') as api, patch.object(beta, 'command') as command:
                    with self.assertRaises(RuntimeError):
                        beta.publish(SHA, [])
                    api.assert_not_called()
                    command.assert_not_called()

    def test_branch_advance_blocks_all_publication_commands(self):
        with patch.dict(os.environ, self.environment(), clear=True), \
             patch.object(beta, 'api', return_value={'commit': {'sha': OTHER_SHA}}), \
             patch.object(beta, 'command') as command:
            with self.assertRaisesRegex(RuntimeError, 'branch advanced'):
                beta.publish(SHA, [])
            command.assert_not_called()

    def test_wrong_existing_tag_blocks_release_creation(self):
        responses = [{'commit': {'sha': SHA}},
                     {'object': {'type': 'commit', 'sha': OTHER_SHA}}]
        with patch.dict(os.environ, self.environment(), clear=True), \
             patch.object(beta, 'api', side_effect=responses), \
             patch.object(beta, 'command') as command:
            with self.assertRaisesRegex(RuntimeError, 'Existing tag'):
                beta.publish(SHA, [])
            command.assert_not_called()


class LocalApprovalGuardTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / '.github/releases').mkdir(parents=True)
        self.marker = self.root / '.github/releases/v4.0.0-beta.1.json'
        self.approved_marker = {'tag': beta.TAG, 'version': '4.0.0-beta.1',
                               'source_commit': beta.SOURCE, 'archive': beta.ARCHIVE,
                               'archive_size': 22141, 'archive_sha256': beta.DIGEST,
                               'prerelease': True}
        self.marker.write_text(json.dumps(self.approved_marker), encoding='utf-8')
        (self.root / 'manggo.plugin.json').write_text('{"version":"4.0.0-beta.1"}', encoding='utf-8')
        (self.root / 'dist').mkdir()
        (self.root / 'dist' / beta.ARCHIVE).write_bytes(b'x' * 22141)
        (self.root / 'dist/sha256.txt').write_text(f'{beta.DIGEST}  {beta.ARCHIVE}\n', encoding='utf-8')
        self.commands = []

    def git_ok(self, args):
        self.commands.append(args)
        return SHA + '\n' if args[:2] == ['git', 'rev-parse'] else ''

    def run_check(self, **environment):
        with patch.object(beta, 'ROOT', self.root), \
             patch.object(beta, 'command', side_effect=self.git_ok), \
             patch.object(beta, 'digest', return_value=beta.DIGEST), \
             patch.dict(os.environ, environment, clear=True):
            return beta.check_local()

    def test_exact_marker_and_archive_pass_and_check_all_source_inputs(self):
        sha, assets = self.run_check(GITHUB_SHA=SHA)
        self.assertEqual(sha, SHA)
        self.assertEqual([p.name for p in assets], [beta.ARCHIVE, 'sha256.txt'])
        self.assertIn(['git', 'merge-base', '--is-ancestor', beta.SOURCE, SHA], self.commands)
        self.assertIn(['git', 'diff', '--exit-code', beta.SOURCE, SHA, '--', *beta.INPUTS], self.commands)
        self.assertIn(['git', 'diff', '--exit-code', '--', *beta.INPUTS], self.commands)
        self.assertIn(['git', 'diff', '--cached', '--exit-code', '--', *beta.INPUTS], self.commands)

    def test_changed_marker_cannot_release_future_or_arbitrary_artifact(self):
        for field, value in [('tag', 'v9.0.0'), ('version', '4.0.0'),
                             ('source_commit', OTHER_SHA), ('archive', '../other.zip'),
                             ('archive_size', 1), ('archive_sha256', '0' * 64),
                             ('prerelease', False)]:
            with self.subTest(field=field):
                marker = dict(self.approved_marker)
                marker[field] = value
                self.marker.write_text(json.dumps(marker), encoding='utf-8')
                with self.assertRaisesRegex(RuntimeError, 'marker'):
                    self.run_check()
                self.assertEqual(self.commands, [])

    def test_workflow_sha_mismatch_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'workflow commit'):
            self.run_check(GITHUB_SHA=OTHER_SHA)

    def test_changed_manifest_version_fails(self):
        (self.root / 'manggo.plugin.json').write_text('{"version":"4.0.0"}', encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'Manifest version'):
            self.run_check()

    def test_changed_archive_size_fails(self):
        (self.root / 'dist' / beta.ARCHIVE).write_bytes(b'wrong')
        with self.assertRaisesRegex(RuntimeError, 'delivered test package'):
            self.run_check()

    def test_changed_archive_bytes_fail(self):
        with patch.object(beta, 'ROOT', self.root), \
             patch.object(beta, 'command', side_effect=self.git_ok), \
             patch.object(beta, 'digest', return_value='0' * 64), \
             patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'delivered test package'):
                beta.check_local()

    def test_checksum_mismatch_fails(self):
        (self.root / 'dist/sha256.txt').write_text('wrong\n', encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'Checksum'):
            self.run_check()

    def test_source_or_worktree_drift_stops_validation(self):
        for stop in ('--is-ancestor', beta.SOURCE, '--cached'):
            def fail_changed(args):
                if args[1] == 'diff' and (stop == beta.SOURCE or stop in args):
                    raise RuntimeError('simulated source drift')
                if stop == '--is-ancestor' and '--is-ancestor' in args:
                    raise RuntimeError('simulated source drift')
                return self.git_ok(args)
            with self.subTest(stop=stop):
                with patch.object(beta, 'ROOT', self.root), \
                     patch.object(beta, 'command', side_effect=fail_changed), \
                     patch.dict(os.environ, {}, clear=True):
                    with self.assertRaisesRegex(RuntimeError, 'source drift'):
                        beta.check_local()


class ReleaseDiscoveryTests(unittest.TestCase):
    def test_empty_collection_is_missing(self):
        with patch.object(beta, 'api', return_value=[]):
            self.assertIsNone(beta.find_release('repos/test/example'))

    def test_finds_pending_draft_on_second_page(self):
        first_page = [{'tag_name': 'other-' + str(i)} for i in range(100)]
        draft = {'id': 42, 'tag_name': beta.TAG, 'draft': True}
        with patch.object(beta, 'api', side_effect=[first_page, [draft]]) as api:
            self.assertEqual(beta.find_release('repos/test/example'), draft)
            self.assertEqual(api.call_args_list[1].args[0],
                             'repos/test/example/releases?per_page=100&page=2')

    def test_duplicate_pending_or_published_tag_fails(self):
        releases = [{'id': i, 'tag_name': beta.TAG, 'draft': bool(i)} for i in range(2)]
        with patch.object(beta, 'api', return_value=releases):
            with self.assertRaisesRegex(RuntimeError, 'Multiple releases'):
                beta.find_release('repos/test/example')

    def test_non_collection_result_fails(self):
        with patch.object(beta, 'api', return_value={'message': 'bad response'}):
            with self.assertRaisesRegex(RuntimeError, 'listing'):
                beta.find_release('repos/test/example')


class MetadataSafetyTests(unittest.TestCase):
    def setUp(self):
        self.release = {'id': 42, 'tag_name': beta.TAG, 'target_commitish': SHA,
                        'name': beta.TITLE, 'body': 'Exact notes\n',
                        'draft': True, 'prerelease': True}

    def test_exact_draft_is_accepted(self):
        beta.validate_metadata(self.release, SHA, 'Exact notes\n', 42, True)

    def test_any_changed_publication_field_fails(self):
        for field, value in [('id', 43), ('tag_name', 'v4.0.0'),
                             ('target_commitish', OTHER_SHA), ('name', 'Changed'),
                             ('body', 'Changed'), ('draft', False), ('prerelease', False)]:
            with self.subTest(field=field):
                release = dict(self.release)
                release[field] = value
                with self.assertRaisesRegex(RuntimeError, 'metadata'):
                    beta.validate_metadata(release, SHA, 'Exact notes\n', 42, True)


class PublicationFlowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        notes_directory = self.root / 'docs/releases'
        notes_directory.mkdir(parents=True)
        (notes_directory / f'{beta.TAG}.md').write_text('Release notes\n', encoding='utf-8')
        self.notes = ('Release notes\n' +
                      f'\n\n源码提交： https://github.com/{beta.REPO}/commit/{SHA}\n')
        self.assets = [self.root / beta.ARCHIVE, self.root / 'sha256.txt']
        for p in self.assets:
            p.write_bytes(p.name.encode())
        self.asset_metadata = [dict(name=p.name, state='uploaded', size=p.stat().st_size,
                                   digest='sha256:' + beta.digest(p)) for p in self.assets]
        self.env = {'GITHUB_REPOSITORY': beta.REPO, 'GITHUB_REF': 'refs/heads/manggo',
                    'GITHUB_EVENT_NAME': 'push', 'GH_TOKEN': 'offline-test-placeholder'}
        self.release = None
        self.tag = None
        self.commands = []
        self.branch_reads = 0
        self.advance_on_final_read = False
        self.tamper_before_publish = False

    def release_template(self, draft=True, assets=None):
        return {'id': 42, 'tag_name': beta.TAG, 'target_commitish': SHA,
                'name': beta.TITLE, 'body': self.notes, 'draft': draft,
                'prerelease': True, 'assets': assets or [],
                'html_url': f'https://github.com/{beta.REPO}/releases/tag/{beta.TAG}'}

    def fake_api(self, endpoint, allow_missing=False):
        if endpoint.endswith('/branches/manggo'):
            self.branch_reads += 1
            sha = OTHER_SHA if self.advance_on_final_read and self.branch_reads > 1 else SHA
            return {'commit': {'sha': sha}}
        if '/git/ref/tags/' in endpoint:
            return copy.deepcopy(self.tag)
        if '/releases?per_page=' in endpoint:
            return [copy.deepcopy(self.release)] if self.release else []
        if endpoint.endswith('/releases/42'):
            result = copy.deepcopy(self.release)
            if self.tamper_before_publish and result['draft']:
                result['target_commitish'] = OTHER_SHA
            return result
        self.fail(f'Unexpected API endpoint: {endpoint}')

    def fake_command(self, args):
        self.commands.append(list(args))
        if args[:3] == ['gh', 'release', 'create']:
            self.assertIn('--draft', args)
            self.assertIn('--prerelease', args)
            self.assertIn('--latest=false', args)
            self.assertEqual(Path(args[args.index('--notes-file') + 1]).read_text(), self.notes)
            self.release = self.release_template()
        elif args[:4] == ['gh', 'api', '--method', 'POST']:
            self.assertIn('/releases/42/assets?name=', args[4])
            path = Path(args[args.index('--input') + 1])
            self.release['assets'].append(next(copy.deepcopy(a) for a in self.asset_metadata
                                               if a['name'] == path.name))
        elif args[:4] == ['gh', 'api', '--method', 'PATCH']:
            self.assertEqual(args[4], f'repos/{beta.REPO}/releases/42')
            self.assertEqual({a['name'] for a in self.release['assets']},
                             {p.name for p in self.assets})
            self.release['draft'] = False
            self.tag = {'object': {'type': 'commit', 'sha': SHA}}
        else:
            self.fail(f'Unexpected mutation: {args}')
        return ''

    def run_publish(self):
        with patch.object(beta, 'ROOT', self.root), \
             patch.dict(os.environ, self.env, clear=True), \
             patch.object(beta, 'api', side_effect=self.fake_api), \
             patch.object(beta, 'command', side_effect=self.fake_command):
            beta.publish(SHA, self.assets)

    def test_first_publication_stages_uploads_before_publishing(self):
        self.run_publish()
        self.assertEqual(len(self.commands), 4)
        self.assertEqual(self.commands[0][:3], ['gh', 'release', 'create'])
        self.assertEqual(self.commands[-1][:4], ['gh', 'api', '--method', 'PATCH'])
        self.assertFalse(self.release['draft'])

    def test_retry_of_exact_published_release_is_read_only(self):
        self.release = self.release_template(False, copy.deepcopy(self.asset_metadata))
        self.tag = {'object': {'type': 'commit', 'sha': SHA}}
        self.run_publish()
        self.assertEqual(self.commands, [])

    def test_partial_draft_resumes_only_missing_asset(self):
        self.release = self.release_template(True, copy.deepcopy(self.asset_metadata[:1]))
        self.run_publish()
        self.assertEqual(len(self.commands), 2)
        self.assertIn('assets?name=sha256.txt', self.commands[0][4])
        self.assertEqual(self.commands[1][3], 'PATCH')

    def test_complete_draft_publishes_without_reupload(self):
        self.release = self.release_template(True, copy.deepcopy(self.asset_metadata))
        self.run_publish()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(self.commands[0][3], 'PATCH')

    def test_conflicting_published_release_is_never_modified(self):
        self.release = self.release_template(False, copy.deepcopy(self.asset_metadata))
        self.release['body'] = 'Unapproved notes'
        self.tag = {'object': {'type': 'commit', 'sha': SHA}}
        with self.assertRaisesRegex(RuntimeError, 'metadata'):
            self.run_publish()
        self.assertEqual(self.commands, [])

    def test_published_release_without_tag_fails_closed(self):
        self.release = self.release_template(False, copy.deepcopy(self.asset_metadata))
        with self.assertRaisesRegex(RuntimeError, 'tag is missing'):
            self.run_publish()
        self.assertEqual(self.commands, [])

    def test_metadata_change_after_upload_never_publishes(self):
        self.release = self.release_template(True, copy.deepcopy(self.asset_metadata[:1]))
        self.tamper_before_publish = True
        with self.assertRaisesRegex(RuntimeError, 'metadata'):
            self.run_publish()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(self.commands[0][3], 'POST')
        self.assertTrue(self.release['draft'])

    def test_branch_advance_after_upload_leaves_draft(self):
        self.release = self.release_template(True, copy.deepcopy(self.asset_metadata[:1]))
        self.advance_on_final_read = True
        with self.assertRaisesRegex(RuntimeError, 'branch advanced'):
            self.run_publish()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(self.commands[0][3], 'POST')
        self.assertTrue(self.release['draft'])


if __name__ == '__main__':
    unittest.main()
