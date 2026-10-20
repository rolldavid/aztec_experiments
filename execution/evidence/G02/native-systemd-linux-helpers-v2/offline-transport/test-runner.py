"""Labelled in-memory Docker doubles only; no Docker/systemd/network calls."""
import ast,importlib.util,json,os,pathlib,tempfile,types,unittest
from unittest.mock import patch
p=pathlib.Path(__file__).with_name('run.py');spec=importlib.util.spec_from_file_location('offline_runner',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CID='a'*64
def actual_fixture():
 return {'Image':m.IMAGE,'HostConfig':{'NetworkMode':'none','CgroupnsMode':'private','PidMode':'','IpcMode':'private','Privileged':False,'ReadonlyRootfs':True,'Binds':None,'Devices':[],'DeviceRequests':None,'Memory':536870912,'MemorySwap':536870912,'NanoCpus':2000000000,'PidsLimit':128,'CapAdd':['CAP_SYS_ADMIN'],'CapDrop':['CAP_NET_BIND_SERVICE','CAP_NET_RAW'],'SecurityOpt':['no-new-privileges'],'LogConfig':{'Type':'none'},'Tmpfs':dict(m.TMPFS)},'Mounts':[],'Config':{'Env':['container=docker','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']}}
class Boundary(unittest.TestCase):
 def cleanup(self,failed=None,persist_failed=False):
  calls=[];report={}
  def call(args,**kwargs):
   calls.append(args[0])
   if args[0]==failed:raise TimeoutError('labelled-double')
   data=json.dumps({'Status':'running','Running':True,'ExitCode':0,'OOMKilled':False,'Dead':False}).encode() if args[0]=='inspect' else b''
   return types.SimpleNamespace(returncode=0,stdout=data)
  def persist():
   if persist_failed:raise OSError('labelled-double')
  m.cleanup(CID,call,report,persist);return calls,report
 def test_state_failure_cannot_skip_cleanup(self):
  calls,r=self.cleanup('inspect');self.assertEqual(calls,['inspect','kill','wait','rm','ps']);self.assertTrue(r['containerAbsent']);self.assertIn('state-unavailable',r['cleanupErrors'])
 def test_persistence_failure_cannot_skip_cleanup(self):
  calls,r=self.cleanup(persist_failed=True);self.assertEqual(calls,['inspect','kill','wait','rm','ps']);self.assertTrue(r['containerAbsent']);self.assertIn('evidence-unavailable',r['cleanupErrors'])
 def test_removal_failure_does_not_suppress_absence(self):
  calls,r=self.cleanup('rm');self.assertEqual(calls[-1],'ps');self.assertIn('rm-unavailable',r['cleanupErrors'])
 def test_unknown_identity_never_mutates(self):
  r={};m.cleanup(None,lambda *a,**k:self.fail('foreign mutation'),r,lambda:self.fail('persistence'));self.assertIsNone(r['containerAbsent'])
 def test_absence_transport_failure_not_positive_absence(self):
  _,r=self.cleanup('ps');self.assertIsNone(r['containerAbsent'])
 def test_state_rejects_unbounded_or_wrong_types(self):
  for value in ({},[],{'Status':'SECRET','Running':True,'ExitCode':0,'OOMKilled':False,'Dead':False},{'Status':'exited','Running':False,'ExitCode':True,'OOMKilled':False,'Dead':False}):
   with self.assertRaises((ValueError,KeyError)):m.state(value)
 def test_positive_confinement_and_each_unsafe_variant(self):
  h={'NetworkMode':'none','CgroupnsMode':'private','PidMode':'','IpcMode':'private','Privileged':False,'ReadonlyRootfs':True,'Binds':None,'Devices':[],'DeviceRequests':None,'Memory':536870912,'MemorySwap':536870912,'NanoCpus':2000000000,'PidsLimit':128,'CapAdd':['CAP_SYS_ADMIN'],'CapDrop':['CAP_NET_RAW','CAP_NET_BIND_SERVICE'],'SecurityOpt':['no-new-privileges'],'LogConfig':{'Type':'none'},'Tmpfs':m.TMPFS}
  info={'Image':m.IMAGE,'HostConfig':h,'Mounts':[],'Config':{'Env':['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','container=docker']}}
  self.assertTrue(m.confined(info))
  for key,value in [('NetworkMode','bridge'),('CgroupnsMode','host'),('Privileged',True),('ReadonlyRootfs',False),('Binds',['/:/host']),('Memory',0),('SecurityOpt',['seccomp=unconfined']),('CapAdd',['SYS_ADMIN','SYS_PTRACE'])]:
   unsafe={**info,'HostConfig':{**h,key:value}}
   with self.assertRaises(ValueError):m.confined(unsafe)
 def test_exact_measured_fixture_and_only_order_changes_pass(self):
  v=actual_fixture();self.assertTrue(m.confined(v));v['Config']['Env'].reverse();v['HostConfig']['CapDrop'].reverse();self.assertTrue(m.confined(v))
 def test_environment_rejects_duplicates_extras_missing_wrong_values_types(self):
  expected=actual_fixture()['Config']['Env']
  for env in (None,{},tuple(expected),[],[expected[0]],[expected[0],expected[0]],expected+['PRIVATE=sentinel'],['container=host',expected[1]],['container=docker','PATH=/private'],[True,expected[1]],[{'private':'sentinel'},expected[1]]):
   v=actual_fixture();v['Config']['Env']=env
   with self.assertRaises((ValueError,TypeError)):m.confined(v)
 def test_capabilities_accept_only_exact_measured_names_and_counts(self):
  for key,value in [('CapAdd',['SYS_ADMIN']),('CapAdd',['CAP_SYS_ADMIN','CAP_SYS_ADMIN']),('CapAdd',['CAP_SYS_ADMIN','CAP_SYS_PTRACE']),('CapAdd',[]),('CapDrop',['NET_RAW','NET_BIND_SERVICE']),('CapDrop',['CAP_NET_RAW']),('CapDrop',['CAP_NET_RAW','CAP_NET_RAW']),('CapDrop',['CAP_NET_RAW','CAP_NET_BIND_SERVICE','CAP_NET_RAW']),('CapDrop',['ALL']),('CapDrop',None)]:
   v=actual_fixture();v['HostConfig'][key]=value
   with self.assertRaises((ValueError,TypeError)):m.confined(v)
 def test_other_confinement_failures_still_reject_measured_representation(self):
  for key,value in [('NetworkMode','bridge'),('CgroupnsMode','host'),('PidMode','host'),('IpcMode','host'),('Privileged',True),('ReadonlyRootfs',False),('Binds',['/:/private']),('Memory',0),('MemorySwap',0),('NanoCpus',0),('PidsLimit',0),('SecurityOpt',['seccomp=unconfined']),('Tmpfs',{})]:
   v=actual_fixture();v['HostConfig'][key]=value
   with self.assertRaises(ValueError):m.confined(v)
 def test_production_subset_and_workload_unchanged(self):
  old=p.parent.parent/'offline-measured'
  self.assertEqual(p.with_name('native-subset.py').read_bytes(),(old/'native-subset.py').read_bytes())
  def case_body(path):
   tree=ast.parse(path.read_text());return ast.dump(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='case'))
  self.assertEqual(case_body(p.with_name('driver.py')),case_body(old/'driver.py'))

