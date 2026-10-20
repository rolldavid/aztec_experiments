"""One local public systemd-image setup, only after separate reviewed slot grant.
No cloud calls; no existing containers/images removed; no test/native job runs.
"""
import hashlib,json,os,pathlib,re,subprocess,sys,time,uuid,shutil,signal
D=pathlib.Path(__file__).resolve().parent
DOCKER='/usr/local/bin/docker'
IMAGE='sha256:8e0b572feae06ff8843f458d2cc4343ecd6995c37f254c0e5de547433c674aee'
EXPECTED_INPUTS={'setup.sh': '5879c43a83ce38422a85c901df00162735fdde3083256e1b619f8aa1d5eabcd8', 'closure.py': 'aa9475610bc11b2fdcddf80daa56243b484f2e0ef724cb1e509488fd34c59ab8'}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(path,value):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 try:os.write(fd,(json.dumps(value,sort_keys=True)+'\n').encode());os.fsync(fd)
 finally:os.close(fd)
 fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)

def capture_setup_diagnostics(cid,call,out,report):
 # Only fixed public files from this owned public-only container. Capture failure
 # is diagnostic, never a precondition for subsequent owned-ID cleanup.
 diagnostics={}
 for name,maximum in [('setup-stage',64),('setup.log',65536)]:
  dest=out/('public-'+name)
  try:
   if dest.exists() or dest.is_symlink():raise ValueError('Diagnostic collision')
   call(['cp',cid+':/opt/rolling-systemd-regression/'+name,str(dest)],limit=2,cleanup=True)
   if dest.is_symlink() or not dest.is_file() or dest.stat().st_size>maximum:raise ValueError('Diagnostic bounds')
   dest.chmod(0o600);data=dest.read_bytes()
   row={'status':'captured','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
   if name=='setup-stage':
    stage=data.decode('ascii').strip()
    if stage not in ('apt-index','apt-plan','apt-download','apt-install','closure','complete'):raise ValueError('Stage projection')
    row['stage']=stage
   diagnostics[name]=row
  except Exception:diagnostics[name]={'status':'unavailable'}
 report['publicDiagnostics']=diagnostics

def cleanup_owned(cid,call,persist,report,*,owned=False):
 # cid is accepted only from our successful exclusive create response or exact
 # name/source-label reconciliation. Diagnostic failure cannot revoke cleanup.
 if owned is not True or type(cid) is not str or not re.fullmatch('[a-f0-9]{64}',cid):
  report['containerAbsent']=None
  report['cleanupError']='ownership-unverified'
  return
 errors=[]
 try:
  state=json.loads(call(['inspect',cid,'--format','{{json .State}}'],cleanup=True).stdout)
  report['beforeCleanupState']={k:state[k] for k in ('Status','Running','ExitCode','OOMKilled','Dead')}
 except Exception:errors.append('state-unavailable')
 try:persist(report)
 except Exception:errors.append('evidence-unavailable')
 # Even a failed/unknown inspect or kill must not prevent the next independently
 # bounded cleanup operation. --force is scoped to this immutable owned ID.
 for args in (['kill',cid],['wait',cid],['rm','--force',cid]):
  try:call(args,check=False,cleanup=True)
  except Exception:errors.append(args[0]+'-unavailable')
 try:
  remaining=call(['ps','-aq','--filter','id='+cid],cleanup=True)
  report['containerAbsent']=remaining.returncode==0 and remaining.stdout.strip()==b''
 except Exception:
  report['containerAbsent']=None;errors.append('absence-unavailable')
 if errors:report['cleanupDiagnosticErrors']=errors
 if report['containerAbsent'] is not True:report['cleanupError']='cleanup-unverified'

def main():
 if sys.argv[1:]!=['--execute-reviewed-once']:raise SystemExit('Preparation only: explicit execution required')
 if not EXPECTED_INPUTS or any(sha(D/p)!=h for p,h in EXPECTED_INPUTS.items()):raise ValueError('Source binding')
 out=D/'setup-actual';out.mkdir(mode=0o700) # Existing outcome/intent never replayed.
 name='rolling-systemd-bus-setup-'+uuid.uuid4().hex[:12]
 tag=name+':verified';label=sha(D/'setup.py');started=time.monotonic();deadline=started+150;cleanup_deadline=started+180
 def interrupted(signum,frame):raise InterruptedError('Setup interrupted')
 signal.signal(signal.SIGTERM,interrupted)
 report={'schemaVersion':1,'name':name,'image':IMAGE,'sourceSha256':label,'passed':False,'containerAbsent':None,'nativeQualified':False,'calls':[]}
 cid=None;attempted=False
 def call(args,limit=10,check=True,cleanup=False):
  remaining=(cleanup_deadline if cleanup else deadline)-time.monotonic()
  if cleanup:limit=min(limit,5)
  if remaining<=0:raise TimeoutError('Setup deadline')
  begin=time.monotonic()
  try:
   # No inherited developer environment/config reference is passed into guests.
   p=subprocess.run([DOCKER,'--context','desktop-linux',*args],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(limit,remaining),env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':str(pathlib.Path.home())})
  except subprocess.TimeoutExpired:
   report['calls'].append({'operation':args[0],'timeout':True});raise
  report['calls'].append({'operation':args[0],'code':p.returncode,'elapsedMs':round((time.monotonic()-begin)*1000),'stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr),'stderrSha256':hashlib.sha256(p.stderr).hexdigest()})
  if len(p.stdout)>65536 or len(p.stderr)>65536:raise ValueError('Command output bound')
  if check and p.returncode:raise ValueError('Docker command failed')
  return p
 def inspect_owned(cleanup=False):
  p=call(['inspect',name,'--format','{{json .Id}} {{json .Name}} {{json (index .Config.Labels "rolling.setup-source")}}'],check=False,cleanup=cleanup)
  if p.returncode:return None
  match=re.fullmatch(rb'"([a-f0-9]{64})" "/'+name.encode()+rb'" "'+label.encode()+rb'"\n?',p.stdout)
  if not match:raise ValueError('Unknown container ownership')
  return match[1].decode()
 try:
  if shutil.disk_usage(D).free<2147483648:raise ValueError('Disk precondition')
  p=call(['ps','-q']);report['preflightRunningCount']=len(p.stdout.splitlines())
  if p.stdout.strip():raise ValueError('Other container active')
  p=call(['ps','-aq','--filter','name=^/'+name+'$'])
  if p.stdout.strip():raise ValueError('Name collision')
  report['containerAbsent']=True
  save(out/'intent.json',{'name':name,'tag':tag,'sourceSha256':label,'image':IMAGE,'attempts':1,'deadlineSeconds':180,'memoryMiB':512,'cpu':2,'network':'public setup only','archiveBytesMax':104857600})
  # Reuse the exact public base retained by the failed predecessor. No pull or fallback.
  image=json.loads(call(['image','inspect',IMAGE,'--format','{{json .}}']).stdout)
  if image['Id']!=IMAGE or image['Architecture']!='arm64' or image['Os']!='linux':raise ValueError('Image identity')
  report['baseImageId']=image['Id'];report['baseBytes']=image['Size']
  if image['Size']>268435456:raise ValueError('Base size')
  create=['create','--pull=never','--platform=linux/arm64','--name',name,'--label','rolling.setup-source='+label,'--network=bridge','--memory=512m','--memory-swap=512m','--cpus=2','--pids-limit=128','--cap-drop=NET_RAW','--cap-drop=NET_BIND_SERVICE','--security-opt=no-new-privileges','--log-driver=none','--tmpfs','/run:rw,nosuid,nodev,size=16m','--tmpfs','/var/lib/apt/lists:rw,nosuid,nodev,size=64m','--tmpfs','/var/cache/apt/archives:rw,nosuid,nodev,size=100m','--entrypoint','/bin/sh',IMAGE,'/opt/rolling-setup.sh']
  save(out/'create-intent.json',{'name':name,'sourceSha256':label,'args':create});attempted=True;report['containerAbsent']=None
  p=call(create)
  if not re.fullmatch(rb'[a-f0-9]{64}\n?',p.stdout):raise ValueError('Create identity')
  cid=p.stdout.decode().strip();report['containerId']=cid;report['containerAbsent']=False
  if inspect_owned()!=cid:raise ValueError('Create readback')
  call(['cp',str(D/'setup.sh'),cid+':/opt/rolling-setup.sh'])
  call(['cp',str(D/'closure.py'),cid+':/opt/rolling-closure.py'])
  # Public closure helper path is fixed in setup.sh, no host mounts.
  save(out/'start-intent.json',{'containerId':cid,'attempts':1})
  call(['start',cid])
  code=call(['wait',cid],limit=160).stdout.strip()
  state=json.loads(call(['inspect',cid,'--format','{{json .State}}']).stdout)
  report['state']={k:state[k] for k in ('Status','Running','ExitCode','OOMKilled','Dead')}
  size=json.loads(call(['inspect','--size',cid,'--format','{{json .SizeRw}}']).stdout);report['writableBytes']=size
  if code!=b'0' or state['Running'] or state['ExitCode']!=0 or state['OOMKilled'] or not isinstance(size,int) or not 0<=size<=1073741824:raise ValueError('Setup failed')
  closure=out/'closure.json';call(['cp',cid+':/opt/rolling-systemd-regression/closure.json',str(closure)])
  if closure.is_symlink() or not closure.is_file() or closure.stat().st_size>65536:raise ValueError('Closure file')
  data=json.loads(closure.read_bytes())
  if data.get('parentImage')!=IMAGE or data.get('parentClosureSha256')!='41001f37ac6c7cd235bebe934c46e42c9060cc1f880104df60c3d4fffa791975' or data.get('parentPackagesUnchanged') is not True or data.get('authenticatedApt') is not True or not 0<=data['receivedBytes']<=157286400:raise ValueError('Closure policy')
  report['closureSha256']=sha(closure);report['receivedBytes']=data['receivedBytes']
  save(out/'commit-intent.json',{'containerId':cid,'tag':tag,'attempts':1,'closureSha256':report['closureSha256']})
  committed=call(['commit',cid,tag],limit=20).stdout.strip()
  if not re.fullmatch(rb'sha256:[a-f0-9]{64}',committed):raise ValueError('Image commit identity')
  final=json.loads(call(['image','inspect',committed.decode(),'--format','{{json .}}']).stdout)
  if final['Id']!=committed.decode() or final['Size']>report['baseBytes']+1073741824:raise ValueError('Final image bounds')
  report['derivedImageId']=final['Id'];report['derivedBytes']=final['Size'];report['passed']=True
 except Exception as error:
  report['errorCategory']='timeout' if isinstance(error,subprocess.TimeoutExpired) or isinstance(error,TimeoutError) else 'precondition-or-operation'
 finally:
  try:
   if attempted and cid is None:cid=inspect_owned(cleanup=True) # Read-only reconcile unknown create, never recreate.
   if cid:
    def persist_cleanup(value):
     capture_setup_diagnostics(cid,call,out,value)
     save(out/'before-cleanup.json',value)
    cleanup_owned(cid,call,persist_cleanup,report,owned=True)
  except Exception:report['cleanupError']='cleanup-unverified';report['containerAbsent']=None
  report['elapsedMs']=round((time.monotonic()-started)*1000)
  report['passed']=report['passed'] and report['containerAbsent'] is True and not report.get('cleanupDiagnosticErrors') and not report.get('cleanupError')
  save(out/'result.json',report)
  print(json.dumps({'passed':report['passed'],'containerAbsent':report['containerAbsent'],'receipt':str(out/'result.json')}))
 return 0 if report['passed'] else 1
if __name__=='__main__':sys.exit(main())
