"""Origin input closure tests; no network requests or archive downloads."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verify_noir_origins', pathlib.Path(__file__).with_name('verify-noir-origins.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class OwnerOriginalsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='owner-origins-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        self.record = {'version':'v6.0.0','packages':{name:{'files':{'Nargo.toml':'a'*64,'src/lib.nr':'b'*64}} for name in ['aztec','balance-set','uint-note']}}
        self.path = self.root / 'scripts/owner-delivery-noir-sources.json'
        self.path.write_text(json.dumps(self.record))
        self.lock = {'ownerDelivery':'.build/owner-delivery/aztec-nr','packages':{'dependencies/github.com/other/lib/v1':{'files':{'src/lib.nr':'c'*64}}}}

    def test_generated_graph_retains_all_original_official_archive_inputs(self):
        packages, digest = verifier.packages_with_owner_sources(self.lock, self.root)
        self.assertEqual(len(packages),4)
        for name, entry in self.record['packages'].items():
            self.assertEqual(packages['dependencies/github.com/aztec-labs-eng/aztec-nr/v6.0.0/'+name],entry)
        self.assertEqual(digest,verifier.digest(self.path.read_bytes()))
        self.assertEqual(len(self.lock['packages']),1)

    def test_matching_originals_deduplicate_but_conflicts_fail(self):
        name='dependencies/github.com/aztec-labs-eng/aztec-nr/v6.0.0/aztec'
        self.lock['packages'][name]=self.record['packages']['aztec']
        self.assertEqual(len(verifier.packages_with_owner_sources(self.lock,self.root)[0]),4)
        self.lock['packages'][name]={'files':{'different':'d'*64}}
        with self.assertRaisesRegex(ValueError,'Conflicting'):verifier.packages_with_owner_sources(self.lock,self.root)

    def test_unknown_generated_directory_or_original_inventory_fails(self):
        self.lock['ownerDelivery']='unregistered'
        with self.assertRaisesRegex(ValueError,'Unknown'):verifier.packages_with_owner_sources(self.lock,self.root)
        self.lock['ownerDelivery']='.build/owner-delivery/aztec-nr'
        del self.record['packages']['aztec'];self.path.write_text(json.dumps(self.record))
        with self.assertRaisesRegex(ValueError,'Unexpected'):verifier.packages_with_owner_sources(self.lock,self.root)

    def test_ordinary_external_lock_does_not_add_generated_inputs(self):
        del self.lock['ownerDelivery'];self.path.unlink()
        packages,digest=verifier.packages_with_owner_sources(self.lock,self.root)
        self.assertEqual(packages,self.lock['packages']);self.assertIsNone(digest)


if __name__=='__main__':unittest.main()
