from pathlib import Path
import json,subprocess,hashlib,datetime
R=Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');D=R.parent/'rolling-design';W=R.parent/'rolling-lead-social';C=R.parent/'rolling-controls'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def show(rev,p):return subprocess.check_output(['git','-C',str(W),'show',rev+':'+p])
def tree(rev):return {r.split('\t')[1]:r.split()[2] for r in subprocess.check_output(['git','-C',str(W),'ls-tree','-r',rev],text=True).splitlines()}
p=D/'execution/evidence/G07/preference-page/cold-consumer-integration-design.json';packet=json.loads(p.read_text());assert sha(p)=='83e3f8e5bfa9d9ddd20b8a545d63950a572f51bc918ecbeb5595e90f41a5b45e'
for row in packet['sources']:assert sha(D/row['path'])==row['sha256']
rev='3589864121f0f5b5f6401264cd34c4d56071b361';parents=subprocess.check_output(['git','-C',str(W),'rev-list','--parents','-n','1',rev],text=True).split()[1:];base=subprocess.check_output(['git','-C',str(W),'merge-base',*parents],text=True).strip()
b,a,c,m=map(tree,[base,*parents,rev]);overlap=[]
for f in set(b)|set(a)|set(c)|set(m):
 x,y,z=b.get(f),a.get(f),c.get(f)
 if y==z:expected=y
 elif x==y:expected=z
 elif x==z:expected=y
 else:overlap.append(f);continue
 assert m.get(f)==expected,f
assert overlap==['package.json']
pa,pc,pm=[json.loads(show(r,'package.json')) for r in [*parents,rev]]
assert pm['scripts']==pa['scripts']
assert {k:v for k,v in pm.items() if k!='scripts'}=={k:v for k,v in pc.items() if k!='scripts'}
changed=subprocess.check_output(['git','-C',str(W),'diff','--name-only','125a69175b8a9df388f6f2938339090fa1bfb6cc',parents[0]],text=True).splitlines();assert len(changed)==8
for f in changed:assert show(rev,f)==show(parents[0],f)
for f in ['scripts/patch-indexeddb-atomicity.mjs','scripts/patch-private-event-query.mjs','scripts/patch-pxe-reorg-anchor.mjs','scripts/build-sdk.mjs']:assert show(rev,f)==show(parents[0],f)
paths=['node_modules/@aztec-labs/pxe/dest/block_synchronizer/block_synchronizer.js','node_modules/@aztec-labs/stdlib/dest/block/l2_block_stream/l2_block_stream.js']
for w in [D,C]:
 assert 'tipsOnly: true' in (w/paths[0]).read_text()
 assert 'this.opts.tipsOnly ? undefined : await this.downloadBlocks' in (w/paths[1]).read_text()
o={'reviewer':'reviewer-20261011','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'designPacketSha256':sha(p),'designSourcePins':packet['sources'],'mergeRevision':rev,'parents':parents,'mergeBase':base,'dualChangedFiles':overlap,'allOtherBlobsExactThreeWayUnion':True,'all8ComponentBlobsPreserved':{f:hashlib.sha256(show(rev,f)).hexdigest() for f in changed},'packageScriptsFrom536cAndAllOtherFieldsFrom9f9':True,'bootstrapAndSdkBuilderPreserved':True,'tipsOnlyEvidence':{w.name:{f:sha(w/f) for f in paths} for w in [D,C]},'execution':'Read-only source/hash inspection only; no test, native, dependency mutation or endpoint registration.'}
p=R/'execution/evidence/G07/cold-consumer-design-independent-audit.json';p.write_text(json.dumps(o,indent=2)+'\n');print(p,sha(p))
