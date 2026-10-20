"""Public APT closure; runs only in the separately authorized setup container."""
import hashlib,json,pathlib,re,subprocess,os
S=pathlib.Path('/run/setup');OUT=pathlib.Path('/opt/rolling-systemd-regression/closure.json')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def command(args):return subprocess.check_output(args,timeout=5,text=True).strip()
PARENT_IMAGE='sha256:8e0b572feae06ff8843f458d2cc4343ecd6995c37f254c0e5de547433c674aee'
PARENT_SHA='41001f37ac6c7cd235bebe934c46e42c9060cc1f880104df60c3d4fffa791975'
parent_path=pathlib.Path('/opt/rolling-systemd-regression/parent-closure.json')
if parent_path.is_symlink() or not parent_path.is_file() or parent_path.stat().st_size>65536 or sha(parent_path)!=PARENT_SHA:raise ValueError('Parent closure')
parent=json.loads(parent_path.read_bytes())
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
# The successor adds a prerequisite; it must not upgrade/remove any old input.
def check_parent_packages(previous,installed):
 current={r['name']:r for r in installed}
 if len(current)!=len(installed) or any(current.get(r['name'])!=r for r in previous):raise ValueError('Parent package changed')
check_parent_packages(parent['installed'],installed)
for name in ('dbus','dbus-daemon','dbus-bin','dbus-system-bus-common','dbus-session-bus-common','libdbus-1-3'):
 if not any(r['name'].split(':')[0]==name and r['version']=='1.14.10-4ubuntu4.1' for r in installed):raise ValueError('DBus pin')
units={'/usr/lib/systemd/system/dbus.service':'bf7ec47644997441174ef6aac992d34cc46b9d2d7b8dc2feba7074d719fdbef1','/usr/lib/systemd/system/dbus.socket':'12b7aaec8d1e007047ec12fc85b1cc6db78565dfb896850cd9148dee0455fe7e'}
if any(sha(pathlib.Path(p))!=h for p,h in units.items()):raise ValueError('Vendor unit binding')
machine_id=pathlib.Path('/etc/machine-id').read_text().strip()
if not re.fullmatch('[a-f0-9]{32}',machine_id) or machine_id=='0'*32:raise ValueError('Machine identity prerequisite')
# The transient /var/lib is empty at offline boot; /etc supplies system identity.
def check_bus_identity(passwd,groups):
 users=[line.split(':') for line in passwd.splitlines() if line.split(':')[0]=='messagebus']
 rows=[line.split(':') for line in groups.splitlines() if line.split(':')[0]=='messagebus']
 if len(users)!=1 or len(rows)!=1 or len(users[0])!=7 or len(rows[0])!=4:raise ValueError('Bus account missing')
 uid,gid,group_gid=users[0][2],users[0][3],rows[0][2]
 if any(not re.fullmatch('[1-9][0-9]{0,4}',v) or not 1<=int(v)<=65534 for v in (uid,gid,group_gid)) or gid!=group_gid:raise ValueError('Bus account invalid')
 return {'uid':int(uid),'gid':int(gid)}
bus_identity=check_bus_identity(pathlib.Path('/etc/passwd').read_text(),pathlib.Path('/etc/group').read_text())
indexes=[{'name':p.name,'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(pathlib.Path('/var/lib/apt/lists').glob('*InRelease')) if p.is_file() and not p.is_symlink()]
if not indexes:raise ValueError('Signed indexes missing')
derived=pathlib.Path('/opt/rolling-systemd-regression/main.sources')
expected_sources='Types: deb\nURIs: http://ports.ubuntu.com/ubuntu-ports/\nSuites: noble noble-updates noble-security\nComponents: main\nArchitectures: arm64\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
if derived.read_text()!=expected_sources:raise ValueError('Derived sources')
result={'derivedSources':{'sha256':sha(derived),'bytes':derived.stat().st_size,'content':expected_sources},'schemaVersion':1,'parentImage':PARENT_IMAGE,'parentClosureSha256':PARENT_SHA,'parentPackagesUnchanged':True,'vendorUnits':units,'machineIdAvailable':True,'busUserAvailable':True,'busIdentity':bus_identity,'authenticatedApt':True,'baseKeyringSha256':sha(pathlib.Path('/usr/share/keyrings/ubuntu-archive-keyring.gpg')),'signedIndexes':indexes,'archives':archives,'installed':installed,'binaries':{p:sha(pathlib.Path(p).resolve()) for p in ['/usr/bin/systemctl','/usr/lib/systemd/systemd','/usr/bin/python3','/usr/bin/busctl','/usr/bin/dbus-daemon','/usr/bin/dbus-send']},'sourceHashes':(S/'sources.sha256').read_text().splitlines(),'receivedBytes':int(pathlib.Path('/sys/class/net/eth0/statistics/rx_bytes').read_text())}
data=json.dumps(result,sort_keys=True,separators=(',',':')).encode()
if len(data)>65536 or result['receivedBytes']>157286400:raise ValueError('Closure bound')
fd=os.open(OUT,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o444)
try:os.write(fd,data);os.fsync(fd)
finally:os.close(fd)
