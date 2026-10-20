import pathlib,json,hashlib,base64,subprocess
R=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');W=R.parent/'rolling-controls';D=W/'execution/evidence/G02/rc3-normal-rolling-23bc'
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();digest=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(pathlib.Path(p).read_text())
h=read(D/'handoff-v2.json');res=read(D/'result.json');p=read(D/'preparation.json');intent=read(D/'execution-intent.json');correction=read(D/'verifier-correction.json')
assert sha(D/'handoff-v2.json')=='d124a23a09cfccdd67485fad61286d0fb1c45b85047c806cbe5783c7931a9584'
assert h['source']==res['source']==p['source']=='23bcbd1094a6bf0d7cee2c784137271ec04f9579'
assert sha(D/'result.json')==h['resultSha256'] and sha(D/'build.log')==h['logSha256']==res['logSha256']
for f,k in [('run.mjs','runnerSha256'),('child.py','childSha256'),('preparation.json','preparationSha256')]:assert sha(D/f)==intent[k]
assert res['passed'] and res['ownedTreeAbsent'] and res['builder']['code']==0 and not res['failures'];assert res['elapsedMs']<540000 and res['peakTreeRSSKiB']==max(x['rssKiB'] for x in res['rssSamples'])<4194304
assert all(x['closed'] and x['cleanupComplete'] and x['code']==0 for x in res['children'])
for path,e in p['protectedOutputs'].items():assert sha(W/path)==e['sha256'] and (W/path).stat().st_size==e['bytes'],path
for path,e in p['sourceHashes'].items():assert sha(W/path)==e,path
for path,e in p['rootSnapshot']['files'].items():assert sha(R/path)==e['sha256'],path
for e in p['rawSnapshots'].values():assert sha(e['path'])==e['sha256']
assert not (W/p['target']['temporary']).exists()
raw=read(D/'prior/RollingBoard.raw.json');assert sha(D/'prior/RollingBoard.raw.json')==p['target']['rawSha256']
a=read(W/p['target']['path']);assert a['transpiled'] is True;assert sha(W/p['target']['path'])==sha(D/'RollingBoard.processed.json')==h['artifactSha256']=='20c4946741d2afd5be7f2f18aad6409780b2f4db74f415bea30f95ee9a76fe24'
private=lambda x:[f for f in x['functions'] if 'abi_private' in f.get('custom_attributes',[])]
fns=private(a);rawfns=private(raw);prefix='__aztec_nr_internals__';assert len(fns)==len(rawfns)==14
assert all(f['name'].startswith(prefix) for f in rawfns);assert [f['name'] for f in fns]==[f['name'][len(prefix):] for f in rawfns];assert len(set(f['name'] for f in fns))==14
assert correction['pairs']==[[x['name'],y['name']] for x,y in zip(rawfns,fns)]
assert sha(D/'handoff.json')==correction['originalHandoffSha256'];assert read(D/'handoff.json')['passed'] is False
vks={}
for f in fns:
 v=base64.b64decode(f['verification_key'],validate=True);b=base64.b64decode(f['bytecode'],validate=True);assert len(v)==4832 and len(b)>0;vks[f['name']]={'vkBytes':len(v),'vkSha256':digest(v),'bytecodeBytes':len(b),'bytecodeSha256':digest(b)}
lock=read(W/'noir-dependencies.json');deps={};local={};std={}
for e in a['file_map'].values():
 path=e['path'];assert not path.startswith('/') and '..' not in path.split('/')
 if path.startswith('dependencies/'):deps[path]=digest(e['source'].encode())
 elif path.startswith('std/'):std[path]=digest(e['source'].encode())
 else:assert (W/path).read_text()==e['source'];local[path]=sha(W/path)
assert deps==lock['embeddedSourcesByContract']['RollingBoard'] and len(deps)==132 and len(local)==7
assert std=={e['path']:digest(e['source'].encode()) for e in raw['file_map'].values() if e['path'].startswith('std/')}
assert 'billboard/rolling_contract/src/preference_recovery.nr' in local
utility=next(f for f in a['functions'] if f['name']=='recover_preference_page');assert 'abi_utility' in utility['custom_attributes'] and base64.b64decode(utility['bytecode'],validate=True)
log=(D/'build.log').read_text();assert log.count('ChonkComputeVk - VK derived, size: 4832 bytes')==14
assert 'RollingBoard transpilation and all private verification keys generated; not deployment acceptance.' in log
out={'source':h['source'],'passed':True,'artifactSha256':h['artifactSha256'],'manifest':'Existing Rolling builder creates no separate manifest; artifact+exact embedded/source/command closure recorded here, later catalogue binding required.','privateVKs':vks,'normalNameMapping':correction['pairs'],'dependencySourceCount':len(deps),'localSources':local,'stdlibEntries':len(std),'protectedOutputs':len(p['protectedOutputs']),'sourceFiles':len(p['sourceHashes']),'rootFiles':len(p['rootSnapshot']['files']),'historicalRawPreserved':len(p['rawSnapshots']),'processingTempAbsent':True,'runtime':{k:res[k] for k in ['elapsedMs','peakTreeRSSKiB','ownedTreeAbsent']},'diagnosticsInCurrentLog':len([line for line in log.splitlines() if line.startswith('bug:')]),'evidenceHashes':{f:sha(D/f) for f in ['handoff.json','handoff-v2.json','verifier-correction.json','result.json','build.log','execution-intent.json','preparation.json','prior/RollingBoard.raw.json','RollingBoard.processed.json']},'method':'Read-only pure Python hashes/JSON/decodedVK inventories; no build/test replay.'}
f=R/'execution/evidence/G02/rc3-normal-rolling-23bc-independent-audit.json';f.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'path':str(f),'sha256':sha(f),'VKs':len(vks),'protected':out['protectedOutputs'],'bugLines':out['diagnosticsInCurrentLog']}))
