"""Private lead operator preparation. No AWS, credentials, workload or host changes."""
import argparse,ast,base64,gzip,hashlib,importlib.util,lzma,pathlib,re
p=argparse.ArgumentParser();p.add_argument('bootstrap');p.add_argument('config');p.add_argument('output');a=p.parse_args()
spec=importlib.util.spec_from_file_location('b',a.bootstrap);b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
config=b.private_file(a.config)
import json
json_deadline=json.loads(pathlib.Path(__file__).with_name('launch-window.json').read_text())
assert json_deadline['sourceRevision']=='f4eb6515e4f55330e07e10ec348b3bd3532199cb'
assert config['createdAt']==json_deadline['createdAt']
assert b.timestamp(json_deadline['finalBudgetStop'])<=b.timestamp(config['createdAt'])+b.dt.timedelta(hours=24)
assert hashlib.sha256(pathlib.Path(a.bootstrap).read_bytes()).hexdigest()=='4e7a6381de6f4442c324e31570a08fbf5584f30459753683e17494684612a33f'
assert config['budgetStop']==json_deadline['initialBudgetStop'],'Wrong approved initial deadline'
assert b.timestamp(config['commissioningStop'])==b.timestamp(config['createdAt'])+b.dt.timedelta(minutes=30)
# Native control extraction must retain exact current HOST AST definitions.
original_functions={n.name:ast.dump(n,include_attributes=False) for n in ast.parse(b.HOST).body if isinstance(n,ast.FunctionDef)}
selected_functions={n.name:ast.dump(n,include_attributes=False) for n in ast.parse(b.native_control_source()).body if isinstance(n,ast.FunctionDef)}
assert set(selected_functions)==set(b.NATIVE_REUSE)
assert all(value==original_functions[name] for name,value in selected_functions.items())
original=b.generate(config)
encoded=re.findall(r"base64\.b64decode\('([A-Za-z0-9+/=]+)'\)",original)
assert len(encoded)==1
program=lzma.decompress(base64.b64decode(encoded[0])).decode()
suffix='execute(CONFIG, ATTESTATION)\n';assert program.endswith(suffix)
# Require that the sole removed top-level call is exactly the known final call.
last=ast.parse(program).body[-1];assert isinstance(last,ast.Expr) and ast.unparse(last)=='execute(CONFIG, ATTESTATION)'
stage=pathlib.Path(__file__).with_name('stage-host.py').read_text()
program=program[:-len(suffix)]+stage
compile(program,'staged-bootstrap','exec')
encoded=base64.b64encode(lzma.compress(program.encode(),format=lzma.FORMAT_ALONE,filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'pb':0}])).decode()
script="#!/bin/sh\nset -eu\numask 077\nexec /usr/bin/python3 - <<'B'\nimport base64,lzma\nexec(lzma.decompress(base64.b64decode('"+encoded+"')))\nB\n"
out=pathlib.Path(a.output);out.mkdir(mode=0o700,parents=True,exist_ok=False)
for name,data in [('staged-userdata.sh',script),('normal-bootstrap.py',lzma.decompress(base64.b64decode(re.findall(r"base64\.b64decode\('([A-Za-z0-9+/=]+)'\)",original)[0])).decode())]:
 path=out/name;path.write_text(data);path.chmod(0o600)
print('stagedUserDataBytes='+str(len(script.encode())))
print('stagedUserDataSha256='+hashlib.sha256(script.encode()).hexdigest())
# SSM receives the full staged script after cloud/host deadline readback.
# EC2 user data contains only the existing compact native control definitions.
control=b.native_control_source()
prefix='PINS = '+repr({'manifest':config['manifestSha256']})+'\nCONFIG = '+repr(config)+'\n'
entry="""
if platform.system()!='Linux' or platform.machine()!='x86_64' or os.geteuid()!=0:raise ValueError('Linux x64 root required')
BASE.mkdir(parents=True,exist_ok=True,mode=0o700)
try:
    run(['systemctl','mask','--now','rolling-node.service','rolling-query.service','board-prover.service','board-prover-proxy.service'])
    install_controls(CONFIG)
    write(BASE/'stage','controls')
    for name in ('budget','commissioning'):
        run(['systemctl','is-active','--quiet','rolling-'+name+'.timer'])
    verify_controls()
    print('ROLLING_INITIAL_CONTROLS_READY')
except BaseException:
    run(['/usr/sbin/poweroff'],timeout=10)
    raise
"""
initial='#!/bin/sh\nset -eu\numask 077\nexec /usr/bin/python3 - <<\'PYTHON\'\n'+prefix+control+entry+'\nPYTHON\n'
compressed=gzip.compress(initial.encode(),mtime=0)
assert len(compressed)<=16384,'EC2 compressed user data limit'
path=out/'initial-userdata.gz';path.write_bytes(compressed);path.chmod(0o600)
print('compressedInitialUserDataBytes='+str(len(compressed)))

# Reuse the actual successful staged/normal SSM delivery, with no instance or API call.
import json
params={'commands':[script],'executionTimeout':['1200']}
(out/'stage-parameters.json').write_text(json.dumps(params));(out/'stage-parameters.json').chmod(0o600)
normal=(out/'normal-bootstrap.py').read_bytes()
payload=base64.b64encode(gzip.compress(normal,mtime=0)).decode()
command="""set -eu
systemctl is-active --quiet rolling-budget.timer rolling-commissioning.timer rolling-attest.timer
python3 /usr/local/lib/rolling-attest.py --check
python3 - <<'REMOTE'
import pathlib,json,gzip,base64
r=json.loads(pathlib.Path('/var/lib/rolling-bootstrap/commission-native.json').read_text());assert r['nativeImports'] is True and r['controlsVerified'] is True and r['workloadsMasked'] is True
p=pathlib.Path('/var/lib/rolling-bootstrap-private/normal-bootstrap.py');p.parent.mkdir(mode=0o700,exist_ok=True);assert not p.exists();p.write_bytes(gzip.decompress(base64.b64decode('PAYLOAD')));p.chmod(0o600)
REMOTE
systemctl unmask rolling-node.service rolling-query.service
python3 /var/lib/rolling-bootstrap-private/normal-bootstrap.py
""".replace('PAYLOAD',payload)
(out/'normal-parameters.json').write_text(json.dumps({'commands':[command],'executionTimeout':['1200']}));(out/'normal-parameters.json').chmod(0o600)
(out/'initial-userdata.b64').write_text(base64.b64encode(compressed).decode());(out/'initial-userdata.b64').chmod(0o600)
(out/'preparation.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(pathlib.Path(a.bootstrap).read_bytes()).hexdigest(),'sourceRevision':json_deadline['sourceRevision'],'nativeControlFunctionsExact':True,'initialUserDataBytes':len(compressed),'budgetStop':config['budgetStop'],'commissioningStop':config['commissioningStop']},indent=2));(out/'preparation.json').chmod(0o600)
