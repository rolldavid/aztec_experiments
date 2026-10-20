"""Controlled source-bound doubles. No Docker, subprocess, network or installation."""
import ast,copy,hashlib,json,pathlib,re,stat,types,unittest
D=pathlib.Path(__file__).resolve().parent

def function(path,name,namespace):
 tree=ast.parse(path.read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
 exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),namespace)
 return namespace[name]

class BusReadiness(unittest.TestCase):
 def prepare(self,*,missing=None,start_error=None,capture_error=None,changes=None,raw=b'b true\n'):
  calls=[];receipt={}
  def check_file(name):
   calls.append(('stat',name))
   if missing==name:raise FileNotFoundError('PRIVATE_SENTINEL')
   return types.SimpleNamespace(st_mode=stat.S_IFREG|0o755)
  def run(args,**kw):
   calls.append(('start',args,kw))
   if start_error:raise start_error
  def capture(args,seconds):
   calls.append(('capture',args,seconds))
   if capture_error:raise capture_error
   summary={'started':True,'reaped':True,'timeout':False,'returnCode':0,'stdout':{'truncated':False},'stderr':{'truncated':False}}
   if changes:summary.update(copy.deepcopy(changes))
   return summary,{'stdout':raw,'stderr':b''}
  namespace={'receipt':receipt,'os':types.SimpleNamespace(stat=check_file),'stat':stat,'run':run,'bounded_capture':capture}
  return function(D/'driver.py','require_system_bus',namespace),calls,receipt
 def test_ready_requires_exact_full_bus_owner_after_bounded_vendor_start(self):
  fn,calls,r=self.prepare();fn();self.assertEqual(r,{'systemBus':{'status':'ready'}})
  self.assertEqual(calls[-2],('start',['systemctl','start','dbus.service'],{'timeout':3}))
  self.assertEqual(calls[-1],('capture',['/usr/bin/busctl','--system','--timeout=2s','call','org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','NameHasOwner','s','org.freedesktop.systemd1'],3))
 def test_each_missing_prerequisite_prevents_start_and_capture(self):
  for path in ('/usr/bin/dbus-daemon','/usr/bin/busctl','/usr/lib/systemd/system/dbus.service','/usr/lib/systemd/system/dbus.socket'):
   fn,calls,r=self.prepare(missing=path)
   with self.assertRaises(FileNotFoundError):fn()
   self.assertFalse(any(c[0]!='stat' for c in calls));self.assertNotIn('PRIVATE_SENTINEL',json.dumps(r))
 def test_start_failure_stops_before_owner_check(self):
  error=RuntimeError('PRIVATE_SENTINEL');fn,calls,r=self.prepare(start_error=error)
  with self.assertRaises(RuntimeError) as caught:fn()
  self.assertIs(caught.exception,error);self.assertEqual(calls[-1][0],'start');self.assertEqual(r['systemBus']['status'],'starting')
 def test_capture_failure_preserves_fixed_status_only(self):
  fn,calls,r=self.prepare(capture_error=OSError('PRIVATE_SENTINEL'))
  with self.assertRaises(OSError):fn()
  self.assertEqual(r,{'systemBus':{'status':'checking-owner'}})
 def test_absent_false_malformed_or_private_owner_reply_rejects(self):
  for raw in (b'',b'b false\n',b'true\n',b'b true\nPRIVATE_SENTINEL',b' b true\n'):
   fn,_,r=self.prepare(raw=raw)
   with self.assertRaises(ValueError):fn()
   self.assertEqual(r,{'systemBus':{'status':'checking-owner'}})
 def test_nonzero_timeout_unreaped_or_unstarted_rejects(self):
  for changes in ({'returnCode':1},{'timeout':True},{'reaped':False},{'started':False}):
   fn,_,r=self.prepare(changes=changes)
   with self.assertRaises(ValueError):fn()
   self.assertNotEqual(r['systemBus']['status'],'ready')
 def test_truncated_either_channel_rejects(self):
  for channel in ('stdout','stderr'):
   fn,_,_=self.prepare(changes={channel:{'truncated':True}})
   with self.assertRaises(ValueError):fn()
 def test_source_places_readiness_before_timers_and_all_cases(self):
  tree=ast.parse((D/'driver.py').read_text());body=next(n.body for n in tree.body if isinstance(n,ast.Try))
  self.assertEqual(ast.unparse(body[0]),"checkpoint('system-bus')")
  self.assertEqual(ast.unparse(body[1]),'require_system_bus()')
  self.assertIsInstance(body[2],ast.For)
 def test_actual_case_capture_classifier_and_boot_unchanged(self):
  prior=D.parent/'offline-runspace'
  def body(path,name):return ast.dump(next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef) and n.name==name))
  self.assertEqual(body(D/'driver.py','case'),body(prior/'driver.py','case'))
  for name in ('native-subset.py','boot-template.py'):self.assertEqual((D/name).read_bytes(),(prior/name).read_bytes())

