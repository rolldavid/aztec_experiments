"""Build the exact reviewed query-only native delta; no network or service actions.
Usage from delivery checkout: SCRIPT PACKET INVENTORY CURRENT_GATE
The successful focused test run is bound to exact source and test bytes below.
"""
import hashlib, io, json, pathlib, re, subprocess, sys, tarfile
assert len(sys.argv)==4
root=pathlib.Path.cwd()
sha=lambda data:hashlib.sha256(data).hexdigest()
changed=['prover/private-query.mjs']
TEST_BINDING={'fileHashes':{'prover/private-query.mjs':'c5212cb3f0d85951a7dab16d35f13839bfd805a35b041ef5b28a7d94b8386563','prover/private-query.test.mjs':'52f96c9bf84fbd54279075b44f9f92d0436cbefecc04ee633fdca478692fa353'},'log':'execution/evidence/G21/anchored-query/tests.log','sha256':'f14f13ee6fae83f27ac0024d7b360e7f980da03c6233a1eb1e06f222253e1367'}
source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
gate_bytes=pathlib.Path(sys.argv[3]).read_bytes();gate=json.loads(gate_bytes)
assert gate['status']=='pass' and gate['candidate']==source
inv_bytes=pathlib.Path(sys.argv[2]).read_bytes();inv=json.loads(inv_bytes)
assert inv['manifestSha256']=='f3efd677aa45a7ececada71b0f23d4a05966ec4081c27a4ffacf9e801aa6aa27'
# Exact currently deployed manifest retained in the successful native packet.
old_bytes=pathlib.Path('/tmp/g21-anchored-query-base-manifest.json').read_bytes()
assert sha(old_bytes)==inv['manifestSha256']
old=json.loads(old_bytes)
assert old['sourceCommit']==inv['sourceCommit']
assert {f:old['files'][f] for f in changed}==inv['changedFileHashes']
for name,digest in TEST_BINDING['fileHashes'].items():
 data=(root/name).read_bytes()
 assert sha(data)==digest,'Source or tests changed after the reviewed test run: '+name
 assert data==subprocess.check_output(['git','show','HEAD:'+name]),'Uncommitted source: '+name
log=(root/TEST_BINDING['log']).read_bytes();assert sha(log)==TEST_BINDING['sha256']
assert log==subprocess.check_output(['git','show','HEAD:'+TEST_BINDING['log']])
text=log.decode()
for field,value in [('pass',101),('fail',0),('cancelled',0),('skipped',1)]:
 assert re.search(r'(?:ℹ|#) '+field+' '+str(value)+r'\b',text)
for title in ('checkpoint bridge: native SDK absent predicate survives proposed synchronization gap','checkpoint bridge: native SDK not consumed predicate survives proposed synchronization gap','checkpoint bridge: native SDK consumed predicate survives proposed synchronization gap','checkpoint bridge: mixed latest batch remains strictly gated before forwarding','checkpoint bridge: final anchor reorg rejects getL1ToL2MessageMembershipWitness'):
 assert any(('✔ '+title in line) or (re.match(r'ok \d+ - ',line) and title in line) for line in text.splitlines())
data={f:(root/f).read_bytes() for f in changed}
new=json.loads(old_bytes);new['sourceCommit']=source
for f in changed:new['files'][f]=sha(data[f])
assert {f for f in old['files'] if old['files'][f]!=new['files'][f]}==set(changed)
manifest=(json.dumps(new,indent=2)+'\n').encode()
checks={'passed':True,'source':source,'changedFiles':changed,'fileHashes':{f:sha(data[f]) for f in changed},'testFileHashes':TEST_BINDING['fileHashes'],'tests':[{'command':'node --test prover/private-query.test.mjs','evidence':TEST_BINDING['log'],'sha256':sha(log),'passed':101,'failed':0,'skipped':1,'coverage':['native SDK bridge predicates','fixed witness schema and canonical anchors','mixed latest batch remains strict']}]}
checks_bytes=(json.dumps(checks,indent=2)+'\n').encode()
updater=pathlib.Path('/tmp/g21-anchored-query-update-v2.py').read_bytes()
p=pathlib.Path(sys.argv[1]).resolve();p.mkdir(mode=0o700)
with tarfile.open(p/'delta.tar.gz','w:gz') as archive:
 for name,content in {'prover-release.json':manifest,**data}.items():
  entry=tarfile.TarInfo(name);entry.size=len(content);entry.mode=0o644
  archive.addfile(entry,io.BytesIO(content))
meta={'source':source,'baseManifestSha256':inv['manifestSha256'],'manifestSha256':sha(manifest),'archiveSha256':inv['runtimeArchiveSha256'],'deltaSha256':sha((p/'delta.tar.gz').read_bytes()),'changed':changed,'affectedChecksSha256':sha(checks_bytes),'gateSha256':sha(gate_bytes),'inventorySha256':sha(inv_bytes),'updaterSha256':sha(updater)}
for name,content in {'package.json':(json.dumps(meta,indent=2)+'\n').encode(),'inventory.json':inv_bytes,'affected-checks.json':checks_bytes,'gate.json':gate_bytes,'update.py':updater}.items():
 (p/name).write_bytes(content);(p/name).chmod(0o600)
print(json.dumps({'packet':str(p),'source':source,'manifest':meta['manifestSha256'],'changedFiles':changed,'focusedTestsPassed':101,'focusedTestsSkipped':1}))
