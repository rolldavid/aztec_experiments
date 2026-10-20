"""One separately granted harmless offline systemd regression; no native binary."""
import hashlib,json,os,pathlib,re,signal,subprocess,sys,time,uuid
D=pathlib.Path(__file__).resolve().parent
DOCKER='/usr/local/bin/docker'
IMAGE='sha256:8e0b572feae06ff8843f458d2cc4343ecd6995c37f254c0e5de547433c674aee'
PINS={'boot-bound.py': '59246a5be77158dfb003cca9f8547820901b80c125fd78661ca46d04cb712830', 'driver.py': '5f9c15a2addb767f5c306470b936694ad94fcf773ed965c2df0914d12c89c8fe', 'native-subset.py': '79fb4e3a89e77ed05ec659aa84470a3cb8269ec8c868a395ab49ec2d5ed90176', 'receipt-reader.py': '4971d13b9c73d7366b87f6e5ff80455b78eb1ef5b5310a808c78b4949b13ae29', '../setup-actual/closure.json': '41001f37ac6c7cd235bebe934c46e42c9060cc1f880104df60c3d4fffa791975'}
TMPFS={'/run':'rw,nosuid,nodev,size=16m','/run/lock':'rw,nosuid,nodev,size=1m','/tmp':'rw,nosuid,nodev,size=8m','/var/log':'rw,nosuid,nodev,size=8m','/var/lib':'rw,nosuid,nodev,size=32m','/etc/systemd/system':'rw,nosuid,nodev,size=1m','/opt/rolling-native-version':'rw,nosuid,nodev,size=1m'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,value):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 try:os.write(fd,(json.dumps(value,sort_keys=True)+'\n').encode());os.fsync(fd)
 finally:os.close(fd)
 fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
def state(value):
 if type(value) is not dict:raise ValueError('State absent')
 out={k:value[k] for k in ('Status','Running','ExitCode','OOMKilled','Dead')}
 if out['Status'] not in ('created','running','paused','restarting','removing','exited','dead') or any(type(out[k]) is not bool for k in ('Running','OOMKilled','Dead')) or type(out['ExitCode']) is not int or not 0<=out['ExitCode']<=255:raise ValueError('State invalid')
 return out
def confined(info):
 h=info['HostConfig']
 if info['Image']!=IMAGE or h['NetworkMode']!='none' or h['CgroupnsMode']!='private' or h['PidMode']!='' or h['IpcMode']!='private':raise ValueError('Namespace')
 if h['Privileged'] or not h['ReadonlyRootfs'] or h['Binds'] or info['Mounts'] or h['Devices'] or h['DeviceRequests']:raise ValueError('Mount or privilege')
 if h['Memory']!=536870912 or h['MemorySwap']!=536870912 or h['NanoCpus']!=2000000000 or h['PidsLimit']!=128:raise ValueError('Limits')
 if h['CapAdd']!=['CAP_SYS_ADMIN'] or type(h['CapDrop']) is not list or len(h['CapDrop'])!=2 or set(h['CapDrop'])!={'CAP_NET_RAW','CAP_NET_BIND_SERVICE'} or h['SecurityOpt']!=['no-new-privileges'] or h['LogConfig']['Type']!='none' or h['Tmpfs']!=TMPFS:raise ValueError('Capabilities')
 if type(info['Config']['Env']) is not list or len(info['Config']['Env'])!=2 or any(type(x) is not str for x in info['Config']['Env']) or set(info['Config']['Env'])!={'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','container=docker'}:raise ValueError('Environment')
 return True
BOOT_CODES={70:'identity',71:'cgroup-root',72:'limits',73:'mount-topology',74:'remount',75:'public-sources',76:'units',77:'systemd-exec'}
def process_identity(value):
 if type(value) is not dict or value.get('Running') is not True or value.get('Restarting') is not False:return None
 pid=value.get('Pid');started=value.get('StartedAt')
 if type(pid) is not int or not 0<pid<=2**31-1 or type(started) is not str or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z',started):return None
 return {'pid':pid,'startedAt':started}
