import pathlib,tarfile,hashlib,json,os,io
os.umask(0o077)
p=pathlib.Path(__file__).resolve().parent
source=pathlib.Path('/Users/zac/Library/Application Support/AnonymousMessageBoard/V6/private/rolling-final-20261018-c71ecfaa7e/checkpoint-20261019/deadline-0300-20261020-two-hosts/bok/verified-private/checkpoint.tar.gz')
private=source.parent/'restore-20261020';private.mkdir(mode=0o700)
prefixes=['var/lib/rolling-bok-testnet','etc/rolling-bok-testnet','var/lib/rolling-bootstrap-private/bok-testnet']
units=['etc/systemd/system/rolling-bok-testnet.service','etc/systemd/system/rolling-bok-artifact-proxy.service','etc/systemd/system/rolling-bok-testnet.service.d/native-crs.conf']
audit={'oldBokUid':997,'oldBokGid':988,'operatorAddress':'0x17d5f49a10c969293812ab72418fa947414e704ea13f540486b46dae4fad139e','files':[],'directories':[]}
with tarfile.open(source,'r:gz') as src,tarfile.open(private/'selected.tar.gz','w:gz') as dest:
 for m in src:
  if not (m.name in units or any(m.name==a or m.name.startswith(a+'/') for a in prefixes)):continue
  assert m.isdir() or m.isfile()
  assert m.uid in (0,997) and m.gid in (0,988), (m.name,m.uid,m.gid)
  entry={'path':m.name.rstrip('/'),'mode':m.mode&0o777,'uid':m.uid,'gid':m.gid}
  if m.isfile():
   data=src.extractfile(m).read();entry.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest());audit['files'].append(entry);dest.addfile(m,io.BytesIO(data))
  else:audit['directories'].append(entry);dest.addfile(m)
 data=json.dumps(audit,sort_keys=True).encode();m=tarfile.TarInfo('restore-inventory.json');m.size=len(data);m.mode=0o600;dest.addfile(m,io.BytesIO(data))
receipt={'sourceInstance':'i-0a56b0bc2dd7727b2','destinationInstance':(p/'instance-id').read_text().strip(),'oldWriterTerminated':True,'operatorAddress':audit['operatorAddress'],'inventorySha256':hashlib.sha256(data).hexdigest(),'selectedArchiveSha256':hashlib.sha256((private/'selected.tar.gz').read_bytes()).hexdigest(),'files':len(audit['files']),'directories':len(audit['directories']),'oldBokUid':997,'oldBokGid':988}
(p/'state-selection-binding.json').write_text(json.dumps(receipt,indent=2)+'\n');(p/'state-private-reference').write_text(str(private)+'\n');print(json.dumps(receipt))
