"""Authorized one-shot S3/SSM dispatch. No implicit retry after submission.
Usage from checkout: SCRIPT native-stage|native-promote PACKET INSTANCE CURRENT_GATE
Only exact packet bytes are sent. Dispatch returns command ID; poll SSM separately.
"""
import base64,hashlib,io,json,os,pathlib,re,shlex,subprocess,sys,tarfile
os.umask(0o077)
assert len(sys.argv)==5
mode=sys.argv[1];assert mode in ('native-stage','native-promote')
p=pathlib.Path(sys.argv[2]).resolve();instance=sys.argv[3];assert re.fullmatch(r'i-[a-f0-9]{17}',instance)
sha=lambda b:hashlib.sha256(b).hexdigest()
meta=json.loads((p/'package.json').read_text());candidate=meta['source']
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert head==candidate
# Always recheck the current gate at dispatch, including promotion.
gate_bytes=pathlib.Path(sys.argv[4]).read_bytes();gate=json.loads(gate_bytes);assert gate['status']=='pass' and gate['candidate']==candidate
assert sha(gate_bytes)==meta['gateSha256'] and (p/'gate.json').read_bytes()==gate_bytes
files=['package.json','inventory.json','delta.tar.gz','affected-checks.json','update.py','gate.json']
contents={name:(p/name).read_bytes() for name in files};hashes={name:sha(content) for name,content in contents.items()}
label='native-query';assert instance=='i-0a9b5b9ba55815cda'
assert hashes['inventory.json']==meta['inventorySha256'] and hashes['update.py']==meta['updaterSha256']
assert hashes['delta.tar.gz']==meta['deltaSha256'] and hashes['affected-checks.json']==meta['affectedChecksSha256']
checks=json.loads(contents['affected-checks.json']);assert checks['passed'] is True and checks['source']==candidate
assert meta['changed']==checks['changedFiles']==['prover/private-query.mjs']
for name,digest in checks['testFileHashes'].items():
 content=pathlib.Path(name).read_bytes()
 assert sha(content)==digest and content==subprocess.check_output(['git','show','HEAD:'+name])
for test in checks['tests']:
 assert sha(pathlib.Path(test['evidence']).read_bytes())==test['sha256']
remote='/var/lib/rolling-bootstrap-private/g21-query-native-publication/'+label+'-'+candidate[:12]+'-'+sha(json.dumps(hashes,sort_keys=True).encode())[:12]
intent=p/(mode+'-submission-intent.json');assert not intent.exists()
aws=lambda *a:subprocess.check_output(['aws','--profile','message-board-deploy','--no-cli-pager',*a],text=True,env={**os.environ,'AWS_MAX_ATTEMPTS':'1'}).strip()
if mode=='native-promote':
 stage=json.loads((p/'native-stage-submission-intent.json').read_text());assert stage['instance']==instance and stage['remote']==remote and stage['hashes']==hashes
 command_id=(p/'native-stage-command-id').read_text().strip()
 result=json.loads(aws('ssm','get-command-invocation','--region','us-east-1','--command-id',command_id,'--instance-id',instance,'--output','json'))
 (p/'native-stage-result.json').write_text(json.dumps(result,indent=2)+'\n');assert result['Status']=='Success' and result['ResponseCode']==0
 # Existing remote packet is checked again; promotion never uploads/replaces it.
 lines=['import hashlib,pathlib,subprocess,sys', 'p=pathlib.Path('+repr(remote)+')', 'expected='+repr(hashes), 'assert all(hashlib.sha256((p/name).read_bytes()).hexdigest()==digest for name,digest in expected.items())', "subprocess.run([sys.executable,str(p/'update.py'),'promote',str(p)],check=True)"]
else:
 transfer=p/'dispatch-transfer.tar.gz'
 with tarfile.open(transfer,'w:gz') as t:
  for name,content in contents.items():
   entry=tarfile.TarInfo(name);entry.size=len(content);entry.mode=0o600;t.addfile(entry,io.BytesIO(content))
 transfer_hash=sha(transfer.read_bytes());bucket='anonymous-message-board-testnet-backups-nvdhcyurtoga';key='rolling-lifecycle-20261020/'+candidate+'/'+label+'-'+transfer_hash+'.tar.gz';uri='s3://'+bucket+'/'+key
 # Source-only upload is reversible; submission intent below precedes send-command.
 aws('s3','cp',str(transfer),uri,'--region','eu-west-2','--sse','AES256','--only-show-errors')
 url=aws('s3','presign',uri,'--region','eu-west-2','--expires-in','900')
 lines=['import hashlib,io,os,pathlib,subprocess,sys,tarfile,urllib.request','os.umask(0o077)','p=pathlib.Path('+repr(remote)+')','p.parent.mkdir(mode=0o700,exist_ok=True)','p.mkdir(mode=0o700)','try:', ' with urllib.request.urlopen('+repr(url)+',timeout=60) as response: data=response.read('+str(transfer.stat().st_size+1)+')','except Exception: raise RuntimeError("Packet retrieval failed") from None','assert len(data)=='+str(transfer.stat().st_size)+' and hashlib.sha256(data).hexdigest()=='+repr(transfer_hash),'expected='+repr(hashes),'with tarfile.open(fileobj=io.BytesIO(data),mode="r:gz") as archive:', ' members=archive.getmembers();assert len(members)==len(expected) and {m.name for m in members}==set(expected)', ' for member in members:', '  assert member.isfile() and "/" not in member.name', '  content=archive.extractfile(member).read();assert hashlib.sha256(content).hexdigest()==expected[member.name]', '  (p/member.name).write_bytes(content)']
 lines += ["subprocess.run([sys.executable,str(p/'update.py'),'stage',str(p)],check=True)"]
# Preserve exact script/hash/remote destination for uncertainty reconciliation.
program='\n'.join(lines)+'\n';encoded=base64.b64encode(program.encode()).decode()
command='python3 -c '+shlex.quote('import base64;exec(compile(base64.b64decode('+repr(encoded)+'),"signup-dispatch","exec"))')
params={'commands':[command],'executionTimeout':['600']}
paramfile=p/(mode+'-parameters.json');paramfile.write_text(json.dumps(params));paramfile.chmod(0o600)
record={'mode':mode,'instance':instance,'source':candidate,'remote':remote,'hashes':hashes,'parametersSha256':sha(paramfile.read_bytes())}
with intent.open('x') as f:json.dump(record,f);f.flush();os.fsync(f.fileno())
command_id=aws('ssm','send-command','--region','us-east-1','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(paramfile),'--comment','Reviewed query selector '+mode+' '+candidate[:12]+' preserving existing chain and service state','--query','Command.CommandId','--output','text')
(p/(mode+'-command-id')).write_text(command_id+'\n')
print(json.dumps({'mode':mode,'commandId':command_id,'source':candidate,'instance':instance,'remote':remote,'status':'submitted'}))
