import ast,pathlib,subprocess,json,os,hashlib
A=pathlib.Path('/usr/local/lib/rolling-attest.py');t=ast.parse(A.read_bytes());h={'__name__':'query_reconciliation','__file__':str(A)}
exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[]),str(A),'exec'),h)
assert h['PINS']['manifest']=='71d5e83614a05c429ebf419c7d8f98a1b19dc10ef7aba8cace7d2e1141bf55f9'
def repair():
 p=h['PRIVATE'];b=h['BASE'];h['verify_controls']()
 assert not (p/'prover-activation-intent.json').exists()
 protected=[p/'query-host-result.json',p/'query-host-intent.json',pathlib.Path('/etc/rolling-query/config.json'),pathlib.Path('/etc/systemd/system/rolling-query.service')]
 before={str(x):hashlib.sha256(x.read_bytes()).hexdigest() for x in protected}
 marker=b/'application-failure.json';archive=p/'core-restore-20261020/application-failure-before-current-anchor-query.json'
 assert marker.exists() and not archive.exists()
 m=json.loads(marker.read_text());assert m['manifestSha256']==h['PINS']['manifest'] and m['category']=='APPLICATION_OBSERVATION_FAILED'
 os.rename(marker,archive)
 subprocess.run(['systemctl','start','rolling-query.service'],check=True)
 observed=h['activation_support']('query-observe');assert observed['queryHostPolicy']=='active-private-authenticated'
 assert before=={str(x):hashlib.sha256(x.read_bytes()).hexdigest() for x in protected}
 h['verify_controls']()
 print(json.dumps({'query':observed,'markerArchived':True,'admissionConfigUnchanged':True,'queryPID':subprocess.check_output(['systemctl','show','rolling-query.service','-p','MainPID','--value'],text=True).strip()}))
if not h['application_work'](repair):raise RuntimeError('Application writer busy')
