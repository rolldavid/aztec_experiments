import pathlib,json,hashlib,os,fcntl
p=pathlib.Path('/var/lib/rolling-bootstrap-private');base=pathlib.Path('/var/lib/rolling-bootstrap');stage=p/'core-restore-20261020'
with open(base/'lock','a') as lock,open(p/'receipt-lock','a') as receipt:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(receipt,fcntl.LOCK_EX|fcntl.LOCK_NB)
 assert not (p/'prover-activation-intent.json').exists() and not (p/'prover-activation-result.json').exists()
 result=json.loads((stage/'current-anchor-identity.json').read_text());assert result['returncode']==0
 verified=json.loads(result['stdout']);anchor=json.loads(result['stderr']);assert verified['scopeVerified'] is True and verified['checkpointHash']==anchor['checkpointHash'] and verified['ready']['checkpointedBlockNumber']>=anchor['checkpointNumber']
 assert anchor=={'checkpointNumber':9500,'checkpointHash':'0x15391a9618e3be9816d30dfd8739ea0ac4285f447521cf375e43cff1c532e7c7'}
 old={n:(p/n).read_bytes() for n in ('prover-activation-scope.json','prover-deployment-evidence.json')}
 assert hashlib.sha256(old['prover-activation-scope.json']).hexdigest()=='cf214dbbc9e4e982021183dc38e22ff3c4cdc7b7f63da70e07183a995c6d437a'
 assert hashlib.sha256(old['prover-deployment-evidence.json']).hexdigest()=='a8db72107cbc4fc4daf0de1b55c1eba884cab986185e01dc3c18c43763e6d953'
 scope=json.loads(old['prover-activation-scope.json']);evidence=json.loads(old['prover-deployment-evidence.json'])
 scope.update(anchor);evidence['scope'].update(anchor)
 encoded=json.dumps(evidence,separators=(',',':')).encode();scope['deploymentEvidenceSha256']=hashlib.sha256(encoded).hexdigest()
 updates={'prover-deployment-evidence.json':encoded,'prover-activation-scope.json':json.dumps(scope,separators=(',',':')).encode()}
 for n,b in old.items():
  f=stage/('historical-'+n)
  with f.open('xb') as out:out.write(b)
  os.chmod(f,0o600)
 for n,b in updates.items():
  tmp=p/(n+'.anchor-new')
  with tmp.open('xb') as out:out.write(b)
  os.chmod(tmp,0o600);os.replace(tmp,p/n)
 print(json.dumps({'anchor':anchor,'sha256':{n:hashlib.sha256(b).hexdigest() for n,b in updates.items()}}))
