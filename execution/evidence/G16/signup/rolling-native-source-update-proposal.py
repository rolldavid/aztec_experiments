import ast,datetime as dt,fcntl,hashlib,io,json,os,pathlib,subprocess,sys,tarfile,tokenize
sys.dont_write_bytecode=True
# PROPOSAL: root must review with current inventory before invocation.
# Usage: python3 update.py stage|promote /root/private-packet-directory
# Packet: package.json, inventory.json, delta.tar.gz, affected-checks.json.
# No credential/upload configuration is accepted or needed.
P=pathlib.Path(sys.argv[2]);BASE=pathlib.Path('/var/lib/rolling-bootstrap');PRIVATE=BASE.parent/'rolling-bootstrap-private'
meta=json.loads((P/'package.json').read_text());inventory=json.loads((P/'inventory.json').read_text())
old_manifest=meta['baseManifestSha256'];new_manifest=meta['manifestSha256']
assert old_manifest==inventory['manifestSha256']
assert set(meta['changed'])=={'prover/interfaces.mjs','prover/process-worker.mjs','prover/queue.mjs','prover/server.mjs'}
assert len(meta['changed'])==4
assert new_manifest!=old_manifest
assert meta['archiveSha256']==inventory['runtimeArchiveSha256']
assert inventory['hasPersistentHosting'] and not inventory['applicationFailurePresent']
assert not inventory['activationDeliveryConfigured'] and not inventory['activationDeliveryFilesPresent']
for value in (old_manifest,new_manifest,meta['archiveSha256'],meta['deltaSha256'],meta['affectedChecksSha256']):
 assert isinstance(value,str) and len(value)==64 and all(x in '0123456789abcdef' for x in value)
old_release=pathlib.Path('/opt/board-prover/releases/rolling-'+old_manifest[:16]);new_release=old_release.parent/('rolling-'+new_manifest[:16]);candidate=BASE/('qualification-candidate-'+new_manifest)
def run(a):return subprocess.check_output(a,text=True).strip()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def atomic(p,data,mode=0o600):
 temp=p.with_name(p.name+'.source-update');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(temp,p)
def wait_query(release):
 # The running query process is preserved. Validate its authenticated boundary,
 # native identity and current upstream using the pinned control implementation.
 b['query_host_readback'](h if release==new_release else old)
 b['query_host_fresh'](h if release==new_release else old)

def prover_identity():
 pid=run(['systemctl','show','board-prover.service','--property=MainPID','--value']);assert pid.isdigit() and int(pid)>1
 proc=pathlib.Path('/proc')/pid
 # /proc/stat starttime prevents PID reuse masquerading as the original process.
 start=proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]
 return {'pid':int(pid),'startTicks':start,'exe':str((proc/'exe').resolve()),'cwd':str((proc/'cwd').resolve())}
def switch_current(target):
 link=pathlib.Path('/opt/board-prover/current');temporary=link.with_name('current.source-update')
 temporary.symlink_to(target);os.replace(temporary,link)

def policy_check(release):
 # The bounded affected tests are run locally by the owning agent. Preserve the
 # actual result bytes and binding; never claim a new full native qualification.
 path=P/'affected-checks.json';assert sha(path)==meta['affectedChecksSha256']
 checks=json.loads(path.read_text())
 assert checks['passed'] is True and checks['source']==meta['source']
 assert set(checks['changedFiles'])==set(meta['changed']) and checks['tests']
 assert checks['fileHashes']=={rel:manifest['files'][rel] for rel in meta['changed']}
 for rel in meta['changed']:
  subprocess.run([str(release/'node/bin/node'),'--check',str(release/rel)],cwd=release,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30,check=True)
 return {'affectedChecksSha256':sha(path),'nativeSyntaxPassed':True,'proofJobs':0}

