# Existing application unit/config installation, preserving original relay/index state.
import pathlib,json,hashlib,os,shutil,subprocess,socket
os.umask(0o077)
P=pathlib.Path('/var/lib/rolling-bootstrap-private/core-restore-20261020');stage=P/'stage';inventory=json.loads((P/'inventory.json').read_text());by={e['path']:e for e in inventory['entries']}
run=lambda a:subprocess.check_output(a,text=True,timeout=60).strip()
assert json.loads(pathlib.Path('/var/lib/rolling-bootstrap-private/app-restore-20261020/stage-result.json').read_text())['source']=='34cc7252f6f90ea127b798cf885e7f3e8439d969'
assert run(['systemctl','show','rolling-application.service','-p','MainPID','--value'])=='0'
assert run(['systemctl','show','rolling-application-proxy.service','-p','MainPID','--value'])=='0'
def verify(rel):
 e=by[rel];q=stage/rel;assert q.is_file() and q.stat().st_size==e['bytes'] and hashlib.sha256(q.read_bytes()).hexdigest()==e['sha256'];return q
# Target paths are fresh; never overwrite existing mutable state/custody.
for rel in ['etc/rolling-app','var/lib/private/rolling-application']:
 dest=pathlib.Path('/'+rel);assert not dest.exists();dest.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 for e in inventory['entries']:
  if e['path']==rel or e['path'].startswith(rel+'/'):
   if e['type']=='file':verify(e['path'])
 shutil.copytree(stage/rel,dest)
 for e in inventory['entries']:
  if e['path']==rel or e['path'].startswith(rel+'/'):
   q=pathlib.Path('/'+e['path']);os.chmod(q,e['mode']);os.chown(q,0,0)
rel='var/lib/rolling-bootstrap-private/app-publication/funding-relay-signer.json';src=verify(rel);dest=pathlib.Path('/'+rel);assert not dest.exists();dest.parent.mkdir(mode=0o700,parents=True,exist_ok=True);shutil.copyfile(src,dest);os.chmod(dest,0o600)
# DynamicUser StateDirectory will map the preserved private tree to its allocated UID.
units={}
for name in ['rolling-application.service','rolling-application-proxy.service']:
 rel='etc/systemd/system/'+name;src=verify(rel);dest=pathlib.Path('/'+rel);assert not dest.exists()
 text=src.read_text();assert '/opt/board-prover/releases/rolling-81f48a8b13fecaa9/' in text;text=text.replace('/opt/board-prover/releases/rolling-81f48a8b13fecaa9/','/opt/board-prover/releases/rolling-71d5e83614a05c42/')
 if name=='rolling-application.service':
  # Preserve default deny. Refresh only the existing configured public Ethereum endpoint DNS.
  relay=json.loads(pathlib.Path('/etc/rolling-app/relay.json').read_text())
  import urllib.parse
  urls=[]
  def collect(x):
   if isinstance(x,dict):
    for k,v in x.items():
     if isinstance(v,str) and v.startswith('https://'):urls.append(v)
     else:collect(v)
  collect(relay)
  hosts={urllib.parse.urlsplit(u).hostname for u in urls}
  addresses=set()
  for host in hosts:
   if host in ('ethereum-sepolia-rpc.publicnode.com','sepolia.drpc.org'):
    addresses.update(x[4][0]for x in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM))
  assert addresses,'Existing relay public provider must resolve'
  lines=text.splitlines();assert sum(l.startswith('IPAddressAllow=')for l in lines)==1
  text='\n'.join('IPAddressAllow=localhost 127.0.0.53 '+' '.join(sorted(addresses)) if l.startswith('IPAddressAllow=')else l for l in lines)+'\n'
 assert 'SupplementaryGroups=rolling-runtime' in text
 dest.write_text(text);dest.chmod(0o644);units[name]=hashlib.sha256(dest.read_bytes()).hexdigest()
run(['systemctl','daemon-reload']);run(['systemctl','enable','rolling-application.service','rolling-application-proxy.service']);run(['systemctl','start','rolling-application.service']);run(['systemctl','start','rolling-application-proxy.service'])
result={'restored':True,'source':'34cc7252','sameRelayCustody':True,'relayJournalsPreserved':True,'unitHashes':units,'appStateOwner':pathlib.Path('/var/lib/private/rolling-application').stat().st_uid,'appActive':run(['systemctl','is-active','rolling-application.service']),'proxyActive':run(['systemctl','is-active','rolling-application-proxy.service'])}
(P/'application-installed.json').write_text(json.dumps(result));print(json.dumps(result))
