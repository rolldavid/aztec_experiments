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
  old=p.parent.parent/'offline-transport'
  self.assertEqual(p.with_name('native-subset.py').read_bytes(),(old/'native-subset.py').read_bytes())
  def case_body(path):
   tree=ast.parse(path.read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='case')
   class RemoveCheckpoints(ast.NodeTransformer):
    def visit_Expr(self,n):return None if isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id in ('checkpoint','check_reload_space') else self.generic_visit(n)
   return ast.dump(RemoveCheckpoints().visit(node))
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
class DriverPhases(unittest.TestCase):
 def driver_namespace(self):
  tree=ast.parse(p.with_name('driver.py').read_text());subset=ast.parse(p.with_name('native-subset.py').read_text())
  constants={n.targets[0].id:ast.literal_eval(n.value) for n in subset.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('CAPTURE','UNIT')}
  ns={'json':json,'os':os,'pathlib':pathlib,'stat':__import__('stat'),'subprocess':__import__('subprocess'),'math':__import__('math'),'hashlib':__import__('hashlib'),'time':types.SimpleNamespace(sleep=lambda _:None),'NATIVE_UNIT':'rolling-native-version.service','receipt':{'passed':False,'nativeQualified':False,'cases':[]},**constants}
  selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('checkpoint','check_reload_space','result_availability','failure_observation','original_exception','case') or isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('PHASES','LABELS')]
  exec(compile(ast.Module(body=selected,type_ignores=[]),'<actual-driver-functions>','exec'),ns)
  # Existing43 phase tests isolate their original operations. The real bus helper
  # was separately exercised by25 controls; new binding tests below gate equality.
  ns['require_system_bus']=lambda:None
  return ns,next(n for n in tree.body if isinstance(n,ast.Try))
 def drive(self,fail_at):
  ns,body=self.driver_namespace();events=[];failed=False
  def operation(kind):
   nonlocal failed
   mark=dict(ns['receipt'].get('checkpoint',{}));events.append((kind,mark))
   if not failed and mark.get('operation')==fail_at:failed=True;raise OSError('secret-sentinel-never-retained')
  ns['write']=lambda *a,**k:operation('write');ns['run']=lambda *a,**k:operation('run')
  def native_state():operation('native_state');return {'status':'observed','ActiveState':'inactive','SubState':'dead','Result':'success','ExecMainCode':1,'ExecMainStatus':0,'ExecMainStartTimestampMonotonic':1}
  ns['native_state']=native_state;ns['native_retain_execution']=lambda:operation('retain')
  def read(path):operation('read');return {'labelledFixture':True}
  ns['read_bounded_json']=read;ns['native_result']=lambda r:r
  ns['native_classify']=lambda a,b:{'baseline':'passed','success':'passed','nonzero':'nonzero','timeout':'timeout'}[ns['receipt']['checkpoint']['label']]
  ns['save']=lambda:events.append(('save',dict(ns['receipt'].get('checkpoint',{}))))
  with patch.object(pathlib.Path,'exists',return_value=False),patch.object(os,'lstat',side_effect=FileNotFoundError),patch.object(os,'statvfs',return_value=types.SimpleNamespace(f_bsize=4096,f_blocks=8192,f_bfree=7936)):exec(compile(ast.Module(body=[body],type_ignores=[]),'<actual-driver-flow>','exec'),ns)
  return ns['receipt'],events
 def test_timer_failures_keep_exact_phase_without_later_work(self):
  for phase in ('timer-service-write','timer-unit-write','timers-reload','timer-start'):
   receipt,events=self.drive(phase);self.assertFalse(receipt['passed']);self.assertEqual(receipt['checkpoint']['operation'],phase);self.assertEqual(receipt['cases'],[])
   self.assertEqual(receipt['failureObservation']['resultAvailability'],{'status':'not-applicable'});self.assertEqual(events[-1][0],'save');self.assertNotIn('secret-sentinel',json.dumps(receipt))
 def test_case_failures_keep_native_state_and_missing_result(self):
  for phase in ('worker-write','unit-write','case-reload','before-state','result-read'):
   receipt,events=self.drive(phase);self.assertFalse(receipt['passed']);self.assertEqual(receipt['checkpoint']['operation'],phase);self.assertEqual(receipt['checkpoint']['label'],'baseline')
   self.assertEqual(receipt['failureObservation']['nativeState']['status'],'observed');self.assertEqual(receipt['failureObservation']['resultAvailability'],{'status':'missing'});self.assertEqual(events[-1][0],'save')
 def test_success_keeps_all_four_cases_and_final_assertions(self):
  receipt,events=self.drive(None);self.assertTrue(receipt['passed']);self.assertEqual([x['label'] for x in receipt['cases']],['baseline','success','nonzero','timeout']);self.assertEqual(receipt['checkpoint']['operation'],'complete');self.assertNotIn('failureObservation',receipt)
 def test_result_availability_never_opens_content(self):
  ns,_=self.driver_namespace();f=ns['result_availability']
  for mode,size,expected in [(0o100444,12,{'status':'regular','bytes':12}),(0o120777,12,{'status':'not-regular'}),(0o040755,12,{'status':'not-regular'}),(0o100444,16385,{'status':'oversized'})]:
   with patch.object(os,'lstat',return_value=types.SimpleNamespace(st_mode=mode,st_size=size)) as read,patch.object(os,'open',side_effect=AssertionError('must not open')):
    self.assertEqual(f('baseline'),expected);read.assert_called_once_with('/var/lib/rolling-fixture-baseline/result.json')
 def test_diagnostic_failure_cannot_replace_primary_outcome(self):
  ns,body=self.driver_namespace();ns['write']=lambda *a,**k:(_ for _ in ()).throw(OSError('private-primary'));ns['failure_observation']=lambda:(_ for _ in ()).throw(OSError('private-secondary'));saved=[];ns['save']=lambda:saved.append(True)
  exec(compile(ast.Module(body=[body],type_ignores=[]),'<actual-driver-flow>','exec'),ns)
  self.assertEqual(saved,[True]);self.assertFalse(ns['receipt']['passed']);self.assertEqual(ns['receipt']['failureObservation'],{'status':'diagnostic-unavailable'});self.assertNotIn('private-',json.dumps(ns['receipt']))
 def test_checkpoint_schema_is_closed_and_state_exception_is_finite(self):
  ns,_=self.driver_namespace()
  for args in [('secret',),('timer-start','secret'),('timer-start','none','secret')]:
   with self.assertRaises(ValueError):ns['checkpoint'](*args)
  ns['checkpoint']('result-read','baseline');ns['native_state']=lambda:(_ for _ in ()).throw(OSError('private-error'))
  with patch.object(os,'lstat',side_effect=PermissionError('private-path')):self.assertEqual(ns['failure_observation'](),{'nativeState':{'status':'transport-error'},'resultAvailability':{'status':'unavailable'}})
