"""Prepare gated source packet, no network. Run from delivery checkout.
Usage: SCRIPT INVENTORY_JSON NEW_PACKET_DIRECTORY [GATE_RESULT]
Review delta.json then dispatch publish.py and archive through existing SSM pattern.
"""
import hashlib,json,pathlib,subprocess,sys,tarfile
root=pathlib.Path.cwd();inv=json.loads(pathlib.Path(sys.argv[1]).read_text())
if 'output' in inv:inv=json.loads(inv['output'])
kind=inv['kind'];assert kind=='app'
source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
gate=json.loads(pathlib.Path(sys.argv[3] if len(sys.argv)>3 else '.build/G17-gate/result.json').read_text())
assert gate['status']=='pass' and gate['candidate']==source
# All selected runtime source bytes must belong to the tested commit.
dirty=subprocess.check_output(['git','diff','HEAD','--name-only'],text=True).splitlines()
prefix={'app':('apps/','shared/','scripts/rolling-public-server','.build/sdk/','.build/rolling-wallet/'),'moderator':('censor-daemon/','shared/'),'bok':('plugins/','shared/','prover/')}[kind]
sha=lambda b:hashlib.sha256(b).hexdigest()
names=[]
for name,old in inv['fileHashes'].items():
 if name in ['apps/rolling/reader.mjs', 'apps/rolling/wallet-panel.mjs', 'apps/rolling/style.css'] and (root/name).is_file() and sha((root/name).read_bytes())!=old:
  assert name not in dirty,'Uncommitted runtime source: '+name
  names.append(name)
assert names
p=pathlib.Path(sys.argv[2]);p.mkdir(mode=0o700)
archive=p/'source-assets.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 for name in sorted(names):t.add(root/name,arcname=name,recursive=False)
m={'source':source,'baseline':inv,'files':[{'path':n,'bytes':(root/n).stat().st_size,'sha256':sha((root/n).read_bytes())} for n in sorted(names)],'archiveSha256':sha(archive.read_bytes())}
(p/'delta.json').write_text(json.dumps(m,indent=2)+'\n');(p/'publish.py').write_bytes(pathlib.Path('/tmp/g17-app-publish.py').read_bytes())
print(json.dumps({'kind':kind,'source':source,'packet':str(p),'files':names,'archiveBytes':archive.stat().st_size}))