def systemd_barrier(before,top,after):
 identity=process_identity(before)
 if identity is None or process_identity(after)!=identity:return {'status':'identity-unavailable-or-changed'}
 if type(top) is not bytes or len(top)>8192:return {'status':'invalid-process-list'}
 try:lines=top.decode('ascii').splitlines()
 except UnicodeError:return {'status':'invalid-process-list'}
 if not 1<=len(lines)<=129 or lines[0].split()!=['PID','COMMAND']:return {'status':'invalid-process-list'}
 matches=[];seen=set()
 for line in lines[1:]:
  fields=line.split()
  if len(fields)!=2 or not re.fullmatch('[0-9]{1,10}',fields[0]):return {'status':'invalid-process-list'}
  pid=int(fields[0])
  if not 0<pid<=2**31-1 or pid in seen:return {'status':'invalid-process-list'}
  seen.add(pid)
  if pid==identity['pid']:matches.append(fields[1])
 if len(matches)!=1:return {'status':'pid-not-observed'}
 return {'status':'ready' if matches[0]=='systemd' else 'boot-pending','identity':identity,'processCount':len(seen)}
def read_after_barrier(cid,identity,name,inspect_state,call,reader):
 if type(cid) is not str or not re.fullmatch('[a-f0-9]{64}',cid) or name not in ('preflight.json','regression.json'):raise ValueError('Reader target')
 if identity is None or process_identity(inspect_state())!=identity:raise ValueError('Reader identity changed')
 p=call(['exec','--user','0',cid,'/usr/bin/python3','-c',reader,name],limit=2)
 if process_identity(inspect_state())!=identity:raise ValueError('Reader identity changed')
 if p.returncode or type(p.stdout) is not bytes or len(p.stdout)>17408:raise ValueError('Reader output bound')
 value=json.loads(p.stdout)
 if type(value) is not dict:raise ValueError('Reader envelope')
 if value=={'status':'missing'}:return None
 if set(value)!={'status','record'} or value['status']!='read' or type(value['record']) is not dict:raise ValueError('Reader envelope')
 maximum=1024 if name=='preflight.json' else 16384
 if len(json.dumps(value['record'],separators=(',',':')).encode())>maximum:raise ValueError('Reader record bound')
 return value['record']
def boot_failure(value):
 observed=state(value)
 return {'status':'boot-phase-failure','phase':BOOT_CODES[observed['ExitCode']]} if observed['Status']=='exited' and not observed['Running'] and not observed['OOMKilled'] and observed['ExitCode'] in BOOT_CODES else {'status':'unclassified-container-exit'}