class SetupBinding(unittest.TestCase):
 def test_signed_setup_all_three_plans_pin_same_six_dbus_packages(self):
  text=(D/'setup.sh').read_text()
  for name in ('dbus','dbus-daemon','dbus-bin','dbus-system-bus-common','dbus-session-bus-common','libdbus-1-3'):
   self.assertEqual(text.count(name+'=1.14.10-4ubuntu4.1'),3)
  self.assertIn('--no-download',text);self.assertEqual(text.count('Acquire::ForceHash=SHA256'),3)
  self.assertIn('Acquire::AllowInsecureRepositories=false',text);self.assertIn('APT::Get::AllowUnauthenticated=false',text)
 def test_original_bounded_setup_cleanup_function_unchanged(self):
  def body(path,name):return ast.dump(next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef) and n.name==name))
  self.assertEqual(body(D/'setup.py','cleanup_owned'),body(D.parent/'setup.py','cleanup_owned'))
 def test_setup_hashes_bind_actual_inputs_and_parent_image(self):
  tree=ast.parse((D/'setup.py').read_text());values={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('IMAGE','EXPECTED_INPUTS')}
  self.assertEqual(values['IMAGE'],'sha256:8e0b572feae06ff8843f458d2cc4343ecd6995c37f254c0e5de547433c674aee')
  self.assertEqual(values['EXPECTED_INPUTS'],{name:hashlib.sha256((D/name).read_bytes()).hexdigest() for name in ('setup.sh','closure.py')})
 def test_parent_packages_unchanged_rejects_upgrade_removal_duplicate(self):
  fn=function(D/'closure.py','check_parent_packages',{})
  parent=[{'name':'systemd','version':'255.4-1ubuntu8.17','architecture':'arm64'}]
  fn(parent,parent+[{'name':'dbus','version':'1.14.10-4ubuntu4.1','architecture':'arm64'}])
  for current in ([],[dict(parent[0],version='other')],parent+parent):
   with self.assertRaises(ValueError):fn(parent,current)
 def test_exact_bus_identity_requires_matching_nonroot_uid_gid(self):
  fn=function(D/'closure.py','check_bus_identity',{'re':re})
  self.assertEqual(fn('messagebus:x:100:102:system bus:/nonexistent:/usr/sbin/nologin\n','messagebus:x:102:\n'),{'uid':100,'gid':102})
 def test_missing_duplicate_root_mismatched_or_malformed_bus_identity_rejects(self):
  fn=function(D/'closure.py','check_bus_identity',{'re':re})
  user='messagebus:x:100:102:system bus:/nonexistent:/usr/sbin/nologin\n';group='messagebus:x:102:\n'
  for u,g in (('',group),(user,''),(user+user,group),(user,group+group),(user.replace(':100:',':0:'),group),(user,group.replace(':102:',':103:')),(user.replace(':100:',':secret:'),group)):
   with self.assertRaises(ValueError):fn(u,g)
 def test_parent_closure_preserved_and_machine_identity_vendor_units_required(self):
  shell=(D/'setup.sh').read_text();closure=(D/'closure.py').read_text()
  self.assertIn('mv /opt/rolling-systemd-regression/closure.json /opt/rolling-systemd-regression/parent-closure.json',shell)
  self.assertIn('41001f37ac6c7cd235bebe934c46e42c9060cc1f880104df60c3d4fffa791975',closure)
  self.assertIn("pathlib.Path('/etc/machine-id')",closure)
  for digest in ('bf7ec47644997441174ef6aac992d34cc46b9d2d7b8dc2feba7074d719fdbef1','12b7aaec8d1e007047ec12fc85b1cc6db78565dfb896850cd9148dee0455fe7e'):self.assertIn(digest,closure)

if __name__=='__main__':unittest.main(verbosity=2)
