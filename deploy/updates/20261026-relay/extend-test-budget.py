"""Extend the owned Sepolia relay allowance, retaining all consumed reservations."""
import pathlib,json,hashlib,os,subprocess,fcntl,tempfile
P=pathlib.Path;unit='rolling-application.service';config=P('/etc/rolling-app/relay.json')
def prop(key):return subprocess.check_output(['systemctl','show',unit,'-p',key,'--value'],text=True).strip()
source=P(prop('WorkingDirectory'));assert source==P('/opt/rolling-app/releases/ui-f9d42ce4616e')
raw=config.read_bytes();settings=json.loads(raw);policy=settings['policy'];directory=P(settings['stateDirectory'])
assert policy['chainId']=='11155111' and policy['development'] is False
assert policy['relayer']=='0xe6c6f747c7f94ac3238a10f6ba4fd1d5367b2c4e'
assert policy['maxGasWei']=='50000000000000' and policy['totalGasBudgetWei']=='100000000000000'
node=subprocess.check_output(['readlink','-f','/proc/'+prop('MainPID')+'/exe'],text=True).strip()
paths=[config,P(str(directory)+'.initialized.json'),directory/'funding-budget.json']
before={p:(p.read_bytes(),p.stat()) for p in paths}
def atomic(p,data,stat):
 fd,name=tempfile.mkstemp(prefix=p.name+'.budget-',dir=p.parent);temp=P(name)
 try:
  with os.fdopen(fd,'wb') as f:
   os.fchmod(f.fileno(),stat.st_mode&0o777);os.fchown(f.fileno(),stat.st_uid,stat.st_gid);f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(temp,p)
 finally:temp.unlink(missing_ok=True)
 fd=os.open(p.parent,os.O_DIRECTORY);os.fsync(fd);os.close(fd)
subprocess.run(['systemctl','stop',unit],check=True)
assert prop('MainPID')=='0'
restored=True
try:
 with (directory/'hosted.lock').open('r+b') as lease:
  fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  # Re-read after drain; a completed request may have changed the reservation.
  assert config.read_bytes()==raw
  before={p:(p.read_bytes(),p.stat()) for p in paths}
  ledger=json.loads(before[paths[2]][0]);marker=json.loads(before[paths[1]][0]);assert ledger['activePlan'] is None
  updated=json.loads(raw);updated['policy']['totalGasBudgetWei']='10000000000000000'
  # The native initializer validates each complete policy and derives its identity.
  js="import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {prepareFundingRelayState} from './plugins/rolling-funding-relay.mjs';let raw='';for await(const part of process.stdin)raw+=part;const policies=JSON.parse(raw),root=await fs.mkdtemp(path.join(os.tmpdir(),'relay-policy-'));try{const ids=[];for(let i=0;i<policies.length;i++){const stateDirectory=path.join(root,String(i));await prepareFundingRelayState({stateDirectory,policy:policies[i]});ids.push(JSON.parse(await fs.readFile(stateDirectory+'.initialized.json','utf8')).identity);}process.stdout.write(JSON.stringify(ids));}finally{await fs.rm(root,{recursive:true,force:true});}"
  identities=json.loads(subprocess.check_output([node,'--input-type=module','-e',js],cwd=source,input=json.dumps([policy,updated['policy']]),text=True))
  assert marker['identity']==ledger['identity']==identities[0]
  assert 0<=int(ledger['reservedGasWei'])<=int(policy['totalGasBudgetWei'])
  next_marker={**marker,'identity':identities[1]};next_ledger={**ledger,'identity':identities[1]}
  try:
   restored=False
   for p,value in zip(paths,[updated,next_marker,next_ledger]):atomic(p,(json.dumps(value,indent=2)+'\n').encode(),before[p][1])
  except BaseException:
   for p,(data,stat) in before.items():atomic(p,data,stat)
   restored=True
   raise
except BaseException:
 if restored:subprocess.run(['systemctl','start',unit],check=True)
 raise
js="import {retryUntil} from '@aztec-labs/foundation/retry';await retryUntil(async()=>{try{const r=await fetch('http://127.0.0.1:4318/api/status',{signal:AbortSignal.timeout(5000)});return r.ok&&(await r.json()).state==='ready';}catch{return false;}},'application readiness',90);"
try:
 subprocess.run(['systemctl','start',unit],check=True)
 pid=prop('MainPID')
 subprocess.run([node,'--input-type=module','-e',js],cwd=source,check=True,timeout=100)
 assert prop('MainPID')==pid and P('/proc',pid,'cwd').resolve()==source
except BaseException:
 subprocess.run(['systemctl','stop',unit],check=True)
 with (directory/'hosted.lock').open('r+b') as lease:
  fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  # Startup may already have admitted work. Keep every new reservation/fence
  # and journal; only revert the policy identity and ceiling. A reservation
  # exceeding the restored ceiling correctly prevents further admission.
  current=json.loads(paths[2].read_bytes());assert current['identity']==identities[1]
  assert int(current['reservedGasWei'])>=int(ledger['reservedGasWei'])
  current['identity']=identities[0]
  for p in paths[:2]:atomic(p,before[p][0],before[p][1])
  atomic(paths[2],(json.dumps(current,indent=2)+'\n').encode(),before[paths[2]][1])
 subprocess.run(['systemctl','start',unit],check=True)
 subprocess.run([node,'--input-type=module','-e',js],cwd=source,check=True,timeout=100)
 raise
print(json.dumps({'appPid':int(pid),'maximumPerPaymentWei':policy['maxGasWei'],'totalGasBudgetWei':updated['policy']['totalGasBudgetWei'],'reservedGasWei':ledger['reservedGasWei'],'journalsPreserved':True}))
