#!/usr/bin/env python3
"""One reviewed UI publication. Run stage, review result/config, then activate.
Packet plan.json: commit(40hex), configuredSource, runningSource, appPid,
appStartTime(/proc/PID/stat field22), configHashes{absolute:sha256}, unitFiles
{absolute:sha256}, files{relative:{sha256,previousSha256|null}}, caddySha256,
protectedPids{unit:pid}, node, nodeSha256, appUnit (base unit in unitFiles), proxyNotifyVerified=true
(after independent native Type=notify verification; required for activate). Payload at packet/files/<relative>. No private values leave host.
"""
import hashlib,json,os,pathlib,re,shlex,shutil,stat,subprocess,sys,urllib.request
P=pathlib.Path(sys.argv[1]).resolve();mode=sys.argv[2];assert mode in ('stage','activate')
m=json.loads((P/'plan.json').read_text());assert re.fullmatch('[0-9a-f]{40}',m['commit'])
BASE=pathlib.Path('/opt/rolling-ui');SOURCE=pathlib.Path(m['configuredSource']);RUNNING=pathlib.Path(m['runningSource']);NEXT=pathlib.Path('/opt/rolling-app/releases/ui-'+m['commit'][:12]);UI=BASE/'releases'/m['commit'];CADDY=pathlib.Path('/etc/rolling-app/Caddyfile');BINARY='/opt/board-prover/releases/rolling-71d5e83614a05c42/caddy/caddy'
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

def preserved():
 assert run(['systemctl','show','rolling-application.service','-p','MainPID','--value'])==str(m['appPid'])
 assert pathlib.Path('/proc/'+str(m['appPid'])+'/cwd').resolve()==RUNNING
 assert pathlib.Path('/proc/'+str(m['appPid'])+'/stat').read_text().rsplit(')',1)[1].split()[19]==str(m['appStartTime'])
 assert 'rolling-application-proxy.service' not in m['protectedPids']
 for unit,pid in m['protectedPids'].items():assert re.fullmatch(r'[A-Za-z0-9-]+\.service',unit) and run(['systemctl','show',unit,'-p','MainPID','--value'])==str(pid)
 for name,want in m['configHashes'].items():assert digest(pathlib.Path(name))==want
 for name,want in m['unitFiles'].items():assert digest(pathlib.Path(name))==want
 assert run(['systemctl','show','rolling-application.service','-p','WorkingDirectory','--value'])==str(SOURCE)

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
def caddy(headers):
 lines=['{',' admin off',' auto_https off',' log {','  output discard',' }','}',':4319 {',' bind 172.31.32.101',' route {','  @api path /api /api/*','  handle @api {','   reverse_proxy 127.0.0.1:4318','  }','  handle {','   route {','   header {']
 for name,value in headers.items():
  assert re.fullmatch('[A-Za-z-]+',name) and '\n' not in value and '\r' not in value;lines.append('    '+name+' '+json.dumps(value))
 lines+=['   }','   encode gzip','   @wrongMethod not method GET HEAD','   header @wrongMethod Allow "GET, HEAD"','   respond @wrongMethod 405','   @pinned {','    path /wallet/* /crs/*','    not path /wallet/runtime.json',"    expression `{http.request.uri.query}.matches('^sha256=[a-f0-9]{64}$')`",'   }','   handle @pinned {','    root * /opt/rolling-ui/by-hash','    rewrite * /{query.sha256}{path}','    header Cache-Control "public, max-age=31536000, immutable"','    file_server','   }',"   @query expression `{http.request.uri.query} != ''`",'   respond @query 404','   @public path '+' '.join(PUBLIC)+' /wallet/* /crs/*','   handle @public {','    root * /opt/rolling-ui/current','    file_server','   }','   respond 404','   }','  }',' }','}']
 return ('\n'.join(lines)+'\n').encode()