class OriginalException(unittest.TestCase):
 def project(self,error):return DriverPhases().driver_namespace()[0]['original_exception'](error)
 def test_called_process_keeps_only_finite_return_code(self):
  import subprocess
  for code in (-9,0,1,255):
   e=subprocess.CalledProcessError(code,['PRIVATE_COMMAND'],output=b'PRIVATE_OUTPUT',stderr=b'PRIVATE_STDERR')
   self.assertEqual(self.project(e),{'category':'called-process-error','returnCode':code})
 def test_timeout_keeps_only_finite_seconds(self):
  import subprocess
  for seconds in (3,20,0.5,120):
   e=subprocess.TimeoutExpired('PRIVATE_COMMAND',seconds,output=b'PRIVATE_OUTPUT',stderr=b'PRIVATE_STDERR')
   self.assertEqual(self.project(e),{'category':'timeout-expired','timeoutSeconds':seconds})
 def test_unknown_subclasses_getters_and_messages_are_untouched(self):
  import subprocess
  calls=[]
  class Private(subprocess.CalledProcessError):
   def __getattribute__(self,name):calls.append(name);raise AssertionError('getter must not run')
   def __str__(self):raise AssertionError('message must not run')
   def __repr__(self):raise AssertionError('repr must not run')
  e=Private(1,'PRIVATE_COMMAND');self.assertEqual(self.project(e),{'category':'unknown'});self.assertEqual(calls,[])
  self.assertEqual(self.project(RuntimeError('PRIVATE_MESSAGE')),{'category':'unknown'})
 def test_malformed_scalar_values_cannot_coerce_or_leak(self):
  import subprocess
  class Private:
   def __float__(self):raise AssertionError('coercion')
   def __int__(self):raise AssertionError('coercion')
   def __str__(self):raise AssertionError('coercion')
  for code in (True,256,-256,'PRIVATE',None,Private()):self.assertEqual(self.project(subprocess.CalledProcessError(code,'PRIVATE')),{'category':'called-process-error'})
  for seconds in (True,0,-1,121,10**1000,float('nan'),float('inf'),'PRIVATE',None,Private()):self.assertEqual(self.project(subprocess.TimeoutExpired('PRIVATE',seconds)),{'category':'timeout-expired'})
 def test_os_error_reveals_no_path_errno_or_message(self):
  self.assertEqual(self.project(OSError(5,'PRIVATE_MESSAGE','PRIVATE_PATH')),{'category':'os-error'})
  self.assertEqual(self.project(FileNotFoundError('PRIVATE_PATH')),{'category':'unknown'})
 def test_outer_failure_preserved_when_diagnostic_fails(self):
  import subprocess
  fixtures=[(subprocess.CalledProcessError(7,'PRIVATE_COMMAND',stderr=b'PRIVATE_STDERR'),{'category':'called-process-error','returnCode':7}),(subprocess.TimeoutExpired('PRIVATE_COMMAND',3,stderr=b'PRIVATE_STDERR'),{'category':'timeout-expired','timeoutSeconds':3}),(OSError('PRIVATE_OS'),{'category':'os-error'}),(RuntimeError('PRIVATE_UNKNOWN'),{'category':'unknown'})]
  for error,expected in fixtures:
   ns,body=DriverPhases().driver_namespace();ns['write']=lambda *a,**k:(_ for _ in ()).throw(error);ns['failure_observation']=lambda:(_ for _ in ()).throw(OSError('PRIVATE_SECONDARY'));saved=[];ns['save']=lambda:saved.append(True)
   exec(compile(ast.Module(body=[body],type_ignores=[]),'<actual-driver-flow>','exec'),ns)
   self.assertEqual(saved,[True]);self.assertEqual(ns['receipt']['originalException'],expected);self.assertEqual(ns['receipt']['failureObservation'],{'status':'diagnostic-unavailable'});self.assertFalse(ns['receipt']['passed']);self.assertNotIn('PRIVATE',json.dumps(ns['receipt']))
