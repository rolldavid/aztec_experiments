"""Install persistent supervision without restarting healthy application processes.
Root operator only. Input is the reviewed source packet, never account secrets.
"""
import ast,base64,fcntl,hashlib,json,os,pathlib,subprocess,sys,time
packet=json.loads(pathlib.Path(sys.argv[1]).read_text());role=sys.argv[2];assert role in ('core','bok')
files={name:base64.b64decode(value['data']) for name,value in packet['files'].items()}
for name,data in files.items():assert hashlib.sha256(data).hexdigest()==packet['files'][name]['sha256']
B=pathlib.Path('/var/lib/rolling-bootstrap');P=B.parent/'rolling-bootstrap-private';A=pathlib.Path('/usr/local/lib/rolling-attest.py')
def sha(raw):return hashlib.sha256(raw).hexdigest()
def run(args):return subprocess.check_output(args,text=True,timeout=60).strip()
def definitions(raw):return ast.Module(body=[n for n in ast.parse(raw).body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[])
def namespace(raw):
 h={'__name__':'supervision_operator','__file__':str(A)};exec(compile(definitions(raw),str(A),'exec'),h);return h
def atomic(path,data,mode=0o644,gid=0):
 path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_name(path.name+'.supervision-new');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(temp,0,gid);os.chmod(temp,mode);os.replace(temp,path)
def process(service):
 pid=run(['systemctl','show',service,'-p','MainPID','--value']);assert int(pid)>0
 return {'pid':pid,'cwd':str((pathlib.Path('/proc')/pid/'cwd').resolve())}
monitor={'__name__':'supervision_module'};exec(compile(files['deploy/prover/supervision.py'],'supervision.py','exec'),monitor)
source_module={'__name__':'bootstrap_module'};exec(compile(files['deploy/prover/bootstrap.py'],'bootstrap.py','exec'),source_module)
services=monitor['SERVICES'][role];lease_services=('rolling-application','rolling-moderator') if role=='core' else ('rolling-bok-testnet',)
with (B/'lock').open('a') as writer,(P/'receipt-lock').open('a') as receipt:
 fcntl.flock(writer,fcntl.LOCK_EX);fcntl.flock(receipt,fcntl.LOCK_EX)
 original=A.read_bytes();h=namespace(original);h['verify_controls']();assert h['persistent_mode'](json.loads((B/'deadline.json').read_text()))
 source=h['control_source']();old_control=source.read_bytes();before={s:process(s) for s in services}
 archive=P/('supervision-'+packet['commit'][:12]);archive.mkdir(mode=0o700)
 (archive/'attestor-before.py').write_bytes(original);(archive/'control-before.py').write_bytes(old_control)
 units={s:pathlib.Path(run(['systemctl','show',s,'-p','FragmentPath','--value'])) for s in services}
 saved={p:p.read_bytes() for p in units.values()};next_units={};staged={}
 for service in lease_services:
  old_root=pathlib.Path(run(['systemctl','show',service,'-p','WorkingDirectory','--value']))
  assert sha((old_root/'plugins/main.mjs').read_bytes())==packet['baseMainSha256']
  new_root=old_root.parent/('supervision-'+packet['commit'][:12]);assert not new_root.exists();run(['cp','-al',str(old_root),str(new_root)])
  meta=(old_root/'plugins/main.mjs').stat()
  for name in ('plugins/main.mjs','plugins/hosted-lease.mjs'):atomic(new_root/name,files[name],meta.st_mode&0o777,meta.st_gid)
  unit=units[service];text=saved[unit].decode();assert 'WorkingDirectory='+str(old_root)+'\n' in text
  rows=text.splitlines(keepends=True)
  rows=[line.replace(str(old_root),str(new_root)) if line.startswith(('WorkingDirectory=','ExecStart=')) else line for line in rows]
  next_units[unit]=''.join(rows).encode();staged[service]={'current':str(old_root),'nextStart':str(new_root)}
 proxy_service,proxy_upstream=('rolling-application-proxy','rolling-application.service') if role=='core' else ('rolling-bok-artifact-proxy','rolling-bok-testnet.service')
 proxy_unit=units[proxy_service]
 next_units[proxy_unit]=source_module['application_proxy_independent_unit'](saved[proxy_unit].decode(),proxy_upstream).encode()
 # Preserve all admitted runtime declarations; amend only control policy readers.
 derived=old_control;updated=original
 if role=='core':
  names={'supervision_dropin','supervision_properties','query_host_readback','proxy_host_observe','activation_service'}
  wanted={n.name:n for n in ast.parse(files['deploy/prover/bootstrap.py']).body if isinstance(n,ast.FunctionDef) and n.name in names}
  lines=old_control.decode().splitlines(keepends=True);replacements=[];found=set()
  for n in ast.parse(old_control).body:
   if isinstance(n,ast.FunctionDef) and n.name in names:
    found.add(n.name);replacements.append((n.lineno-1,n.end_lineno,ast.get_source_segment(files['deploy/prover/bootstrap.py'].decode(),wanted[n.name])+'\n'))
  for start,end,text in reversed(replacements):lines[start:end]=[text]
  constants=next(n for n in ast.parse(files['deploy/prover/bootstrap.py']).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SUPERVISION_UNITS' for t in n.targets))
  derived=(''.join(lines)+'\n'+ast.get_source_segment(files['deploy/prover/bootstrap.py'].decode(),constants)+'\n'+'\n'.join(ast.get_source_segment(files['deploy/prover/bootstrap.py'].decode(),wanted[n]) for n in sorted(names-found))+'\n').encode()
  stable=lambda raw:[ast.dump(n,include_attributes=False) for n in ast.parse(raw).body if not(isinstance(n,ast.FunctionDef) and n.name in names) and not(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SUPERVISION_UNITS' for t in n.targets))]
  assert stable(derived)==stable(old_control)
  assignment=next(n for n in ast.parse(original).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets))
  lines=original.decode().splitlines(keepends=True);lines[assignment.lineno-1:assignment.end_lineno]=['PINS = '+repr({**h['PINS'],'controlSourceSha256':sha(derived)})+'\n'];updated=''.join(lines).encode()
 legacy=['rolling-attest.timer','rolling-attest.service','rolling-application-attest.timer','rolling-application-attest.service','rolling-application-stop.service']
 saved_links={name:os.readlink(pathlib.Path('/etc/systemd/system')/name) for name in legacy if (pathlib.Path('/etc/systemd/system')/name).is_symlink()}
 saved_legacy={name:(pathlib.Path('/etc/systemd/system')/name).read_bytes() for name in legacy if (pathlib.Path('/etc/systemd/system')/name).is_file() and name not in saved_links}
 fresh_paths=[pathlib.Path('/usr/local/lib/rolling-supervision/supervision.py'),pathlib.Path('/etc/systemd/system/rolling-monitor.service'),pathlib.Path('/etc/systemd/system/rolling-monitor.timer')]
 for path in fresh_paths:assert not path.exists() and not path.is_symlink(), 'Existing monitor requires explicit reconciliation'
 for p,data in saved.items():(archive/p.name).write_bytes(data)
 for name,data in saved_legacy.items():(archive/name).write_bytes(data)
 active_timers=[name for name in legacy if name.endswith('.timer') and run(['systemctl','show',name,'-p','ActiveState','--value'])=='active']
 for service in services:
  drop=pathlib.Path('/etc/systemd/system')/(service+'.service.d')/'availability.conf'
  assert not drop.exists() and not drop.is_symlink(), 'Existing availability policy requires explicit reconciliation'
 changed=False;activated=False
 try:
  if active_timers:run(['systemctl','stop',*active_timers])
  end=time.monotonic()+110
  for name in ('rolling-attest.service','rolling-application-attest.service'):
   while run(['systemctl','show',name,'-p','ActiveState','--value']) in ('active','activating','deactivating'):
    if time.monotonic()>end:raise RuntimeError('Observer did not drain')
  changed=True;atomic(source,derived);atomic(A,updated,0o700);namespace(updated)['verify_controls']()
  atomic(pathlib.Path('/usr/local/lib/rolling-supervision/supervision.py'),files['deploy/prover/supervision.py'])
  for service in services:atomic(pathlib.Path('/etc/systemd/system')/(service+'.service.d')/'availability.conf',source_module['supervision_dropin'](service).encode())
  for unit,data in next_units.items():atomic(unit,data)
  for name in legacy:
   path=pathlib.Path('/etc/systemd/system')/name
   if path.exists() or path.is_symlink():path.unlink()
   path.symlink_to('/dev/null')
  atomic(pathlib.Path('/etc/systemd/system/rolling-monitor.service'),monitor['monitor_unit'](role).encode())
  atomic(pathlib.Path('/etc/systemd/system/rolling-monitor.timer'),monitor['monitor_timer']().encode())
  run(['systemd-analyze','verify','/etc/systemd/system/rolling-monitor.service',*[str(p) for p in units.values()]])
  # Once reload is dispatched, new owners may start even if its response is lost.
  atomic(archive/'activation-started.json',json.dumps({'commit':packet['commit'],'role':role}).encode(),0o600)
  activated=True
  run(['systemctl','daemon-reload'])
  for service in services:
   fields=dict(line.split('=',1) for line in run(['systemctl','show',service,'--property=Restart,RestartUSec,StartLimitIntervalUSec,KillMode,OnFailure']).splitlines())
   assert fields=={'Restart':'always','RestartUSec':'5s','StartLimitIntervalUSec':'0','KillMode':'control-group','OnFailure':''}
  deps=dict(line.split('=',1) for line in run(['systemctl','show',proxy_service,'--property=Requires,BindsTo,Wants']).splitlines())
  assert proxy_upstream not in deps['Requires'].split()
  assert proxy_upstream not in deps['BindsTo'].split()
  assert 'rolling-egress.service' in deps['Requires'].split()
  assert proxy_upstream in deps['Wants'].split()
  assert before=={s:process(s) for s in services}
  run(['systemctl','enable','--now','rolling-monitor.timer'])
  run(['systemctl','start','rolling-monitor.service'])
  result={'published':True,'role':role,'commit':packet['commit'],'processesUnchanged':before,'nextStartReleases':staged,'controlSourceSha256':sha(derived),'attestorSha256':sha(updated),'manifestSha256':h['PINS']['manifest'],'legacyMonitorUnitsMasked':legacy,'monitor':json.loads(pathlib.Path('/var/lib/rolling-monitor/status.json').read_text())}
  (archive/'result.json').write_text(json.dumps(result));print(json.dumps(result))
 except Exception:
  if changed and not activated:
   atomic(source,old_control);atomic(A,original,0o700)
   for p,data in saved.items():atomic(p,data)
   for name in legacy:
    path=pathlib.Path('/etc/systemd/system')/name
    if path.is_symlink():path.unlink()
    if name in saved_links:path.symlink_to(saved_links[name])
    elif name in saved_legacy:atomic(path,saved_legacy[name])
    else:path.unlink(missing_ok=True)
   for service in services:(pathlib.Path('/etc/systemd/system')/(service+'.service.d')/'availability.conf').unlink(missing_ok=True)
   for path in fresh_paths:path.unlink(missing_ok=True)
   run(['systemctl','daemon-reload']);namespace(original)['verify_controls']()
  if not activated and active_timers:run(['systemctl','start',*active_timers])
  # After activation retain coherent new startup paths; never roll a newly
  # restarted kernel-lock owner back into the legacy exclusive-file protocol.
  raise
