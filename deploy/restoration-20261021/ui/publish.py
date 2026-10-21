#!/usr/bin/env python3
"""Repeat static UI publication. Run stage, review result, then activate.
Packet plan.json: commit(40hex), configuredSource, runningSource, appPid,
appStartTime(/proc/PID/stat field22), configHashes{absolute:sha256}, unitFiles
{absolute:sha256}, files{relative:{sha256,previousSha256|null}}, caddySha256,
protectedPids{unit:pid} (including the application proxy), node, nodeSha256,
appUnit (base unit in unitFiles), notifySha256, expectedCurrentUi (exact absolute
current symlink target). Caddy routing and its notify drop-in must already exist.
Payload at packet/files/<relative>. No private values leave host.
"""
import hashlib,json,os,pathlib,re,shlex,stat,subprocess,sys,urllib.request
P=pathlib.Path(sys.argv[1]).resolve();mode=sys.argv[2];assert mode in ('stage','activate')
m=json.loads((P/'plan.json').read_text());assert re.fullmatch('[0-9a-f]{40}',m['commit'])
BASE=pathlib.Path('/opt/rolling-ui');SOURCE=pathlib.Path(m['configuredSource']);RUNNING=pathlib.Path(m['runningSource']);NEXT=pathlib.Path('/opt/rolling-app/releases/ui-'+m['commit'][:12]);UI=BASE/'releases'/m['commit'];CADDY=pathlib.Path('/etc/rolling-app/Caddyfile')
NOTIFY=pathlib.Path('/etc/systemd/system/rolling-application-proxy.service.d/90-ui-ready.conf')
sha=lambda b:hashlib.sha256(b).hexdigest()
def digest(p):return sha(p.read_bytes())
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def atomic(p,data,mode=0o644,uid=0,gid=0):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.new');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  os.fchmod(fd,mode);os.fchown(fd,uid,gid)
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(tmp,p);fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 except:raise

def check_current(expected):
 current=BASE/'current'
 assert current.is_symlink() and os.readlink(current)==str(expected)
 assert current.resolve()==pathlib.Path(expected).resolve() and pathlib.Path(expected).is_dir()

def switch_current(expected,target):
 check_current(expected)
 temporary=BASE/'current.new';assert not temporary.exists() and not temporary.is_symlink()
 os.symlink(target,temporary);os.replace(temporary,BASE/'current')
 fd=os.open(BASE,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)

def preserved(configured=SOURCE,unit_hash=None,current=None):
 assert run(['systemctl','show','rolling-application.service','-p','MainPID','--value'])==str(m['appPid'])
 assert pathlib.Path('/proc/'+str(m['appPid'])+'/cwd').resolve()==RUNNING
 assert pathlib.Path('/proc/'+str(m['appPid'])+'/stat').read_text().rsplit(')',1)[1].split()[19]==str(m['appStartTime'])
 assert 'rolling-application-proxy.service' in m['protectedPids']
 for unit,pid in m['protectedPids'].items():assert isinstance(pid,int) and pid>0 and re.fullmatch(r'[A-Za-z0-9-]+\.service',unit) and run(['systemctl','show',unit,'-p','MainPID','--value'])==str(pid)
 for name,want in m['configHashes'].items():assert digest(pathlib.Path(name))==want
 for name,want in m['unitFiles'].items():assert digest(pathlib.Path(name))==(unit_hash if unit_hash and name==m['appUnit'] else want)
 assert digest(CADDY)==m['caddySha256'] and not CADDY.is_symlink()
 assert digest(NOTIFY)==m['notifySha256'] and not NOTIFY.is_symlink()
 assert run(['systemctl','show','rolling-application.service','-p','WorkingDirectory','--value'])==str(configured)
 check_current(current or m['expectedCurrentUi'])

def safe_relative(name):
 p=pathlib.PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts and str(p)==name and 'node_modules' not in p.parts
 assert name.startswith(('apps/','shared/','scripts/','.build/sdk/','.build/rolling-wallet/'))
 return p

EXPORT=r'''import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [source,walletFile,publicFile]=process.argv.slice(1);const {loadRollingWalletAssets}=await import(pathToFileURL(source+'/scripts/rolling-wallet-assets.mjs'));
const wallet=await loadRollingWalletAssets(JSON.parse(await fs.readFile(walletFile)),JSON.parse(await fs.readFile(publicFile)).scope);
const manifest=JSON.parse(await fs.readFile(source+'/.build/rolling-wallet/manifest.json'));
// Validators above bind source, artifacts, SDK, CRS, configuration and deployment.
process.stdout.write(JSON.stringify({runtime:wallet.runtime,files:manifest.files}));'''

