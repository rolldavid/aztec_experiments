"""Bounded local pipe/file doubles; no Docker, network or systemd."""
import importlib.util,pathlib,subprocess,tempfile,unittest,json,types,os,hashlib,signal,selectors
from unittest.mock import patch
D=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('setup_candidate',D/'setup.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Repairs(unittest.TestCase):
 def test_sink_drains_oversized_no_newline_input_with_bounded_files(self):
  data=b'public-fixture-'+b'a'*400000+b'-END'
  with tempfile.TemporaryDirectory() as t:
   p=subprocess.run(['/bin/sh',str(D/'setup.sh'),'--log-sink',t],input=data,capture_output=True,timeout=5)
   self.assertEqual(p.returncode,0);self.assertEqual(p.stdout,b'');self.assertEqual(p.stderr,b'')
   files=list(pathlib.Path(t).iterdir());self.assertLessEqual(len(files),2)
   self.assertTrue(all(f.stat().st_size<=65536 for f in files))
   last=(pathlib.Path(t)/'setup.log').read_bytes();self.assertTrue(data.endswith(last));self.assertTrue(last.endswith(b'-END'))
 def test_sink_small_input_and_empty_eof(self):
  for data in (b'',b'public failure 153\n'):
   with self.subTest(data=data),tempfile.TemporaryDirectory() as t:
    p=subprocess.run(['/bin/sh',str(D/'setup.sh'),'--log-sink',t],input=data,capture_output=True,timeout=5);self.assertEqual(p.returncode,0)
    paths=list(pathlib.Path(t).iterdir())
    if data:self.assertEqual((pathlib.Path(t)/'setup.log').read_bytes(),data)
    else:self.assertEqual(paths,[])
 def test_log_limit_no_longer_applies_to_apt_data(self):
  s=(D/'setup.sh').read_text();self.assertNotIn('ulimit -f 8192',s);self.assertIn('dd bs=4096 count=16',s)
  self.assertIn('--no-download',s);self.assertIn('total>104857600',s);self.assertIn('"$rx" -gt 157286400',s)
 def test_fixed_public_diagnostic_projection_and_cleanup_independence(self):
  for fault in ('none','copy','stage','persist'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as t:
    out=pathlib.Path(t);calls=[];report={};cid='a'*64
    def call(args,**kw):
     calls.append(args[0]);self.assertTrue(kw['cleanup'])
     if args[0]=='cp':
      self.assertEqual(kw['limit'],2)
      if fault=='copy':raise TimeoutError()
      path=pathlib.Path(args[-1]);path.write_bytes(b'PRIVATE_SENTINEL' if fault=='stage' and path.name=='public-setup-stage' else b'apt-index\n' if path.name=='public-setup-stage' else b'public log')
      return types.SimpleNamespace(returncode=0,stdout=b'')
     if args[0]=='inspect':return types.SimpleNamespace(returncode=0,stdout=json.dumps({'Status':'exited','Running':False,'ExitCode':153,'OOMKilled':False,'Dead':False}).encode())
     return types.SimpleNamespace(returncode=0,stdout=b'')
    def persist(r):
     m.capture_setup_diagnostics(cid,call,out,r)
     if fault=='persist':raise OSError()
    with patch.object(subprocess,'run',side_effect=AssertionError('No real Docker')):m.cleanup_owned(cid,call,persist,report,owned=True)
    self.assertTrue(report['containerAbsent']);self.assertEqual(calls[-4:],['kill','wait','rm','ps'])
    self.assertNotIn('PRIVATE_SENTINEL',json.dumps(report))
    self.assertEqual(report['publicDiagnostics']['setup-stage']['status'],'unavailable' if fault in ('copy','stage') else 'captured')
 def test_every_apt_stage_uses_explicit_authenticated_main_only_source(self):
  s=(D/'setup.sh').read_text()
  self.assertEqual(s.count('apt-get '),1);self.assertEqual(s.count('  apt_public '),4)
  self.assertIn('Dir::Etc::sourceparts=-',s);self.assertIn('Architectures: arm64',s)
  self.assertIn('Components: main\n',s);self.assertNotIn('Components: main universe',s)
  self.assertIn('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',s)
  self.assertIn('Acquire::AllowInsecureRepositories=false',s)
  self.assertIn('APT::Get::AllowUnauthenticated=false',s)
 def test_actual_extracted_capture_eof_wiring_without_process(self):
  ns={};exec((D/'native-subset.py').read_text(),ns)
  self.assertIs(ns['selectors'],selectors);self.assertIs(ns['signal'],signal)
  pipes=[]
  class Child:
   pid=777777
   def __init__(self):
    for _ in range(2):
     r,w=os.pipe();os.close(w);pipes.append(os.fdopen(r,'rb'))
    self.stdout,self.stderr=pipes
   def wait(self,timeout=None):return 0
   def poll(self):return 0
  with patch.object(subprocess,'Popen',return_value=Child()) as popen:
   result,raw=ns['bounded_capture'](['/usr/bin/true'],.1)
  self.assertTrue(result['started']);self.assertTrue(result['reaped']);self.assertFalse(result['timeout']);self.assertEqual(raw,{'stdout':b'','stderr':b''});popen.assert_called_once()
 def test_actual_extracted_capture_timeout_wiring_without_process(self):
  ns={};exec((D/'native-subset.py').read_text(),ns);readers=[];writers=[]
  class Child:
   pid=777777
   def __init__(self):
    for _ in range(2):
     r,w=os.pipe();readers.append(os.fdopen(r,'rb'));writers.append(w)
    self.stdout,self.stderr=readers
   def wait(self,timeout=None):return -9
   def poll(self):return None
  try:
   with patch.object(subprocess,'Popen',return_value=Child()),patch.object(os,'killpg') as kill:
    result,_=ns['bounded_capture'](['/usr/bin/sleep','10'],.001)
   self.assertTrue(result['timeout']);self.assertTrue(result['reaped']);kill.assert_called_once_with(777777,signal.SIGKILL)
  finally:
   for fd in writers:os.close(fd)
 def test_capture_function_is_exact_frozen_production_bytes(self):
  import ast
  bindings=json.loads((D/'offline-source-bindings-v2.json').read_text());source=(D/'native-subset.py').read_text()
  node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='bounded_capture')
  self.assertEqual(hashlib.sha256(ast.get_source_segment(source,node).encode()).hexdigest(),bindings['functions']['bounded_capture'])
if __name__=='__main__':unittest.main(verbosity=2)
