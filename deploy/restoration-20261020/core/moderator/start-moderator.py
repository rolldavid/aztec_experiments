import pathlib,subprocess,json,hashlib,grp,ast
P=pathlib.Path('/var/lib/rolling-bootstrap-private/moderator-current');R=pathlib.Path('/opt/rolling-moderator/releases/34cc7252');run=lambda a:subprocess.check_output(a,text=True,timeout=120).strip()
A=pathlib.Path('/usr/local/lib/rolling-attest.py');t=ast.parse(A.read_bytes());h={'__name__':'moderator_start','__file__':str(A)};exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))],type_ignores=[]),str(A),'exec'),h);h['verify_controls']();assert h['persistent_mode'](json.loads((h['BASE']/'deadline.json').read_text()))
expected={'censor-daemon/daemon.mjs':'161fc78c9a8b1c2080a6ea6fe3b575f9d545fe16c6cfcca666b6b49999e4fc48','censor-daemon/rolling-adapter.mjs':'1d0ba5f1ba9690e13404a9470f6564f47a08382a9d2750c2ba4ec28aa7259380'}
for f in json.loads((P/'source-closure.json').read_text())['files']:assert hashlib.sha256((R/f['path']).read_bytes()).hexdigest()==expected.get(f['path'],f['sha256'])
assert (R/'.build/prover-crs').is_dir(),'Missing retained native CRS cache'
models=pathlib.Path('/opt/rolling-moderator/models')
for name,size,sha in [('Qwen3.5-9B-Q4_K_M.gguf',5680522464,'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'),('model-manifest.json',1746,'15e2235a766c30b62371969bf885b5fe7eb789cdf221fb0b6e75283d9f6b8cb7')]:
 p=models/name;assert p.stat().st_size==size and p.stat().st_mode&0o777==0o444
 with p.open('rb')as f:assert hashlib.file_digest(f,'sha256').hexdigest()==sha
for ref in ['ghcr.io/ggml-org/llama.cpp@sha256:15e2235a766c30b62371969bf885b5fe7eb789cdf221fb0b6e75283d9f6b8cb7','docker.io/library/node@sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0']:
 image=json.loads(run(['docker','image','inspect',ref]))[0];assert image['Architecture']=='amd64' and image['Os']=='linux'
assert 'rolling-moderator'not in grp.getgrnam('rolling-runtime').gr_mem and 'rolling-moderator'not in grp.getgrnam('docker').gr_mem
unit=pathlib.Path('/etc/systemd/system/rolling-moderator.service');assert not unit.exists();u=(P/'rolling-moderator.service').read_bytes();assert hashlib.sha256(u).hexdigest()=='cfab3eed72ee960df9646a5ce63685492744fb9bd272e3398471230c18706436'
before={x:run(['systemctl','show',x,'-p','MainPID','--value'])for x in ['rolling-node','rolling-application','rolling-query','board-prover']};assert all(int(x)>0 for x in before.values())
unit.write_bytes(u);unit.chmod(0o644);run(['systemctl','daemon-reload']);run(['systemctl','enable','rolling-moderator.service']);run(['systemctl','start','--no-block','rolling-moderator.service'])
assert before=={x:run(['systemctl','show',x,'-p','MainPID','--value'])for x in before}
print(json.dumps({'startDispatched':True,'source':'34cc7252+f3e23bf4','unitSha256':hashlib.sha256(u).hexdigest(),'bootEnabled':True,'preservedPIDs':before,'readinessNotYetObserved':True}))