def wait_prover(release):
 script="import {createAztecNodeClient,waitForNode} from '@aztec-labs/aztec.js/node';await waitForNode(createAztecNodeClient('http://127.0.0.1:8081/v1/node',{maxBatchSize:1}),undefined,{timeout:60});"
 subprocess.run([str(release/'node/bin/node'),'--input-type=module','--eval',script],cwd=release,env={'PATH':'/usr/bin:/bin','HOME':'/root','NODE_BACKEND':'js','LOG_LEVEL':'silent'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=65,check=True)

def definitions(text):
 tree=ast.parse(text);return ast.Module(body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[])
assert os.geteuid()==0 and sys.argv[1] in ('stage','promote')
assert P.is_absolute() and P.resolve()==P and P.stat().st_uid==0 and (P.stat().st_mode&0o777)==0o700
with (BASE/'lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 deadline=json.loads((BASE/'deadline.json').read_text());assert deadline['manifestSha256']==old_manifest
 assert sha(BASE/'deadline.json')==inventory['fileHashes'][str(BASE/'deadline.json')]
 assert run(['systemctl','show','rolling-node.service','--property=ActiveState','--value'])=='active'
 attestor=pathlib.Path('/usr/local/lib/rolling-attest.py');assert sha(attestor)==inventory['attestorSha256']
 old={};exec(compile(definitions(attestor.read_text()),'old-attestor','exec'),old);old['verify_controls']();assert old['persistent_mode'](deadline)
 assert old['PINS']['controlSourceSha256']==inventory['controlSourceSha256']
 assert run(['systemctl','show','rolling-attest.timer','--property=ActiveState','--value'])=='active'
 assert not (BASE/'application-failure.json').exists()
 node_identity=run(['docker','inspect','--format','{{.Id}} {{.State.StartedAt}}','rolling-node'])
 prover_process=prover_identity()
 assert prover_process==inventory['proverProcess']
 retained_pids={u:run(['systemctl','show',u,'--property=MainPID','--value']) for u in ['rolling-node.service','rolling-query.service','rolling-application.service']}
 assert all(int(v)>0 for v in retained_pids.values())
 # Bok is on the separate host; preserve its observed absence on core.
 absent_bok={k:run(['systemctl','show','rolling-bok-testnet.service','--property='+k,'--value']) for k in ('LoadState','ActiveState','MainPID')}
 assert absent_bok=={k:inventory['services']['rolling-bok-testnet.service'][k] for k in absent_bok}
 assert absent_bok=={'LoadState':'not-found','ActiveState':'inactive','MainPID':'0'}
 config_hashes={str(p):sha(p) for p in [pathlib.Path('/etc/board-prover/config.json'),pathlib.Path('/etc/rolling-query/config.json')]}
 assert pathlib.Path('/opt/board-prover/current').resolve()==old_release
 assert all(sha(pathlib.Path(p))==digest for p,digest in inventory['fileHashes'].items())
 assert not old['PINS'].get('activationDelivery') and not any(PRIVATE.glob('activation-delivery-*.json'))
 if sys.argv[1]=='stage':
  assert not new_release.exists() and not candidate.exists()
  delta=P/'delta.tar.gz';assert sha(delta)==meta['deltaSha256']
  patch=P/'patch';patch.mkdir(mode=0o700)
  with tarfile.open(delta,'r:gz') as t:
   members=t.getmembers();assert len(members)==len(meta['changed'])+1 and {x.name for x in members}=={'prover-release.json',*meta['changed']} and all(x.isfile() for x in members)
   t.extractall(patch,filter='data')
  assert sha(patch/'prover-release.json')==new_manifest
  before=json.loads((old_release/'prover-release.json').read_text());after=json.loads((patch/'prover-release.json').read_text())
  assert sha(old_release/'prover-release.json')==old_manifest and set(before['files'])==set(after['files'])
  assert before['sourceCommit']==inventory['sourceCommit']
  assert {name:before['files'][name] for name in meta['changed']}==inventory['changedFileHashes']
  assert {k for k in before['files'] if before['files'][k]!=after['files'][k]}==set(meta['changed'])
  assert {k:v for k,v in before.items() if k not in ('sourceCommit','files')}=={k:v for k,v in after.items() if k not in ('sourceCommit','files')}
  old['verify_release'](old_release)
  run(['cp','-al',str(old_release),str(new_release)])
  for rel in ['prover-release.json',*meta['changed']]:
   target=new_release/rel;mode=target.stat().st_mode&0o777;gid=target.stat().st_gid
   atomic(target,(patch/rel).read_bytes(),mode);os.chown(target,0,gid)
 assert sha(new_release/'prover-release.json')==new_manifest
 manifest=json.loads((new_release/'prover-release.json').read_text());assert manifest['sourceCommit']==meta['source']
 for rel in meta['changed']:assert sha(new_release/rel)==manifest['files'][rel]
 source=old['control_source']()
 assert sha(source)==inventory['controlSourceSha256']
 # Preserve the current generated attestor verbatim except the PINS assignment.
 # In particular retain persistent hosting helpers and pinned control provenance.
 raw=attestor.read_text();tree=ast.parse(raw)
 assignments=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets)]
 assert len(assignments)==1
 assignment=assignments[0];pins={**old['PINS'],'manifest':new_manifest}
 lines=raw.splitlines(keepends=True)
 code=''.join(lines[:assignment.lineno-1])+('PINS = '+repr(pins)+'\n')+''.join(lines[assignment.end_lineno:])
 dispatch='' # Existing dispatch is already preserved in code, never re-generated.
 assert [ast.dump(n,include_attributes=False) for n in tree.body if n is not assignment]==[ast.dump(n,include_attributes=False) for n in ast.parse(code).body if not(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets))]
 previous={'__name__':'rolling_pinned_control','__file__':str(source)};exec(compile(source.read_bytes(),str(source),'exec'),previous)
 b=previous
 h={};exec(compile(definitions(code),'new-attestor','exec'),h)
 assert h['PINS']==pins and h['RELEASE']==new_release
 h['verify_release'](new_release);h['verify_controls']()
 if sys.argv[1]=='stage':
  # Carry forward the actually completed historical query-only qualification. Keep
  # its immutable bytes and exact provenance; this is NOT a new qualifier run.
  original=BASE/'qualification';report_raw=(original/'report.json').read_bytes();result_raw=(original/'result.json').read_bytes()
  previous_result=old['validated_qualification'](json.loads(result_raw));previous_report=json.loads(report_raw)
  assert previous_result['passed'] is True and previous_result['stage']=='complete'
  assert hashlib.sha256(report_raw).hexdigest()==previous_result['reportSha256']
  final=json.loads((PRIVATE/'final-receipt.json').read_text())
  assert final['manifestSha256']==old_manifest and final['qualification']==previous_result
  assert final['bootstrapSourceSha256']==old['PINS']['bootstrap']
  assert previous_report['release']['manifestSha256']==old_manifest and previous_report['release']['sourceCommit']==before['sourceCommit']
  observed=previous['qualification_projection'](old,previous_report,process_exited=previous_result['checks']['processExitVerified'])
  assert observed==previous_result['checks'] and all(observed.values())
  wait_query(old_release)
  # Contract artifacts and admission scope are unchanged. Query shares server.mjs;
  # retain original query qualification as historical evidence, supplemented by
  # bounded affected tests and live boundary readback. No new proof is claimed.
  policy=policy_check(new_release)
  observation=b['prover_activation'](old,'observe')
  queue=b['activation_health']();assert queue['running'] is False and queue['bytes']==0
  assert observation['proverActivated'] is True
  original_names=('prover-activation-scope.json','prover-deployment-evidence.json','prover-activation-intent.json','prover-activation-result.json','proxy-host-intent.json','proxy-host-result.json')
  original_activation={name:(PRIVATE/name).read_bytes() for name in original_names}
  old_scope=json.loads(original_activation['prover-activation-scope.json'])
  old_intent=json.loads(original_activation['prover-activation-intent.json'])
  previous['activation_record'](old_scope,old_manifest)
  assert hashlib.sha256(original_activation['prover-activation-scope.json']).hexdigest()==old_intent['scopeSha256']
  assert hashlib.sha256(original_activation['prover-deployment-evidence.json']).hexdigest()==old_scope['deploymentEvidenceSha256']
  evidence=json.loads(original_activation['prover-deployment-evidence.json'])
  previous['activation_evidence'](evidence,old_scope,before['files'])
  evidence['scope']={**evidence['scope'],'manifestSha256':new_manifest}
  evidence_bytes=json.dumps(evidence,sort_keys=True,separators=(',',':')).encode()
  scope={**old_scope,'manifestSha256':new_manifest,'deploymentEvidenceSha256':hashlib.sha256(evidence_bytes).hexdigest()}
  scope_bytes=json.dumps(scope,sort_keys=True,separators=(',',':')).encode()
  b['activation_record'](scope,new_manifest);b['activation_evidence'](evidence,scope,manifest['files'])
  derived_activation={name:json.loads(data) for name,data in original_activation.items()}
  derived_activation['prover-deployment-evidence.json']=evidence
  derived_activation['prover-activation-scope.json']=scope
  for name in ('prover-activation-intent.json','prover-activation-result.json','proxy-host-intent.json','proxy-host-result.json'):
   derived_activation[name]['manifestSha256']=new_manifest
  derived_activation['prover-activation-intent.json']['scopeSha256']=hashlib.sha256(scope_bytes).hexdigest()
  candidate.mkdir(mode=0o700)
  atomic(candidate/'original-report.json',report_raw);atomic(candidate/'original-result.json',result_raw)
  for name,data in original_activation.items():atomic(candidate/('original-'+name),data)
  for name,value in derived_activation.items():atomic(candidate/name,json.dumps(value,sort_keys=True,separators=(',',':')).encode())
  provenance={'kind':'historical-query-qualification-with-affected-source-checks','originalManifestSha256':old_manifest,
   'originalReportSha256':hashlib.sha256(report_raw).hexdigest(),'originalResultSha256':hashlib.sha256(result_raw).hexdigest(),
   'originalFinalReceiptSha256':sha(PRIVATE/'final-receipt.json'),'originalSource':before['sourceCommit'],'source':meta['source'],
   'changedFiles':meta['changed'],'changedBootstrapDeclarations':[],'baseArchiveSha256':deadline['runtimeArchiveSha256'],'deltaSha256':meta['deltaSha256'],
   'hostControlsQualificationIdentical':True,'allOtherPackageFilesIdentical':True,'qualificationReexecuted':False,
   'newObservations':['existing-query-boundary-and-upstream-readiness','native-syntax-and-bound-affected-tests','runtime-activation-observation'],'nodeIdentity':node_identity,
   'proverProcess':prover_process,'proverExecutionRelease':prover_process['cwd'],'activationReexecuted':False,
   'originalActivationSha256':{name:hashlib.sha256(data).hexdigest() for name,data in original_activation.items()},
   'derivedActivationSha256':{name:sha(candidate/name) for name in original_names}}
  report=json.loads(report_raw);report['release']={**report['release'],'manifestSha256':new_manifest,'sourceCommit':meta['source']};report['carryForward']=provenance
  report_bytes=json.dumps(report,sort_keys=True,separators=(',',':')).encode();atomic(candidate/'report.json',report_bytes)
  checks=b['qualification_projection'](h,report,process_exited=previous_result['checks']['processExitVerified'])
  assert checks==observed and all(checks.values())
  result={**previous_result,'manifestSha256':new_manifest,'reportSha256':hashlib.sha256(report_bytes).hexdigest(),'checks':checks}
  h['validated_qualification'](result);atomic(candidate/'result.json',json.dumps(result).encode())
  if (original/'readiness-observation.json').exists():atomic(candidate/'readiness-observation.json',(original/'readiness-observation.json').read_bytes())
  affected={'passed':True,'coverage':'bound-affected-tests-native-syntax-and-existing-query-boundary','policy':policy,'manifestSha256':new_manifest,
   'bootstrapSha256':sha(source),'observation':observation,'proverProcess':prover_process,
   'activationReexecuted':False,'qualificationReexecuted':False}
  atomic(candidate/'affected-check.json',json.dumps(affected).encode());atomic(candidate/'carry-forward.json',json.dumps(provenance).encode())
  assert run(['docker','inspect','--format','{{.Id}} {{.State.StartedAt}}','rolling-node'])==node_identity
  assert prover_identity()==prover_process
  print(json.dumps({'staged':True,'source':meta['source'],'qualification':result,'qualificationReexecuted':False,'affectedCheck':affected,'carryForward':provenance,'nodePreserved':True}));raise SystemExit(0 if result['passed'] else 2)
 result=h['validated_qualification'](json.loads((candidate/'result.json').read_text()))
 assert result['passed'] is True and result['stage']=='complete'
 assert {'anchors','readiness'}<=set(result) and result.get('checks') and all(result['checks'].values())
 assert sha(candidate/'report.json')==result['reportSha256']
 provenance=json.loads((candidate/'carry-forward.json').read_text());affected=json.loads((candidate/'affected-check.json').read_text())
 assert provenance['originalManifestSha256']==old_manifest and provenance['source']==meta['source'] and provenance['qualificationReexecuted'] is False
 assert sha(BASE/'qualification/report.json')==provenance['originalReportSha256'] and sha(BASE/'qualification/result.json')==provenance['originalResultSha256']
 assert sha(PRIVATE/'final-receipt.json')==provenance['originalFinalReceiptSha256']
 assert affected['passed'] is True and affected['manifestSha256']==new_manifest and affected['bootstrapSha256']==sha(source)
 assert affected['activationReexecuted'] is False and affected['proverProcess']==prover_process
 for name,digest in provenance['originalActivationSha256'].items():assert sha(PRIVATE/name)==digest and sha(candidate/('original-'+name))==digest
 for name,digest in provenance['derivedActivationSha256'].items():assert sha(candidate/name)==digest
 assert json.loads((candidate/'report.json').read_text())['carryForward']==provenance
 old['activation_support']('query-observe')
 b['prover_activation'](old,'observe')
 qr=json.loads((PRIVATE/'query-host-result.json').read_text());query_intent=json.loads((PRIVATE/'query-host-intent.json').read_text());unit=b['query_host_unit'](new_release)
 proxy_config,proxy_unit=b['proxy_files'](h,b['proxy_host_request'](old))
 assert pathlib.Path('/etc/board-prover/Caddyfile').read_text()==proxy_config
 entries=b['query_public_plan'](new_release)
 # cp -al preserves admitted read-only ownership/modes; never chmod/chown the
 # whole clone because shared inodes are still used by old services.
 import stat
 for p,info in entries:
  assert info.st_uid==0 and info.st_gid==qr['publicGid']
  if not stat.S_ISLNK(info.st_mode):assert stat.S_IMODE(info.st_mode)==(0o550 if stat.S_ISDIR(info.st_mode) or info.st_mode&0o111 else 0o440)
 history=PRIVATE/('qualification-'+old_manifest[:16]);assert not history.exists();history.mkdir(mode=0o700)
 saved={p:p.read_bytes() for p in [BASE/'deadline.json',pathlib.Path('/usr/local/lib/rolling-attest.py'),pathlib.Path('/etc/systemd/system/rolling-query.service'),pathlib.Path('/etc/systemd/system/board-prover-proxy.service')]}
 for p,data in saved.items():(history/p.name).write_bytes(data);os.chmod(history/p.name,0o600)
 names=('final-receipt.json','receipt-put.json','upload-intent.json','upload-result.json','query-host-intent.json','query-host-result.json',*provenance['originalActivationSha256'])
 old_q=BASE/('qualification-'+old_manifest[:16]);assert not old_q.exists()
 # BASE/lock is the same application writer lock used by the current observer.
 # Keep the independent safety timer running; pause only application observation.
 assert run(['systemctl','show','rolling-application-attest.timer','--property=ActiveState','--value'])=='active'
 assert run(['systemctl','show','rolling-application-stop.service','--property=ActiveState','--value']) in ('inactive','failed')
 receipt_lock=(PRIVATE/'receipt-lock').open('a')
 moved=[];q_old_moved=False;q_new_moved=False;archives_done=False;mutation_started=False
 try:
  fcntl.flock(receipt_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  assert run(['systemctl','show','rolling-qualification.service','--property=ActiveState','--value']) in ('inactive','failed')
  assert run(['systemctl','show','rolling-qualification-receipt.service','--property=ActiveState','--value']) in ('inactive','failed')
  assert prover_identity()==prover_process
  b['prover_activation'](old,'observe')
  queue=b['activation_health']();assert queue['running'] is False and queue['bytes']==0
  assert not (BASE/'application-failure.json').exists()
  old['verify_controls']()
  run(['systemctl','stop','rolling-application-attest.timer','rolling-application-attest.service'])
  mutation_started=True
  run(['systemctl','stop','board-prover.service','board-prover-proxy.service'])
  (BASE/'qualification').rename(old_q);q_old_moved=True
  candidate.rename(BASE/'qualification');q_new_moved=True
  for name in names:
   p=PRIVATE/name
   if p.exists():p.rename(history/name);moved.append(name)
  archives_done=True
  assert meta['archiveSha256']==deadline['runtimeArchiveSha256']
  new_deadline={**deadline,'manifestSha256':new_manifest}
  atomic(BASE/'deadline.json',json.dumps(new_deadline).encode());atomic(pathlib.Path('/usr/local/lib/rolling-attest.py'),(code+dispatch).encode(),0o700)
  # Historical receipt-upload records are archived; this local update has no
  # upload capability. final_receipt seals current native-schema receipt only.
  atomic(pathlib.Path('/etc/systemd/system/rolling-query.service'),unit.encode(),0o644)
  atomic(pathlib.Path('/etc/systemd/system/board-prover-proxy.service'),proxy_unit.encode(),0o644)
  switch_current(new_release)
  run(['systemctl','daemon-reload'])
  # final_receipt owns this lock itself; no observer can enter while BASE/lock is held.
  receipt_lock.close()
  h['final_receipt']();final=json.loads((PRIVATE/'final-receipt.json').read_text());assert final['qualification']==result
  intent={**query_intent,'manifestSha256':new_manifest,'finalReceiptSha256':sha(PRIVATE/'final-receipt.json')}
  h['exclusive_record'](PRIVATE/'query-host-intent.json',intent)
  h['exclusive_record'](PRIVATE/'query-host-result.json',{**qr,'manifestSha256':new_manifest,'unitSha256':hashlib.sha256(unit.encode()).hexdigest()})
  for name in provenance['derivedActivationSha256']:atomic(PRIVATE/name,(BASE/'qualification'/name).read_bytes())
  run(['systemctl','start','board-prover.service']);wait_prover(new_release);run(['systemctl','start','board-prover-proxy.service']);wait_query(new_release);b['query_host_readback'](h);h['verify_controls']()
  runtime_observation=b['prover_activation'](h,'observe')
  assert runtime_observation['proverActivated'] is True
  assert prover_identity()['cwd']==str(new_release)
  for u,pid in retained_pids.items():assert run(['systemctl','show',u,'--property=MainPID','--value'])==pid
  for p,digest in config_hashes.items():assert sha(pathlib.Path(p))==digest
  assert absent_bok=={k:run(['systemctl','show','rolling-bok-testnet.service','--property='+k,'--value']) for k in absent_bok}
  assert run(['docker','inspect','--format','{{.Id}} {{.State.StartedAt}}','rolling-node'])==node_identity
 except BaseException:
  if not mutation_started:raise
  run(['systemctl','stop','board-prover.service','board-prover-proxy.service'])
  for p,data in saved.items():atomic(p,data,0o700 if p.name=='rolling-attest.py' else 0o644 if p.name.endswith('.service') else 0o600)
  switch_current(old_release)
  if q_new_moved:(BASE/'qualification').rename(candidate)
  if q_old_moved:old_q.rename(BASE/'qualification')
  for name in names:
   p=PRIVATE/name
   if (archives_done or name in moved) and p.exists():p.rename(P/('unpromoted-'+name))
   if name in moved:(history/name).rename(p)
  run(['systemctl','daemon-reload']);run(['systemctl','start','board-prover.service','board-prover-proxy.service']);wait_prover(old_release);wait_query(old_release);b['query_host_readback'](old);raise
 finally:
  if not receipt_lock.closed:receipt_lock.close()
  run(['systemctl','start','rolling-application-attest.timer'])
  assert run(['systemctl','show','rolling-application-attest.timer','--property=ActiveState','--value'])=='active'
  assert run(['systemctl','show','rolling-attest.timer','--property=ActiveState','--value'])=='active'
 print(json.dumps({'promoted':True,'source':meta['source'],'manifest':new_manifest,'nodePreserved':True,'proverRestarted':True,'proverProcess':prover_identity(),'unaffectedPidsPreserved':retained_pids,'activationReexecuted':False,'runtimeObservation':runtime_observation,'queryIdentityPreserved':True,'budgetStop':deadline['budgetStop'],'qualificationPassed':result['passed'],'qualificationReexecuted':False,'carryForwardSha256':sha(BASE/'qualification/carry-forward.json'),'affectedCheckSha256':sha(BASE/'qualification/affected-check.json'),'deltaSha256':meta['deltaSha256'],'packageMetadataSha256':sha(P/'package.json'),'inventorySha256':sha(P/'inventory.json')}))
