import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('retain', Path(__file__).with_name('retain-bok-static.py'))
retain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retain)


class PublicRoutes(unittest.TestCase):
    def setUp(self):
        self.repository = 'a' * 64
        self.thread = '0x' + 'b' * 64
        self.id = retain.sha(json.dumps([self.repository, self.thread], separators=(',', ':')).encode())
        self.revision = 'c' * 40
        meta = {'binding': {'id': self.id, 'revision': self.revision, 'repositoryId': self.repository,
                           'threadId': self.thread, 'sourceArchiveSha256': 'd' * 64},
                'manifest': [{'path': 'index.html', 'bytes': 12, 'sha256': 'e' * 64}]}
        self.catalog = {'schema': 1, 'threads': {self.id: {'repositoryId': self.repository, 'threadId': self.thread,
                        'disabled': False, 'latest': self.revision, 'revisions': {self.revision: meta, 'f' * 40: {}}}}}

    def test_only_current_public_routes_and_directory_alias(self):
        paths = retain.public_routes(self.catalog)
        self.assertEqual(set(paths), {f't/{self.id}/latest/', f't/{self.id}/latest/index.html',
                         f't/{self.id}/r/{self.revision}/files/index.html', f't/{self.id}/source.json',
                         f't/{self.id}/r/{self.revision}/source.json'})

    def test_disabled_thread_never_published(self):
        self.catalog['threads'][self.id]['disabled'] = True
        with self.assertRaises(AssertionError):
            retain.public_routes(self.catalog)

    def test_invalid_binding_and_traversal_rejected(self):
        for change in ('binding', 'path', 'duplicate'):
            catalog = copy.deepcopy(self.catalog)
            meta = catalog['threads'][self.id]['revisions'][self.revision]
            if change == 'binding':
                meta['binding']['threadId'] = '0x' + 'f' * 64
            elif change == 'path':
                meta['manifest'].append({'path': '../secret', 'bytes': 1, 'sha256': 'f' * 64})
            else:
                meta['manifest'].append(meta['manifest'][0])
            with self.assertRaises(AssertionError):
                retain.public_routes(catalog)

    def test_stage_rejects_old_or_disabled_objects_before_fetch_or_write(self):
        prefix = 'published/example'
        expected = [prefix + '/' + route for route in retain.public_routes(self.catalog)]
        s3 = Mock()
        s3.get_paginator.return_value.paginate.return_value = [
            {'Contents': [{'Key': k} for k in expected]},
            {'Contents': [{'Key': prefix + '/t/disabled-thread/latest/index.html'}]},
        ]
        with patch.object(retain, 'build_opener') as network:
            with self.assertRaisesRegex(AssertionError, 'Unexpected objects'):
                retain.stage(self.catalog, 'https://artifacts.example', 'artifact-bucket', prefix, s3)
            network.assert_not_called()
        s3.put_object.assert_not_called()

    def test_final_destination_must_have_every_expected_key(self):
        s3 = Mock()
        s3.get_paginator.return_value.paginate.return_value = [{'Contents': [{'Key': 'published/x/a'}]}]
        with self.assertRaisesRegex(AssertionError, 'Incomplete publication'):
            retain.check_destination(s3, 'artifact-bucket', 'published/x', {'published/x/a', 'published/x/b'}, complete=True)


if __name__ == '__main__':
    unittest.main()