class RunSpace(unittest.TestCase):
 def test_reallocation_preserves_aggregate_and_other_limits(self):
  self.assertEqual(m.TMPFS['/run'],'rw,nosuid,nodev,size=32m');self.assertEqual(m.TMPFS['/var/lib'],'rw,nosuid,nodev,size=16m')
  self.assertEqual(sum(int(v.rsplit('size=',1)[1][:-1]) for v in m.TMPFS.values()),67)
  fixture=actual_fixture();self.assertTrue(m.confined(fixture))
  for target,value in (('/run','rw,nosuid,nodev,size=16m'),('/var/lib','rw,nosuid,nodev,size=32m')):
   v=actual_fixture();v['HostConfig']['Tmpfs'][target]=value
   with self.assertRaises(ValueError):m.confined(v)
 def test_exact_free_floor_and_record(self):
  ns,_=DriverPhases().driver_namespace()
  with patch.object(os,'statvfs',return_value=types.SimpleNamespace(f_bsize=4096,f_blocks=8192,f_bfree=4096)) as read:ns['check_reload_space']()
  read.assert_called_once_with('/run/systemd');self.assertEqual(ns['receipt']['reloadSpace'],[{'label':'none','status':'observed','totalBytes':33554432,'freeBytes':16777216,'requiredFreeBytes':16777216}])
 def test_old_capacity_and_below_floor_fail_with_observation(self):
  for blocks,free in ((4096,4095),(8192,4095)):
   ns,_=DriverPhases().driver_namespace()
   with patch.object(os,'statvfs',return_value=types.SimpleNamespace(f_bsize=4096,f_blocks=blocks,f_bfree=free)):
    with self.assertRaises(ValueError):ns['check_reload_space']()
   self.assertEqual(ns['receipt']['reloadSpace'][0]['freeBytes'],free*4096)
 def test_invalid_type_overflow_and_unknown_transport_fail_closed(self):
  for fields in ((True,8192,4096),(4096,8192,8193),(4096,8193,8192),(4096,2**62,1),(3,8192,4096),(4096,8192,-1)):
   ns,_=DriverPhases().driver_namespace()
   with patch.object(os,'statvfs',return_value=types.SimpleNamespace(**dict(zip(('f_bsize','f_blocks','f_bfree'),fields)))):
    with self.assertRaises(ValueError):ns['check_reload_space']()
  ns,_=DriverPhases().driver_namespace()
  with patch.object(os,'statvfs',side_effect=OSError('PRIVATE_PATH')):
   with self.assertRaises(ValueError):ns['check_reload_space']()
  self.assertEqual(ns['receipt']['reloadSpace'],[{'label':'none','status':'unavailable'}]);self.assertNotIn('PRIVATE',json.dumps(ns['receipt']))
 def test_pre_reload_insufficient_space_halts_original_command(self):
  ns,body=DriverPhases().driver_namespace();calls=[];ns['write']=lambda *a,**k:None;ns['run']=lambda *a,**k:calls.append(a);ns['native_state']=lambda:{'status':'transport-error'};ns['save']=lambda:None
  with patch.object(os,'statvfs',return_value=types.SimpleNamespace(f_bsize=4096,f_blocks=4096,f_bfree=4095)):exec(compile(ast.Module(body=[body],type_ignores=[]),'<actual-driver-flow>','exec'),ns)
  self.assertEqual(calls,[]);self.assertFalse(ns['receipt']['passed']);self.assertEqual(ns['receipt']['checkpoint']['operation'],'reload-space');self.assertEqual(ns['receipt']['cases'],[])
 def test_observation_count_bounded_to_existing_reload_calls(self):
  ns,_=DriverPhases().driver_namespace()
  with patch.object(os,'statvfs',return_value=types.SimpleNamespace(f_bsize=4096,f_blocks=8192,f_bfree=7936)):
   for label in ('none','baseline','success','nonzero','timeout'):ns['check_reload_space'](label)
   with self.assertRaises(ValueError):ns['check_reload_space']()
  self.assertEqual(len(ns['receipt']['reloadSpace']),5)
