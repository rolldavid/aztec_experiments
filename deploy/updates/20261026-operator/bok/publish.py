"""Root-operated Bok only: python3 publish.py PACKET stage|activate.
Stage never changes services. Activate drains naturally; a deadline never kills.
"""
import hashlib,json,os,pathlib,re,shutil,stat,subprocess,sys,time,urllib.request
os.umask(0o077)
UNIT='rolling-bok-testnet.service'
BASE=pathlib.Path('/opt/rolling-bok/releases/bbf76d92c0520f3e2192887b555b3a62d2fa4dcc')
COMMIT='bff92b326bb112b08931cc4d750c805abecb2c52'
TARGET=BASE.parent/('operator-'+COMMIT)
NODE=pathlib.Path('/opt/board-prover/releases/rolling-05d526891911bd90/node/bin/node')
CONFIG=pathlib.Path('/etc/rolling-bok-testnet/config.json')
FRAGMENT=pathlib.Path('/etc/systemd/system/rolling-bok-testnet.service')
DROP=pathlib.Path('/run/systemd/system/rolling-bok-testnet.service.d/bok-repair-drain.conf')
DROP_BYTES=b'[Service]\nRestart=no\n'
SELECTED={'plugins/main.mjs', 'plugins/private-bok-escrow.mjs'}
PIN_NAMES=['.build/stable-app-source-pins.json']
STATIC='WorkingDirectory ExecStart EnvironmentFiles User Group Restart KillMode KillSignal SendSIGKILL TimeoutStopUSec CPUQuotaPerSecUSec MemoryMax NoNewPrivileges ProtectSystem ProtectHome PrivateTmp PrivateDevices ProtectKernelTunables ProtectKernelModules ProtectControlGroups RestrictSUIDSGID RestrictRealtime LockPersonality RestrictNamespaces CapabilityBoundingSet AmbientCapabilities SystemCallFilter ReadWritePaths ReadOnlyPaths InaccessiblePaths FragmentPath DropInPaths'.split()
def run(args):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE).strip()
def sha(path):return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(pathlib.Path(path).read_text())
def regular(root,name):
 assert isinstance(name,str) and name and not name.startswith('/') and '\\' not in name and all(x not in ('','.','..') for x in name.split('/'))
 assert root.is_dir() and root.resolve()==root and not root.is_symlink()
 p=root
 for part in name.split('/'):
  p=p/part;assert not p.is_symlink(),str(p)
 assert p.is_file(),str(p)
 return p

def atomic(path,data,mode=0o644,uid=0,gid=0):
 assert path.parent.resolve()==path.parent and not path.is_symlink()
 tmp=path.with_name(path.name+'.bok-repair-next')
 fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
 try:
  with os.fdopen(fd,'wb') as f:
   os.fchmod(f.fileno(),mode);os.fchown(f.fileno(),uid,gid);f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(tmp,path)
 finally:
  if tmp.exists():tmp.unlink()

def props(unit,fields):return dict(x.split('=',1) for x in run(['systemctl','show',unit,'--property='+','.join(fields)]).splitlines())
def state(unit=UNIT):return props(unit,['MainPID','ActiveState','SubState','NRestarts'])
def static():
 value=props(UNIT,STATIC)
 # ExecStart contains mutable last-invocation timestamps/status. Preserve the
 # exact configured command prefix, never compare its historical process data.
 command=value['ExecStart'];assert command.startswith('{ ') and command.count('argv[]=')==1
 value['ExecStart']=command.split(' ; start_time=',1)[0].rstrip(' }')
 return value
def definitions(unit):
 p=props(unit,['FragmentPath','DropInPaths']);assert p['FragmentPath']
 return {name:sha(name) for name in [p['FragmentPath'],*p['DropInPaths'].split()]}
