import ast,base64,gzip,fcntl,hashlib,json,os,pathlib,subprocess,sys,time
payload=json.loads(base64.b64decode(sys.argv[1]));candidate=gzip.decompress(base64.b64decode(payload['functions']));assert hashlib.sha256(candidate).hexdigest()==payload['functionsSha256']
A=pathlib.Path('/usr/local/lib/rolling-attest.py');B=pathlib.Path('/var/lib/rolling-bootstrap');P=B.parent/'rolling-bootstrap-private'
def sha(data):return hashlib.sha256(data).hexdigest()
def namespace(raw):
 tree=ast.parse(raw);h={'__name__':'observer_amendment','__file__':str(A)};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[]),str(A),'exec'),h);return h
def run(args):return subprocess.check_output(args,text=True,timeout=30).strip()
def atomic(path,data,mode):
 tmp=path.with_name(path.name+'.observation-new');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(tmp,0,0);os.chmod(tmp,mode);os.replace(tmp,path)
with (B/'lock').open('a') as writer,(P/'receipt-lock').open('a') as receipt:
 fcntl.flock(writer,fcntl.LOCK_EX);fcntl.flock(receipt,fcntl.LOCK_EX)
 original=A.read_bytes();h=namespace(original);h['verify_controls']();source=h['control_source']();old=source.read_bytes();assert sha(old)=='9501b3d7316203729124ae727bf105e4fb7a3554c3148f646a3bee8c77110c6b'
 names={'unavailable_http','query_listener_denials','query_host_readback','query_host','activation_health','prover_activation'}
 proposed={n.name:n for n in ast.parse(candidate).body if isinstance(n,ast.FunctionDef) and n.name in names};assert set(proposed)==names
 lines=old.decode().splitlines(keepends=True);changes=[];seen=set()
 for n in ast.parse(old).body:
  if isinstance(n,ast.FunctionDef) and n.name in names:
   seen.add(n.name);new=ast.get_source_segment(candidate.decode(),proposed[n.name])+'\n';changes.append((n.lineno-1,n.end_lineno,new))
 assert seen==names-{'unavailable_http'}
 for start,end,new in reversed(changes):lines[start:end]=[new]
 derived=(''.join(lines)+'\n'+ast.get_source_segment(candidate.decode(),proposed['unavailable_http'])+'\n').encode()
 # No changes to other constants, functions, native artifacts or chain identity.
 stable=lambda raw:[ast.dump(n,include_attributes=False) for n in ast.parse(raw).body if not(isinstance(n,ast.FunctionDef) and n.name in names)]
 assert stable(old)==stable(derived)
 tree=ast.parse(original);assignment=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets));pins={**h['PINS'],'controlSourceSha256':sha(derived)}
 lines=original.decode().splitlines(keepends=True);lines[assignment.lineno-1:assignment.end_lineno]=['PINS = '+repr(pins)+'\n'];updated=''.join(lines).encode()
 services=['rolling-node','rolling-query','board-prover','board-prover-proxy','rolling-application','rolling-application-proxy','rolling-moderator'];pids={s:run(['systemctl','show',s,'-p','MainPID','--value']) for s in services};assert all(int(v)>0 for v in pids.values())
 archive=P/('observer-amendment-'+payload['sourceSha256'][:12]);archive.mkdir(mode=0o700);(archive/'control-before.py').write_bytes(old);(archive/'attestor-before.py').write_bytes(original)
 timers=['rolling-attest.timer','rolling-application-attest.timer'];changed=False;controls_coherent=True
 try:
  run(['systemctl','stop',*timers])
  # Timers are stopped; drain finite observations before replacing the matched pair.
  drain_deadline=time.monotonic()+110
  for timer in timers:
   unit=timer.replace('.timer','.service')
   while run(['systemctl','show',unit,'-p','ActiveState','--value']) in ('active','activating','deactivating'):
    if time.monotonic()>drain_deadline:raise RuntimeError('Observer did not drain; no files changed')
  controls_coherent=False;changed=True;atomic(source,derived,0o644);atomic(A,updated,0o700)
  new=namespace(updated);new['verify_controls']();new['control_source']();controls_coherent=True
  q=new['activation_support']('query-observe');p=new['activation_support']('observe')
  assert q['queryHostPolicy']=='active-private-authenticated' and p['proverActivated'] is True
  assert pids=={s:run(['systemctl','show',s,'-p','MainPID','--value']) for s in services}
  result={'published':True,'sourceSha256':payload['sourceSha256'],'controlSourceSha256':sha(derived),'attestorSha256':sha(updated),'manifestSha256':pins['manifest'],'pidsUnchanged':pids,'proverAvailability':p['proverAvailability'],'queryAvailability':q['queryAvailability']}
  (archive/'result.json').write_text(json.dumps(result));print(json.dumps(result))
 except Exception:
  if changed:
   controls_coherent=False;atomic(source,old,0o644);atomic(A,original,0o700);namespace(original)['verify_controls']();controls_coherent=True
  raise
 finally:
  if controls_coherent:run(['systemctl','start',*timers])
