import pathlib,json,subprocess,hashlib
p=pathlib.Path('.build/G16-signup-native');record=json.loads((p/'native-promote-submission-intent.json').read_text());remote=record['remote']
script="""import pathlib,json,hashlib,os,subprocess,sys
P=pathlib.Path(REMOTE);expected=HASHES
assert all(hashlib.sha256((P/n).read_bytes()).hexdigest()==h for n,h in expected.items())
old=pathlib.Path('/opt/board-prover/releases/rolling-71d5e83614a05c42');new=old.parent/'rolling-b6291cca0855496d'
assert pathlib.Path('/opt/board-prover/current').resolve()==old
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(old/'prover-release.json')=='71d5e83614a05c429ebf419c7d8f98a1b19dc10ef7aba8cace7d2e1141bf55f9'
assert sha(new/'prover-release.json')=='b6291cca0855496d7a08974451d31729f86671880453c9fde4fb4ef40b9908e0'
m=json.loads((new/'prover-release.json').read_text());files=['prover-release.json','prover/interfaces.mjs','prover/process-worker.mjs','prover/queue.mjs','prover/server.mjs'];before={}
for f in files:
 a=(old/f).stat();b=(new/f).stat();assert (a.st_dev,a.st_ino)!=(b.st_dev,b.st_ino) and b.st_nlink==1
 assert a.st_uid==b.st_uid==0 and a.st_gid==b.st_gid and a.st_mode&0o777==0o440 and b.st_mode&0o777==0o400
 if f!='prover-release.json':assert sha(new/f)==m['files'][f]
 before[f]=(sha(old/f),a.st_mode,a.st_uid,a.st_gid,sha(new/f),b.st_uid,b.st_gid)
for f in files:os.chmod(new/f,0o440)
for f in files:
 a=(old/f).stat();b=(new/f).stat();assert before[f]==(sha(old/f),a.st_mode,a.st_uid,a.st_gid,sha(new/f),b.st_uid,b.st_gid) and b.st_mode&0o777==0o440
print('Staged five-file mode repair verified',flush=True)
os.umask(0o022)
subprocess.run([sys.executable,str(P/'update.py'),'promote',str(P)],check=True)
""".replace('REMOTE',repr(remote)).replace('HASHES',repr(record['hashes']))
params=p/'repair-promote-parameters.json';params.write_text(json.dumps({'commands':["python3 - <<'PYREMOTE'\n"+script+"\nPYREMOTE"],'executionTimeout':['600']}));params.chmod(0o600)
id=subprocess.check_output(['aws','--profile','message-board-deploy','--region','us-east-1','ssm','send-command','--instance-ids',record['instance'],'--document-name','AWS-RunShellScript','--parameters','file://'+str(params.resolve()),'--comment','Repair five staged private inodes then promote reviewed unchanged native packet','--query','Command.CommandId','--output','text'],text=True).strip();(p/'repair-promote-command-id').write_text(id);print(id)
