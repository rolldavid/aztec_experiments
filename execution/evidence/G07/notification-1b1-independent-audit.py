import json,pathlib,hashlib,subprocess
R=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments'); W=R.parent/'rolling-lead-social'; E=R/'execution/evidence/G07'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bind(m,base=W):
 for p,h in m.items():
  if p=='localAnvilBinary':continue
  assert sha(base/p)==h,p
 return len(m)
x=read(E/'application-1b1c3a03-1030-43df-aa5b-52f10d54597b.json'); b=x['worker']['node']['bridge']; revision='b44010c38da83d04b123382d92ed522b13b6979f'
assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==revision
assert not subprocess.check_output(['git','-C',str(W),'status','--porcelain'],text=True)
assert b['sourceRevision']==revision and x['passed'] and b['passed'] and x['failures']==[]
assert x['elapsedMs']<x['deadlineMs']==540000 and x['peakTreeRSSKiB']<x['rssLimitKiB']==4194304
assert x['ownedTreeAbsent'] and x['temporaryDirectoryRemoved'] and all(b['cleanup'].values())
counts={'outer':bind(x['sourceHashes']),'inner':bind(b['sourceHashes']),'artifacts':bind(b['artifactHashes']),'native':bind(b['nativeArtifacts']['inputs']),'bok':bind(b['bokBuildInputs'])}
copy=read(E/'storage-notification2-evidence-copy.json')
for f in copy['files']:assert sha(R/f['path'])==sha(W/f['path'])==f['sha256']
dir=R/'execution/evidence/G06/application-port-19b9615d-5c0f-4cb4-8ec3-a77987c2f000';inner=read(dir/'observation.json'); assert inner==b
rows=b['transactions']; assert len(rows)==4 and len(set(t['txHash'] for t in rows))==4
for t in rows:
 raw=(dir/(t['action']+'-effect.bin')).read_bytes();assert hashlib.sha256(raw).hexdigest()==t['effectSha256']
 assert t['status']=='checkpointed' and t['executionResult']=='success'
 # Actual TxEffect serialization begins revertCode u8, txHash32, fee32.
 assert raw[0]==0 and '0x'+raw[1:33].hex()==t['txHash'] and int.from_bytes(raw[33:65],'big')==int(t['transactionFee'])
 assert all(v['author'] is False and v['otherAuthor'] is False for v in t['publicFootprint']['rolePresence'].values())
assert [t['blockNumber'] for t in rows]==[14,15,16,17]
assert [t['events'] for t in rows]==[['PostPublished'],[],['PostPublished'],[]]
fees=[int(t['transactionFee']) for t in rows]; claim=int(b['collateral']['fee']); standalone=int(b['secondPrivateFees']['standalone']['transactionFee'])
a=fees[0]+fees[2]+claim;bb=fees[1]+fees[3]+standalone
assert int(b['accountFees']['a'])==a and int(b['accountFees']['b'])==bb-standalone
assert int(b['actualHumanFees'])==sum(fees)+claim
for p,total,other in [(b['privateFees'],a,bb),(b['secondPrivateFees'],bb,a)]:
 amount=int(p['funding']['amount']);v=p['lastVerification'];assert p['passed'] and int(p['privateDebit'])==int(p['actualProtocolFees'])==total
 assert int(v['privateBalance'])==amount-total and int(v['authorPublicBalance'])==0 and int(v['poolBalance'])==2*amount-a-bb
 assert v['status']=='passed' and all(v[k] for k in ['targetCanonicalBefore','anchorCanonicalBefore','targetCanonicalAfter','anchorCanonicalAfter'])
 assert v['target']==v['anchorBeforeSync']==v['anchorBeforeRead']==v['anchorAfterRead'] and v['target']['number']==17
 assert all(v[k]==v['expected'][k] for k in ['privateBalance','authorPublicBalance','poolBalance'])
