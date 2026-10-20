# Existing moderator restoration: original actor/state, exact f3 overlay, no generated actions.
import pathlib,json,hashlib,subprocess,os,pwd,grp,shutil,tarfile,urllib.request
P=pathlib.Path('/var/lib/rolling-bootstrap-private/core-restore-20261020');stage=P/'stage';inv=json.loads((P/'inventory.json').read_text());by={e['path']:e for e in inv['entries']};private=pathlib.Path('/var/lib/rolling-bootstrap-private/moderator-current');state=pathlib.Path('/var/lib/rolling-moderator');root=pathlib.Path('/opt/rolling-moderator/releases/34cc7252');run=lambda a:subprocess.check_output(a,text=True,timeout=120).strip()
assert not root.exists() and not private.exists() and not state.exists() and not pathlib.Path('/etc/systemd/system/rolling-moderator.service').exists()
assert int(run(['df','--output=avail','-B1','/']).splitlines()[-1])>9000000000
before={u:run(['systemctl','show',u,'-p','MainPID','--value'])for u in ['rolling-node','rolling-query','board-prover','rolling-application']};assert all(int(v)>0 for v in before.values())
def verified(rel):
 p=stage/rel;e=by[rel];assert p.is_file() and p.stat().st_size==e['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256'];return p
try:pwd.getpwnam('rolling-moderator');raise RuntimeError('Existing moderator identity')
except KeyError:subprocess.run(['useradd','--system','--user-group','--home-dir',str(state),'--shell','/usr/sbin/nologin','rolling-moderator'],check=True)
user=pwd.getpwnam('rolling-moderator');assert 'rolling-moderator'not in grp.getgrnam('rolling-runtime').gr_mem and 'rolling-moderator'not in grp.getgrnam('docker').gr_mem
private.mkdir(mode=0o700)
for name in ['operator.json','config.json','query.env','source-closure.json']:
 rel='var/lib/rolling-bootstrap-private/moderator-current/'+name;shutil.copyfile(verified(rel),private/name);(private/name).chmod(0o600)
actor=json.loads((private/'operator.json').read_text());assert actor['address']=='0x2c8a8c02a4b70118ce06ca7f789f497349ad464a8439368d4db2bfd7a5577cf9'
config=json.loads((private/'config.json').read_text());assert config['maxTransactionFee'] in ('2000000000000000000','20000000000000000000')
# Exact previously reviewed fee-cap amendment is supplied separately; no renewed funding.
fee_path=pathlib.Path('/var/lib/rolling-bootstrap-private/moderator-restore-input/config-after-checkpoint.json');assert hashlib.sha256(fee_path.read_bytes()).hexdigest()=='cf4a876b0bb1bb209ba88b88540099d7b0f771cb3e581c36fb318469cf76d184';fee=json.loads(fee_path.read_text());assert fee['maxTransactionFee']=='20000000000000000000';original=json.loads((private/'config.json').read_text())
diffs=[k for k in set(fee)|set(original)if fee.get(k)!=original.get(k)];assert diffs in ([],['maxTransactionFee'])
(private/'config-before-checkpoint-amendment.json').write_bytes((private/'config.json').read_bytes());(private/'config-before-checkpoint-amendment.json').chmod(0o600);(private/'config.json').write_text(json.dumps(fee)+'\n');(private/'config.json').chmod(0o600)
query=(private/'query.env').read_text();assert query.startswith('PLUGIN_QUERY_API_KEY=') and len(query.splitlines())==1
assert hashlib.sha256(query.strip().split('=',1)[1].encode()).hexdigest()==json.loads(pathlib.Path('/etc/rolling-query/config.json').read_text())['operatorAuthSha256']
for e in inv['entries']:
 if e['path'].startswith('var/lib/rolling-moderator/') and e['type']=='file':verified(e['path'])
shutil.copytree(stage/'var/lib/rolling-moderator',state)
for e in inv['entries']:
 if e['path']=='var/lib/rolling-moderator' or e['path'].startswith('var/lib/rolling-moderator/'):
  q=pathlib.Path('/'+e['path']);os.chown(q,user.pw_uid,user.pw_gid);q.chmod(e['mode'])
assert not (state/'hosted.lock').exists()
root.parent.mkdir(parents=True,exist_ok=True)
for directory in [pathlib.Path('/opt/rolling-moderator'),root.parent,pathlib.Path('/opt/rolling-moderator/models')]:
 directory.mkdir(exist_ok=True);os.chown(directory,0,grp.getgrnam('rolling-runtime').gr_gid);directory.chmod(0o750)
subprocess.run(['cp','-al','/opt/rolling-app/releases/34cc7252',str(root)],check=True)
for f in json.loads((private/'source-closure.json').read_text())['files']:
 assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['sha256']
archive=pathlib.Path('/var/lib/rolling-bootstrap-private/moderator-restore-input/f3-source-overlay.tar.gz');binding=json.loads(archive.with_name('f3-source-binding.json').read_text());assert hashlib.sha256(archive.read_bytes()).hexdigest()==binding['archiveSha256']
with tarfile.open(archive)as t:
 assert {m.name for m in t.getmembers()}==set(binding['files'])
 for m in t.getmembers():
  assert m.isfile();data=t.extractfile(m).read();assert hashlib.sha256(data).hexdigest()==binding['files'][m.name];dest=root/m.name;tmp=dest.with_name(dest.name+'.restore-new');assert not tmp.exists();tmp.write_bytes(data);os.chown(tmp,0,grp.getgrnam('rolling-runtime').gr_gid);tmp.chmod(0o440);tmp.replace(dest)
proxy=root/'censor-daemon/model-runtime-proxy.cjs';tmp=proxy.with_suffix('.restore-new');tmp.write_bytes(proxy.read_bytes());tmp.chmod(0o444);tmp.replace(proxy)
unit=verified('etc/systemd/system/rolling-moderator.service').read_text();assert unit.count('/opt/board-prover/releases/rolling-81f48a8b13fecaa9/')==1
unit=unit.replace('/opt/board-prover/releases/rolling-81f48a8b13fecaa9/','/opt/board-prover/releases/rolling-71d5e83614a05c42/')
(private/'rolling-moderator.service').write_text(unit);(private/'rolling-moderator.service').chmod(0o600)
assert before=={u:run(['systemctl','show',u,'-p','MainPID','--value'])for u in before}
print(json.dumps({'moderatorStateRestored':True,'sameActor':actor['address'],'stateFiles':sum(e['type']=='file'and e['path'].startswith('var/lib/rolling-moderator/')for e in inv['entries']),'source':'34cc7252+f3e23bf4','unitSha256':hashlib.sha256(unit.encode()).hexdigest(),'privateQueryMatched':True,'notStarted':True,'preservedPIDs':before}))
