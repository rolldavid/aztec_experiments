# Existing verified runtime/public-overlay composition; no build, state or service action.
import pathlib,json,hashlib,subprocess,tarfile,os,grp
os.umask(0o077)
P=pathlib.Path('/var/lib/rolling-bootstrap-private/app-restore-20261020');binding=json.loads((P/'binding.json').read_text())
R=pathlib.Path('/opt/rolling-app/releases/34cc7252');assert not R.exists()
base=pathlib.Path('/opt/board-prover/releases/rolling-71d5e83614a05c42');assert hashlib.sha256((base/'prover-release.json').read_bytes()).hexdigest()=='71d5e83614a05c429ebf419c7d8f98a1b19dc10ef7aba8cace7d2e1141bf55f9'
R.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
# Separate inodes: overlay extraction must never modify the admitted prover release.
subprocess.run(['cp','-a',str(base),str(R)],check=True)
for name in ['overlay','delta']:
 b=binding[name];target=P/(name+'.tar.gz')
 subprocess.run(['curl','--fail','--silent','--show-error','--connect-timeout','10','--max-time','600','--output',str(target),b['url']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 assert target.stat().st_size==b['bytes'] and hashlib.sha256(target.read_bytes()).hexdigest()==b['sha256']
 with tarfile.open(target) as t:
  members=t.getmembers();assert sum(m.size for m in members)<=3*1024**3
  for m in members:
   assert not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts and (m.isfile() or m.isdir())
  t.extractall(R,filter='data')
for row in binding['deltaFiles']:
 f=R/row['path'];assert f.stat().st_size==row['bytes'] and hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256']
# Same existing runtime-only group; no persistent supplementary memberships.
subprocess.run(['chown','-R','root:rolling-runtime',str(R)],check=True)
subprocess.run(['chmod','-R','g+rX',str(R)],check=True)
assert os.stat(R/'node/bin/node').st_ino!=os.stat(base/'node/bin/node').st_ino
result={'source':'34cc7252f6f90ea127b798cf885e7f3e8439d969','release':str(R),'deltaSha256':binding['delta']['sha256'],'files':len(binding['deltaFiles']),'servicesStarted':False,'mutableStateTouched':False,'separateRuntimeInodes':True}
(P/'stage-result.json').write_text(json.dumps(result));print(json.dumps(result))
