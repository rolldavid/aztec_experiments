"""Public, harmless real-systemd fixtures; not native/prover qualification."""
import json,os,pathlib,time,hashlib
exec(pathlib.Path('/run/native-subset.py').read_text(),globals())
receipt={'schemaVersion':1,'passed':False,'nativeQualified':False,'cases':[],'sourceFunctionHashes':SOURCE_FUNCTION_HASHES}

def save():
 data=json.dumps(receipt,sort_keys=True).encode()
 if len(data)>16384:raise ValueError('Receipt size')
 fd=os.open('/run/regression.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
 try:os.write(fd,data);os.fsync(fd)
 finally:os.close(fd)

def case(label,args,timeout,retained):
 state_name='rolling-fixture-'+label
 path='/var/lib/'+state_name+'/result.json'
 worker=CAPTURE
 for before,after in [("/var/lib/rolling-native-version/result.json",path),("['/opt/rolling-native-version/bb','--version'],15",repr(args)+','+str(timeout))]:
  if worker.count(before)!=1:raise ValueError('Worker anchor')
  worker=worker.replace(before,after)
 worker="EXPECTED_VERSION=''\n"+worker+'\nnative_worker()\n'
 worker_path='/opt/rolling-native-version/'+label+'.py'
 write(worker_path,worker,0o444)
 unit=UNIT
 for before,after in [('StateDirectory=rolling-native-version','StateDirectory='+state_name),('/opt/rolling-native-version/capture.py',worker_path)]:
  if unit.count(before)!=1:raise ValueError('Unit anchor')
  unit=unit.replace(before,after)
 write('/etc/systemd/system/'+NATIVE_UNIT,unit,0o644)
 if retained:native_retain_execution()
 else:run(['systemctl','daemon-reload'],timeout=3)
 # Loading the ordering reference must not start the workload.
 before=native_state()
 if before.get('ActiveState') not in ('inactive','failed') or pathlib.Path(path).exists():raise ValueError('Automatic activation')
 try:run(['systemctl','start','--wait',NATIVE_UNIT],timeout=20)
 except Exception:pass
 state=native_state();result=native_result(read_bounded_json(path))
 outcome=native_classify(state,result)
 row={'label':label,'state':state,'result':result,'outcome':outcome,'workerSha256':hashlib.sha256(worker.encode()).hexdigest()}
 receipt['cases'].append(row)
 if retained:
  time.sleep(3)
  row['afterDelay']=native_state()
  if row['afterDelay']!=state:raise ValueError('Execution identity lost')
 return outcome

try:
 # Harmless timer targets, not cloud shutdown replacement. Both stay active well
 # past the60s outer fixture. The exact production reference helper is invoked.
 for name in ('budget','commissioning'):
  write('/etc/systemd/system/rolling-'+name+'.service','[Service]\nType=oneshot\nExecStart=/usr/bin/true\n',0o644)
  write('/etc/systemd/system/rolling-'+name+'.timer','[Timer]\nOnActiveSec=120s\nUnit=rolling-'+name+'.service\n',0o644)
 run(['systemctl','daemon-reload'],timeout=3)
 for name in ('budget','commissioning'):run(['systemctl','start','rolling-'+name+'.timer'],timeout=3)
 case('baseline',['/usr/bin/true'],15,False) # Collection is observed, not assumed.
 if case('success',['/usr/bin/true'],15,True)!='passed':raise ValueError('Retained positive')
 if case('nonzero',['/usr/bin/false'],15,True)!='nonzero':raise ValueError('Nonzero gate')
 if case('timeout',['/usr/bin/sleep','10'],1,True)!='timeout':raise ValueError('Timeout gate')
 receipt['passed']=True
except Exception:
 receipt['failureCategory']='precondition-or-assertion'
finally:
 try:save()
 finally:
  # Exact owned container only; host retains State and receipt before removal.
  try:run(['systemctl','poweroff','--no-block'],timeout=3)
  except Exception:pass
