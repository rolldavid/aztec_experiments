"""Public, harmless real-systemd fixtures; not native/prover qualification."""
import json,os,pathlib,time,hashlib,stat,subprocess,math
exec(pathlib.Path('/run/native-subset.py').read_text(),globals())
receipt={'schemaVersion':1,'passed':False,'nativeQualified':False,'cases':[],'sourceFunctionHashes':SOURCE_FUNCTION_HASHES}
RECEIPT_DIRECTORY='/run'
PHASES=('timer-service-write','timer-unit-write','timers-reload','timer-start','worker-transform','worker-write','unit-transform','unit-write','retention-reference','case-reload','before-state','activation-assert','start-wait','after-state','result-read','classify','record-case','retention-delay','retention-state','retention-assert','case-outcome-assert','complete')
LABELS=('none','baseline','success','nonzero','timeout')
def checkpoint(operation,label='none',timer='none'):
 if operation not in PHASES or label not in LABELS or timer not in ('none','budget','commissioning'):raise ValueError('Closed diagnostic checkpoint')
 receipt['checkpoint']={'operation':operation,'label':label,'timer':timer}
def result_availability(label):
 if label=='none':return {'status':'not-applicable'}
 if label not in LABELS:return {'status':'invalid-label'}
 try:
  info=os.lstat('/var/lib/rolling-fixture-'+label+'/result.json')
  if not stat.S_ISREG(info.st_mode):return {'status':'not-regular'}
  if not 0<=info.st_size<=16384:return {'status':'oversized'}
  return {'status':'regular','bytes':info.st_size}
 except FileNotFoundError:return {'status':'missing'}
 except Exception:return {'status':'unavailable'}
def original_exception(error):
 # Only exact trusted stdlib exception types; never inspect unknown subclasses
 # or serialize messages, args, cmd, output, stderr, errno or arbitrary objects.
 kind=type(error)
 if kind is subprocess.CalledProcessError:
  result={'category':'called-process-error'}
  fields=object.__getattribute__(error,'__dict__')
  code=dict.get(fields,'returncode') if type(fields) is dict else None
  if type(code) is int and -255<=code<=255:result['returnCode']=code
  return result
 if kind is subprocess.TimeoutExpired:
  result={'category':'timeout-expired'}
  fields=object.__getattribute__(error,'__dict__')
  seconds=dict.get(fields,'timeout') if type(fields) is dict else None
  if type(seconds) in (int,float) and 0<seconds<=120 and math.isfinite(seconds):result['timeoutSeconds']=seconds
  return result
 return {'category':'os-error' if kind is OSError else 'unknown'}
def failure_observation():
 # Exact production native_state uses its existing bounded3s capture and finite
 # projection. Failure diagnostics never replace the original outcome or run
 # the workload, parse its private data, retry it, or alter its state.
 try:observed=native_state()
 except Exception:observed={'status':'transport-error'}
 return {'nativeState':observed,'resultAvailability':result_availability(receipt.get('checkpoint',{}).get('label','none'))}

def save():
 data=json.dumps(receipt,sort_keys=True).encode()
 if len(data)>16384:raise ValueError('Receipt size')
 pending=pathlib.Path(RECEIPT_DIRECTORY)/'regression.pending'
 final=pathlib.Path(RECEIPT_DIRECTORY)/'regression.json'
 fd=os.open(pending,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o444)
 try:
  if os.write(fd,data)!=len(data):raise OSError('Incomplete receipt')
  os.fsync(fd)
 finally:os.close(fd)
 # Same-directory exclusive publication: readers see no file or complete JSON.
 # Existing final/pending records are never replaced or silently reseeded.
 os.link(pending,final,follow_symlinks=False);os.unlink(pending)
 fd=os.open(RECEIPT_DIRECTORY,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)

