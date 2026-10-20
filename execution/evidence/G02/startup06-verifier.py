import pathlib,json,hashlib,ast,subprocess,tarfile,gzip,datetime,os
ROOT=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-controls');OUT=pathlib.Path('/private/tmp/rolling-prover-release-startup06-20261012');ARCHIVE=pathlib.Path(str(OUT)+'.tar.gz');EVIDENCE=pathlib.Path.cwd()/'execution/evidence/G02/runtime-package-startup06-20261012.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1048576):h.update(b)
 return h.hexdigest()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()=='c06235f83603e904dbc86cb9cad59dc2b8981584'
manifest=json.loads((OUT/'prover-release.json').read_text());assert manifest['sourceCommit']=='c06235f83603e904dbc86cb9cad59dc2b8981584';assert manifest['applicationProfile']=='rolling'
actual={p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file() and p.name!='prover-release.json'}
assert actual==set(manifest['files'])
links=[]
for p in OUT.rglob('*'):
 if p.is_symlink():assert p.resolve().is_relative_to(OUT);links.append(p.relative_to(OUT).as_posix())
for rel,digest in manifest['files'].items():assert sha(OUT/rel)==digest,rel
b=(ROOT/'deploy/prover/bootstrap.py').read_bytes();assert b==(OUT/'deploy/prover/bootstrap.py').read_bytes();pins={n.targets[0].id:ast.literal_eval(n.value) for n in ast.parse(b).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['CATALOG_SHA','NODE_SHA','BB_SHA']}
stage=ROOT/'deploy/prover/startup-stages.mjs';assert stage.read_bytes()==(OUT/'deploy/prover/startup-stages.mjs').read_bytes();stage_pin=next(ast.literal_eval(n.value) for n in ast.parse(b).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STARTUP_HELPER_SHA' for t in n.targets));assert sha(stage)==stage_pin
for rel,key in [('node/bin/node','NODE_SHA'),('node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb','BB_SHA'),('prover/rolling-artifacts.json','CATALOG_SHA')]:assert sha(OUT/rel)==pins[key]
node=ROOT.parent/'aztec_experiments/.build/A02-node/node-v24.21.0-darwin-arm64/bin/node';subprocess.run([str(node),'--input-type=module','--eval','import {loadRollingArtifacts} from '+json.dumps((OUT/'prover/rolling-artifacts.mjs').as_uri())+';loadRollingArtifacts();'],cwd=OUT,check=True,capture_output=True,timeout=60)
r={'schemaVersion':1,'source':'c06235f83603e904dbc86cb9cad59dc2b8981584','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'output':str(OUT),'archive':str(ARCHIVE),'applicationProfile':'rolling','qualificationScope':'Mixed legacy/Rolling prover-query runtime; node remains pinned separate fullnode image on nativeAMD64; not standalone nativefullnode qualification','manifestSha256':sha(OUT/'prover-release.json'),'bootstrapSha256':hashlib.sha256(b).hexdigest(),'startupStageHelperSha256':stage_pin,'notRootIntegration':True,'pins':pins,'verifiedFiles':len(actual),'internalSymlinks':links,'completeFileSetVerified':True,'rollingCatalogLoadPassed':True,'archivePassed':False,'noUpload':True,'noPaidAction':True}
EVIDENCE.write_text(json.dumps(r,indent=2)+'\n')
# Exclusive archive, stable order, numeric owners0, namesempty, mtimes0; preserve file execute bits and symlinks.
def canonical(info):
 info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0;info.pax_headers={};return info
with ARCHIVE.open('xb') as raw:
 with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as compressed:
  with tarfile.open(mode='w|',fileobj=compressed,format=tarfile.PAX_FORMAT,dereference=False) as tar:
   tar.add(OUT,arcname='.',recursive=False,filter=canonical)
   for p in sorted(OUT.rglob('*'),key=lambda x:x.relative_to(OUT).as_posix()):tar.add(p,arcname=p.relative_to(OUT).as_posix(),recursive=False,filter=canonical)
 raw.flush();os.fsync(raw.fileno())
fd=os.open(ARCHIVE.parent,os.O_RDONLY);os.fsync(fd);os.close(fd)
# Independently stream every tar member, compare content to the verified complete manifest.
seen=set();regular=0;symlink=0
with tarfile.open(ARCHIVE,'r|gz') as tar:
 for item in tar:
  assert item.name not in seen;seen.add(item.name);assert item.uid==item.gid==item.mtime==0 and not item.uname and not item.gname
  assert not item.name.startswith('/') and '..' not in pathlib.PurePosixPath(item.name).parts
  if item.isfile():
   regular+=1;h=hashlib.sha256();f=tar.extractfile(item)
   while chunk:=f.read(1048576):h.update(chunk)
   expected=r['manifestSha256'] if item.name=='prover-release.json' else manifest['files'][item.name];assert h.hexdigest()==expected,item.name
  elif item.issym():symlink+=1;assert (OUT/item.name).is_symlink();assert item.linkname==os.readlink(OUT/item.name)
  else:assert item.isdir(),item.name
assert {p for p in actual if not (OUT/p).is_symlink()}|{'prover-release.json'} <= seen
r.update(archiveBytes=ARCHIVE.stat().st_size,archiveSha256=sha(ARCHIVE),archiveRegularFiles=regular,archiveSymlinks=symlink,archivePassed=True,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());EVIDENCE.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));print('evidenceSha256',sha(EVIDENCE))
