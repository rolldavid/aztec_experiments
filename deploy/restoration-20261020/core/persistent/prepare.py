import ast,pathlib,json,hashlib,base64,gzip,subprocess
root=pathlib.Path.cwd();out=root/'.build/restore-service-20261020/persistent';raw=(root/'deploy/prover/bootstrap.py').read_bytes();assert raw==subprocess.check_output(['git','show','0205d08b:deploy/prover/bootstrap.py'])
import runpy
assign=runpy.run_path(str(root/'deploy/prover/bootstrap.py'),run_name='operator_prepare')
readback=root.parent/'rolling-lead-bok/.build/restore-service-20261020/persistent/budget-readback.json'
policy={'schemaVersion':1,'budgetName':'Rolling Chat ongoing hosting','monthlyUsd':1500,'budgetReadbackSha256':hashlib.sha256(readback.read_bytes()).hexdigest()}
files={'deploy/prover/bootstrap.py':base64.b64encode(raw).decode()}
for rel,sha in assign['STARTUP_SOURCES'].items():
 b=(root/rel).read_bytes();assert hashlib.sha256(b).hexdigest()==sha;files[rel]=base64.b64encode(b).decode()
payload={'schemaVersion':1,'source':'0205d08b','controlSourceSha256':hashlib.sha256(raw).hexdigest(),'policy':policy,'files':files}
b=gzip.compress(json.dumps(payload,sort_keys=True).encode(),mtime=0);(out/'control-payload.json.gz').write_bytes(b)
bindings={'source':'0205d08b','payloadSha256':hashlib.sha256(b).hexdigest(),'payloadBytes':len(b),'controlSourceSha256':payload['controlSourceSha256'],'policy':policy,'hosts':{}}
for label,instance in [('core','i-0a9b5b9ba55815cda'),('bok','i-0a7d9957f2b3d7f19')]:
 r=json.loads((out.parent/('persistent-current-'+instance+'.json')).read_text());x=json.loads(r['StandardOutputContent']);bindings['hosts'][label]={'instanceId':instance,'oldAttestorSha256':x['attestorSha256'],'manifest':x['manifest'],'oldDeadline':x['deadline']}
(out/'bindings.json').write_text(json.dumps(bindings,indent=2)+'\n');print(json.dumps({k:v for k,v in bindings.items()if k!='hosts'}))
