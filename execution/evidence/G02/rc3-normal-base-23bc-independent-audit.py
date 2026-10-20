import pathlib,json,hashlib,base64,subprocess,os,datetime
W=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-controls')
R=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments')
D=W/'execution/evidence/G02/rc3-normal-base-23bc'
def digest(b):return hashlib.sha256(b).hexdigest()
def sha(p):return digest(pathlib.Path(p).read_bytes())
def read(p):return json.loads(pathlib.Path(p).read_text())
def git(*a):return subprocess.check_output(['git','-C',str(W),*a],text=True).strip()
h=read(D/'handoff.json'); plan=read(W/'execution/evidence/G02/rc3-normal-processing-plan-1c7.json'); result=read(D/'result.json'); intent=read(D/'execution-intent.json'); lock=read(W/'noir-dependencies.json'); m=read(W/'.build/contracts-manifest.json')
assert git('rev-parse','HEAD')==h['source']=='23bcbd1094a6bf0d7cee2c784137271ec04f9579'
assert sha(D/'handoff.json')=='f443609c422389eb641315d7d4052463d343d038936a496219562ce25b4cca7c'
assert sha(D/'result.json')==h['resultSha256'] and sha(D/'build.log')==h['buildLogSha256']==result['logSha256']
for f,k in [('run.mjs','runnerSha256'),('child.py','childSha256'),('preparation.json','preparationSha256')]:assert sha(D/f)==intent[k]
assert result['passed'] and result['ownedTreeAbsent'] and not result['failures'] and result['builder']['code']==0
assert result['elapsedMs']<540000 and result['peakTreeRSSKiB']==max(x['rssKiB'] for x in result['rssSamples'])<4194304
assert all(x['closed'] and x['cleanupComplete'] and x['code']==0 for x in result['children'])
for p,x in read(D/'before-source.json').items():assert sha(W/p)==x,p
root=read(D/'before-root.json')
root_head_now=subprocess.check_output(['git','-C',str(R),'rev-parse','HEAD'],text=True).strip()
root_advance=subprocess.check_output(['git','-C',str(R),'diff','--name-only',root['head'],root_head_now],text=True).splitlines()
assert set(root_advance)<= {'execution/infrastructure-ledger.json','execution/sessions/registry.json'}
for p,x in root['files'].items():assert sha(R/p)==x['sha256'],p
for x in plan['rawSnapshots'].values():assert sha(x['snapshot'])==x['snapshotSha256']
for p in plan['processorTemporaryFiles']:assert not (W/p).exists()
# Independently reconstruct exact manifest inventory, excluding only normal generated/dependency directories.
names=['toolchain.json','package-lock.json','billboard/portal/package-lock.json','billboard/portal/foundry.toml','scripts/build-contracts.mjs','scripts/toolchain.mjs','scripts/artifact-provenance.mjs','scripts/normalize-noir.mjs','noir-dependencies.json','scripts/check-noir-dependencies.mjs']
for rootdir,dirs,files in os.walk(W/'billboard'):
 dirs[:]=[x for x in dirs if x not in ['target','node_modules','out','cache','lib']]
 for f in files:
  if f.endswith(('.nr','.sol')) or f=='Nargo.toml':names.append(str((pathlib.Path(rootdir)/f).relative_to(W)))