assert os.getuid()==0
assert str(NOTIFY) not in m['unitFiles'] and not NOTIFY.exists() and not NOTIFY.is_symlink()
proxy_unit=run(['systemctl','show','rolling-application-proxy.service','-p','FragmentPath','--value']);assert proxy_unit in m['unitFiles']
preserved()
if mode=='stage':
 assert digest(CADDY)==m['caddySha256'];assert not NEXT.exists() and not UI.exists()
 # Capture existing exact static security/isolation policy, not an invented CSP.
 with urllib.request.urlopen('http://127.0.0.1:4318/',timeout=10) as response:
  names=['Cache-Control','X-Content-Type-Options','Referrer-Policy','Content-Security-Policy','Cross-Origin-Opener-Policy','Cross-Origin-Embedder-Policy','Cross-Origin-Resource-Policy'];headers={k:response.headers[k] for k in names};assert all(headers.values())
 for name,entry in m['files'].items():
  safe_relative(name);old=SOURCE/name;payload=P/'files'/name;assert not payload.is_symlink() and digest(payload)==entry['sha256']
  assert (not old.exists()) if entry['previousSha256'] is None else (not old.is_symlink() and digest(old)==entry['previousSha256'])
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
 candidate=caddy(headers);atomic(P/'Caddyfile.next',candidate,0o600);run([BINARY,'validate','--config',str(P/'Caddyfile.next'),'--adapter','caddyfile'])
 result={'schemaVersion':1,'commit':m['commit'],'source':str(NEXT),'ui':str(UI),'caddySha256':sha(candidate),'unitSha256':digest(P/'application.service.next'),'securityHeaders':headers,'files':{str(f.relative_to(UI)):digest(f) for f in UI.rglob('*') if f.is_file()}}
 atomic(P/'stage-result.json',json.dumps(result,sort_keys=True).encode(),0o600)
 for name,entry in m['files'].items():assert (not (SOURCE/name).exists()) if entry['previousSha256'] is None else digest(SOURCE/name)==entry['previousSha256']
 preserved();print(json.dumps({'staged':True,'files':len(result['files'])}))
else:
 assert m.get('proxyNotifyVerified') is True
 r=json.loads((P/'stage-result.json').read_text());assert r['commit']==m['commit'] and r['source']==str(NEXT) and r['ui']==str(UI)
 assert digest(P/'application.service.next')==r['unitSha256']
 assert digest(P/'Caddyfile.next')==r['caddySha256'] and digest(CADDY)==m['caddySha256']
 for name,want in r['files'].items():assert digest(UI/name)==want
 # Preserve exact old Caddy bytes; NEVER stop/restart application or index.
 atomic(P/'Caddyfile.before',CADDY.read_bytes(),0o600)
 current=BASE/'current';assert not current.exists() and not current.is_symlink() # first migration only
 os.symlink(UI,BASE/'current.new');os.replace(BASE/'current.new',current)
 atomic(CADDY,(P/'Caddyfile.next').read_bytes(),stat.S_IMODE(CADDY.stat().st_mode),CADDY.stat().st_uid,CADDY.stat().st_gid)
 try:
  # Caddy's independently verified native READY notification owns startup.
  # Later symlink publications need neither a reload nor a service restart.
  atomic(NOTIFY,b'[Service]\nType=notify\nNotifyAccess=main\n');run(['systemctl','daemon-reload'])
  run(['systemctl','restart','rolling-application-proxy.service'])
  with urllib.request.urlopen('http://172.31.32.101:4319/wallet/runtime.json',timeout=10) as response:assert sha(response.read())==r['files']['wallet/runtime.json']
  preserved()
 except:
  atomic(CADDY,(P/'Caddyfile.before').read_bytes(),stat.S_IMODE(CADDY.stat().st_mode),CADDY.stat().st_uid,CADDY.stat().st_gid)
  if NOTIFY.exists():
   assert not NOTIFY.is_symlink() and NOTIFY.read_bytes()==b'[Service]\nType=notify\nNotifyAccess=main\n';NOTIFY.unlink()
  run(['systemctl','daemon-reload']);run(['systemctl','restart','rolling-application-proxy.service']);raise
 # Future starts use new code; amend the exact base unit, including absolute
 # script paths, without changing the pinned native Node executable.
 unit=pathlib.Path(m['appUnit']);assert digest(unit)==m['unitFiles'][str(unit)];info=unit.stat()
 atomic(P/'application.service.before',unit.read_bytes(),0o600)
 atomic(unit,(P/'application.service.next').read_bytes(),stat.S_IMODE(info.st_mode),info.st_uid,info.st_gid)
 try:run(['systemctl','daemon-reload'])
 except:
  atomic(unit,(P/'application.service.before').read_bytes(),stat.S_IMODE(info.st_mode),info.st_uid,info.st_gid);run(['systemctl','daemon-reload']);raise
 assert run(['systemctl','show','rolling-application.service','-p','WorkingDirectory','--value'])==str(NEXT)
 assert run(['systemctl','show','rolling-application.service','-p','MainPID','--value'])==str(m['appPid'])
 assert pathlib.Path('/proc/'+str(m['appPid'])+'/cwd').resolve()==RUNNING
 atomic(P/'activation-result.json',json.dumps({'commit':m['commit'],'appPid':m['appPid'],'runningSource':str(RUNNING),'nextSource':str(NEXT),'ui':str(UI)}).encode(),0o600);print('{"activated":true,"appRestarted":false}')
