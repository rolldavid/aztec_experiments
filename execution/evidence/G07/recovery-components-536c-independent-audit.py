from pathlib import Path
import json,hashlib,subprocess,re,datetime
R=Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');W=R.parent/'rolling-lead-social';D=R.parent/'rolling-design';C=R.parent/'rolling-controls';E=W/'execution/evidence/G07/combined-536c'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rd(p):return json.loads(Path(p).read_text())
def git(w,*args):return subprocess.check_output(['git','-C',str(w),*args],text=True).strip()
p=rd(E/'preparation.json');r=rd(E/'result.json');i=rd(E/'execution-intent.json');bindings=rd(E/'before-source.json');assert git(W,'rev-parse','HEAD')==p['source']=='536c068c1764192edf8380da0f953eaa8e62c633' and not git(W,'status','--porcelain')
changed=git(W,'diff','--name-only',p['base'],'HEAD').splitlines();assert len(changed)==8
for f in changed:assert (W/f).read_bytes()==subprocess.check_output(['git','-C',str(D),'show','59d0c6cd9a9091966ab90ee5a3d73b8936ea2a19:'+f])
for f,h in bindings.items():assert sha(W/f)==h
assert not git(W,'diff','59d0c6cd9a9091966ab90ee5a3d73b8936ea2a19','HEAD','--','billboard/rolling_contract/src')
for f,k in [('run.mjs','runnerSha256'),('child.py','childSha256'),('preparation.json','preparationSha256')]:assert sha(E/f)==i[k]
control=(C/'execution/evidence/G02/rc3-normal-base-1c7/run.mjs').read_text();combined=(E/'run.mjs').read_text();assert combined==control.replace('execution/evidence/G02/rc3-normal-base-1c7','execution/evidence/G07/combined-536c').replace('deadlineMs:540000','deadlineMs:180000')
assert (E/'child.py').read_bytes()==(C/'execution/evidence/G02/rc3-normal-base-1c7/child.py').read_bytes()
assert r['command']==p['argv']==i['command'];assert r['command'][1:]==['--test','--test-concurrency=1','shared/rolling/compact-block.test.mjs','prover/compact-block-native.test.mjs','scripts/test-pxe-preference-page.mjs']
assert r['env']['ROLLING_PREFERENCE_PAGE_NATIVE']=='1' and r['env']['ROLLING_PREFERENCE_PAGE_ACIR']=='1'
assert r['passed'] and r['builder']['code']==0 and r['ownedTreeAbsent'] and not r['failures']
assert r['elapsedMs']<180000 and r['peakTreeRSSKiB']<4194304 and r['peakTreeRSSKiB']==max(x['rssKiB'] for x in r['rssSamples'])
assert all(x['code']==0 and x['closed'] and x['cleanupComplete'] for x in r['children'])
log=(E/'build.log').read_text();assert sha(E/'build.log')==r['logSha256']=='931e7cdc58ea42aa7bea669e7a60ee4e8869bb786a79c4b2dd439b1cbe867575'
counts={k:int(re.search(r'ℹ '+k+r' (\d+)',log)[1]) for k in ['tests','pass','fail','cancelled','skipped','todo']};assert counts=={'tests':127,'pass':127,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert len(re.findall('✔',log))==127
# Source of processed experiment remains this exact local Noir tree; no canonical catalog replacement.
a=rd(W/'.build/preference-page-processed-321/RollingBoard.json');local={}
for item in a['file_map'].values():
 f=item['path']
 if f.startswith('billboard/'):
  assert (W/f).read_text()==item['source'],f;local[f]=sha(W/f)
for f in ['src/pxe.ts','dest/pxe.js','src/operation_queue.ts','dest/operation_queue.js','src/operation_lifecycle.ts','dest/operation_lifecycle.js']:
 assert (W/'node_modules/@aztec-labs/pxe'/f).read_bytes()==(D/'node_modules/@aztec-labs/pxe'/f).read_bytes()
refs=['compact-d9e-final-review.json','compact-native-ef368-final-review.json','preference-page-091-source-review.json','preference-page-c6bbe-actual-acir-runtime-review.json','preference-page-59d0-source-review.json','preference-page-59d-runtime-review.json']
out={'reviewer':'reviewer-20261011','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':p['source'],'base':p['base'],'passed':True,'changed8Files':{f:sha(W/f) for f in changed},'all8ByteIdenticalToDesign59d':True,'fullRollingNoirTreeMatchesDesign59d':True,'directBindings':bindings,'processedArtifactLocalSourceMatches':local,'prototypeSdkNotApplied':True,'runtime':{k:r[k] for k in ['elapsedMs','peakTreeRSSKiB','ownedTreeAbsent','deadlineMs','rssLimitKiB']},'counts':counts,'runnerMatchesPriorWithOnlyDirectoryDeadlineChanges':True,'evidence':{f:sha(E/f) for f in ['preparation.json','before-source.json','run.mjs','child.py','execution-intent.json','result.json','build.log']},'priorReviews':{f:sha(R/'execution/evidence/G07'/f) for f in refs}}
f=R/'execution/evidence/G07/recovery-components-536c-independent-audit.json';f.write_text(json.dumps(out,indent=2)+'\n');print(str(f),sha(f))
