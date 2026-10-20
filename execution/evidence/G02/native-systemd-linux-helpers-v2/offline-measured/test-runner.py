"""Labelled in-memory Docker doubles only; no Docker/systemd/network calls."""
import importlib.util,json,pathlib,types,unittest
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
 def test_embedded_production_driver_and_subset_are_unchanged(self):
  root=p.parent.parent
  for name in ('boot-bound.py','driver.py','native-subset.py'):
   self.assertEqual(p.with_name(name).read_bytes(),root.joinpath('offline',name).read_bytes())
if __name__=='__main__':unittest.main(verbosity=2)
