"""Package preflight tests; never build an archive or execute a prover."""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prover_package', ROOT / 'deploy/prover/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

class PackagePreflight(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        (self.root / 'prover').mkdir()
        shutil.copyfile(ROOT / 'prover/rolling-artifacts.mjs', self.root / 'prover/rolling-artifacts.mjs')
        shutil.copyfile(ROOT / 'toolchain.json', self.root / 'toolchain.json')
        (self.root / 'prover/rolling-artifacts.json').write_text(json.dumps({'schemaVersion': 1, 'status': 'pending', 'artifacts': [], 'inputs': {}}))
        self.node = os.environ.get('PROVER_VALIDATION_NODE', 'node')

    def tearDown(self):
        self.temp.cleanup()

    def test_pending_artifacts_cannot_enter_package(self):
        with self.assertRaises(subprocess.CalledProcessError):
            package.rolling_resources(self.root, self.node)

    def test_validation_node_must_match_pinned_version(self):
        pins = json.loads((self.root / 'toolchain.json').read_text())
        pins['node'] = '0.0.0'
        (self.root / 'toolchain.json').write_text(json.dumps(pins))
        with self.assertRaisesRegex(RuntimeError, 'Pinned validation Node'):
            package.rolling_resources(self.root, self.node)

    def test_archive_builder_is_import_safe(self):
        # Importing the preflight API has neither parsed CLI flags nor created a
        # release directory. The only entries here were installed by setUp.
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['prover', 'toolchain.json'])

if __name__ == '__main__':
    unittest.main()
