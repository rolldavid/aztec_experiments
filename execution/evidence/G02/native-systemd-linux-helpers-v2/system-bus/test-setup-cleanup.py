"""Controlled transport/persistence doubles only; no Docker or provider calls."""
import importlib.util,json,pathlib,subprocess,types,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).with_name('setup.py')
spec=importlib.util.spec_from_file_location('owned_setup',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CID='a'*64
STATE={'Status':'running','Running':True,'ExitCode':0,'OOMKilled':False,'Dead':False}
class OwnedCleanup(unittest.TestCase):
 def exercise(self,state=None,persist_fails=False,fail_operations=(),remaining=b'',remaining_code=0,cid=CID,owned=True):
  calls=[];saved=[];r={}
  def call(args,**kw):
   self.assertTrue(kw['cleanup']);calls.append(args)
   if args[0] in fail_operations:raise TimeoutError('controlled')
   if args[0]=='inspect':
    if isinstance(state,BaseException):raise state
    return types.SimpleNamespace(returncode=0,stdout=json.dumps(STATE).encode() if state is None else state)
   if args[0]=='ps':return types.SimpleNamespace(returncode=remaining_code,stdout=remaining)
   self.assertEqual(args[-1],CID)
   return types.SimpleNamespace(returncode=0,stdout=b'')
  def persist(value):
   saved.append(True)
   if persist_fails:raise OSError('controlled fsync')
  with patch.object(subprocess,'run',side_effect=AssertionError('No real command')):
   m.cleanup_owned(cid,call,persist,r,owned=owned)
  return r,calls,saved
 def mutations(self,calls):return [x[0] for x in calls if x[0] in ('kill','wait','rm')]
 def test_normal_owned_cleanup_requires_positive_absence(self):
  r,c,s=self.exercise();self.assertTrue(r['containerAbsent']);self.assertEqual(self.mutations(c),['kill','wait','rm']);self.assertEqual(s,[True]);self.assertNotIn('cleanupDiagnosticErrors',r)
 def test_state_timeout_cannot_skip_owned_cleanup(self):
  r,c,_=self.exercise(state=TimeoutError());self.assertTrue(r['containerAbsent']);self.assertEqual(self.mutations(c),['kill','wait','rm']);self.assertIn('state-unavailable',r['cleanupDiagnosticErrors'])
 def test_malformed_or_missing_state_cannot_skip_owned_cleanup(self):
  for state in (b'not-json',b'{}',b'[]'):
   with self.subTest(state=state):
    r,c,_=self.exercise(state=state);self.assertTrue(r['containerAbsent']);self.assertEqual(self.mutations(c),['kill','wait','rm'])
 def test_before_cleanup_persistence_failure_cannot_skip_owned_cleanup(self):
  r,c,_=self.exercise(persist_fails=True);self.assertTrue(r['containerAbsent']);self.assertEqual(self.mutations(c),['kill','wait','rm']);self.assertIn('evidence-unavailable',r['cleanupDiagnosticErrors'])
 def test_multiple_failure_still_attempts_removal_and_absence(self):
  r,c,_=self.exercise(state=TimeoutError(),persist_fails=True,fail_operations=('kill','wait'));self.assertTrue(r['containerAbsent']);self.assertEqual([x[0] for x in c],['inspect','kill','wait','rm','ps'])
 def test_removal_failure_still_checks_actual_absence(self):
  r,c,_=self.exercise(fail_operations=('rm',),remaining=CID.encode());self.assertFalse(r['containerAbsent']);self.assertEqual(c[-1][0],'ps');self.assertEqual(r['cleanupError'],'cleanup-unverified')
 def test_unknown_or_foreign_identity_never_mutates(self):
  for cid in (None,'','foreign-name','a'*63,123):
   with self.subTest(cid=cid):
    r,c,s=self.exercise(cid=cid);self.assertEqual(c,[]);self.assertEqual(s,[]);self.assertIsNone(r['containerAbsent']);self.assertEqual(r['cleanupError'],'ownership-unverified')
 def test_valid_shaped_unknown_id_never_mutates(self):
  r,c,s=self.exercise(cid=CID,owned=False);self.assertEqual(c,[]);self.assertEqual(s,[]);self.assertIsNone(r['containerAbsent'])
 def test_absence_transport_failure_is_not_absence(self):
  r,_,_=self.exercise(fail_operations=('ps',));self.assertIsNone(r['containerAbsent'])
  r,_,_=self.exercise(remaining_code=1);self.assertFalse(r['containerAbsent'])
if __name__=='__main__':unittest.main(verbosity=2)