def wallet(source,node):
 return json.loads(run([node,'--input-type=module','-e',EXPORT,str(source),'/etc/rolling-app/wallet.json','/etc/rolling-app/public.json']))

def public_directory(target):
 assert target.is_relative_to(BASE)
 for part in [BASE,*[BASE.joinpath(*target.relative_to(BASE).parts[:i]) for i in range(1,len(target.relative_to(BASE).parts)+1)]]:
  if not part.exists():part.mkdir(mode=0o755);part.chmod(0o755)
  info=part.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o755

def public_file(target,data):
 public_directory(target.parent);assert not target.exists();atomic(target,data,0o444)

def export_assets(source,description,destination=None):
 for url,entry in description['files'].items():
  assert re.fullmatch('/(?:wallet|crs)/[A-Za-z0-9_.-]+',url) and url!='/wallet/runtime.json'
  file=(source/entry['file']);assert file.resolve().is_relative_to(source.resolve())
  data=file.read_bytes();assert len(data)==entry['bytes'] and sha(data)==entry['sha256']
  target=BASE/'by-hash'/entry['sha256']/url.lstrip('/')
  if target.exists():assert not target.is_symlink() and digest(target)==entry['sha256']
  else:public_file(target,data)
  if destination:
   link=destination/url.lstrip('/');public_directory(link.parent);os.link(target,link)
 if destination:public_file(destination/'wallet/runtime.json',json.dumps(description['runtime'],separators=(',',':')).encode())

PUBLIC={'/':'live.html','/archive/':'archive.html','/archive/snapshot.json':'archive.json','/reader.mjs':'reader.mjs','/reader-client.mjs':'reader-client.mjs','/profile-view.mjs':'profile-view.mjs','/avatar-upload.mjs':'avatar-upload.mjs','/model.mjs':'model.mjs','/navigation.mjs':'navigation.mjs','/style.css':'style.css','/wallet-panel.mjs':'wallet-panel.mjs','/wallet-cache-worker.mjs':'wallet-cache-worker.mjs'}

def activate():
 r=json.loads((P/'stage-result.json').read_text())
 assert r['schemaVersion']==1 and r['commit']==m['commit'] and r['source']==str(NEXT) and r['ui']==str(UI)
 assert r['planSha256']==digest(P/'plan.json') and r['publisherSha256']==digest(pathlib.Path(__file__))
 assert r['expectedCurrentUi']==m['expectedCurrentUi'] and r['caddySha256']==m['caddySha256'] and r['notifySha256']==m['notifySha256']
 assert digest(P/'application.service.next')==r['unitSha256']
 for name,want in r['files'].items():
  relative=pathlib.PurePosixPath(name);assert not relative.is_absolute() and '..' not in relative.parts
  assert not (UI/name).is_symlink() and digest(UI/name)==want
 for name,entry in m['files'].items():
  safe_relative(name);assert not (NEXT/name).is_symlink() and digest(NEXT/name)==entry['sha256']
 preserved()
 unit=pathlib.Path(m['appUnit']);info=unit.stat();original=unit.read_bytes()
 assert sha(original)==m['unitFiles'][str(unit)]
 atomic(P/'application.service.before',original,0o600)
 atomic(P/'current.before',m['expectedCurrentUi'].encode(),0o600)
 switch_attempted=False;install_attempted=False
 try:
  # Record the future source without stopping any healthy owner. Caddy already
  # serves /opt/rolling-ui/current and immutable assets from /by-hash.
  install_attempted=True
  atomic(unit,(P/'application.service.next').read_bytes(),stat.S_IMODE(info.st_mode),info.st_uid,info.st_gid)
  run(['systemctl','daemon-reload'])
  preserved(configured=NEXT,unit_hash=r['unitSha256'])
  switch_attempted=True;switch_current(m['expectedCurrentUi'],UI)
  with urllib.request.urlopen('http://172.31.32.101:4319/wallet/runtime.json',timeout=10) as response:
   assert sha(response.read())==r['files']['wallet/runtime.json']
  preserved(configured=NEXT,unit_hash=r['unitSha256'],current=UI)
 except:
  # Roll back pointers and future startup configuration only. Existing hashed
  # assets remain available to tabs which observed the candidate publication.
  if switch_attempted:
   if (BASE/'current').is_symlink() and os.readlink(BASE/'current')==str(UI):switch_current(UI,m['expectedCurrentUi'])
   else:check_current(m['expectedCurrentUi'])
  if install_attempted:
   actual=digest(unit);assert actual in (sha(original),r['unitSha256'])
   if actual==r['unitSha256']:atomic(unit,original,stat.S_IMODE(info.st_mode),info.st_uid,info.st_gid)
   run(['systemctl','daemon-reload'])
  preserved()
  raise
 atomic(P/'activation-result.json',json.dumps({'commit':m['commit'],'appPid':m['appPid'],'runningSource':str(RUNNING),'nextSource':str(NEXT),'ui':str(UI),'previousUi':m['expectedCurrentUi'],'protectedPids':m['protectedPids'],'caddySha256':m['caddySha256'],'notifySha256':m['notifySha256']}).encode(),0o600)
 print('{"activated":true,"appRestarted":false,"proxyRestarted":false}')