def inspect_fields(info):
 # Public fixed-field diagnostic only. No unknown string, Config object, Env
 # value, entrypoint, mount source/destination or arbitrary key is retained.
 missing=object()
 def get(*keys):
  value=info
  for key in keys:
   if type(value) is not dict or key not in value:return missing
   value=value[key]
  return value
 def project(value,kind,allowed=()):
  if value is missing:return {'status':'missing'}
  if value is None:return {'status':'null'}
  if kind=='bool':return {'status':'observed','value':value} if type(value) is bool else {'status':'invalid-type'}
  if kind=='int':return {'status':'observed','value':value} if type(value) is int and 0<=value<=2**63-1 else {'status':'invalid-type-or-range'}
  if kind=='enum':
   if type(value) is not str:return {'status':'invalid-type'}
   return {'status':'observed','value':value} if value in allowed else {'status':'unlisted-value'}
  if kind=='list':
   if type(value) is not list:return {'status':'invalid-type'}
   if len(value)>16:return {'status':'oversized-list'}
   return {'status':'observed','count':len(value),'values':[x if type(x) is str and x in allowed else 'unlisted-value' for x in value]}
  if kind=='empty':
   if type(value) not in (list,dict):return {'status':'invalid-type'}
   return {'status':'observed','count':len(value)} if len(value)<=128 else {'status':'oversized-container'}
  raise ValueError('Closed projection kind')
 rows={}
 def add(name,keys,expected,kind,allowed=()):
  v=get(*keys);rows[name]={'expected':expected,'equal':type(v) is type(expected) and v==expected,'observed':project(v,kind,allowed)}
 for name,expected,allowed in [('NetworkMode','none',('none','bridge','host','default')),('CgroupnsMode','private',('private','host','')),('PidMode','',('','host','private')),('IpcMode','private',('private','host','shareable','none',''))]:add(name,('HostConfig',name),expected,'enum',allowed)
 for name,expected in [('Privileged',False),('ReadonlyRootfs',True)]:add(name,('HostConfig',name),expected,'bool')
 for name in ('Binds','Devices','DeviceRequests'):
  v=get('HostConfig',name);rows[name]={'expected':'absent-or-empty','empty':v is None or type(v) in (list,dict) and len(v)==0,'observed':project(v,'empty')}
 v=get('Mounts');rows['Mounts']={'expected':'empty','empty':type(v) is list and len(v)==0,'observed':project(v,'empty')}
 if type(v) is list and len(v)<=16:rows['Mounts']['types']=[project(x.get('Type',missing) if type(x) is dict else missing,'enum',('tmpfs','bind','volume','image','cluster','npipe')) for x in v]
 for name,expected in [('Memory',536870912),('MemorySwap',536870912),('NanoCpus',2000000000),('PidsLimit',128)]:add(name,('HostConfig',name),expected,'int')
 caps=('SYS_ADMIN','NET_RAW','NET_BIND_SERVICE','CAP_SYS_ADMIN','CAP_NET_RAW','CAP_NET_BIND_SERVICE','ALL','SYS_PTRACE','CAP_SYS_PTRACE')
 add('CapAdd',('HostConfig','CapAdd'),['CAP_SYS_ADMIN'],'list',caps)
 add('CapDrop',('HostConfig','CapDrop'),['CAP_NET_RAW','CAP_NET_BIND_SERVICE'],'list',caps)
 add('SecurityOpt',('HostConfig','SecurityOpt'),['no-new-privileges'],'list',('no-new-privileges','no-new-privileges=true','seccomp=unconfined','apparmor=unconfined'))
 add('LogType',('HostConfig','LogConfig','Type'),'none','enum',('none','json-file','local','journald'))
 v=get('HostConfig','Tmpfs');rows['Tmpfs']={'expectedCount':len(TMPFS),'exactMatch':type(v) is dict and v==TMPFS,'observed':project(v,'empty')}
 rows['Tmpfs']['expectedTargetChecks']={k:{'present':type(v) is dict and k in v,'optionsEqual':type(v) is dict and type(v.get(k)) is str and v[k]==options} for k,options in TMPFS.items()}
 v=get('Config','Env');expected=['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','container=docker']
 rows['Environment']={'exactMatch':type(v) is list and v==expected,'observed':project(v,'empty')}
 if type(v) is list and len(v)<=16:rows['Environment']['entryChecks']=[{'knownKey':x.split('=',1)[0] if type(x) is str and x.split('=',1)[0] in ('PATH','container') else 'unlisted-key','expectedValue':type(x) is str and x in expected} for x in v]
 v=get('Image');rows['Image']={'expectedBoundId':IMAGE,'matches':type(v) is str and v==IMAGE,'status':'missing' if v is missing else 'observed' if type(v) is str else 'invalid-type'}
 return {'schemaVersion':1,'fields':rows,'rawInspectRetained':False,'predicateVersion':'measured-cap-prefix-and-env-order-v1'}
