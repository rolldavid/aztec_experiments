"""One app-only cutover; preserve shared inodes, runtime identities and journals."""
import hashlib,json,os,pathlib,subprocess,tarfile,shlex,grp,sys
P=pathlib.Path(sys.argv[1]);m=json.loads((P/'delta.json').read_text())
source=pathlib.Path('/opt/rolling-app/releases/34cc7252')
target=pathlib.Path('/opt/rolling-app/releases/ux-'+m['source'][:12])
unit=pathlib.Path('/etc/systemd/system/rolling-application.service')
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(args,**kw):return subprocess.check_output(args,text=True,**kw).strip()
def atomic(path,data,mode=0o640,gid=None):
 tmp=path.with_name(path.name+'.ux-new')
 with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(tmp,0,grp.getgrnam('rolling-runtime').gr_gid if gid is None else gid);tmp.chmod(mode);os.replace(tmp,path)
def journal_hashes():
 return {str(f):sha(f.read_bytes()) for f in journal_root.rglob('*.json') if f.is_file()}
def validate(root,node):
 code="import fs from 'node:fs/promises';import {loadRollingWalletAssets} from './scripts/rolling-wallet-assets.mjs';await loadRollingWalletAssets(JSON.parse(await fs.readFile('/etc/rolling-app/wallet.json')));console.log('verified');"
 assert run([node,'--input-type=module','-e',code],cwd=root,env={**os.environ,'NODE_BACKEND':'js','LOG_LEVEL':'silent'})=='verified'
assert os.geteuid()==0 and not target.exists() and not (P/'cutover-intent.json').exists()
assert len(m['source'])==40 and all(c in '0123456789abcdef' for c in m['source'])
original=unit.read_bytes();assert sha(original)==m['baseline']['unit']
assert original.decode().count('WorkingDirectory='+str(source))==1
assert sha((source/'.build/sdk/sdk-manifest.json').read_bytes())==m['baseline']['sdk']
assert sha((source/'.build/rolling-wallet/manifest.json').read_bytes())==m['baseline']['wallet']
start=shlex.split(next(l[10:] for l in original.decode().splitlines() if l.startswith('ExecStart=')))
node=start[0];assert node.startswith('/opt/board-prover/releases/rolling-') and node.endswith('/node/bin/node')
assert any(a.startswith('apps/rolling/') for a in start), 'Entry point must follow WorkingDirectory'
protected={p:sha(p.read_bytes()) for p in map(pathlib.Path,['/etc/rolling-app/public.json','/etc/rolling-app/wallet.json','/etc/rolling-app/relay.json'])}
services=['rolling-node.service','rolling-query.service','board-prover.service','rolling-moderator.service']
pids={n:run(['systemctl','show',n,'--property=MainPID','--value']) for n in services};assert all(int(v)>0 for v in pids.values())
journal_root=pathlib.Path('/var/lib/private/rolling-application/funding-relay');ledger=journal_root/'funding-budget.json'
assert ledger.is_file() and json.loads(ledger.read_text())['activePlan'] is None
validate(source,node)
archive=P/'browser-assets.tar.gz';assert sha(archive.read_bytes())==m['archiveSha256']
allowed={'apps/rolling/reader.mjs','apps/rolling/start.mjs','apps/rolling/style.css','apps/rolling/wallet-panel.mjs','apps/rolling/wallet-runtime.mjs','apps/rolling/wallet-session.mjs','shared/rolling/aggregate-wallet.mjs','shared/rolling/application.mjs','shared/wallet-providers.js','shared/crs-client.js','.build/rolling-wallet/runtime.mjs','.build/rolling-wallet/manifest.json'}
assert len(m['files'])==len(allowed) and {x['path'] for x in m['files']}==allowed
before={name:sha((source/name).read_bytes()) for name in allowed}
run(['cp','-al',str(source),str(target)])
with tarfile.open(archive) as tar:
 members=tar.getmembers();assert len(members)==len(allowed) and {x.name for x in members}==allowed
 for item in m['files']:
  name=item['path'];member=tar.getmember(name);assert member.isfile() and member.size==item['bytes']
  data=tar.extractfile(member).read();assert sha(data)==item['sha256']
  dest=target/name;assert not dest.is_symlink() and dest.parent.is_dir()
  atomic(dest,data)
validate(target,node)
assert {name:sha((source/name).read_bytes()) for name in allowed}==before
updated=original.replace(('WorkingDirectory='+str(source)).encode(),('WorkingDirectory='+str(target)).encode())
(P/'original-unit').write_bytes(original);(P/'original-unit').chmod(0o600)
(P/'cutover-intent.json').write_text(json.dumps({'source':m['source'],'target':str(target),'before':before}))
try:
 assert json.loads(ledger.read_text())['activePlan'] is None
 journals=journal_hashes()
 run(['systemctl','stop','rolling-application.service'])
 assert json.loads(ledger.read_text())['activePlan'] is None and journal_hashes()==journals,'Payment activity changed; abort cutover'
 atomic(unit,updated,0o644,0);run(['systemctl','daemon-reload']);run(['systemctl','start','rolling-application.service']);run(['systemctl','start','rolling-application-proxy.service'])
 assert run(['systemctl','is-active','rolling-application.service'])=='active'
 assert all(sha(p.read_bytes())==value for p,value in protected.items())
 assert {name:sha((source/name).read_bytes()) for name in allowed}==before
 assert pids=={n:run(['systemctl','show',n,'--property=MainPID','--value']) for n in services}
except BaseException:
 run(['systemctl','stop','rolling-application.service']);atomic(unit,original,0o644,0);run(['systemctl','daemon-reload']);run(['systemctl','start','rolling-application.service']);run(['systemctl','start','rolling-application-proxy.service']);raise
result={'published':str(target),'source':m['source'],'files':len(m['files']),'walletAssetsVerified':True,'journalsPreservedAtCutover':True,'protectedConfigsPreserved':True,'sharedSourcePreserved':True,'otherServicePidsPreserved':True,'unitSha256':sha(updated)}
(P/'result.json').write_text(json.dumps(result));print(json.dumps(result))
