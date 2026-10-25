"""Bounded actual publisher helper tests; no systemd, host or service operations."""
import ast,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parent
class DrainFailure(unittest.TestCase):
 def test_publishers(self):
  for host in ('bok','core'):
   tree=ast.parse((ROOT/host/'publish.py').read_text())
   helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='restore_after_drain_failure')
   main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
   remover=next(n for n in main.body if isinstance(n,ast.FunctionDef) and n.name=='remove_drain')
   # Actual call sites cover partial add/reload failure and rollback-drain failure.
   guards=[n for n in ast.walk(main) if isinstance(n,ast.Try) and any(any(isinstance(v,ast.Expr) and isinstance(v.value,ast.Call) and isinstance(v.value.func,ast.Name) and v.value.func.id=='restore_after_drain_failure' for v in h.body) for h in n.handlers)]
   self.assertEqual(len(guards),2)
   self.assertIn('add_drain(False)',ast.unparse(guards[0]));self.assertIn('drain(False)',ast.unparse(guards[0]))
   self.assertIn('drain(switched)',ast.unparse(guards[1]))
   for pid,active,empty,starts in [('8','active',False,False),('0','inactive',True,True),('0','failed',True,True),('0','inactive',False,False),('0','activating',True,False)]:
    with self.subTest(host=host,pid=pid,active=active,empty=empty):
     calls=[];ns={'state':lambda:{'MainPID':pid,'ActiveState':active},'empty_group':lambda g:empty,'run':lambda c:calls.append(c),'UNIT':'exact.service'}
     exec(compile(ast.Module(body=[helper],type_ignores=[]),str(ROOT/host/'publish.py'),'exec'),ns)
     ns['restore_after_drain_failure'](lambda:calls.append('remove'),lambda:calls.append('settings'),'/exact')
     self.assertEqual(calls[:2],['remove','settings']);self.assertEqual(len(calls),3 if starts else 2)
     if starts:self.assertEqual(calls[2],['systemctl','start','exact.service'])
   class Drop:
    present=True;linked=False;data=b'[Service]\nRestart=no\n';owner=0
    def exists(self):return self.present
    def is_symlink(self):return self.linked
    def read_bytes(self):return self.data
    def stat(self):return type('Stat',(),{'st_uid':self.owner})()
    def unlink(self):self.present=False
   for variant in ('owned','absent','foreign','symlink','wrong-owner'):
    with self.subTest(host=host,drop=variant):
     d=Drop();calls=[]
     if variant=='absent':d.present=False
     if variant=='foreign':d.data=b'foreign'
     if variant=='symlink':d.linked=True
     if variant=='wrong-owner':d.owner=1000
     ns={'DROP':d,'DROP_BYTES':Drop.data,'run':lambda c:calls.append(c)}
     exec(compile(ast.Module(body=[remover],type_ignores=[]),str(ROOT/host/'publish.py'),'exec'),ns)
     if variant in ('owned','absent'):
      ns['remove_drain']();self.assertFalse(d.present);self.assertEqual(calls,[['systemctl','daemon-reload']])
     else:
      with self.assertRaises(AssertionError):ns['remove_drain']()
      self.assertTrue(d.present);self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
