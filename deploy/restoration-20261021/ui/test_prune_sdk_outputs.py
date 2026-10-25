import importlib.util,pathlib,tempfile,json,hashlib,os,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prune',pathlib.Path(__file__).with_name('prune-inactive-sdk-outputs.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name).resolve();self.release=self.root/'old';self.sdk=self.release/'.build/sdk';self.sdk.mkdir(parents=True);self.file=self.sdk/'bundle.js';self.file.write_bytes(b'generated');self.manifest=self.sdk/'sdk-manifest.json';self.manifest.write_text(json.dumps({'outputs':{'bundle.js':hashlib.sha256(b'generated').hexdigest()}}));self.plan={'candidates':[str(self.release)],'protected':[str(self.root/'current')]}
 def run_prune(self,apply=True,refs=lambda:set()):return m.prune(self.plan,apply,refs,(self.root,))
 def test_dry_run(self):
  self.assertEqual(self.run_prune(False)['files'],1);self.assertTrue(self.file.exists())
 def test_only_outputs(self):
  extra=self.release/'credentials.json';extra.write_text('protected fixture');native=self.release/'node_modules/native';native.parent.mkdir();native.write_text('native');self.run_prune();self.assertFalse(self.file.exists());self.assertTrue(self.manifest.exists());self.assertTrue(extra.exists());self.assertTrue(native.exists())
 def test_live_reference(self):
  self.assertEqual(self.run_prune(refs=lambda:{self.release})['files'],0);self.assertTrue(self.file.exists())
 def test_protected(self):
  self.plan['protected'].append(str(self.release));self.assertEqual(self.run_prune()['files'],0)
 def test_reference_change(self):
  calls=iter([set(),{self.release}]);
  with self.assertRaises(AssertionError):self.run_prune(refs=lambda:next(calls))
  self.assertTrue(self.file.exists())
 def test_old_generated_bytes_need_no_repair(self):
  self.file.write_text('changed')
  self.run_prune();self.assertFalse(self.file.exists());self.assertTrue(self.manifest.exists())
 def test_symlink_leaf(self):
  self.file.unlink();target=self.root/'target';target.write_text('generated');self.file.symlink_to(target)
  with self.assertRaises(AssertionError):self.run_prune()
  self.assertTrue(target.exists())
 def test_hardlink_preserved(self):
  other=self.root/'retained';os.link(self.file,other);result=self.run_prune();self.assertEqual(result['reclaimableAllocatedBytes'],0);self.assertEqual(other.read_text(),'generated')
 def test_all_links_accounted_once(self):
  second=self.root/'old2';sdk=second/'.build/sdk';sdk.mkdir(parents=True);os.link(self.file,sdk/'bundle.js');(sdk/'sdk-manifest.json').write_bytes(self.manifest.read_bytes());self.plan['candidates'].append(str(second));expected=self.file.stat().st_blocks*512;result=self.run_prune();self.assertEqual(result['reclaimableAllocatedBytes'],expected);self.assertFalse((sdk/'bundle.js').exists())
 def test_generated_outputs_are_not_rehashed(self):
  second=self.root/'old2';sdk=second/'.build/sdk';sdk.mkdir(parents=True);os.link(self.file,sdk/'bundle.js');(sdk/'sdk-manifest.json').write_bytes(self.manifest.read_bytes());self.plan['candidates'].append(str(second));original=m.digest;reads=[]
  def counted(path):
   if path.name=='bundle.js':reads.append(path)
   return original(path)
  m.digest=counted
  try:self.run_prune();self.assertEqual(len(reads),0)
  finally:m.digest=original
 def test_changed_after_hash_refuses_unlink(self):
  calls=0
  def refs():
   nonlocal calls
   calls+=1
   if calls==2:self.file.write_bytes(b'modified!')
   return set()
  with self.assertRaises(AssertionError):self.run_prune(refs=refs)
  self.assertTrue(self.file.exists())
 def test_actual_bok_and_moderator_config_roots_are_references(self):
  for folder in ('etc/rolling-bok-testnet','etc/rolling-moderator'):
   directory=self.root/folder;directory.mkdir(parents=True)
   (directory/'config.json').write_text(json.dumps({'source':'/opt/rolling-app/releases/protected-'+directory.name}))
  (self.root/'proc').mkdir();(self.root/'opt').mkdir()
  original=m.P
  def mapped(value):
   path=original(value)
   return self.root/str(path).lstrip('/') if path.is_absolute() else path
  with patch.object(m,'P',mapped),patch.object(m.subprocess,'check_output',return_value=''):
   found=m.references()
  self.assertEqual(found,{self.root/'opt/rolling-app/releases/protected-rolling-bok-testnet',self.root/'opt/rolling-app/releases/protected-rolling-moderator'})
 def test_traversal(self):
  self.manifest.write_text(json.dumps({'outputs':{'../credentials.json':'a'*64}}))
  with self.assertRaises(AssertionError):self.run_prune()
 def test_symlink_parent(self):
  self.sdk.rename(self.release/'real');self.sdk.symlink_to(self.release/'real')
  with self.assertRaises(AssertionError):self.run_prune()
if __name__=='__main__':unittest.main()