def protected():
 out={}
 for row in run(['systemctl','list-units','--all','--type=service','--plain','--no-legend']).splitlines():
  unit=row.split()[0]
  if unit==UNIT or not unit.startswith(('rolling-','board-prover')):continue
  if props(unit,['Type']).get('Type')=='oneshot':
   out[unit]={'definitions':definitions(unit),'triggers':props(unit,['TriggeredBy'])}
   for timer in out[unit]['triggers']['TriggeredBy'].split():
    out[timer]={'definitions':definitions(timer),'active':props(timer,['ActiveState'])}
  else:out[unit]={'state':state(unit),'definitions':definitions(unit)}
 assert 'rolling-bok-artifact-proxy.service' in out
 return out

def inventory(root,name):
 pins=read(regular(root,name));assert isinstance(pins,dict) and pins
 deps=(root/'node_modules').resolve(strict=True);assert deps.is_dir() and str(deps).startswith('/opt/')
 assert any(n.startswith('node_modules/') for n in pins),'Native closure missing'
 for n,digest in pins.items():
  assert re.fullmatch('[a-f0-9]{64}',digest)
  p=regular(deps,n[len('node_modules/'):]) if n.startswith('node_modules/') else regular(root,n)
  assert sha(p)==digest,n
 return pins,str(deps)

def new_unit(old):
 line=('WorkingDirectory='+str(BASE)).encode();replacement=('WorkingDirectory='+str(TARGET)).encode()
 assert old.splitlines().count(line)==1,'WorkingDirectory is not exact unique baseline'
 return b'\n'.join(replacement if x==line else x for x in old.split(b'\n'))

def empty_group(group):
 assert group.startswith('/system.slice/') and '..' not in group.split('/')
 p=pathlib.Path('/sys/fs/cgroup')/group.lstrip('/')
 return not p.exists() or all(not q.read_text().strip() for q in p.rglob('cgroup.procs'))

def health():
 with urllib.request.urlopen('http://127.0.0.1:8807/health',timeout=10) as response:return json.load(response)
def idle():
 h=health();assert h.get('status')=='ready' and h.get('active')==0 and h.get('lastFailure') is None

def native_process_ready(current,source,proc=pathlib.Path('/proc')):
 # Type=simple reports MainPID/active after fork, before chdir/execve. Neither
 # its inherited cwd nor an exiting PID is a permanent source mismatch.
 if current['ActiveState']!='active' or not current['MainPID'].isdigit() or int(current['MainPID'])<1:return False
 try:
  owner=proc/current['MainPID']
  return (owner/'cwd').resolve(strict=True)==source and (owner/'exe').resolve(strict=True)==NODE.resolve(strict=True)
 except OSError:return False

def restore_after_drain_failure(remove_override,check_settings,group):
 # Restore systemd's original policy even while the current owner is draining.
 # An explicit start is safe only after that owner AND every child have exited.
 remove_override();check_settings()
 current=state()
 if current['MainPID']=='0' and current['ActiveState'] in ('inactive','failed') and empty_group(group):
  run(['systemctl','start',UNIT])