STAMP='2026-10-13T12:00:00.123456789Z'
def running(**changes):return {'Running':True,'Restarting':False,'Pid':123,'StartedAt':STAMP,**changes}
class Transport(unittest.TestCase):
 def test_exact_systemd_barrier(self):
  r=m.systemd_barrier(running(),b'PID COMMAND\n123 systemd\n124 python3\n',running())
  self.assertEqual(r,{'status':'ready','identity':{'pid':123,'startedAt':STAMP},'processCount':2})
 def test_boot_pending_never_accepts_other_systemd(self):
  r=m.systemd_barrier(running(),b'PID COMMAND\n123 python3\n124 systemd\n',running())
  self.assertEqual(r['status'],'boot-pending')
  self.assertEqual(m.systemd_barrier(running(),b'PID COMMAND\n123 systemd-evil\n',running())['status'],'boot-pending')
 def test_identity_races_and_types_reject(self):
  for changed in (running(Pid=124),running(StartedAt='2026-10-13T12:00:01Z'),running(Running=False),running(Restarting=True),running(Pid=True),running(StartedAt='secret'),[]):
   self.assertEqual(m.systemd_barrier(running(),b'PID COMMAND\n123 systemd\n',changed)['status'],'identity-unavailable-or-changed')
 def test_duplicate_missing_malformed_oversize_rows_reject(self):
  for data in (b'PID COMMAND\n123 systemd\n123 systemd\n',b'PID COMMAND\n124 systemd\n',b'PID COMMAND\n123 systemd injected\n',b'PID ARGS\n123 systemd\n',b'x'*8193,b'PID COMMAND\n123 \xff\n'):
   self.assertNotEqual(m.systemd_barrier(running(),data,running())['status'],'ready')
 def invoke(self,data,states=None,name='regression.json'):
  calls=[];states=iter(states or [running(),running()])
  def call(args,**kwargs):calls.append((args,kwargs));return types.SimpleNamespace(returncode=0,stdout=data)
  value=m.read_after_barrier(CID,{'pid':123,'startedAt':STAMP},name,lambda:next(states),call,'fixed-reader')
  return value,calls
 def test_fixed_reader_command_and_missing(self):
  value,calls=self.invoke(b'{"status":"missing"}')
  self.assertIsNone(value);self.assertEqual(calls,[(['exec','--user','0',CID,'/usr/bin/python3','-c','fixed-reader','regression.json'],{'limit':2})])
 def test_reader_rechecks_identity_before_and_after(self):
  for states in ([running(Pid=124)],[running(),running(Pid=124)]):
   with self.assertRaises(ValueError):self.invoke(b'{"status":"read","record":{"passed":true}}',states)
  calls=[]
  with self.assertRaises(ValueError):m.read_after_barrier(CID,None,'regression.json',lambda:running(),lambda *a,**k:calls.append(a),'fixed')
  self.assertEqual(calls,[])
 def test_reader_envelope_partial_oversize_invalid_paths(self):
  for data in (b'{',b'[]',b'{"status":"read","record":[]}',b'{"status":"missing","secret":"x"}',b'{"status":"invalid-record"}',b'x'*17409,json.dumps({'status':'read','record':{'x':'a'*16384}}).encode()):
   with self.assertRaises((ValueError,json.JSONDecodeError)):self.invoke(data)
  with self.assertRaises(ValueError):self.invoke(b'{}',name='../private')
 def test_finite_boot_exit_projection(self):
  for code,phase in m.BOOT_CODES.items():
   v={'Status':'exited','Running':False,'ExitCode':code,'OOMKilled':False,'Dead':False}
   self.assertEqual(m.boot_failure(v),{'status':'boot-phase-failure','phase':phase})
   self.assertEqual(m.boot_failure({**v,'OOMKilled':True})['status'],'unclassified-container-exit')
  self.assertEqual(m.boot_failure({**v,'ExitCode':2})['status'],'unclassified-container-exit')
 def reader(self):
  spec=importlib.util.spec_from_file_location('receipt_reader',p.with_name('receipt-reader.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
 def test_real_file_reader_bounds_partial_and_symlink(self):
  reader=self.reader();original_open=os.open
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);f=root/'regression.json'
   def mapped(path,flags,*args):
    self.assertEqual(path,'/run/regression.json');self.assertTrue(flags&os.O_NOFOLLOW);self.assertTrue(flags&os.O_NONBLOCK)
    return original_open(root/'regression.json',flags,*args)
   with patch.object(reader.os,'open',mapped):
    self.assertEqual(reader.read_receipt('regression.json'),{'status':'missing'})
    for content,status in [(b'{"ok":true}','read'),(b'{','invalid-record'),(b'[]','invalid-record'),(b'x'*16385,'invalid-file')]:
     f.write_bytes(content);self.assertEqual(reader.read_receipt('regression.json')['status'],status)
    f.unlink();target=root/'target';target.write_text('{"secret":"sentinel"}');f.symlink_to(target)
    self.assertEqual(reader.read_receipt('regression.json')['status'],'invalid-record')
 def test_file_mutation_during_read_is_rejected(self):
  reader=self.reader();before=types.SimpleNamespace(st_mode=0o100444,st_size=2,st_ino=1,st_mtime_ns=1);after=types.SimpleNamespace(**{**vars(before),'st_mtime_ns':2})
  with patch.object(reader.os,'open',return_value=42),patch.object(reader.os,'fstat',side_effect=[before,after]),patch.object(reader.os,'read',return_value=b'{}'),patch.object(reader.os,'close'):
   self.assertEqual(reader.read_receipt('regression.json'),{'status':'invalid-file'})
 def publisher(self,root):
  tree=ast.parse(p.with_name('driver.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='save')
  namespace={'json':json,'os':os,'pathlib':pathlib,'receipt':{'passed':True},'RECEIPT_DIRECTORY':str(root)}
  exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual-publication>','exec'),namespace);return namespace['save']
 def test_atomic_complete_publication_and_no_overwrite(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);publish=self.publisher(root);real_link=os.link
   def observe(src,dst,**kwargs):
    self.assertFalse(pathlib.Path(dst).exists());self.assertEqual(json.loads(pathlib.Path(src).read_bytes()),{'passed':True});return real_link(src,dst,**kwargs)
   with patch.object(os,'link',observe):publish()
   self.assertEqual(json.loads((root/'regression.json').read_bytes()),{'passed':True});self.assertFalse((root/'regression.pending').exists())
   with self.assertRaises(FileExistsError):publish()
   self.assertEqual(json.loads((root/'regression.json').read_bytes()),{'passed':True})
 def test_partial_publication_never_becomes_final(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);publish=self.publisher(root)
   with patch.object(os,'write',return_value=1):
    with self.assertRaises(OSError):publish()
   self.assertFalse((root/'regression.json').exists())
 def test_boot_phase_codes_and_embedded_bytes(self):
  tree=ast.parse(p.with_name('boot-bound.py').read_text());assignments={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('PUBLIC_FILES','BOOT_CODES')}
  self.assertEqual(assignments['BOOT_CODES'],{v:k for k,v in m.BOOT_CODES.items()})
  for name,text in assignments['PUBLIC_FILES'].items():self.assertEqual(text,p.with_name(name).read_text())
  self.assertNotIn('sleep(45)',p.with_name('boot-bound.py').read_text())
if __name__=='__main__':unittest.main(verbosity=2)
