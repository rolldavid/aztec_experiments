import pathlib,json,hashlib,tarfile,os,grp,subprocess,tempfile
os.umask(0o077)
P=pathlib.Path('/var/lib/rolling-bootstrap-private/app-source-repair-34cc');R=pathlib.Path('/opt/rolling-app/releases/34cc7252')
b=json.loads((P/'binding.json').read_text());m=b['manifest']
assert m['sourceArchiveSha256']=='ab01fef4ffbd54a88c62cb12077792ea5d30d7b0dfb61ee9400ee5a9f4b46f75' and m['target']=='34cc7252f6f90ea127b798cf885e7f3e8439d969'
assert subprocess.check_output(['systemctl','show','rolling-application.service','-p','MainPID','--value'],text=True).strip()=='0'
assert not (P/'result.json').exists() and not (P/'intent.json').exists()
(P/'intent.json').write_text(json.dumps({'sha256':m['sourceArchiveSha256'],'attempts':1}))
a=P/'source.tar.gz';subprocess.run(['curl','--fail','--silent','--show-error','--max-time','120','--output',str(a),b['url']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
assert a.stat().st_size==m['bytes'] and hashlib.sha256(a.read_bytes()).hexdigest()==m['sourceArchiveSha256']
files={e['path']:e for e in m['files']};assert len(files)==370
with tarfile.open(a) as t:
 members=t.getmembers();assert len(members)==len(files) and {x.name for x in members}==set(files)
 for x in members:
  assert x.isfile() and not x.name.startswith('/') and '..' not in pathlib.PurePosixPath(x.name).parts
  data=t.extractfile(x).read();e=files[x.name];assert len(data)==e['bytes'] and hashlib.sha256(data).hexdigest()==e['sha256']
 gid=grp.getgrnam('rolling-runtime').gr_gid
 for x in members:
  target=R/x.name;target.parent.mkdir(parents=True,exist_ok=True)
  for parent in [target.parent,*target.parent.parents]:
   if parent==R.parent:break
   assert parent.is_dir() and not parent.is_symlink();os.chown(parent,0,gid);os.chmod(parent,0o750)
  assert not target.is_symlink()
  fd,tmp=tempfile.mkstemp(prefix='.source-repair-',dir=target.parent)
  with os.fdopen(fd,'wb') as f:f.write(t.extractfile(x).read());f.flush();os.fsync(f.fileno())
  os.chown(tmp,0,gid);os.chmod(tmp,0o640);os.replace(tmp,target)
for e in files.values():assert hashlib.sha256((R/e['path']).read_bytes()).hexdigest()==e['sha256']
for name in ['.build/rolling-wallet/manifest.json','.build/sdk/sdk-manifest.json']:
 manifest=json.loads((R/name).read_text())
 for rel,sha in manifest['inputs'].items():assert hashlib.sha256((R/rel).read_bytes()).hexdigest()==sha
subprocess.run(['systemctl','start','rolling-application.service','rolling-application-proxy.service'],check=True)
result={'source':m['target'],'files':len(files),'allWalletAndSdkInputsVerified':True,'originalStateAndConfigPreserved':True}
(P/'result.json').write_text(json.dumps(result));print(json.dumps(result))
