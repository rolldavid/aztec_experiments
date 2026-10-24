"""Focused observer/supervision tests; no service actions or cloud access."""
import importlib.util,pathlib,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=module('supervision','deploy/prover/supervision.py');b=module('bootstrap','deploy/prover/bootstrap.py')
class Supervision(unittest.TestCase):
 def states(self):return {name:{'active':True,'running':True,'pid':10,'restarts':0,'successful':True} for name in m.SERVICES['core']}
 def test_failure_reports_without_lifecycle_action(self):
  def unavailable(*a,**k):raise TimeoutError('private detail must not escape')
  h={'verify_controls':unavailable};control={'prover_activation':unavailable,'query_host_readback':unavailable}
  with patch.object(m.subprocess,'check_output',side_effect=AssertionError('Unexpected service action')):
   result=m.observe('core',h,control,self.states())
  self.assertFalse(result['ready']);self.assertTrue(all(not c['ok'] for c in result['checks'].values()));self.assertNotIn('private detail',str(result))
 def test_restart_state_does_not_stop_healthy_peers(self):
  states=self.states();states['rolling-query'].update(active=False,running=False,pid=0,restarts=2)
  result=m.observe('core',{'verify_controls':lambda:None},{'prover_activation':lambda *a:{'proverActivated':True,'proverAvailability':'ready'},'query_host_readback':lambda *a,**k:{'listenerAvailable':False}},states)
  self.assertFalse(result['ready']);self.assertTrue(result['services']['board-prover']['running'])
 def test_ready_requires_all_services_and_actual_query_prover_readiness(self):
  h={'verify_controls':lambda:None};control={'prover_activation':lambda *a:{'proverActivated':True,'proverAvailability':'ready'},'query_host_readback':lambda *a,**k:{'listenerAvailable':True}}
  self.assertTrue(m.observe('core',h,control,self.states())['ready'])
  control['prover_activation']=lambda *a:{'proverActivated':True,'proverAvailability':'degraded'}
  self.assertFalse(m.observe('core',h,control,self.states())['ready'])
 def test_startup_check_fails_without_shutdown(self):
  with patch.object(m,'load_control',side_effect=TimeoutError('private')):
   self.assertEqual(m.startup_check(),1)
  drop=b.supervision_dropin('rolling-node');self.assertIn('supervision.py --check',drop);self.assertNotIn('rolling-attest.py',drop)
 def test_startup_preserves_control_and_runtime_integrity_checks(self):
  from unittest.mock import Mock
  attest=Mock()
  with patch.object(m,'load_control',return_value=({'attest':attest},{})):
   self.assertEqual(m.startup_check(),0)
  attest.assert_called_once_with(check=True)
  for failure in (OSError('control check failed'),ValueError('runtime digest differs')):
   with patch.object(m,'load_control',return_value=({'attest':Mock(side_effect=failure)},{})), patch.object(m.subprocess,'check_output',side_effect=AssertionError('Unexpected lifecycle action')):
    self.assertEqual(m.startup_check(),1)
 def test_monitor_has_no_shutdown_or_failure_hooks(self):
  for role in m.SERVICES:
   unit=m.monitor_unit(role)
   for forbidden in ['OnFailure=','ExecStopPost=','--application-stop','poweroff','Restart=']:self.assertNotIn(forbidden,unit)
 def test_persistent_supervision_has_no_permanent_restart_limit(self):
  for service in b.SUPERVISION_UNITS:
   drop=b.supervision_dropin(service)
   self.assertIn('Restart=always\n',drop);self.assertIn('KillMode=control-group\n',drop);self.assertIn('StartLimitIntervalSec=0\n',drop)
  drop=b.supervision_dropin('rolling-application-proxy')
  self.assertNotIn('BindsTo=',drop);self.assertNotIn('Requires=\n',drop)
  self.assertIn('Requires=rolling-egress.service\n',drop);self.assertIn('Wants=rolling-application.service\n',drop)
 def proxy_unit(self):
  return ('[Unit]\nDescription=Proxy\nRequires=rolling-application.service rolling-egress.service\n'
   'Requires=extra-security.service\nBindsTo=rolling-application.service egress-watch.service\n'
   'After=rolling-egress.service\nBefore=rolling-application.service\n\n'
   '[Service]\nType=notify\nExecStart=/opt/pinned/caddy run\nIPAddressDeny=any\n'
   'IPAddressAllow=localhost\nNoNewPrivileges=yes\n[Install]\nWantedBy=multi-user.target\n')
 def dependencies(self,*texts):
  # systemd dependency assignments add units; an empty assignment cannot reset them.
  result={key:set() for key in ('Requires','BindsTo','Wants')}
  for text in texts:
   section=None
   for line in text.splitlines():
    if line.startswith('['):section=line
    if section=='[Unit]' and '=' in line:
     key,value=line.split('=',1)
     if key in result:result[key].update(value.split())
  return result
 def test_base_rewrite_removes_app_stop_dependency_and_retains_security(self):
  original=self.proxy_unit();updated=b.application_proxy_independent_unit(original)
  effective=self.dependencies(updated,b.supervision_dropin('rolling-application-proxy'))
  self.assertEqual(effective['Requires'],{'rolling-egress.service','extra-security.service'})
  self.assertEqual(effective['BindsTo'],{'egress-watch.service'})
  self.assertEqual(effective['Wants'],{'rolling-application.service'})
  self.assertEqual(original.split('[Service]',1)[1],updated.split('[Service]',1)[1])
  self.assertIn('After=rolling-egress.service\nBefore=rolling-application.service\n',updated)
  self.assertEqual(b.application_proxy_independent_unit(updated),updated)
 def test_bok_proxy_rewrite_keeps_artifact_hosting_independent(self):
  original=self.proxy_unit().replace('rolling-application.service','rolling-bok-testnet.service')
  updated=b.application_proxy_independent_unit(original,'rolling-bok-testnet.service')
  drop=b.supervision_dropin('rolling-bok-artifact-proxy');effective=self.dependencies(updated,drop)
  self.assertNotIn('BindsTo=',drop);self.assertNotIn('Requires=\n',drop)
  self.assertEqual(effective['Requires'],{'rolling-egress.service','extra-security.service'})
  self.assertEqual(effective['BindsTo'],{'egress-watch.service'})
  self.assertEqual(effective['Wants'],{'rolling-bok-testnet.service'})
  self.assertEqual(original.split('[Service]',1)[1],updated.split('[Service]',1)[1])
  self.assertIn('After=rolling-egress.service\nBefore=rolling-bok-testnet.service\n',updated)
  self.assertEqual(b.application_proxy_independent_unit(updated,'rolling-bok-testnet.service'),updated)
  with self.assertRaises(b.Invalid):b.application_proxy_independent_unit(original,'unrelated.service')
 def test_empty_dropin_cannot_fix_existing_base_lifecycle(self):
  effective=self.dependencies(self.proxy_unit(),'[Unit]\nRequires=\nBindsTo=\nWants=rolling-application.service\n')
  self.assertIn('rolling-application.service',effective['Requires'])
  self.assertIn('rolling-application.service',effective['BindsTo'])
 def test_missing_egress_or_unsupported_multiline_dependency_rejected(self):
  for text in (self.proxy_unit().replace('rolling-egress.service','other.service'),
               self.proxy_unit().replace('Requires=extra-security.service','Requires=extra-security.service \\\n more.service')):
   with self.assertRaises(b.Invalid):b.application_proxy_independent_unit(text)
 def test_installer_rewrites_base_and_checks_effective_dependency_graph(self):
  source=(ROOT/'deploy/restoration-20261021/supervision/publish.py').read_text()
  self.assertIn("next_units[proxy_unit]=source_module['application_proxy_independent_unit']",source)
  self.assertIn("'--property=Requires,BindsTo,Wants'",source)
  self.assertIn("assert proxy_upstream not in deps['BindsTo'].split()",source)
if __name__=='__main__':unittest.main(verbosity=2)
