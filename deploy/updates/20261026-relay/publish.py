"""Apply a reviewed two-file app overlay; retain UI, proxy and native services."""
import pathlib,json,hashlib,shutil,subprocess,os,sys
P=pathlib.Path
packet=P(sys.argv[1]);plan=json.loads((packet/'plan.json').read_text());base=P(plan['configuredSource']);target=P('/opt/rolling-app/releases/relay-'+plan['commit'][:12])
sha=lambda p:hashlib.sha256(P(p).read_bytes()).hexdigest()
def run(*args):return subprocess.check_output(args,text=True).strip()
def prop(unit,key):return run('systemctl','show',unit,'-p',key,'--value')
def atomic(path,data,mode):
 temp=path.with_name(path.name+'.relay-update');temp.write_bytes(data);temp.chmod(mode);os.replace(temp,path)
def ready(source):
 pid=int(prop('rolling-application.service','MainPID'));assert pid>0
 # Type=simple may return before the child has completed exec/chdir. The
 # successful HTTP response below is the startup boundary, then verify cwd.
 # Native SDK polling observes HTTP readiness; timeout is a deployment watchdog.
 port=json.loads(P('/etc/rolling-app/public.json').read_text())['port']
 assert isinstance(port,int) and 0<port<65536
 js="import {retryUntil} from '@aztec-labs/foundation/retry';await retryUntil(async()=>{try{const r=await fetch("+json.dumps('http://127.0.0.1:'+str(port)+'/api/status')+",{signal:AbortSignal.timeout(5000)});return r.ok&&(await r.json()).state==='ready';}catch{return false;}},'application readiness',90);"
 subprocess.run([plan['node'],'--input-type=module','-e',js],cwd=source,check=True,timeout=100)
 assert int(prop('rolling-application.service','MainPID'))==pid and P('/proc',str(pid),'cwd').resolve()==source
 return pid
assert os.getuid()==0 and not target.exists()
assert prop('rolling-application.service','WorkingDirectory')==str(base)
assert int(prop('rolling-application.service','MainPID'))==plan['appPid']
assert P('/proc',str(plan['appPid']),'cwd').resolve()==P(plan['runningSource'])
assert os.readlink('/opt/rolling-ui/current')==plan['expectedCurrentUi']
for file,want in plan['unitFiles'].items():assert sha(file)==want
for file,want in plan['configHashes'].items():assert sha(file)==want
for unit,pid in plan['protectedPids'].items():assert int(prop(unit,'MainPID'))==pid
assert sha(base/'.build/rolling-wallet/manifest.json')==plan['walletManifestSha256']
assert sha(base/'.build/sdk/sdk-manifest.json')==plan['sdkManifestSha256']
assert set(plan['files'])=={'plugins/rolling-funding-relay.mjs','scripts/rolling-public-server.mjs'}
for name,entry in plan['files'].items():
 assert sha(base/name)==entry['before'] and sha(packet/'files'/name)==entry['after']
# Existing dependency links remain links; never copy or mutate their targets.
assert (base/'node_modules').is_symlink()
shutil.copytree(base,target,symlinks=True)
for name,entry in plan['files'].items():
 destination=target/name;assert not destination.is_symlink()
 atomic(destination,(packet/'files'/name).read_bytes(),destination.stat().st_mode&0o777)
 assert sha(destination)==entry['after']
 subprocess.run([plan['node'],'--check',str(destination)],check=True)
assert os.readlink(target/'node_modules')==os.readlink(base/'node_modules')
unit=P(plan['appUnit']);old=unit.read_bytes();rows=old.decode().splitlines(keepends=True)
new=''.join(line.replace(str(base),str(target)) if line.startswith(('WorkingDirectory=','ExecStart=')) else line for line in rows).encode()
rollback=''.join(line.replace(str(base),plan['runningSource']) if line.startswith(('WorkingDirectory=','ExecStart=')) else line for line in rows).encode()
assert new!=old
for name,want in plan['configHashes'].items():assert sha(name)==want
for file,want in plan['unitFiles'].items():assert sha(file)==want
for name,pid in plan['protectedPids'].items():assert int(prop(name,'MainPID'))==pid
assert prop('rolling-application.service','WorkingDirectory')==str(base)
assert P('/proc',str(plan['appPid']),'cwd').resolve()==P(plan['runningSource'])
assert os.readlink('/opt/rolling-ui/current')==plan['expectedCurrentUi']
atomic(unit,new,unit.stat().st_mode&0o777)
try:
 subprocess.run(['systemctl','daemon-reload'],check=True)
 subprocess.run(['systemctl','restart','rolling-application.service'],check=True)
 assert prop('rolling-application.service','ActiveState')=='active'
 pid=ready(target);assert pid!=plan['appPid']
 for name,previous in plan['protectedPids'].items():
  if name!='rolling-application.service':assert int(prop(name,'MainPID'))==previous
 assert os.readlink('/opt/rolling-ui/current')==plan['expectedCurrentUi']
except BaseException:
 atomic(unit,rollback,unit.stat().st_mode&0o777)
 subprocess.run(['systemctl','daemon-reload'],check=True)
 subprocess.run(['systemctl','restart','rolling-application.service'],check=True)
 ready(P(plan['runningSource']))
 raise
print(json.dumps({'published':plan['commit'],'appPid':pid,'appSource':str(target),'proxyPid':plan['protectedPids']['rolling-application-proxy.service'],'uiUnchanged':True}))
