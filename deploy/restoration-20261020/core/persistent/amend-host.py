# Trusted host-only transition. No cloud calls, live service restart, or runtime relabel.
import ast,base64,fcntl,gzip,hashlib,json,os,pathlib,shutil,stat,subprocess,sys
label=sys.argv[1];packet=pathlib.Path(sys.argv[2]);binding=json.loads(pathlib.Path(sys.argv[3]).read_text());assert label in ('core','bok');expected=binding['hosts'][label]
assert hashlib.sha256(packet.read_bytes()).hexdigest()==binding['payloadSha256']
payload=json.loads(gzip.decompress(packet.read_bytes()));assert payload['policy']==binding['policy'] and payload['controlSourceSha256']==binding['controlSourceSha256']
A=pathlib.Path('/usr/local/lib/rolling-attest.py');B=pathlib.Path('/var/lib/rolling-bootstrap');P=pathlib.Path('/var/lib/rolling-bootstrap-private');P.mkdir(mode=0o700,exist_ok=True)
run=lambda args:subprocess.check_output(args,text=True,timeout=60).strip()
def namespace(raw):
 t=ast.parse(raw);h={'__name__':'persistent_operator','__file__':str(A)};exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[]),str(A),'exec'),h);return h
original=A.read_bytes();assert hashlib.sha256(original).hexdigest()==expected['oldAttestorSha256'];old=namespace(original);assert old['PINS']['manifest']==expected['manifest'];old['verify_controls']()
deadline=B/'deadline.json';before_deadline=deadline.read_bytes();record=json.loads(before_deadline)
assert all(record[k]==v for k,v in expected['oldDeadline'].items()) and 'persistentHosting' not in record
# Completed commissioning must remain disabled; it is not recreated by this amendment.
assert subprocess.run(['systemctl','is-active','--quiet','rolling-commissioning.timer']).returncode==3
services=(['rolling-node.service','rolling-query.service','board-prover.service','board-prover-proxy.service','rolling-application.service','rolling-application-proxy.service']if label=='core'else['rolling-bok-testnet.service','rolling-bok-artifact-proxy.service'])
pids={u:run(['systemctl','show',u,'-p','MainPID','--value'])for u in services};assert all(int(x)>0 for x in pids.values())
if label=='core':assert not (B/'application-failure.json').exists()
archive=P/'persistent-hosting-0205d08b';assert not archive.exists();archive.mkdir(mode=0o700)
(archive/'attestor-before.py').write_bytes(original);(archive/'deadline-before.json').write_bytes(before_deadline)
unit=pathlib.Path('/etc/systemd/system/rolling-budget.timer');assert unit.is_file() and not unit.is_symlink();timer=unit.read_bytes();(archive/'budget-timer-before').write_bytes(timer)
control=pathlib.Path('/usr/local/lib/rolling-control');assert not control.exists()
source=base64.b64decode(payload['files']['deploy/prover/bootstrap.py']);assert hashlib.sha256(source).hexdigest()==binding['controlSourceSha256']
t=ast.parse(source);host=next(ast.literal_eval(n.value)for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='HOST'for x in n.targets));newdefs={n.name:n for n in ast.parse(host).body if isinstance(n,ast.FunctionDef)}
replace={'persistent_hosting','control_source','persistent_mode','operation_deadline','immutable_deadline','install_controls','verify_controls'}
if label=='core':replace.update({'qualify','install_qualification','application_observation','activation_support'})
oldtree=ast.parse(original);names={n.name for n in oldtree.body if isinstance(n,ast.FunctionDef)};pins=dict(old['PINS']);pins['controlSourceSha256']=binding['controlSourceSha256'];pins['persistentHosting']=hashlib.sha256(json.dumps(payload['policy'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
newbody=[]
for n in oldtree.body:
 if isinstance(n,ast.FunctionDef) and n.name in replace:n=newdefs[n.name]
 elif isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='PINS'for x in n.targets):n=ast.parse('PINS = '+repr(pins)).body[0]
 newbody.append(n)
# Missing reviewed helper definitions precede the existing execution entrypoint.
where=next(i for i,n in enumerate(newbody)if isinstance(n,ast.FunctionDef))
for name in sorted(replace-names):newbody.insert(where,newdefs[name]);where+=1
new_source=(ast.unparse(ast.fix_missing_locations(ast.Module(body=newbody,type_ignores=[])))+'\n').encode();compile(new_source,str(A),'exec')
record['persistentHosting']=payload['policy']
nodeunit=pathlib.Path('/etc/systemd/system/rolling-node.service');node_before=nodeunit.read_bytes() if label=='core'else None
if node_before:(archive/'node-unit-before').write_bytes(node_before)
monitors=['rolling-attest.timer']+(['rolling-application-attest.timer']if label=='core'else[])
def atomic(path,data,mode=0o600):
 tmp=path.with_name(path.name+'.persistent-new');assert not tmp.exists();tmp.write_bytes(data);tmp.chmod(mode);os.chown(tmp,0,0);os.replace(tmp,path)
changed=False
with open(B/'lock','a')as writer,open(P/'receipt-lock','a')as receipt:
 fcntl.flock(writer,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(receipt,fcntl.LOCK_EX|fcntl.LOCK_NB)
 run(['systemctl','stop',*monitors])
 try:
  for monitor in monitors:
   assert run(['systemctl','show',monitor.replace('.timer','.service'),'-p','ActiveState','--value'])=='inactive', 'Observer still owns a finite check; no transition performed'
  control.mkdir(mode=0o755)
  for rel,encoded in payload['files'].items():
   assert rel in {'deploy/prover/bootstrap.py','deploy/prover/startup-stages.mjs','prover/compact-node-transform.mjs','prover/compact-node-registration.mjs','prover/compact-block-native.mjs','shared/trusted-private-node.mjs','shared/rolling/compact-client.mjs'}
   dest=control/rel;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755);dest.write_bytes(base64.b64decode(encoded));dest.chmod(0o644)
  for directory,_,_ in os.walk(control):os.chmod(directory,0o755);os.chown(directory,0,0)
  changed=True
  atomic(deadline,json.dumps(record,sort_keys=True).encode());atomic(A,new_source,0o700)
  run(['systemctl','disable','--now','rolling-budget.timer']);unit.unlink();run(['systemctl','mask','rolling-budget.timer'])
  if label=='core':
   oldpath=str(old['RELEASE']/'deploy/prover/bootstrap.py');text=node_before.decode();assert text.count(oldpath)==1
   atomic(nodeunit,text.replace(oldpath,str(control/'deploy/prover/bootstrap.py')).encode(),0o644)
   # One-shot historical admission never runs again on reboot.
   run(['systemctl','disable','rolling-qualification.service'])
   wants=pathlib.Path('/etc/systemd/system/multi-user.target.wants');wants.mkdir(exist_ok=True)
   query=wants/'rolling-query.service';assert not query.exists();query.symlink_to('/etc/systemd/system/rolling-query.service')
   run(['systemctl','enable','rolling-node.service','board-prover.service','board-prover-proxy.service','rolling-application.service','rolling-application-proxy.service'])
  # Keep the fast controls monitor ordered after the preserved egress service.
  drop=pathlib.Path('/etc/systemd/system/rolling-attest.service.d/persistent-order.conf');drop.parent.mkdir(exist_ok=True,mode=0o755);assert not drop.exists();drop.write_text('[Unit]\nRequires=rolling-egress.service\nAfter=rolling-egress.service\n');drop.chmod(0o644)
  if label=='core':
   appdrop=pathlib.Path('/etc/systemd/system/rolling-application-attest.service.d/persistent-order.conf');appdrop.parent.mkdir(exist_ok=True,mode=0o755);assert not appdrop.exists();appdrop.write_text('[Unit]\nAfter=rolling-node.service rolling-query.service board-prover.service board-prover-proxy.service\n');appdrop.chmod(0o644)
  run(['systemctl','daemon-reload']);h=namespace(new_source);h['verify_controls']();assert h['persistent_mode'](record);h['control_source']()
  if label=='core':
   assert h['activation_support']('query-observe')['queryHostPolicy']=='active-private-authenticated'
   assert h['activation_support']('observe')['proverPolicy']=='active-loopback'
  assert pids=={u:run(['systemctl','show',u,'-p','MainPID','--value'])for u in services}
  result={'persistentHostingVerified':True,'source':'0205d08b','controlSourceSha256':binding['controlSourceSha256'],'admittedManifestUnchanged':expected['manifest'],'attestorSha256':hashlib.sha256(new_source).hexdigest(),'monthlyUsd':1500,'noLifetimeExpiry':True,'elapsedTimerMasked':True,'pidsUnchanged':pids,'egressMbps':record['hostResources']['egressMbps'],'oldDeadlineHistorical':record['budgetStop'],'cloudExpiryRetirementPending':True}
  (archive/'result.json').write_text(json.dumps(result));print(json.dumps(result))
 except Exception:
  # Existing independent cloud shutdown remains throughout. Restore prior native policy on failure.
  if changed:
   atomic(A,original,0o700);atomic(deadline,before_deadline)
   if unit.is_symlink():unit.unlink()
   atomic(unit,timer,0o644)
   if node_before:atomic(nodeunit,node_before,0o644)
   run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','rolling-budget.timer']);namespace(original)['verify_controls']()
  raise
 finally:run(['systemctl','start',*monitors])
