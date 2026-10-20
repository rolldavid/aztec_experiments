from pathlib import Path
import json,hashlib,subprocess,re,tempfile,datetime,base64
W=Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-design');R=Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');D=W/'execution/evidence/G07/preference-page'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rd(p):return json.loads(Path(p).read_text())
r=rd(D/'application-store-run-1.json');s=rd(D/'application-store-run-1-summary.json');p=rd(D/'application-store-run-packet.json');previous=rd(D/'actual-acir-source-packet-321.json')
assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==r['candidateBase']=='59d0c6cd9a9091966ab90ee5a3d73b8936ea2a19'
assert not subprocess.check_output(['git','-C',str(W),'status','--porcelain'],text=True).strip()
assert sha(D/'application-store-run-1.json')==s['receiptSha256']=='2416ee97c6c0f17d7944285b5c6071b5a0fb1364ea18f774ad50dcf1a13f540e'
for f,k in [('application-store-run-1.log','logSha256'),('application-store-run-1-intent.json','intentSha256'),('run-application-store-1.py','runnerSha256'),('application-store-candidate-59d0c6c.json','sourcePacketSha256')]:assert sha(D/f)==s[k]
assert sha(D/'application-store-run-packet.json')==r['sourcePacketSha256']
assert sha(R/'execution/evidence/G07/preference-page-59d0-source-review.json')==s['reviewSha256']==p['reviewSha256']
assert p['files']==r['sourceFiles']
for row in r['sourceFiles']:assert sha(W/row['path'])==row['sha256']
for row in p['sdkSourcePins']:assert sha(W/'node_modules/@aztec-labs/pxe'/row['path'])==row['before']
for f,h in previous['sdkHashes'].items():assert sha(W/'node_modules'/f)==h
assert r['command'][3:]==['--test','scripts/test-pxe-preference-page.mjs']
assert r['environment']=={'ROLLING_PREFERENCE_PAGE_NATIVE':'1','ROLLING_PREFERENCE_PAGE_ACIR':'1','NODE_BACKEND':'js','LOG_LEVEL':'silent'}
assert r['exitCode']==0 and r['limitFailure'] is None and r['elapsedMs']<180000 and r['peakRssBytes']<4294967296
assert r['ownedGroupAbsentBeforeCleanup'] and r['ownedGroupAbsent'] and not r['remainingPids']
assert all(not r[k] for k in ['tempDirectoriesBefore','tempDirectoriesAfter','allTestTempDirectoriesBefore','allTestTempDirectoriesAfter'])
log=(D/'application-store-run-1.log').read_text();counts={k:int(re.search(r'ℹ '+k+r' (\d+)',log)[1]) for k in ['tests','pass','fail','cancelled','skipped','todo']};assert counts==s['counts']=={'tests':52,'pass':52,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert len(re.findall('✔',log))==52
required=['real processed ACIR: emitted encrypted preference head/event, scoped keys, validators and atomic discard','successful settlement canonical race: pristine commits, patched discards actual ACIR rows','successful settlement account race: pristine commits, patched discards actual ACIR rows','receipt mutation during successful settlement is rejected by original-node revalidation','held successful contributor prevents commit and next operation until fresh context veto and complete drain','failure in a later staged store rolls back actual note and event database writes','actual BlockSynchronizer prunes committed ACIR head and event with indexes on canonical reorg','canonical encrypted head and event commit without contract-sync completion']
for name in required:assert re.search('✔ '+re.escape(name)+r' \(',log),name
current=(W/'scripts/test-pxe-preference-page.mjs').read_text();old=(D/'application-store-before-30171.mjs').read_text()
start="    test('real processed ACIR: emitted encrypted preference head/event, scoped keys, validators and atomic discard'"
end="  test('patched real queue:"
oldblock=old[old.index(start):old.index(end)].strip();newblock=current[current.index(start):current.index(end)].strip();assert oldblock==newblock
artifact=rd(W/previous['normalArtifact']['path']);assert artifact['transpiled'];priv=[f for f in artifact['functions'] if 'abi_private' in f.get('custom_attributes',[])];assert len(priv)==14 and all(base64.b64decode(f['verification_key'],validate=True) for f in priv)
# No child execution: read current PID membership and owned fixture directory absence.
pids={int(x.split()[0]) for x in subprocess.check_output(['ps','-axo','pid='],text=True).splitlines()};assert not (pids & set(r['observedPids']))
remaining=[str(p) for parent in [W/'.build',Path(tempfile.gettempdir())] for p in parent.glob('*preference-page-*') if p.is_dir() and (p.name.startswith('preference-page-acir-') or p.name.startswith('preference-page-queue-') or p.name.startswith('rolling-preference-page-'))];assert not remaining
out={'reviewer':'reviewer-20261011','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':r['candidateBase'],'passed':True,'counts':counts,'runtime':{k:r[k] for k in ['elapsedMs','peakRssBytes','exitCode','limitFailure','ownedGroupAbsentBeforeCleanup','ownedGroupAbsent']},'sourceBindings':r['sourceFiles'],'additionalUnmodifiedSdkInputs':len(p['sdkSourcePins'])+len(previous['sdkHashes']),'sharedPrototypePatchNotApplied':True,'processedArtifactPrivateVKs':14,'originalAcirAssertionBlockIdentical':True,'currentPidReadbackAbsent':r['observedPids'],'currentOwnedFixtureDirectories':remaining,'evidenceHashes':{f:sha(D/f) for f in ['application-store-candidate-59d0c6c.json','application-store-run-packet.json','application-store-run-1-intent.json','application-store-run-1.json','application-store-run-1-summary.json','application-store-run-1.log','run-application-store-1.py']}}
p=R/'execution/evidence/G07/preference-page-59d-runtime-audit.json';p.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'counts':counts,'runtime':out['runtime']}))