inputs={p:sha(W/p) for p in sorted(names)};assert inputs==m['inputs']
assert sha(W/'.build/contracts-manifest.json')==h['manifestSha256']
# Closed source inventories and present private VKs are checked independently of worker verifier.
artifacts={}
for name,item in h['processed'].items():
 a=read(W/item['path']);raw=read(plan['rawSnapshots'][name]['snapshot']);assert sha(W/item['path'])==item['sha256'] and a['transpiled'] is True
 deps={};std={};local={}
 for e in a['file_map'].values():
  p=e['path'];assert not p.startswith('/') and '..' not in p.split('/') and '\\' not in p
  if p.startswith('dependencies/'):deps[p]=digest(e['source'].encode())
  elif p.startswith('std/'):std[p]=digest(e['source'].encode())
  else:assert (W/p).read_text()==e['source'];local[p]=sha(W/p)
 assert deps==lock['embeddedSourcesByContract'][name]
 rawstd={e['path']:digest(e['source'].encode()) for e in raw['file_map'].values() if e['path'].startswith('std/')};assert std==rawstd
 fns=[f for f in a['functions'] if 'abi_private' in f.get('custom_attributes',[])];assert len(fns)==item['privateFunctions']==item['privateVKs']
 vks={}
 for f in fns:
  vk=base64.b64decode(f['verification_key'],validate=True);bc=base64.b64decode(f['bytecode'],validate=True)
  assert len(vk)==4832 and len(bc)>0
  vks[f['name']]={'vkBytes':len(vk),'vkSha256':digest(vk),'bytecodeBytes':len(bc),'bytecodeSha256':digest(bc)}
 artifacts[name]={'path':item['path'],'sha256':sha(W/item['path']),'functions':len(a['functions']),'privateVKs':vks,'embeddedSources':len(deps),'localSources':local,'stdlibEntriesExact':len(std)}
# Full source trees currently still match promoted lock.
files=0
for p,e in lock['packages'].items():
 folder=pathlib.Path.home()/'nargo'/p.removeprefix('dependencies/')
 actual={}
 for x in [folder/'Nargo.toml',*(folder/'src').rglob('*')]:
  assert not x.is_symlink()
  if x.is_file():actual[str(x.relative_to(folder))]=sha(x)
 assert actual==e['files'];files+=len(actual)
for p,x in lock['localManifests'].items():assert sha(W/p)==x
copies={'apps/src/billboard/billboard_artifact.json':'Billboard','apps/src/billboard/deploy/billboard_artifact.json':'Billboard','apps/src/billboard/censor/billboard_artifact.json':'Billboard','apps/src/billboard/private_fee_artifact.json':'PrivateFPC','plugins/adapter_artifact.json':'PluginAdapter'}
for p,n in copies.items():assert sha(W/p)==artifacts[n]['sha256']
assert m['noir']==artifacts['Billboard']['sha256'] and m['privateFee']==artifacts['PrivateFPC']['sha256'] and m['pluginAdapter']==artifacts['PluginAdapter']['sha256']
portals={}
for n,e in h['portal'].items():
 p=W/f'billboard/portal/out/{n}.sol/{n}.json';a=read(p);metadata=a.get('metadata');metadata=json.loads(metadata) if isinstance(metadata,str) else metadata
 assert sha(p)==e['sha256'] and metadata['compiler']['version']==e['compiler']
 for field in ['bytecode','deployedBytecode']:assert a[field]['object'].startswith('0x') and len(bytes.fromhex(a[field]['object'][2:]))>0
 assert digest(a['bytecode']['object'].encode())==e['creationSha256']
 portals[n]={'path':str(p.relative_to(W)),'sha256':sha(p),'compiler':metadata['compiler']['version'],'creationStringSha256':e['creationSha256'],'creationBytes':len(bytes.fromhex(a['bytecode']['object'][2:])),'runtimeBytes':len(bytes.fromhex(a['deployedBytecode']['object'][2:]))}
 if n=='BillboardPortal':
  assert len(next(x for x in a['abi'] if x['type']=='constructor')['inputs'])==6
  assert m['portal']==e['creationSha256']
  for cp in ['apps/src/billboard/portal_bytecode.txt','apps/src/billboard/deploy/portal_bytecode.txt']:assert (W/cp).read_text()==a['bytecode']['object']+'\n'
