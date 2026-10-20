import pathlib,json,hashlib,base64,re
R=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');W=R.parent/'rolling-controls';D=W/'execution/evidence/G02/rc3-normal-private-bok-23bc'
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();digest=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(pathlib.Path(p).read_text())
h=read(D/'handoff.json');p=read(D/'preparation.json');res=read(D/'result.json');i=read(D/'execution-intent.json')
assert sha(D/'handoff.json')=='71fa5aaf4a457ae25c57d6e6b448008f4ce1b5ea653b06832fc66ef2250e53ef'
assert h['source']==p['source']==res['source']==i['source']=='23bcbd1094a6bf0d7cee2c784137271ec04f9579'
for f,k in [('run.mjs','runnerSha256'),('child.py','childSha256'),('preparation.json','preparationSha256')]:assert sha(D/f)==i[k]
assert sha(D/'result.json')==h['resultSha256'];assert sha(D/'build.log')==h['logSha256']==res['logSha256']
assert res['passed'] and res['ownedTreeAbsent'] and res['builder']['code']==0 and not res['failures']
assert res['elapsedMs']<540000 and res['peakTreeRSSKiB']==max(x['rssKiB'] for x in res['rssSamples'])<4194304
assert all(x['code']==0 and x['closed'] and x['cleanupComplete'] for x in res['children'])
for path,e in p['protectedOutputs'].items():assert sha(W/path)==e['sha256'] and (W/path).stat().st_size==e['bytes'],path
sourceChanges=[path for path,e in p['sourceHashes'].items() if sha(W/path)!=e]
rootChanges=[path for path,e in p['rootSnapshot']['files'].items() if sha(R/path)!=e['sha256']]
for e in p['rawSnapshots'].values():assert sha(e['path'])==e['sha256']
lock=read(W/'noir-dependencies.json');artifacts={}
for label,key in [('PrivateBok','target'),('InvocationProbeBoard','boardTarget')]:
 t=p[key];a=read(W/t['path']);raw=read(D/'prior'/pathlib.Path(t['path']).name)
 assert sha(D/'prior'/pathlib.Path(t['path']).name)==t['rawSha256'];assert not(W/t['temporary']).exists()
 assert sha(W/t['path'])==sha(D/(label+'.processed.json'))==h['artifacts'][label]['sha256'];assert a['transpiled'] is True
 priv=lambda art:[f for f in art['functions'] if 'abi_private' in f.get('custom_attributes',[])]
 fs=priv(a);rs=priv(raw);assert len(fs)==(6 if label=='PrivateBok' else 0)
 assert [f['name'] for f in fs]==[f['name'].removeprefix('__aztec_nr_internals__') for f in rs]
 assert len(set(f['name'] for f in fs))==len(fs)
 vks={}
 for f in a['functions']:assert base64.b64decode(f['bytecode'],validate=True)
 for f in fs:
  vk=base64.b64decode(f['verification_key'],validate=True);assert len(vk)==4832;vks[f['name']]={'bytes':len(vk),'sha256':digest(vk)}
 deps={};local={};std={}
 for e in a['file_map'].values():
  path=e['path'];assert not path.startswith('/') and '..' not in path.split('/')
  if path.startswith('dependencies/'):deps[path]=digest(e['source'].encode())
  elif path.startswith('std/'):std[path]=digest(e['source'].encode())
  else:assert (W/path).read_text()==e['source'];local[path]=sha(W/path)
 assert deps==lock['embeddedSourcesByContract'][label]
 assert std=={e['path']:digest(e['source'].encode()) for e in raw['file_map'].values() if e['path'].startswith('std/')}
 artifacts[label]={'sha256':sha(W/t['path']),'privateVKs':vks,'dependencies':len(deps),'local':local,'stdlibEntries':len(std),'transientAbsent':True}
m=read(W/p['additionalOutput']);assert sha(W/p['additionalOutput'])==sha(D/'private-bok-build.json')==h['manifestSha256']
build=(W/'experiments/private-bok/build.mjs').read_text();inputRegion=build.split('return Object.fromEntries([')[1].split('].map')[0];paths=re.findall(r"'([^']+)'",inputRegion)
assert len(paths)==14 and m['inputs']=={s:sha(W/s) for s in paths}
assert m['artifactSha256']==artifacts['PrivateBok']['sha256'] and m['boardArtifactSha256']==artifacts['InvocationProbeBoard']['sha256']
log=(D/'build.log').read_text();assert log.count('ChonkComputeVk - VK derived, size: 4832 bytes')==6
out={'source':h['source'],'artifactAuditPassed':True,'artifacts':artifacts,'manifestSha256':sha(W/p['additionalOutput']),'manifestInputs':len(paths),'protectedUnchanged':len(p['protectedOutputs']),'sourceSnapshotCount':len(p['sourceHashes']),'sourceChangesSinceRun':sourceChanges,'rootChangesSinceRun':rootChanges,'historicalRawUnchanged':len(p['rawSnapshots']),'runtime':{k:res[k] for k in ['elapsedMs','peakTreeRSSKiB','ownedTreeAbsent']},'evidenceHashes':{f:sha(D/f) for f in ['handoff.json','result.json','build.log','execution-intent.json','preparation.json','PrivateBok.processed.json','InvocationProbeBoard.processed.json','private-bok-build.json']},'method':'Independent pure Python inventory/hash/base64 audit; no build, SDK or proof execution.'}
f=R/'execution/evidence/G02/rc3-normal-private-bok-23bc-independent-audit.json';f.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'sha256':sha(f),'sourceChanges':sourceChanges,'rootChanges':rootChanges,'artifacts':artifacts,'runtime':out['runtime']}))
