import pathlib,importlib.util,json,hashlib,ast,signal
E=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-design/execution/evidence/G07/preference-page');p=json.loads((E/'generated-three-helper-packet.json').read_text())
for b in p['bindings']:assert hashlib.sha256(pathlib.Path(b['path']).read_bytes()).hexdigest()==b['sha256']
spec=importlib.util.spec_from_file_location('runner_no_execution',E/'run-generated-three-errno.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original_processes=m.processes;original_kill=m.os.kill;original_killpg=m.os.killpg
results=[]
try:
 for persistent in [False,True]:
  calls={'ps':0,'signals':[],'wait':0}; alive=[True]
  class P:
   pid=777777
   def wait(self,timeout):calls['wait']+=1;assert not alive[0];return 0
  def ps():
   calls['ps']+=1
   if persistent or calls['ps']==1:raise TimeoutError('labelled discovery failure')
   return {}
  def killpg(pid,sig):
   assert pid==777777
   if sig==0:
    if not alive[0]:raise ProcessLookupError()
   else:calls['signals'].append(int(sig));alive[0]=False
  def kill(pid,sig):raise AssertionError('no discovered process to signal individually')
  m.processes=ps;m.os.kill=kill;m.os.killpg=killpg
  o=m.Owned(P(),pathlib.Path('/unused-owned'));assert calls['ps']==0
  try:o.refresh()
  except TimeoutError:pass
  else:raise AssertionError('expected initial discovery failure')
  try:o.cleanup();accepted=True
  except RuntimeError as e:assert str(e)=='OWNED_CLEANUP_UNVERIFIED';accepted=False
  assert accepted is not persistent and not alive[0] and calls['wait']==2
  assert calls['signals']==[int(signal.SIGTERM),int(signal.SIGKILL)]
  assert o.cleanupFacts['rootReaped'] and o.cleanupFacts['groupsAbsent']
  assert o.cleanupFacts['descendantsAbsent'] is not persistent
  results.append({'label':'pure process double','persistentDiscoveryFailure':persistent,'acceptedCleanup':accepted,'groupSignalledTwice':True,'rootReaped':True})
finally:m.processes=original_processes;m.os.kill=original_kill;m.os.killpg=original_killpg
ast.parse((E/'run-generated-three-errno.py').read_text());assert "'NODE_BACKEND':'js'" in (E/'run-generated-three-errno.py').read_text()
print(json.dumps({'passed':2,'results':results,'processesLaunched':0,'nativeExecuted':False}))
