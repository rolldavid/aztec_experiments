# Existing CMS/tar restore procedure, staging only. Does not install units or start services.
import hashlib,json,os,pathlib,subprocess,tarfile,urllib.request
os.umask(0o077)
P=pathlib.Path('/var/lib/rolling-bootstrap-private/core-restore-20261020')
assert P.is_dir() and P.stat().st_uid==0 and P.stat().st_mode&0o077==0
stage=P/'stage';stage.mkdir(mode=0o700,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
binding=json.loads((P/'binding.json').read_text());inventory=json.loads((P/'inventory.json').read_text())
assert binding['ciphertextSha256']==inventory['ciphertextSha256']=='c68379f1aecf9ed9ff09cf621c716d449c3d9e1a5ec0fe38508e4da7d6eac17b'
assert json.loads(pathlib.Path('/var/lib/rolling-bootstrap/deadline.json').read_text())['manifestSha256']=='71d5e83614a05c429ebf419c7d8f98a1b19dc10ef7aba8cace7d2e1141bf55f9'
subprocess.run(['curl','--fail','--silent','--show-error','--connect-timeout','10','--max-time','120','--output',str(P/'state.cms'),binding['getUrl']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
raw=(P/'state.cms').read_bytes();assert len(raw)==6990930 and sha(raw)==binding['ciphertextSha256']
child=subprocess.Popen(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(P/'state.cms'),'-inkey',str(P/'decrypt-key.pem')],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
expected={x['path']:x for x in inventory['entries']};seen=set();total=0
try:
 with tarfile.open(fileobj=child.stdout,mode='r|gz') as archive:
  for m in archive:
   assert m.name in expected and m.name not in seen and not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts
   e=expected[m.name];seen.add(m.name);total+=m.size;assert total<=268435456
   assert (m.isdir() and e['type']=='directory') or (m.isfile() and e['type']=='file')
   assert (m.mode&0o777,m.uid,m.gid,m.size)==(e['mode'],e['uid'],e['gid'],e['bytes'])
   archive.extract(m,stage,filter='data')
   if m.isfile():assert sha((stage/m.name).read_bytes())==e['sha256']
finally:child.stdout.close()
assert child.wait(timeout=15)==0 and seen==set(expected)
# Root-only staging: original UID/name/modes remain in authenticated inventory.
# Apply target account UID mapping only during explicit selective installation.
for e in inventory['entries']:
 q=stage/e['path'];os.chmod(q,e['mode']);os.chown(q,0,0)
(P/'decrypt-key.pem').unlink()
result={'staged':True,'files':sum(e['type']=='file' for e in expected.values()),'directories':sum(e['type']=='directory' for e in expected.values()),'ciphertextSha256':binding['ciphertextSha256'],'servicesChanged':False,'livePathsOverwritten':False}
(P/'stage-result.json').write_text(json.dumps(result));print(json.dumps(result))