assert os.getuid()==0
assert re.fullmatch(r'/opt/rolling-ui/releases/[0-9a-f]{40}',m['expectedCurrentUi'])
assert re.fullmatch('[0-9a-f]{64}',m['notifySha256'])
assert str(NOTIFY) not in m['unitFiles'] or m['unitFiles'][str(NOTIFY)]==m['notifySha256']
proxy_unit=run(['systemctl','show','rolling-application-proxy.service','-p','FragmentPath','--value']);assert proxy_unit in m['unitFiles']
preserved()
if mode=='stage':
 assert digest(CADDY)==m['caddySha256'];assert not NEXT.exists() and not UI.exists()
 for name,entry in m['files'].items():
  safe_relative(name);old=SOURCE/name;payload=P/'files'/name;assert not payload.is_symlink() and digest(payload)==entry['sha256']
  assert (not old.exists() and not old.is_symlink()) if entry['previousSha256'] is None else (not old.is_symlink() and digest(old)==entry['previousSha256'])
 run(['cp','-al',str(SOURCE),str(NEXT)])
 for name,entry in m['files'].items():
  target=NEXT/name;reference=target if target.exists() else NEXT/'apps/rolling/wallet-panel.mjs';info=reference.stat();atomic(target,(P/'files'/name).read_bytes(),stat.S_IMODE(info.st_mode),info.st_uid,info.st_gid)
  assert digest(target)==entry['sha256'];assert not (SOURCE/name).exists() or target.stat().st_ino!=(SOURCE/name).stat().st_ino
 node=m['node'];assert re.fullmatch(r'/opt/board-prover/releases/rolling-[a-f0-9]+/node/bin/node',node) and digest(pathlib.Path(node))==m['nodeSha256']
 old,new=wallet(RUNNING,node),wallet(NEXT,node)
 unit=pathlib.Path(m['appUnit']);assert digest(unit)==m['unitFiles'][str(unit)]
 original=unit.read_text();rows=original.splitlines(keepends=True)
 assert rows.count('WorkingDirectory='+str(SOURCE)+'\n')==1
 starts=[line for line in rows if line.startswith('ExecStart=')];assert len(starts)==1 and shlex.split(starts[0][10:])[0]==node
 updated=''.join(line.replace(str(SOURCE),str(NEXT)) if line.startswith(('WorkingDirectory=','ExecStart=')) else line for line in rows)
 assert shlex.split(next(line[10:] for line in updated.splitlines() if line.startswith('ExecStart=')))[0]==node
 atomic(P/'application.service.next',updated.encode(),0o600)
 public_directory(UI);export_assets(RUNNING,old);export_assets(NEXT,new,UI)
 for url,name in PUBLIC.items():public_file(UI/(url.lstrip('/')+('index.html' if url.endswith('/') else '')),(NEXT/'apps/rolling'/name).read_bytes())
 result={'schemaVersion':1,'commit':m['commit'],'source':str(NEXT),'ui':str(UI),'planSha256':digest(P/'plan.json'),'publisherSha256':digest(pathlib.Path(__file__)),'caddySha256':m['caddySha256'],'notifySha256':m['notifySha256'],'expectedCurrentUi':m['expectedCurrentUi'],'unitSha256':digest(P/'application.service.next'),'files':{str(f.relative_to(UI)):digest(f) for f in UI.rglob('*') if f.is_file()}}
 atomic(P/'stage-result.json',json.dumps(result,sort_keys=True).encode(),0o600)
 for name,entry in m['files'].items():assert (not (SOURCE/name).exists()) if entry['previousSha256'] is None else digest(SOURCE/name)==entry['previousSha256']
 preserved();print(json.dumps({'staged':True,'files':len(result['files'])}))
else:
 activate()