class BusBinding(unittest.TestCase):
 def test_exact_actual_image_size_signed_closure_and_runtime_pins(self):
  import hashlib
  source=p.read_text();setup=p.parent.parent/'system-bus/setup-actual'
  actual=json.loads((setup/'result.json').read_text());closure=setup/'closure.json'
  self.assertTrue(actual['passed']);self.assertTrue(actual['containerAbsent'])
  self.assertEqual(m.IMAGE,actual['derivedImageId']);self.assertIn("image['Size']!="+str(actual['derivedBytes']),source)
  self.assertEqual(m.PINS['../system-bus/setup-actual/closure.json'],hashlib.sha256(closure.read_bytes()).hexdigest())
  for name,digest in m.PINS.items():self.assertEqual(hashlib.sha256((p.parent/name).read_bytes()).hexdigest(),digest)
 def test_actual_driver_is_reviewed_candidate_with_bus_gate_first(self):
  self.assertEqual(p.with_name('driver.py').read_bytes(),(p.parent.parent/'system-bus/driver.py').read_bytes())
  tree=ast.parse(p.with_name('driver.py').read_text());body=next(n.body for n in tree.body if isinstance(n,ast.Try))
  self.assertEqual(ast.unparse(body[0]),"checkpoint('system-bus')");self.assertEqual(ast.unparse(body[1]),'require_system_bus()')
  self.assertIsInstance(body[2],ast.For)
 def test_failed_bus_gate_never_writes_timers_or_starts_cases(self):
  ns,body=DriverPhases().driver_namespace();writes=[];saved=[]
  import subprocess
  original=subprocess.CalledProcessError(1,'PRIVATE_BUS_COMMAND',stderr=b'PRIVATE_BUS_ERROR')
  ns['require_system_bus']=lambda:(_ for _ in ()).throw(original)
  ns['write']=lambda *a,**k:writes.append(a);ns['run']=lambda *a,**k:writes.append(a)
  ns['native_state']=lambda:{'status':'transport-error'};ns['save']=lambda:saved.append(True)
  exec(compile(ast.Module(body=[body],type_ignores=[]),'<actual-bus-flow>','exec'),ns)
  self.assertEqual(writes,[]);self.assertEqual(saved,[True]);self.assertEqual(ns['receipt']['cases'],[])
  self.assertFalse(ns['receipt']['passed']);self.assertEqual(ns['receipt']['checkpoint']['operation'],'system-bus')
  self.assertEqual(ns['receipt']['originalException'],{'category':'called-process-error','returnCode':1})
  self.assertNotIn('PRIVATE',json.dumps(ns['receipt']))
if __name__=='__main__':unittest.main(verbosity=2)