def case(label,args,timeout,retained):
 state_name='rolling-fixture-'+label
 path='/var/lib/'+state_name+'/result.json'
 checkpoint('worker-transform',label)
 worker=CAPTURE
 for before,after in [("/var/lib/rolling-native-version/result.json",path),("['/opt/rolling-native-version/bb','--version'],15",repr(args)+','+str(timeout))]:
  if worker.count(before)!=1:raise ValueError('Worker anchor')
  worker=worker.replace(before,after)
 worker="EXPECTED_VERSION=''\n"+worker+'\nnative_worker()\n'
 worker_path='/opt/rolling-native-version/'+label+'.py'
 checkpoint('worker-write',label)
 write(worker_path,worker,0o444)
 checkpoint('unit-transform',label)
 unit=UNIT
 for before,after in [('StateDirectory=rolling-native-version','StateDirectory='+state_name),('/opt/rolling-native-version/capture.py',worker_path)]:
  if unit.count(before)!=1:raise ValueError('Unit anchor')
  unit=unit.replace(before,after)
 checkpoint('unit-write',label)
 write('/etc/systemd/system/'+NATIVE_UNIT,unit,0o644)
 if retained:
  checkpoint('retention-reference',label)
  native_retain_execution()
 else:
  checkpoint('case-reload',label)
  run(['systemctl','daemon-reload'],timeout=3)
 # Loading the ordering reference must not start the workload.
 checkpoint('before-state',label)
 before=native_state()
 checkpoint('activation-assert',label)
 if before.get('ActiveState') not in ('inactive','failed') or pathlib.Path(path).exists():raise ValueError('Automatic activation')
 checkpoint('start-wait',label)
 try:run(['systemctl','start','--wait',NATIVE_UNIT],timeout=20)
 except Exception:pass
 checkpoint('after-state',label)
 state=native_state()
 checkpoint('result-read',label)
 result=native_result(read_bounded_json(path))
 checkpoint('classify',label)
 outcome=native_classify(state,result)
 row={'label':label,'state':state,'result':result,'outcome':outcome,'workerSha256':hashlib.sha256(worker.encode()).hexdigest()}
 checkpoint('record-case',label)
 receipt['cases'].append(row)
 if retained:
  checkpoint('retention-delay',label)
  time.sleep(3)
  checkpoint('retention-state',label)
  row['afterDelay']=native_state()
  checkpoint('retention-assert',label)
  if row['afterDelay']!=state:raise ValueError('Execution identity lost')
 checkpoint('case-outcome-assert',label)
 return outcome

try:
 # Harmless timer targets, not cloud shutdown replacement. Both stay active well
 # past the60s outer fixture. The exact production reference helper is invoked.
 for name in ('budget','commissioning'):
  checkpoint('timer-service-write',timer=name)
  write('/etc/systemd/system/rolling-'+name+'.service','[Service]\nType=oneshot\nExecStart=/usr/bin/true\n',0o644)
  checkpoint('timer-unit-write',timer=name)
  write('/etc/systemd/system/rolling-'+name+'.timer','[Timer]\nOnActiveSec=120s\nUnit=rolling-'+name+'.service\n',0o644)
 checkpoint('timers-reload')
 run(['systemctl','daemon-reload'],timeout=3)
 for name in ('budget','commissioning'):
  checkpoint('timer-start',timer=name)
  run(['systemctl','start','rolling-'+name+'.timer'],timeout=3)
 case('baseline',['/usr/bin/true'],15,False) # Collection is observed, not assumed.
 if case('success',['/usr/bin/true'],15,True)!='passed':raise ValueError('Retained positive')
 if case('nonzero',['/usr/bin/false'],15,True)!='nonzero':raise ValueError('Nonzero gate')
 if case('timeout',['/usr/bin/sleep','10'],1,True)!='timeout':raise ValueError('Timeout gate')
 checkpoint('complete')
 receipt['passed']=True
except Exception as failure:
 receipt['failureCategory']='precondition-or-assertion'
 receipt['originalException']=original_exception(failure)
 try:receipt['failureObservation']=failure_observation()
 except Exception:receipt['failureObservation']={'status':'diagnostic-unavailable'}
finally:
 # Keep PID1 running so the host can retrieve /run tmpfs evidence before its
 # already-bounded owned-container termination. No guest shutdown lifecycle.
 save()