def cleanup(cid,call,report,persist):
 if type(cid) is not str or not re.fullmatch('[a-f0-9]{64}',cid):
  report['containerAbsent']=None;report['cleanupError']='ownership-unverified';return
 errors=[]
 try:report['beforeCleanupState']=state(json.loads(call(['inspect',cid,'--format','{{json .State}}'],cleanup=True).stdout))
 except Exception:errors.append('state-unavailable')
 try:persist()
 except Exception:errors.append('evidence-unavailable')
 for args in (['kill',cid],['wait',cid],['rm','--force',cid]):
  try:call(args,check=False,cleanup=True)
  except Exception:errors.append(args[0]+'-unavailable')
 try:
  p=call(['ps','-aq','--filter','id='+cid],cleanup=True)
  report['containerAbsent']=p.returncode==0 and not p.stdout.strip()
 except Exception:report['containerAbsent']=None;errors.append('absence-unavailable')
 if errors:report['cleanupErrors']=errors
def main():
 if sys.argv[1:]!=['--execute-reviewed-once']:raise SystemExit('Separate execution grant required')
 if any(sha(D/p)!=s for p,s in PINS.items()):raise ValueError('Source changed')
 out=D/'actual';out.mkdir(mode=0o700) # Never replay an existing invocation.
 start=time.monotonic();operation=start+43;end=start+60
 name='rolling-systemd-exception-'+uuid.uuid4().hex[:12];label=sha(D/'run.py')
 report={'schemaVersion':1,'name':name,'image':IMAGE,'sourceSha256':label,'passed':False,'nativeQualified':False,'containerAbsent':None,'calls':[]}
 cid=None;attempted=False
 def interrupted(signum,frame):raise InterruptedError('Interrupted')
 signal.signal(signal.SIGTERM,interrupted)
 def call(args,limit=5,check=True,cleanup=False):
  left=(end if cleanup else operation)-time.monotonic()
  if left<=0:raise TimeoutError('Deadline')
  # Five independently attempted cleanup calls fit the reserved17s (<=3 each).
  if cleanup:limit=min(limit,3)
  try:p=subprocess.run([DOCKER,'--context','desktop-linux',*args],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(limit,left),env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':str(pathlib.Path.home())})
  except subprocess.TimeoutExpired:report['calls'].append({'operation':args[0],'timeout':True});raise
  report['calls'].append({'operation':args[0],'code':p.returncode,'stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr),'stderrSha256':hashlib.sha256(p.stderr).hexdigest()})
  if len(p.stdout)>65536 or len(p.stderr)>65536:raise ValueError('Output bound')
  if check and p.returncode:raise ValueError('Docker operation')
  return p
 def reconcile():
  p=call(['inspect',name,'--format','{{json .Id}} {{json .Name}} {{json (index .Config.Labels "rolling.offline-source")}}'],check=False,cleanup=True)
  if p.returncode:return None
  m=re.fullmatch(rb'"([a-f0-9]{64})" "/'+name.encode()+rb'" "'+label.encode()+rb'"\n?',p.stdout)
  if not m:raise ValueError('Unknown ownership')
  return m[1].decode()
 def inspect_state():
  return json.loads(call(['inspect',cid,'--format','{{json .State}}'],limit=2).stdout)
 def read_record(name,identity):
  value=read_after_barrier(cid,identity,name,inspect_state,call,(D/'receipt-reader.py').read_text())
  if value is not None:save(out/name,value)
  return value

 try:
  if call(['ps','-q']).stdout.strip():raise ValueError('Other container running')
  if call(['ps','-aq','--filter','name=^/'+name+'$']).stdout.strip():raise ValueError('Name collision')
  report['containerAbsent']=True
  image=json.loads(call(['image','inspect',IMAGE,'--format','{{json .}}']).stdout)
  if image['Id']!=IMAGE or image['Architecture']!='arm64' or image['Os']!='linux' or image['Size']!=53964743:raise ValueError('Image binding')
  save(out/'intent.json',{'name':name,'image':IMAGE,'sourceSha256':label,'pins':PINS,'seconds':60,'memoryMiB':512,'cpu':2,'attempts':1,'noNetwork':True})
  args=['create','--pull=never','--platform=linux/arm64','--name',name,'--label','rolling.offline-source='+label,'--network=none','--cgroupns=private','--ipc=private','--read-only','--memory=512m','--memory-swap=512m','--cpus=2','--pids-limit=128','--cap-add=SYS_ADMIN','--cap-drop=NET_RAW','--cap-drop=NET_BIND_SERVICE','--security-opt=no-new-privileges','--log-driver=none','--stop-signal=SIGRTMIN+3','--stop-timeout=2','--env','container=docker']
  for target,options in TMPFS.items():args.extend(['--tmpfs',target+':'+options])
  args.extend(['--entrypoint','/usr/bin/python3',IMAGE,'-c',(D/'boot-bound.py').read_text()])
  save(out/'create-intent.json',{'name':name,'sourceSha256':label,'bootSha256':PINS['boot-bound.py'],'attempts':1});attempted=True;report['containerAbsent']=None
  p=call(args)
  if not re.fullmatch(rb'[a-f0-9]{64}\n?',p.stdout):raise ValueError('Create identity')
  cid=p.stdout.decode().strip();report['containerId']=cid
  if reconcile()!=cid:raise ValueError('Ownership')
  info=json.loads(call(['inspect',cid,'--format','{{json .}}']).stdout)
  report['fieldDiagnostic']=inspect_fields(info)
  save(out/'host-inspect-projection.json',report['fieldDiagnostic'])
  report['hostConfinement']=confined(info)
  if state(info['State'])['Status']!='created':raise ValueError('Unexpected start')
  save(out/'start-intent.json',{'containerId':cid,'attempts':1});call(['start',cid])
  preflight=None;receipt=None;identity=None
  while time.monotonic()<operation:
   before=inspect_state();observed=state(before)
   if not observed['Running']:
    report['earlyExitState']=observed;report['bootFailure']=boot_failure(before) if identity is None else {'status':'post-barrier-container-exit'};raise ValueError('Guest exited')
   if identity is None:
    top=call(['top',cid,'-eo','pid,comm'],limit=2)
    barrier=systemd_barrier(before,top.stdout,inspect_state());report['systemdBarrier']=barrier
    if barrier['status']=='boot-pending':
     time.sleep(min(.5,max(0,operation-time.monotonic())));continue
    if barrier['status']!='ready':raise ValueError('Systemd identity barrier')
    identity=barrier['identity']
   if preflight is None:
    preflight=read_record('preflight.json',identity);report['preflight']=preflight
    if preflight!={'passed':True,'category':'confined'}:raise ValueError('Guest confinement')
   receipt=read_record('regression.json',identity)
   if receipt is not None:break
   time.sleep(min(.5,max(0,operation-time.monotonic())))
  if receipt is None:raise TimeoutError('Regression deadline')
  report['receiptSha256']=sha(out/'regression.json');report['regression']=receipt
  if receipt.get('passed') is not True or receipt.get('nativeQualified') is not False or [r.get('label') for r in receipt.get('cases',[])]!=['baseline','success','nonzero','timeout'] or [r.get('outcome') for r in receipt['cases'][1:]]!=['passed','nonzero','timeout']:raise ValueError('Regression failed')
  report['passed']=True
 except Exception as e:report['errorCategory']='timeout' if isinstance(e,(TimeoutError,subprocess.TimeoutExpired)) else 'precondition-or-operation'
 finally:
  if attempted and cid is None:
   try:cid=reconcile()
   except Exception:report['cleanupError']='ownership-unverified'
  if cid:cleanup(cid,call,report,lambda:save(out/'before-cleanup.json',report))
  report['elapsedMs']=round((time.monotonic()-start)*1000)
  report['sourceUnchanged']=all(sha(D/p)==s for p,s in PINS.items())
  report['passed']=report['passed'] and report['sourceUnchanged'] and report['containerAbsent'] is True and report.get('beforeCleanupState',{}).get('OOMKilled') is False and not report.get('cleanupErrors') and not report.get('cleanupError')
  save(out/'result.json',report)
  print(json.dumps({'passed':report['passed'],'containerAbsent':report['containerAbsent'],'receipt':str(out/'result.json')}))
 return 0 if report['passed'] else 1
if __name__=='__main__':sys.exit(main())