def main(packet,phase):
 assert os.geteuid()==0 and phase in ('stage','activate')
 P=pathlib.Path(packet);assert P.is_absolute() and P.resolve()==P and P.is_dir()
 info=P.stat();assert info.st_uid==0 and not info.st_mode&0o022
 plan=read(regular(P,'plan.json'));planhash=sha(P/'plan.json')
 assert plan['commit']==COMMIT and set(plan['files'])==SELECTED
 assert BASE.resolve()==BASE and BASE.is_dir()
 for name,entry in plan['files'].items():
  assert sha(regular(P/'files',name))==entry['sha256']
  assert sha(regular(BASE,name))==entry['baseSha256']
 def save(name,value):atomic(P/name,(json.dumps(value,sort_keys=True,indent=2)+'\n').encode(),0o600)
 def sourcecheck(b,root):
  pins,deps=inventory(root,b['inventoryName'])
  expected=dict(b['inventory'])
  if root==TARGET:
   for n,e in plan['files'].items():expected[n]=e['sha256']
  assert pins==expected and deps==b['dependencies']
  assert sha(NODE)==b['nodeSha256']
  for n,d in b['closure'].items():assert sha(regular(root,n))==d,n
  for n,e in plan['files'].items():assert sha(regular(root,n))==(e['sha256'] if root==TARGET else e['baseSha256'])
 def fixed(b,switched=False):
  assert sha('/usr/local/lib/rolling-attest.py')==plan['attestorSha256']
  assert sha('/usr/local/lib/rolling-control/deploy/prover/bootstrap.py')==plan['controlSha256']
  assert CONFIG.is_file() and not CONFIG.is_symlink() and sha(CONFIG)==b['configSha256']
  assert sha(NODE)==b['nodeSha256']
  for name,digest in b['privateReferences'].items():assert sha(name)==digest
  for name,digest in b['definitions'].items():
   if name==str(FRAGMENT) and switched:assert sha(name)==b['nextUnitSha256']
   else:assert sha(name)==digest
  assert protected()==b['protected'],'Other service state/definition changed'
 def effective(b,switched=False,draining=False):
  wanted=dict(b['static']);wanted['WorkingDirectory']=str(TARGET if switched else BASE)
  if draining:
   wanted['Restart']='no';wanted['DropInPaths']=' '.join(sorted([*wanted['DropInPaths'].split(),str(DROP)]))
  actual=static();actual['DropInPaths']=' '.join(sorted(actual['DropInPaths'].split()));wanted['DropInPaths']=' '.join(sorted(wanted['DropInPaths'].split()))
  assert actual==wanted,'Effective Bok settings changed'
 def fresh(b):
  fixed(b);effective(b);assert state()==b['state']
  assert pathlib.Path('/proc',b['state']['MainPID'],'cwd').resolve()==BASE
  sourcecheck(b,BASE)
 if phase=='stage':
  assert not TARGET.exists() and not TARGET.is_symlink() and not (P/'stage.json').exists()
  s=state();settings=static();assert s['ActiveState']=='active' and s['SubState']=='running' and int(s['MainPID'])>0
  assert s['MainPID']==str(plan['observed']['pid']) and sha(NODE)==plan['nodeSha256']
  assert sha('/usr/local/lib/rolling-attest.py')==plan['attestorSha256']
  assert sha('/usr/local/lib/rolling-control/deploy/prover/bootstrap.py')==plan['controlSha256']
  assert sha(BASE/plan['inventoryName'])==plan['inventorySha256']
  assert settings['WorkingDirectory']==str(BASE) and pathlib.Path('/proc',s['MainPID'],'cwd').resolve()==BASE
  assert settings['FragmentPath']==str(FRAGMENT) and settings['KillMode']=='control-group' and settings['TimeoutStopUSec']=='infinity'
  assert str(NODE) in settings['ExecStart'] and 'plugins/main.mjs' in settings['ExecStart'] and str(BASE) not in settings['ExecStart']
  assert str(CONFIG) in settings['ExecStart'] and pathlib.Path('/proc',s['MainPID'],'exe').resolve()==NODE.resolve()
  config=read(CONFIG);assert config['development'] is False
  idle()
  assert props('rolling-bok-artifact-proxy.service',['ActiveState'])['ActiveState']=='active'
  proxydeps=props('rolling-bok-artifact-proxy.service',['BindsTo','Requires'])
  assert UNIT not in (proxydeps['BindsTo']+' '+proxydeps['Requires']).split()
  assert sha(CONFIG)==plan['configSha256'] and sha(NODE)==plan['nodeSha256']
  defs=definitions(UNIT);assert defs==plan['unitFiles']
  pin=next((n for n in PIN_NAMES if (BASE/n).is_file()),None);assert pin
  assert pin==plan['inventoryName'] and sha(BASE/pin)==plan['inventorySha256']
  pins,deps=inventory(BASE,pin);assert SELECTED<=set(pins)
  closure={n:sha(regular(BASE,n)) for n in ['package-lock.json','prover/rolling-artifacts.json','billboard/target/rolling_contract-RollingBoard.json','experiments/private-bok/target/private_bok-PrivateBok.json','apps/src/billboard/private_fee_artifact.json']}
  raw=FRAGMENT.read_bytes();meta=FRAGMENT.stat();candidate=new_unit(raw)
  private_refs={}
  for name in defs:
   for line in pathlib.Path(name).read_text().splitlines():
    if line.startswith('LoadCredential='):
     reference=line.split('=',1)[1].split(':',1)[1]
    elif line.startswith('EnvironmentFile='):
     reference=line.split('=',1)[1].removeprefix('-')
    else:continue
    assert reference.startswith('/') and not any(c in reference for c in (' ', '%', '\\'))
    private_refs[reference]=sha(reference)
  b={'privateReferences':private_refs,'state':s,'static':settings,'definitions':defs,'configSha256':sha(CONFIG),'nodeSha256':sha(NODE),'inventoryName':pin,'inventory':pins,'dependencies':deps,'closure':closure,'protected':protected(),'controlGroup':props(UNIT,['ControlGroup'])['ControlGroup'],'unitMode':stat.S_IMODE(meta.st_mode),'unitUid':meta.st_uid,'unitGid':meta.st_gid,'nextUnitSha256':hashlib.sha256(candidate).hexdigest()}
  assert shutil.disk_usage(TARGET.parent).free>=1024**3+sum((P/'files'/n).stat().st_size for n in SELECTED)
  fresh(b)
  shutil.copytree(BASE,TARGET,copy_function=os.link,symlinks=True,ignore=lambda directory,names:['node_modules'] if pathlib.Path(directory)==BASE and 'node_modules' in names else [])
  (TARGET/'node_modules').symlink_to(pathlib.Path(deps),target_is_directory=True)
  for name in sorted(SELECTED):
   p=regular(TARGET,name);m=p.stat();atomic(p,(P/'files'/name).read_bytes(),stat.S_IMODE(m.st_mode),m.st_uid,m.st_gid);run([str(NODE),'--check',str(p)])
  updated={**pins,**{n:e['sha256'] for n,e in plan['files'].items()}}
  p=regular(TARGET,pin);m=p.stat();atomic(p,(json.dumps(updated,sort_keys=True,indent=2)+'\n').encode(),stat.S_IMODE(m.st_mode),m.st_uid,m.st_gid)
  assert (TARGET/'node_modules').is_symlink() and (TARGET/'node_modules').resolve()==pathlib.Path(deps)
  fresh(b)
  bt=dict(b);bt['dependencies']=b.get('targetDependencies',deps);sourcecheck(bt,TARGET)
  atomic(P/'original-unit',raw,0o600)
  save('stage.json',{'planSha256':planhash,'publisherSha256':sha(__file__),'commit':COMMIT,'base':str(BASE),'target':str(TARGET),'baseline':b})
  print(json.dumps({'staged':True,'files':len(SELECTED),'target':str(TARGET),'servicesChanged':False}));return
 r=read(regular(P,'stage.json'));assert r['planSha256']==planhash and r['publisherSha256']==sha(__file__) and r['commit']==COMMIT
 assert r['base']==str(BASE) and r['target']==str(TARGET)
 b=r['baseline'];fresh(b);bt=dict(b);bt['dependencies']=b.get('targetDependencies',b['dependencies']);sourcecheck(bt,TARGET)
 original=regular(P,'original-unit').read_bytes();assert hashlib.sha256(original).hexdigest()==b['definitions'][str(FRAGMENT)]
 assert not DROP.exists() and not DROP.is_symlink()
 def add_drain(switched):
  DROP.parent.mkdir(parents=True,exist_ok=True);assert DROP.parent.resolve()==DROP.parent
  atomic(DROP,DROP_BYTES);run(['systemctl','daemon-reload']);effective(b,switched,True)
 def remove_drain():
  if DROP.exists() or DROP.is_symlink():
   assert not DROP.is_symlink() and DROP.read_bytes()==DROP_BYTES and DROP.stat().st_uid==0
   DROP.unlink()
  # Reload even when the preceding attempt removed the file before reload failed.
  run(['systemctl','daemon-reload'])
 def drain(switched):
  fixed(b,switched);effective(b,switched,True)
  until=time.monotonic()+300;signalled=False
  while time.monotonic()<until:
   s=state()
   if s['MainPID']=='0' and s['ActiveState'] in ('inactive','failed') and empty_group(b['controlGroup']):return
   if not signalled and native_process_ready(s,TARGET if switched else BASE):
    run(['systemctl','kill','--kill-whom=main','--signal=SIGTERM',UNIT]);signalled=True
   time.sleep(1)
  raise TimeoutError('Natural drain incomplete; no forced kill or source change authorized.')
 def qualify(switched,started):
  until=time.monotonic()+180
  while time.monotonic()<until:
   s=state()
   if s['ActiveState'] in ('failed','inactive'):raise RuntimeError('Bok startup failed')
   if native_process_ready(s,TARGET if switched else BASE):
    try:h=health()
    except (OSError,ValueError):time.sleep(1);continue
    if h.get('status')=='degraded' or h.get('lastFailure') is not None:raise RuntimeError('Bok startup degraded')
    if h.get('status') in ('ready','working') and isinstance(h.get('active'),int):
     fixed(b,switched);effective(b,switched)
     fresh_state=state()
     if fresh_state['MainPID']==s['MainPID'] and native_process_ready(fresh_state,TARGET if switched else BASE):return fresh_state,{'status':h['status'],'active':h['active']}
   time.sleep(1)
  raise TimeoutError('No healthy Bok startup observed')
 idle()
 try:
  add_drain(False)
  drain(False)
 except BaseException:
  restore_after_drain_failure(remove_drain,lambda:effective(b),b['controlGroup'])
  raise
 switched=False
 try:
  fixed(b);sourcecheck(bt,TARGET);assert FRAGMENT.read_bytes()==original
  atomic(FRAGMENT,new_unit(original),b['unitMode'],b['unitUid'],b['unitGid']);switched=True
  remove_drain();effective(b,True);started=int(time.time());run(['systemctl','start',UNIT]);s,h=qualify(True,started)
  save('activation.json',{'activated':True,'commit':COMMIT,'source':str(TARGET),'pid':s['MainPID'],'planSha256':planhash,'configSha256':b['configSha256'],'health':h,'otherServicesUnchanged':True,'attestorSha256':plan['attestorSha256'],'controlSha256':plan['controlSha256'],'sourceInventorySha256':sha(TARGET/b['inventoryName'])})
 except BaseException:
  # Even after failed qualification, a candidate may have admitted native work.
  # Drain it with exactly the same no-escalation protocol before restoring unit.
  try:
   if not DROP.exists():add_drain(switched)
   drain(switched);fixed(b,switched)
   expected=new_unit(original) if switched else original;assert FRAGMENT.read_bytes()==expected
   atomic(FRAGMENT,original,b['unitMode'],b['unitUid'],b['unitGid']);switched=False;remove_drain();effective(b)
   started=int(time.time());run(['systemctl','start',UNIT]);s,h=qualify(False,started)
  except BaseException:
   restore_after_drain_failure(remove_drain,lambda:effective(b,switched),b['controlGroup'])
   raise
  save('rollback.json',{'restored':True,'source':str(BASE),'pid':s['MainPID'],'health':h});raise
 print(json.dumps({'activated':True,'target':str(TARGET),'otherServicesUnchanged':True}))
if __name__=='__main__':main(*sys.argv[1:])
