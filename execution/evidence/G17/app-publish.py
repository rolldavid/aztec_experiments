"""Reviewed source-only release cutover. Execute on host: SCRIPT private_packet_dir.
Packet: delta.json, source-assets.tar.gz. Does not alter contracts/native runtime.
Coordinator must verify the integration gate before dispatching this exact packet.
"""
import grp,hashlib,json,os,pathlib,shlex,sqlite3,subprocess,sys,tarfile,urllib.request
P=pathlib.Path(sys.argv[1]);m=json.loads((P/'delta.json').read_text());b=m['baseline'];kind=b['kind']
assert kind=='app' and os.geteuid()==0
assert len(m['source'])==40 and all(x in '0123456789abcdef' for x in m['source'])
source=pathlib.Path(b['source']);target=source.parent/('ux-'+m['source'][:12]);unit=pathlib.Path(b['unit'])
assert source==pathlib.Path('/opt/rolling-app/releases/signup-c9c850df1e51')
assert source.is_dir() and not target.exists() and not (P/'cutover-intent.json').exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
run=lambda a,**kw:subprocess.check_output(a,text=True,**kw).strip()
service={'app':'rolling-application','moderator':'rolling-moderator','bok':'rolling-bok-testnet'}[kind]+'.service'
protected_services=(['rolling-node.service','rolling-query.service','board-prover.service']+(['rolling-moderator.service'] if kind=='app' else ['rolling-application.service'])) if kind!='bok' else ['rolling-bok-artifact-proxy.service']
pids={u:run(['systemctl','show',u,'-p','MainPID','--value']) for u in protected_services}
assert all(int(v)>0 for v in pids.values())
original=unit.read_bytes();assert sha(original)==b['unitSha256']
assert 'WorkingDirectory='+str(source) in original.decode()
assert run(['systemctl','show',service,'-p','WorkingDirectory','--value'])==str(source)
assert run(['systemctl','is-active',service])=='active'
protected={pathlib.Path(p):h for p,h in b['privateHashes'].items()}
assert protected and all(sha(p.read_bytes())==h for p,h in protected.items())
for p,h in b['buildHashes'].items():assert sha((source/p).read_bytes())==h
if kind=='moderator':
 args=shlex.split(next(l[10:] for l in original.decode().splitlines() if l.startswith('ExecStart=')))
 values=[a.split('=',1)[1] for a in args if a.startswith('--state-dir=')]+[args[i+1] for i,a in enumerate(args[:-1]) if a=='--state-dir']
 assert values==[b['stateDirectory']]
 moderator_state=pathlib.Path(values[0]);assert moderator_state.is_absolute()
 assert b['databases'] or b.get('emptyStateVerified') is True

def idle():
 if kind=='app':
  return json.loads(pathlib.Path('/var/lib/private/rolling-application/funding-relay/funding-budget.json').read_text())['activePlan'] is None
 if kind=='moderator':
  assert moderator_state.is_dir() and moderator_state.resolve()==moderator_state and not moderator_state.is_symlink()
  stat=moderator_state.stat();assert {'device':stat.st_dev,'inode':stat.st_ino}==b['stateIdentity']
  files=sorted(moderator_state.glob('*.sqlite'));assert [f.name for f in files]==b['databases']
  assert all(f.is_file() and not f.is_symlink() for f in files)
  pid=run(['systemctl','show',service,'-p','MainPID','--value']);lock=moderator_state/'hosted.lock'
  if pid!='0':assert lock.is_file() and not lock.is_symlink() and lock.read_text().strip()==pid
  else:assert not lock.exists() and not lock.is_symlink(),'Moderator ownership was not released'
  for file in files:
   con=sqlite3.connect('file:'+str(file)+'?mode=ro',uri=True)
   try:
    for (raw,) in con.execute('SELECT record FROM jobs'):
     if json.loads(raw).get('lease'):return False
   finally:con.close()
  return True
 c=json.loads(pathlib.Path('/etc/rolling-bok-testnet/config.json').read_text())
 with urllib.request.urlopen('http://127.0.0.1:'+str(c.get('port',8787))+'/health',timeout=20) as r:h=json.load(r)
 return h.get('active')==0

def atomic(path,data,mode,gid):
 tmp=path.with_name(path.name+'.signup-new');assert not tmp.exists()
 with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(tmp,0,gid);tmp.chmod(mode);os.replace(tmp,path)