assert m['pluginPortal']==portals['PluginPortal']['sha256']
changed=subprocess.check_output(['git','-C',str(W),'diff','--name-only'],text=True).splitlines()
assert not subprocess.check_output(['git','-C',str(W),'ls-files','--others','--exclude-standard'],text=True).strip()
allowed=set(copies)|{'apps/src/billboard/portal_bytecode.txt','apps/src/billboard/deploy/portal_bytecode.txt'}
assert all(x in allowed or x.startswith('billboard/portal/out/') for x in changed)
snapshot={p:sha(W/p) for p in sorted(changed)}
assert changed==[] and h['changedTrackedAndNewOutputs']==[]
log=(D/'build.log').read_text();assert log.count('ChonkComputeVk - VK derived, size: 4832 bytes')==10
assert 'Compiling 108 files with Solc 0.8.27' in log and 'Built canonical Noir/VK and Solidity artifacts; synchronized all consumers.' in log
out={'reviewer':'reviewer-20261011','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':h['source'],'passed':True,'sourceInventoryCount':len(read(D/'before-source.json')),'rootPreservedFiles':len(root['files']),'rootHeadAtBuild':root['head'],'rootHeadAtReview':root_head_now,'laterRootMetadataOnlyChanges':root_advance,'dependencyPackages':len(lock['packages']),'dependencyFiles':files,'manifestInputs':len(inputs),'manifestSha256':sha(W/'.build/contracts-manifest.json'),'artifacts':artifacts,'portals':portals,'generatedTrackedSnapshot':snapshot,'generatedSnapshotSha256':digest(json.dumps(snapshot,sort_keys=True,separators=(',',':')).encode()),'rawSnapshotsPreserved':7,'allProcessingTempsAbsent':True,'runtime':{k:result[k] for k in ['elapsedMs','peakTreeRSSKiB','ownedTreeAbsent']},'rssSampleCount':len(result['rssSamples']),'executionEvidence':{f:sha(D/f) for f in ['handoff.json','result.json','execution-intent.json','preparation.json','run.mjs','child.py','build.log','generated-snapshot.json','readiness-result.json']},'checksExecuted':'Python read-only hashes, schema/source/inventory/decoded VK checks only; no native processor/test replay.'}
# Independently bind all fresh generated bytes and new raw utility, not just historical identical canonicals.
fresh=read(D/'generated-snapshot.json');assert sha(D/'generated-snapshot.json')=='c538edb787a26fd335150c6517e6251ad5790df7fe595ad0b81a959a7a109fbb'
for p,e in fresh['files'].items():assert (W/p).stat().st_size==e['bytes'] and sha(W/p)==e['sha256'],p
rawRolling=read(W/'billboard/target/rolling_contract-RollingBoard.json');assert rawRolling.get('transpiled',False) is False
utility=[e for e in rawRolling['file_map'].values() if e['path'].endswith('/preference_recovery.nr')];assert len(utility)==1
assert utility[0]['source']==(W/'billboard/rolling_contract/src/preference_recovery.nr').read_text()
assert sha(W/'billboard/target/rolling_contract-RollingBoard.json')==fresh['rawRollingSha256']
assert m['inputs']['billboard/rolling_contract/src/preference_recovery.nr']==fresh['utilityInput']['billboard/rolling_contract/src/preference_recovery.nr']
assert len(inputs)==53
for p in [*copies,'apps/src/billboard/portal_bytecode.txt','apps/src/billboard/deploy/portal_bytecode.txt']:
 assert digest(subprocess.check_output(['git','-C',str(W),'show','9f9df3ffc085e2451d814c37605313efca9d2fee:'+p]))==sha(W/p)
ready=read(D/'readiness-result.json');assert ready['passed'] and len(ready['results'])==4 and all(x['passed'] and x['reaped'] for x in ready['results'])
out.update({'generatedFilesVerified':len(fresh['files']),'generatedSnapshotSha256':sha(D/'generated-snapshot.json'),'rawRolling':{'sha256':fresh['rawRollingSha256'],'transpiled':False,'utilitySourceExact':True,'utilityInput':fresh['utilityInput'],'processedAcceptance':False},'toolIdentityReadiness':{'sha256':sha(D/'readiness-result.json'),'count':4,'passed':True},'canonicalBytesEqual9f9':True})
target=R/'execution/evidence/G02/rc3-normal-base-23bc-independent-audit.json';target.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'audit':str(target),'sha256':sha(target),'artifacts':{k:len(v['privateVKs']) for k,v in artifacts.items()},'manifestInputs':len(inputs),'dependencyFiles':files,'changedOutputs':len(snapshot),'generatedSnapshotSha256':out['generatedSnapshotSha256']}))
