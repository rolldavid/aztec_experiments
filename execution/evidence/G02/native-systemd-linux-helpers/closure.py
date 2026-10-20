"""Public APT closure; runs only in the separately authorized setup container."""
import hashlib,json,pathlib,re,subprocess,os
S=pathlib.Path('/run/setup');OUT=pathlib.Path('/opt/rolling-systemd-regression/closure.json')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def command(args):return subprocess.check_output(args,timeout=5,text=True).strip()
expected={}
for line in (S/'uris').read_text().splitlines():
 if not line.startswith("'"):continue
 # Never persist mirror URLs. Only authenticated filename/size/hash metadata.
 parts=line.split();name=parts[1];size=int(parts[2]);digest=parts[3]
 if len(parts)!=4 or not re.fullmatch(r'[A-Za-z0-9_.+%~:-]{1,255}\.deb',name) or not re.fullmatch(r'SHA256:[a-f0-9]{64}',digest) or name in expected:raise ValueError('Archive metadata')
 expected[name]=(size,digest[7:])
archives=[]
for p in sorted(pathlib.Path('/var/cache/apt/archives').glob('*.deb')):
 if p.is_symlink() or not p.is_file() or p.name not in expected:raise ValueError('Archive closure')
 size,digest=expected[p.name]
 if p.stat().st_size!=size or sha(p)!=digest:raise ValueError('Archive integrity')
 fields=command(['dpkg-deb','-f',str(p),'Package','Version','Architecture']).splitlines()
 archives.append({'file':p.name,'bytes':size,'sha256':digest,'metadata':fields})
if len(archives)!=len(expected) or not 1<=len(archives)<=64 or sum(a['bytes'] for a in archives)>104857600:raise ValueError('Archive set')
installed=[]
for line in command(['dpkg-query','-W','-f=${binary:Package}\t${Version}\t${Architecture}\n']).splitlines():
 row=line.split('\t')
 if len(row)!=3 or any(not re.fullmatch(r'[A-Za-z0-9:_.+~%-]{1,160}',x) for x in row):raise ValueError('Package inventory')
 installed.append({'name':row[0],'version':row[1],'architecture':row[2]})
for name in ('systemd','libsystemd-shared','libsystemd0','systemd-dev'):
 if not any(r['name'].split(':')[0]==name and r['version']=='255.4-1ubuntu8.17' and r['architecture'] in (('all','arm64') if name=='systemd-dev' else ('arm64',)) for r in installed):raise ValueError('Systemd pin')
indexes=[{'name':p.name,'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(pathlib.Path('/var/lib/apt/lists').glob('*InRelease')) if p.is_file() and not p.is_symlink()]
if not indexes:raise ValueError('Signed indexes missing')
result={'schemaVersion':1,'authenticatedApt':True,'baseKeyringSha256':sha(pathlib.Path('/usr/share/keyrings/ubuntu-archive-keyring.gpg')),'signedIndexes':indexes,'archives':archives,'installed':installed,'binaries':{p:sha(pathlib.Path(p).resolve()) for p in ['/usr/bin/systemctl','/usr/lib/systemd/systemd','/usr/bin/python3']},'sourceHashes':(S/'sources.sha256').read_text().splitlines(),'receivedBytes':int(pathlib.Path('/sys/class/net/eth0/statistics/rx_bytes').read_text())}
data=json.dumps(result,sort_keys=True,separators=(',',':')).encode()
if len(data)>65536 or result['receivedBytes']>157286400:raise ValueError('Closure bound')
fd=os.open(OUT,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
try:os.write(fd,data);os.fsync(fd)
finally:os.close(fd)