def validate(root):
 start=shlex.split(next(l[10:] for l in original.decode().splitlines() if l.startswith('ExecStart=')))
 node=start[0];assert node.endswith('/node/bin/node') and node.startswith('/opt/board-prover/releases/rolling-')
 if kind=='app':
  code="import fs from 'node:fs/promises';import {loadRollingWalletAssets} from './scripts/rolling-wallet-assets.mjs';await loadRollingWalletAssets(JSON.parse(await fs.readFile('/etc/rolling-app/wallet.json')));console.log('verified');"
  assert run([node,'--input-type=module','-e',code],cwd=root,env={**os.environ,'NODE_BACKEND':'js','LOG_LEVEL':'silent'})=='verified'
 for f in m['files']:
  if f['path'].endswith(('.mjs','.cjs','.js')) and not f['path'].startswith('.build/'):
   run([node,'--check',str(root/f['path'])])

assert idle(),'Existing work is active; no cutover performed'
archive=P/'source-assets.tar.gz';assert sha(archive.read_bytes())==m['archiveSha256']
names=[x['path'] for x in m['files']];assert len(names)==len(set(names)) and names
assert set(names)<=set(['apps/rolling/reader.mjs', 'apps/rolling/wallet-panel.mjs', 'apps/rolling/style.css'])
for name in names:
 p=pathlib.PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts and not name.startswith(('node_modules/','billboard/portal/node_modules/'))
 assert name.startswith(('apps/','shared/','scripts/','censor-daemon/','plugins/','prover/','.build/sdk/','.build/rolling-wallet/'))
 # Source-only delta, no contract/dependency/configuration replacements.
 assert (source/name).is_file() and not (source/name).is_symlink(),name
before={name:sha((source/name).read_bytes()) for name in names}
assert all(before[name]==b['fileHashes'][name] for name in names), 'Source baseline changed'
run(['cp','-al',str(source),str(target)])
with tarfile.open(archive) as tar:
 assert len(tar.getmembers())==len(names) and {x.name for x in tar.getmembers()}==set(names)
 for f in m['files']:
  member=tar.getmember(f['path']);assert member.isfile() and member.size==f['bytes']
  data=tar.extractfile(member).read();assert sha(data)==f['sha256']
  dest=target/f['path'];st=dest.stat();assert st.st_uid==0
  atomic(dest,data,st.st_mode&0o777,st.st_gid)
validate(target)
assert before=={name:sha((source/name).read_bytes()) for name in names}
# All references to this source release (entry point/read-only mounts/workdir)
# move together; native executable/config/state paths do not contain source.
updated=original.replace(str(source).encode(),str(target).encode())
(P/'original-unit').write_bytes(original);(P/'original-unit').chmod(0o600)
(P/'cutover-intent.json').write_text(json.dumps({'kind':kind,'source':m['source'],'target':str(target),'before':before}))
assert idle(),'Existing work became active; no cutover performed'
try:
 run(['systemctl','stop',service])
 assert run(['systemctl','show',service,'-p','MainPID','--value'])=='0'
 # No force removal of abandoned ownership. Normal shutdown must release it.
 if kind=='bok':assert not pathlib.Path('/var/lib/rolling-bok-testnet/hosted.lock').exists()
 if kind=='moderator':assert idle()
 if kind=='app':assert idle()
 atomic(unit,updated,0o644,0);run(['systemctl','daemon-reload']);run(['systemctl','start',service])
 if kind=='app':run(['systemctl','start','rolling-application-proxy.service'])
 assert run(['systemctl','is-active',service])=='active'
 assert all(sha(p.read_bytes())==h for p,h in protected.items())
 assert before=={name:sha((source/name).read_bytes()) for name in names}
 assert pids=={u:run(['systemctl','show',u,'-p','MainPID','--value']) for u in pids}
except BaseException:
 run(['systemctl','stop',service]);atomic(unit,original,0o644,0);run(['systemctl','daemon-reload']);run(['systemctl','start',service])
 if kind=='app':run(['systemctl','start','rolling-application-proxy.service'])
 raise
result={'published':str(target),'source':m['source'],'kind':kind,'files':len(names),'sourcePreserved':True,'privateConfigsPreserved':True,'otherServicePidsPreserved':True,'unitSha256':sha(updated),'started':True,'applicationReadbackStillRequired':True}
(P/'result.json').write_text(json.dumps(result));print(json.dumps(result))
