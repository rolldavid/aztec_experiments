import copy
import importlib.util
import json
from pathlib import Path
import unittest

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


if __name__ == '__main__':
    unittest.main()
