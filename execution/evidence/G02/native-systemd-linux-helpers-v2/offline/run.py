"""One separately granted harmless offline systemd regression; no native binary."""
import hashlib,json,os,pathlib,re,signal,subprocess,sys,time,uuid
D=pathlib.Path(__file__).resolve().parent
DOCKER='/usr/local/bin/docker'
IMAGE='sha256:8e0b572feae06ff8843f458d2cc4343ecd6995c37f254c0e5de547433c674aee'
PINS={'boot-bound.py':'2244105a259c832e501e44ae7b5fbb11eeb655b543bad0fe2853cb76bd85ef57','driver.py':'eb8e59158d2293e9e45c12628c882126b33960675a5f62567a42493a151fe7ea','native-subset.py':'79fb4e3a89e77ed05ec659aa84470a3cb8269ec8c868a395ab49ec2d5ed90176','../setup-actual/closure.json':'41001f37ac6c7cd235bebe934c46e42c9060cc1f880104df60c3d4fffa791975'}
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
 if h['CapAdd']!=['SYS_ADMIN'] or set(h['CapDrop'])!={'NET_RAW','NET_BIND_SERVICE'} or h['SecurityOpt']!=['no-new-privileges'] or h['LogConfig']['Type']!='none' or h['Tmpfs']!=TMPFS:raise ValueError('Capabilities')
 if info['Config']['Env']!=['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','container=docker']:raise ValueError('Environment')
 return True
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
 name='rolling-systemd-offline-'+uuid.uuid4().hex[:12];label=sha(D/'run.py')
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
 def copy_record(name,maximum):
  dest=out/name
  p=call(['cp',cid+':/run/'+name,str(dest)],limit=2,check=False)
  if p.returncode:
   if dest.exists():raise ValueError('Partial record')
   return None
  if dest.is_symlink() or not dest.is_file() or dest.stat().st_size>maximum:raise ValueError('Record bounds')
  dest.chmod(0o600);value=json.loads(dest.read_bytes())
  if type(value) is not dict:raise ValueError('Record schema')
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
  report['hostConfinement']=confined(info)
  if state(info['State'])['Status']!='created':raise ValueError('Unexpected start')
  save(out/'start-intent.json',{'containerId':cid,'attempts':1});call(['start',cid])
  preflight=None;receipt=None
  while time.monotonic()<operation:
   if preflight is None:
    preflight=copy_record('preflight.json',1024)
    if preflight is not None:
     report['preflight']=preflight
     if preflight!={'passed':True,'category':'confined'}:raise ValueError('Guest confinement')
   if preflight is not None:
    receipt=copy_record('regression.json',16384)
    if receipt is not None:break
   observed=state(json.loads(call(['inspect',cid,'--format','{{json .State}}']).stdout))
   if not observed['Running']:report['earlyExitState']=observed;raise ValueError('Guest exited')
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
