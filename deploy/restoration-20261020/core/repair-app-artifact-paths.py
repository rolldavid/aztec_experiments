import pathlib,json,hashlib,subprocess,os
p=pathlib.Path('/etc/rolling-app/public.json');before=p.read_bytes();c=json.loads(before);root=pathlib.Path('/opt/rolling-app/releases/34cc7252')
for k,rel,sha in [('artifactPath','billboard/target/rolling_contract-RollingBoard.json','52e8d3f0e43fb8c1fe3db59f2160453b60579277ce64a86495ab81ebff2c42f1'),('bokArtifactPath','experiments/private-bok/target/private_bok-PrivateBok.json','0095bc9599401ef052436c1e6aec34903fad7745e3ff8bee2ea682d4586b65af')]:
 assert c[k]=='/opt/rolling-app/releases/791297f7/'+rel
 assert hashlib.sha256((root/rel).read_bytes()).hexdigest()==sha
 c[k]=str(root/rel)
assert subprocess.check_output(['systemctl','show','rolling-application.service','-p','MainPID','--value'],text=True).strip()=='0'
a=pathlib.Path('/var/lib/rolling-bootstrap-private/core-restore-20261020/public-before-artifact-path-repair.json');assert not a.exists();a.write_bytes(before);a.chmod(0o600)
i=p.stat();q=p.with_suffix('.restore-new');assert not q.exists();q.write_text(json.dumps(c)+'\n');os.chown(q,i.st_uid,i.st_gid);q.chmod(i.st_mode&0o777);q.replace(p)
subprocess.run(['systemctl','start','rolling-application.service','rolling-application-proxy.service'],check=True)
print(json.dumps({'artifactPathsRemapped':2,'artifactBytesVerified':True,'configSha256':hashlib.sha256(p.read_bytes()).hexdigest()}))
