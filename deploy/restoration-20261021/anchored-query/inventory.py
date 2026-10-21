#!/usr/bin/env python3
"""Read-only, nonsecret host facts for the existing core native release update.
Run as root via SSM. Does not invoke any attestor entrypoint or mutate service state.
"""
import ast, hashlib, json, pathlib, subprocess
A=pathlib.Path('/usr/local/lib/rolling-attest.py'); B=pathlib.Path('/var/lib/rolling-bootstrap'); P=pathlib.Path('/var/lib/rolling-bootstrap-private')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def state(unit):
 raw=subprocess.check_output(['systemctl','show',unit,'--property=ActiveState,LoadState,MainPID,WorkingDirectory,FragmentPath,DropInPaths'],text=True,timeout=10)
 return dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
tree=ast.parse(A.read_bytes()); pins=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PINS' for t in n.targets))
release=pathlib.Path('/opt/board-prover/current').resolve(strict=True)
manifest=json.loads((release/'prover-release.json').read_bytes()); deadline=json.loads((B/'deadline.json').read_bytes())
paths=[A,B/'deadline.json',release/'prover-release.json',pathlib.Path('/usr/local/lib/rolling-control/deploy/prover/bootstrap.py'),pathlib.Path('/etc/board-prover/config.json'),pathlib.Path('/etc/rolling-query/config.json'),pathlib.Path('/etc/systemd/system/board-prover.service'),pathlib.Path('/etc/systemd/system/rolling-query.service'),pathlib.Path('/etc/systemd/system/board-prover-proxy.service'),B/'qualification/report.json',B/'qualification/result.json']
for n in ('final-receipt.json','query-host-intent.json','query-host-result.json','query-host-request.json','prover-activation-scope.json','prover-deployment-evidence.json','prover-activation-intent.json','prover-activation-result.json','proxy-host-intent.json','proxy-host-result.json'):paths.append(P/n)
artifact_pins=json.loads((release/'prover/rolling-artifacts.json').read_text())
candidates={'prover/private-query.mjs'}
assert all(name in manifest['files'] and sha(release/name)==manifest['files'][name] for name in candidates)
assert sha(release/'prover-release.json')=='f3efd677aa45a7ececada71b0f23d4a05966ec4081c27a4ffacf9e801aa6aa27'
services=['rolling-node.service','rolling-query.service','rolling-bok-testnet.service','rolling-application.service','rolling-moderator.service','board-prover.service','board-prover-proxy.service','rolling-attest.timer','rolling-application-attest.timer','rolling-application-stop.service','rolling-budget.timer']
out={'release':str(release),'manifestSha256':sha(release/'prover-release.json'),'sourceCommit':manifest['sourceCommit'],'changedFileHashes':{name:manifest['files'][name] for name in sorted(candidates)},'rollingArtifacts':artifact_pins,'attestorSha256':sha(A),'controlSourceSha256':pins.get('controlSourceSha256'),'pinKeys':sorted(pins),'persistentHostingPin':pins.get('persistentHosting'),'runtimeArchiveSha256':deadline['runtimeArchiveSha256'],'persistentPolicySha256':hashlib.sha256(json.dumps(deadline.get('persistentHosting'),sort_keys=True,separators=(',',':')).encode()).hexdigest(),'hasPersistentHosting':bool(deadline.get('persistentHosting')),'activationDeliveryConfigured':bool(pins.get('activationDelivery')),'activationDeliveryFilesPresent':bool(list(P.glob('activation-delivery-*.json'))),'applicationFailurePresent':(B/'application-failure.json').exists(),'fileHashes':{str(p):sha(p) for p in paths},'services':{u:state(u) for u in services},'attestorFunctions':{n.name:hashlib.sha256(ast.dump(n,include_attributes=False).encode()).hexdigest() for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('control_source','persistent_hosting','persistent_mode','operation_deadline','immutable_deadline','verify_controls','application_observation','activation_support')}}
def identity(unit):
 pid=out['services'][unit]['MainPID'];assert pid.isdigit() and int(pid)>1
 proc=pathlib.Path('/proc')/pid
 return {'pid':int(pid),'startTicks':proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19],'exe':str((proc/'exe').resolve()),'cwd':str((proc/'cwd').resolve())}
out['proverProcess']=identity('board-prover.service')
out['queryProcess']=identity('rolling-query.service')
out['protectedProcesses']={u:identity(u) for u in ('rolling-node.service','rolling-application.service','rolling-moderator.service')}
assert pins['controlSourceSha256']=='d9cfcd1ec3a69573634a3a26a4ea870ffbbb39df84dc5445406c939fcbf6e839'
assert pins['catalog']=='d20df9f285b211d907fb30a98d2166efe46d20fe3b967b2ccd25bbbb38aac885'
assert sha(pathlib.Path('/usr/local/lib/rolling-control/deploy/prover/bootstrap.py'))==pins['controlSourceSha256']
out['nodeIdentity']=identity('rolling-node.service')
out['timerStates']={u:{k:out['services'][u][k] for k in ('LoadState','ActiveState')} for u in ('rolling-attest.timer','rolling-application-attest.timer')}
print(json.dumps(out,sort_keys=True))
