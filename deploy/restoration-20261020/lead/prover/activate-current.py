import pathlib,json,hashlib,subprocess,os
p=pathlib.Path('/var/lib/rolling-bootstrap-private');base=pathlib.Path('/var/lib/rolling-bootstrap')
assert not (base/'application-failure.json').exists()
assert not (p/'prover-activation-intent.json').exists() and not (p/'prover-activation-result.json').exists()
h='d1b797ada91498811b6dcb6cfb10e13802fa259067848d6163672977eb32a843';assert hashlib.sha256((p/'prover-activation-scope.json').read_bytes()).hexdigest()==h
r=subprocess.run(['/usr/bin/python3','/usr/local/lib/rolling-attest.py','--activate-prover',h],capture_output=True,text=True)
f=p/'core-restore-20261020/prover-current-activation-result.json';f.write_text(json.dumps({'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}));os.chmod(f,0o600)
result=p/'prover-activation-result.json';print(json.dumps({'returncode':r.returncode,'intentPresent':(p/'prover-activation-intent.json').exists(),'result':json.loads(result.read_text()) if result.exists() else None}))
raise SystemExit(r.returncode)