assert b['proverJobs']['submitted']==b['proverJobs']['completed']==4 and b['proverJobs']['failed']==0 and not b['proverJobs']['running']
browser=x['browser'];assert browser==b['notificationBrowser']['browser'];assert len(browser['checks'])==16 and all(browser['checks'].values()) and browser['elapsedMs']<=150000
assert all(browser['cleanup'].values()) and not browser['timedOut']
for k in ['l1Submissions','blockedRequests','inspectionErrors','deniedWrites']:assert browser['traffic'][k]==0
assert browser['traffic']['proofSubmits']==browser['traffic']['nodeSubmissions']==2
assert b['notificationBrowser']['acceptance']['newRecoveryProofJobs']==b['notificationBrowser']['acceptance']['newRecoveryNodeSubmissions']==0
assert b['journalReopen']['newProofJobs']==0 and b['journalReopen']['transactionBytesRetained'] and b['journalReopen']['sameHash']
assert b['rebuild']['passed'] and b['publicReader']['passed'] and all(s['closed'] and s['authenticatedRanges']==2 for s in b['publicReader']['sessions'])
obs=read(E/'storage-notification2-native-threads.json'); assert obs['candidate']==revision and not obs['errors'] and obs['supervisorAbsentAtEnd']
children=[v for v in obs['observations'] if 'PROVER_THREADS' in v];assert len(children)==4 and all(v['PROVER_THREADS']==v['HARDWARE_CONCURRENCY']==2 for v in children)
# Rehash all normal build inputs and outputs, not merely receipt booleans.
closure={}
for name in ['.build/sdk/sdk-manifest.json','.build/apps-manifest.json','.build/rolling-wallet/manifest.json']:
 m=read(W/name);ni=bind(m['inputs'])
 if 'outputs' in m:
  out=m['outputs'];base=W/'.build/sdk' if name.startswith('.build/sdk/') else W;bind(out,base);no=len(out)
 else:
  no=len(m['files'])
  for entry in m['files'].values():assert sha(W/entry['file'])==entry['sha256'] and (W/entry['file']).stat().st_size==entry['bytes']
 closure[name]={'sha256':sha(W/name),'inputs':ni,'outputs':no}
post=read(E/'storage-b440-post-run-closure.json');assert post['candidate']==revision and post['allPreRunBindingsUnchanged'];bind(post['fingerprints']);bind(post['browserFingerprints'])
policy=read(E/'integration-b440-policy-draft.json'); actual=subprocess.check_output(['git','-C',str(W),'diff','--name-only',policy['base'],revision],text=True).splitlines();assert sorted(actual)==sorted(policy['allowed_paths'])
draft=read(E/'integration-b440-evidence-draft.json');refs=[]
def walk(v):
 if isinstance(v,dict):
  if 'path'in v and 'sha256'in v:
   p=R/'execution'/v['path'];assert sha(p)==v['sha256'],str(p);refs.append(str(p.relative_to(R)))
  for z in v.values():walk(z)
 elif isinstance(v,list):
  for z in v:walk(z)
walk(draft)
out={'candidate':revision,'base':policy['base'],'passed':True,'sourceHashCounts':counts,'normalBuildClosure':closure,'transactions':4,'fees':{'application':str(sum(fees)),'collateral':str(claim),'standalone':str(standalone),'aTotal':str(a),'bTotal':str(bb),'combined':str(a+bb)},'effectSerializationCheck':'whole SHA256 plus pinned TxEffect success/hash/fee prefix; no independent full SDK decoder rerun','browserChecks':16,'nativeTrustedChildrenWith2Threads':4,'diffPaths':len(actual),'draftReferencesRehashed':len(refs),'elapsedMs':x['elapsedMs'],'peakTreeRSSKiB':x['peakTreeRSSKiB'],'receiptSha256':sha(E/'application-1b1c3a03-1030-43df-aa5b-52f10d54597b.json'),'innerSha256':sha(dir/'observation.json'),'postRunClosureSha256':sha(E/'storage-b440-post-run-closure.json')}
(E/'notification-1b1-independent-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
