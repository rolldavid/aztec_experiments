"""One corrected Bok cutover, reusing the already validated staged release.
Root reviews/dispatches explicitly. Usage: SCRIPT EXISTING_PRIVATE_PACKET.
"""
import hashlib,json,os,pathlib,subprocess,sys,urllib.request
P=pathlib.Path(sys.argv[1]);m=json.loads((P/'delta.json').read_text());b=m['baseline']
assert os.geteuid()==0 and b['kind']=='bok' and m['source']=='c9c850df1e514197f6577bd7a12df8c0970fc315'
source=pathlib.Path(b['source']);target=source.parent/('signup-'+m['source'][:12]);unit=pathlib.Path(b['unit']);proxy=pathlib.Path('/etc/systemd/system/rolling-bok-artifact-proxy.service')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();run=lambda a:subprocess.check_output(a,text=True).strip()
assert source==pathlib.Path('/opt/rolling-app/releases/791297f7') and target.is_dir()
assert sha(unit)==b['unitSha256']=='115bfde5f17b0c04abdb977c71bce0c8c9429ecfa78a5a7c1a12a4f44374acb8'
original=unit.read_bytes();assert original==(P/'original-unit').read_bytes()
assert sha(proxy)=='5ed75ee5eafaff581c58d4dbcd6ed44e79f429d7103d0aa329c223ac6f56b248'
assert run(['systemctl','show','rolling-bok-artifact-proxy.service','-p','BindsTo','--value'])=='rolling-bok-testnet.service'
assert run(['systemctl','is-active','rolling-bok-testnet.service'])=='active'
assert run(['systemctl','is-active','rolling-bok-artifact-proxy.service'])=='active'
assert run(['systemctl','show','rolling-bok-testnet.service','-p','WorkingDirectory','--value'])==str(source)
protected={pathlib.Path(p):h for p,h in b['privateHashes'].items()};protected[proxy]=sha(proxy)
protected[pathlib.Path('/etc/rolling-bok-testnet/Caddyfile')]=sha(pathlib.Path('/etc/rolling-bok-testnet/Caddyfile'))
protected[pathlib.Path('/usr/local/lib/rolling-attest.py')]=sha(pathlib.Path('/usr/local/lib/rolling-attest.py'))
def verify():
 assert all(sha(p)==h for p,h in protected.items())
 assert all(sha(target/f['path'])==f['sha256'] for f in m['files'])
 assert all(sha(source/f['path'])==b['fileHashes'][f['path']] for f in m['files'])
def idle():
 c=json.loads(pathlib.Path('/etc/rolling-bok-testnet/config.json').read_text())
 with urllib.request.urlopen('http://127.0.0.1:'+str(c.get('port',8787))+'/health',timeout=20) as r:h=json.load(r)
 assert h.get('active')==0 and h.get('status')=='ready' and h.get('lastFailure') is None
 return h
verify();idle()
assert original.decode().count('WorkingDirectory='+str(source))==1
updated=original.replace(('WorkingDirectory='+str(source)).encode(),('WorkingDirectory='+str(target)).encode())
def atomic(data):
 temp=unit.with_name(unit.name+'.signup-retry-new')
 with temp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(temp,0,0);temp.chmod(0o644);os.replace(temp,unit)
with (P/'bok-corrected-cutover-intent.json').open('x') as f:
 json.dump({'source':m['source'],'target':str(target),'reason':'Artifact proxy intentionally follows Bok through BindsTo; validate unit/config rather than preserve PID'},f);f.flush();os.fsync(f.fileno())
try:
 idle();run(['systemctl','stop','rolling-bok-testnet.service'])
 assert run(['systemctl','show','rolling-bok-testnet.service','-p','MainPID','--value'])=='0'
 assert run(['systemctl','show','rolling-bok-artifact-proxy.service','-p','MainPID','--value'])=='0'
 lock=pathlib.Path('/var/lib/rolling-bok-testnet/hosted.lock');assert not lock.exists() and not lock.is_symlink()
 verify();atomic(updated);run(['systemctl','daemon-reload']);run(['systemctl','start','rolling-bok-testnet.service','rolling-bok-artifact-proxy.service'])
 assert run(['systemctl','is-active','rolling-bok-testnet.service'])=='active'
 assert run(['systemctl','is-active','rolling-bok-artifact-proxy.service'])=='active'
 assert run(['systemctl','show','rolling-bok-testnet.service','-p','WorkingDirectory','--value'])==str(target)
 verify()
except BaseException:
 run(['systemctl','stop','rolling-bok-testnet.service']);atomic(original);run(['systemctl','daemon-reload']);run(['systemctl','start','rolling-bok-testnet.service','rolling-bok-artifact-proxy.service']);raise
result={'source':m['source'],'published':str(target),'existingTargetVerified':True,'sourcePreserved':True,'privateConfigsPreserved':True,'artifactProxyRestartedByNativeDependency':True,'unitSha256':hashlib.sha256(updated).hexdigest(),'started':True,'healthReadbackStillRequired':True}
(P/'bok-corrected-result.json').write_text(json.dumps(result));print(json.dumps(result))
