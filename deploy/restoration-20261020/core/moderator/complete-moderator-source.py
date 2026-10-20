import pathlib,json,hashlib,subprocess,os,grp,tarfile
P=pathlib.Path('/var/lib/rolling-bootstrap-private/core-restore-20261020');stage=P/'stage';inv=json.loads((P/'inventory.json').read_text());by={e['path']:e for e in inv['entries']};private=pathlib.Path('/var/lib/rolling-bootstrap-private/moderator-current');state=pathlib.Path('/var/lib/rolling-moderator');root=pathlib.Path('/opt/rolling-moderator/releases/34cc7252');run=lambda a:subprocess.check_output(a,text=True,timeout=120).strip()
assert root.is_dir() and private.is_dir() and state.is_dir() and not pathlib.Path('/etc/systemd/system/rolling-moderator.service').exists()
before={u:run(['systemctl','show',u,'-p','MainPID','--value'])for u in ['rolling-node','rolling-query','board-prover','rolling-application']};assert all(int(v)>0 for v in before.values())
def verified(rel):
 p=stage/rel;e=by[rel];assert p.is_file() and p.stat().st_size==e['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==e['sha256'];return p
actor=json.loads((private/'operator.json').read_text());assert actor['address']=='0x2c8a8c02a4b70118ce06ca7f789f497349ad464a8439368d4db2bfd7a5577cf9'
a=verified('var/lib/rolling-bootstrap-private/moderator-current/moderator-source.tar.gz');assert hashlib.sha256(a.read_bytes()).hexdigest()=='33086d1e160d5a92518d137438c79bd128cb14ac2f1b324ce2a7e428f5fcb143'
entries=json.loads(verified('var/lib/rolling-bootstrap-private/moderator-current/source-delta.json').read_text())['files'];expected={f['path']:f for f in entries}
with tarfile.open(a)as t:
 assert {m.name for m in t.getmembers()}==set(expected)
 for m in t.getmembers():
  assert m.isfile() and not pathlib.PurePosixPath(m.name).is_absolute() and '..'not in pathlib.PurePosixPath(m.name).parts
  data=t.extractfile(m).read();f=expected[m.name];assert len(data)==f['bytes']and hashlib.sha256(data).hexdigest()==f['sha256'];dest=root/m.name;dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+'.moderator-restore');assert not tmp.exists();tmp.write_bytes(data);os.chown(tmp,0,grp.getgrnam('rolling-runtime').gr_gid);tmp.chmod(0o440);tmp.replace(dest)
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
