"""Generate private, immutable cloud-init shell input; never calls AWS itself.

Host implementation is embedded verbatim and unit-tested through injected commands.
Only public pins are committed. Capability URLs belong in owner-only external files.
"""
import argparse, base64, datetime as dt, gzip, hashlib, ipaddress, json, os, pathlib, re, stat, sys, urllib.parse

IMAGE = "azteclabs/aztec@sha256:e5bc218e326b4f3b1cd06b0309cb98e87fef5dfda3330157ce1e393d89416c32"
NODE_SHA = "7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c"
BB_SHA = "ba8bbb2b82c573153511e638c97100791f0186ef40ee5dd41e911bb5286b29d9"
CATALOG_SHA = "e7eb93bf9aeed96ec5acd7c8fad09f385177a87b05f96b9a5aa5321bfe70edf3"
NETWORK = {'testnet': {'bootnodes': ['enr:-LO4QA4kHKdUJOirQ4NxtI-gjBNLRK1GPeKtmz664Uph-EqLW1B3EkCqu6ul5C7dejOBWbEWMOPZc07I0Bl8bmW5Vn0EhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIlCfmYlzZWNwMjU2azGhAoRffgRFcK_rV5ddbmtUW9cyXrPwrDFL18OFRVejOOXDg3VkcIKd0A', 'enr:-LO4QO3-kuKH3c-RgaxYBWk0PiV-97B4wnvHcgMxYpB-1WjoctKlpY3Fuh29AESLhBn1WtQXE-1G0Umo_VhTcu7bLloEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIicStolzZWNwMjU2azGhAxUvKI8xXnGpkj2VjRZk9VmMbtfHZUoszOvvl76qFrGeg3VkcIKd0A', 'enr:-LO4QNTdBJe-2tIfXpzJmu4Tise0rRdPSn2gwQMtkVPe40szAdpWRgixGub2iUXMcxSQuQ8nkKh-GSvQpRKqw2XzUhQEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIrZz14lzZWNwMjU2azGhApwZiWnsA8TFqvz-sGDrgbi1AypT4QXJfFWdYOz2yeVtg3VkcIKd0A', 'enr:-Nu4QLjG2KMKvsVOjnhELmYmUO-auKssB_HPKNJitPOwXN0IYC5XPwUwZucnlAE0towcJ9lemeu4gmZkRnYWiGL_lkIHhWF6dGVjsDAwLTExMTU1MTExLWViZDk5ZmYwLTg0NTIzMTcxMy0xMmU5YWEzNi0yMjllYWRiN4JpZIJ2NINpcDaQKgEE-AJiEJUAAAAAAAAAAolzZWNwMjU2azGhA5_JMPCAGUHSS3vWQU3LlQoXnUOaO7AUNylXu2ieLTlKhHRjcDaCnJCEdWRwNoKckIN2ZXKFMi4xLjI', 'enr:-Ku4QHA70JBzwsnhlg-Y-Ud_vH_xAJtaoIAGpEGwvBFu8jHxEEVBrzMCrgRTqYpwDgPgyWPEtEGg-pWlxsK3Gq1VGa4EhWF6dGVjoDAwLS0wMDAwMDAwMC0wLTIyNzgwMjM5LTBjNzU3NmQzgmlkgnY0gmlwhNU65vmJc2VjcDI1NmsxoQLj0Km-mQSLz-0Wz8JBhBv9r0AhFbctdeO0yuT-gqUlPYN1ZHCCndA'], 'snapshots': ['https://aztec-labs-snapshots.com/testnet/', 'https://files5.blacknodes.net/Aztec/', 'https://snapshots-data.aztec.graphops.xyz/'], 'blobFileStoreUrls': ['https://aztec-labs-snapshots.com/testnet/blobs'], 'txCollectionFileStoreUrls': ['https://aztec-labs-snapshots.com/testnet/txs'], 'registryAddress': '0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba', 'feeAssetHandlerAddress': '0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9', 'l1ChainId': 11155111}}

class Invalid(ValueError):
    pass

def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise Invalid("Invalid UTC deadline")
    try: return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError: raise Invalid("Invalid UTC deadline") from None

def validate(config, now=None):
    keys = {"createdAt", "budgetStop", "commissioningStop", "runtimeUrl", "runtimeArchiveSha256", "manifestSha256"}
    if type(config) is not dict or set(config) != keys: raise Invalid("Invalid bootstrap fields")
    created, stop, commission = (timestamp(config[k]) for k in ("createdAt", "budgetStop", "commissioningStop"))
    now = now or dt.datetime.now(dt.timezone.utc)
    if not now - dt.timedelta(minutes=5) <= created <= now + dt.timedelta(minutes=5): raise Invalid("Stale creation time")
    if not created < stop <= created + dt.timedelta(hours=8): raise Invalid("Invalid budget window")
    if commission != created + dt.timedelta(minutes=30) or commission >= stop: raise Invalid("Invalid commissioning deadline")
    if not isinstance(config["runtimeArchiveSha256"], str) or not re.fullmatch("[a-f0-9]{64}", config["runtimeArchiveSha256"]): raise Invalid("Invalid archive digest")
    if not isinstance(config["manifestSha256"], str) or not re.fullmatch("[a-f0-9]{64}", config["manifestSha256"]): raise Invalid("Invalid manifest digest")
    url = config["runtimeUrl"]
    if not isinstance(url, str) or len(url) > 4096 or any(ord(c) < 33 or ord(c) > 126 for c in url): raise Invalid("Invalid package URL")
    try:
        u = urllib.parse.urlsplit(url)
        good = u.scheme == "https" and u.hostname == "anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.us-east-1.amazonaws.com" and u.port in (None,443) and not u.username and not u.password and not u.fragment
    except ValueError: good = False
    if not good or not re.fullmatch(r"/releases/[a-zA-Z0-9._/-]+\.tar\.gz", u.path) or ".." in u.path.split("/"):
        raise Invalid("Invalid package URL")
    return dict(config)

# Executed only on the future Linux host, never while generating or testing.
HOST = r'''
import datetime as dt, fcntl, hashlib, ipaddress, json, os, pathlib, platform, re, shutil, subprocess, sys, tarfile, urllib.request
BASE = pathlib.Path('/var/lib/rolling-bootstrap')
RELEASE = pathlib.Path('/opt/board-prover/releases') / ('rolling-'+PINS['manifest'][:16])
STAGE = 'initial'

def run(args, timeout=120, capture=False):
    result = subprocess.run(args, check=True, timeout=timeout, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin', 'HOME':'/root', 'LANG':'C', 'LC_ALL':'C'})
    return result.stdout.decode().strip() if capture else None

def write(path, text, mode=0o600):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink(): raise ValueError('Unsafe destination')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'w') as f:
        os.fchmod(f.fileno(), mode); f.write(text); f.flush(); os.fsync(f.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def immutable_deadline(config):
    public = {k:config[k] for k in ('createdAt','budgetStop','commissioningStop','runtimeArchiveSha256','manifestSha256')}
    record = BASE / 'deadline.json'
    if record.exists():
        if json.loads(record.read_text()) != public: raise ValueError('Deadline changed')
    else: write(record, json.dumps(public))
    if dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(config['budgetStop'].replace('Z','+00:00')):
        raise ValueError('Budget expired')

def install_controls(config):
    immutable_deadline(config)
    for name, stop in [('budget',config['budgetStop']),('commissioning',config['commissioningStop'])]:
        write('/etc/systemd/system/rolling-'+name+'.service', '[Unit]\nDescription=Rolling bounded shutdown\n[Service]\nType=oneshot\nExecStart=/usr/sbin/poweroff\n', 0o644)
        write('/etc/systemd/system/rolling-'+name+'.timer', '[Unit]\nDescription=Rolling absolute shutdown\n[Timer]\nOnCalendar='+stop.replace('T',' ').replace('Z',' UTC')+'\nPersistent=true\nAccuracySec=1s\nRandomizedDelaySec=0\n[Install]\nWantedBy=timers.target\n', 0o644)
    run(['systemctl','daemon-reload'])
    for name in ('budget','commissioning'):
        run(['systemctl','enable','--now','rolling-'+name+'.timer'])
        run(['systemctl','is-active','--quiet','rolling-'+name+'.timer'])
    # No proof server can start accidentally during bootstrap or a reboot.
    run(['systemctl','mask','board-prover.service','board-prover-proxy.service'])
    for service in ('board-prover.service','board-prover-proxy.service'):
        try: run(['systemctl','is-active','--quiet',service])
        except subprocess.CalledProcessError as error:
            if error.returncode not in (3,4): raise
        else: run(['systemctl','stop',service])
    # One physical interface: forwarded Docker traffic also traverses this root qdisc.
    routes = json.loads(run(['ip','-j','route','show','default'], capture=True))
    devices = {r['dev'] for r in routes if 'dev' in r}
    if len(devices) != 1: raise ValueError('Expected single egress interface')
    dev = devices.pop()
    if not dev or not all(c.isalnum() or c in '_-.' for c in dev): raise ValueError('Invalid interface')
    # Root ceiling is mandatory even if class classification changes. All IP families covered.
    write(BASE/'interface', dev)
    shaper = '#!/bin/sh\nset -eu\nDEV='+dev+'\n'
    shaper += 'tc qdisc replace dev "$DEV" root handle 1: htb default 10\n'
    shaper += 'tc class replace dev "$DEV" parent 1: classid 1:1 htb rate 50mbit ceil 50mbit burst 1mb cburst 1mb\n'
    shaper += 'tc class replace dev "$DEV" parent 1:1 classid 1:10 htb rate 25mbit ceil 50mbit\n'
    shaper += 'tc class replace dev "$DEV" parent 1:1 classid 1:20 htb rate 25mbit ceil 50mbit\n'
    # The installed prover is disabled. Future enablement must classify its UID as mark20.
    shaper += 'tc filter replace dev "$DEV" parent 1: protocol all prio 1 handle 20 fw classid 1:20\n'
    write('/usr/local/sbin/rolling-egress', shaper, 0o700)
    write('/etc/systemd/system/rolling-egress.service', '[Unit]\nDescription=Whole host egress ceiling\nAfter=network-online.target\nWants=network-online.target\nBefore=docker.service rolling-node.service\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/rolling-egress\nRemainAfterExit=yes\n[Install]\nWantedBy=multi-user.target\n', 0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','rolling-egress.service'])
    verify_controls()

def class_bytes(text):
    # Noble iproute2 6.1.0 has no class JSON support. These are its C-locale
    # tc_class.c/q_htb.c/tc_util.c outputs, not the newer upstream JSON schema.
    if type(text) is not str or len(text) > 16384: raise ValueError('Invalid class output')
    records = {}
    current = None
    for line in text.splitlines():
        if not line.strip(): continue
        if line.startswith('class '):
            header = re.fullmatch(r'class htb (1:(?:1|10|20)) (root|parent 1:1) (?:leaf [0-9a-f]+: )?(?:prio 0 )?rate (25|50)Mbit ceil 50Mbit burst [0-9]+(?:[KM])?b cburst [0-9]+(?:[KM])?b *', line)
            if not header: raise ValueError('Unexpected class topology or ceiling')
            handle, parent, rate = header.groups()
            if handle in records or parent != ('root' if handle == '1:1' else 'parent 1:1') or rate != ('50' if handle == '1:1' else '25'):
                raise ValueError('Unexpected class topology or ceiling')
            records[handle] = None; current = handle
        elif line.lstrip().startswith('Sent '):
            stats = re.fullmatch(r' Sent ([0-9]{1,20}) bytes [0-9]+ pkt \(dropped [0-9]+, overlimits [0-9]+ requeues [0-9]+\) *', line)
            if current is None or records[current] is not None or not stats or int(stats[1]) > 2**64-1: raise ValueError('Missing class byte accounting')
            records[current] = int(stats[1])
        elif not re.fullmatch(r' (?:backlog [0-9]+(?:[KM])?b [0-9]+p requeues [0-9]+|lended: [0-9]+ borrowed: [0-9]+ giants: [0-9]+|tokens: -?[0-9]+ ctokens: -?[0-9]+) *', line) or current is None:
            raise ValueError('Unexpected class statistics')
    if set(records) != {'1:1','1:10','1:20'} or any(v is None for v in records.values()): raise ValueError('Missing class byte accounting')
    return records['1:1']

def verify_controls():
    run(['systemctl','is-active','--quiet','rolling-budget.timer'])
    config = json.loads((BASE/'deadline.json').read_text())
    if dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(config['budgetStop'].replace('Z','+00:00')): raise ValueError('Expired')
    dev = (BASE/'interface').read_text()
    if not re.fullmatch(r'tc utility, iproute2-6\.1\.0(?:, libbpf [0-9]+\.[0-9]+\.[0-9]+)?', run(['tc','-V'], capture=True)):
        raise ValueError('Unreviewed tc version')
    # Pin the reviewed Ubuntu patch families too: neither backports class JSON.
    if run(['dpkg-query','-W','-f=${Version}','iproute2'], capture=True) not in ('6.1.0-1ubuntu6','6.1.0-1ubuntu6.4'):
        raise ValueError('Unreviewed iproute2 package')
    byte_count = class_bytes(run(['tc','-s','class','show','dev',dev], capture=True))
    qdisc = json.loads(run(['tc','-j','qdisc','show','dev',dev],capture=True))
    roots = [q for q in qdisc if q.get('root') is True]
    if len(roots)!=1 or roots[0].get('kind')!='htb' or roots[0].get('handle')!='1:' or roots[0].get('options',{}).get('default')!='0x10':
        raise ValueError('Wrong root qdisc')
    return byte_count

def fetch_package(url, path):
    # urllib refuses redirects: no capability may escape to a different destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): raise ValueError('Redirect rejected')
    opener = urllib.request.build_opener(NoRedirect)
    total = 0
    with opener.open(url, timeout=60) as response, open(path,'xb') as out:
        if response.status != 200: raise ValueError('Download status')
        while True:
            chunk = response.read(1024*1024)
            if not chunk: break
            total += len(chunk)
            if total > 4*1024**3: raise ValueError('Archive too large')
            out.write(chunk)
        out.flush();os.fsync(out.fileno())

def extract_verified(archive, target, expected):
    if digest(archive) != expected: raise ValueError('Archive hash mismatch')
    target.mkdir(parents=True,exist_ok=False)
    with tarfile.open(archive,'r:gz') as tar:
        members = tar.getmembers()
        if len(members)>200000 or sum(m.size for m in members)>20*1024**3: raise ValueError('Archive limit')
        # Python3.12 data filter rejects external links, device files and traversal.
        tar.extractall(target, filter='data')
    verify_release(target)

def verify_release(target):
    if digest(target/'prover-release.json') != PINS['manifest']: raise ValueError('Manifest mismatch')
    m = json.loads((target/'prover-release.json').read_text())
    if m['platform']!='linux-x64' or m['applicationProfile']!='rolling': raise ValueError('Wrong release')
    actual = set()
    for p in target.rglob('*'):
        if not p.resolve().is_relative_to(target.resolve()): raise ValueError('External package link')
        if p.is_file() and str(p.relative_to(target))!='prover-release.json': actual.add(str(p.relative_to(target)))
    if actual != set(m['files']): raise ValueError('Manifest file set mismatch')
    for rel, expected in m['files'].items():
        p = target/rel
        if not p.resolve().is_relative_to(target.resolve()) or digest(p)!=expected: raise ValueError('Release file mismatch')
    for rel, key in [('node/bin/node','node'),('node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb','bb'),('prover/rolling-artifacts.json','catalog')]:
        if digest(target/rel)!=PINS[key]: raise ValueError('Native or catalog mismatch')

def prepare_data():
    # A fresh dedicated secondary EBS disk only; never guess among existing data disks.
    disks=json.loads(run(['lsblk','-b','-J','-o','PATH,TYPE,SIZE,FSTYPE,MOUNTPOINTS,UUID'],capture=True))['blockdevices']
    candidates=[d for d in disks if d['type']=='disk' and int(d['size'])==1024**4]
    if len(candidates)!=1: raise ValueError('Expected dedicated 1024GiB disk')
    d=candidates[0];device=d['path'];mount='/var/lib/rolling-node'
    if d.get('children'): raise ValueError('Partitioned data disk rejected')
    mounts=[x for x in d.get('mountpoints',[]) if x]
    if mounts and mounts!=[mount]: raise ValueError('Data disk already mounted elsewhere')
    marker=BASE/'volume.json'
    if marker.exists():
        record=json.loads(marker.read_text())
        if d.get('uuid')!=record['uuid'] or d.get('fstype')!='ext4': raise ValueError('Data disk changed')
    else:
        if d.get('fstype') or mounts: raise ValueError('Existing filesystem rejected')
        run(['mkfs.ext4','-q',device],timeout=120)
        uuid=run(['blkid','-s','UUID','-o','value',device],capture=True)
        if not uuid or not all(c.isalnum() or c=='-' for c in uuid): raise ValueError('Invalid volume identity')
        record={'uuid':uuid};write(marker,json.dumps(record))
    pathlib.Path(mount).mkdir(parents=True,exist_ok=True)
    line='UUID='+record['uuid']+' '+mount+' ext4 defaults,nosuid,nodev 0 2\n'
    fstab=pathlib.Path('/etc/fstab').read_text()
    if line not in fstab: write('/etc/fstab',fstab+'\n'+line,0o644)
    if not mounts: run(['mount',mount])
    pathlib.Path(mount+'/data').mkdir(exist_ok=True)

def public_ip():
    req=urllib.request.Request('http://169.254.169.254/latest/api/token',method='PUT',headers={'X-aws-ec2-metadata-token-ttl-seconds':'60'})
    with urllib.request.urlopen(req,timeout=5) as r: token=r.read(4096).decode()
    req=urllib.request.Request('http://169.254.169.254/latest/meta-data/public-ipv4',headers={'X-aws-ec2-metadata-token':token})
    with urllib.request.urlopen(req,timeout=5) as r: value=r.read(64).decode().strip()
    address=ipaddress.IPv4Address(value)
    if not address.is_global: raise ValueError('Expected public IPv4')
    return str(address)

def install_node():
    prepare_data()
    write('/etc/rolling-node/network.json',json.dumps(NETWORK),0o644)
    if not shutil.which('docker'):
        run(['apt-get','update'],timeout=180)
        run(['apt-get','install','-y','docker.io'],timeout=300)
    # Docker cannot start on reboot without its shaping prerequisite.
    write('/etc/systemd/system/docker.service.d/rolling.conf','[Unit]\nRequires=rolling-egress.service\nAfter=rolling-egress.service\n',0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','docker'])
    verify_controls()
    run(['docker','pull','--platform','linux/amd64',PINS['image']],timeout=600)
    ip=public_ip()
    args=['/usr/bin/docker','run','--rm','--name','rolling-node','--platform','linux/amd64','--memory','24g','--memory-swap','24g','--pids-limit','512','--cap-drop','ALL','--security-opt','no-new-privileges',
          '-p','127.0.0.1:8082:8080','-p','127.0.0.1:8882:8880','-p','40400:40400/tcp','-p','40400:40400/udp',
          '-v','/var/lib/rolling-node/data:/var/lib/data','-v','/etc/rolling-node/network.json:/etc/aztec/network.json:ro',
          '-e','DATA_DIRECTORY=/var/lib/data','-e','NETWORK_CONFIG_LOCATION=/etc/aztec/network.json',
          '-e','ETHEREUM_HOSTS=https://ethereum-sepolia-rpc.publicnode.com','-e','ETHEREUM_DEBUG_HOSTS=https://ethereum-sepolia-rpc.publicnode.com',
          '-e','L1_CONSENSUS_HOST_URLS=https://ethereum-sepolia-beacon-api.publicnode.com','-e','ETHEREUM_ALLOW_NO_DEBUG_HOSTS=false','-e','BLOB_ALLOW_EMPTY_SOURCES=false',
          '-e','PROVER_REAL_PROOFS=true','-e','SYNC_MODE=snapshot','-e','P2P_IP='+ip,'-e','P2P_PORT=40400','-e','AZTEC_PORT=8080','-e','AZTEC_ADMIN_PORT=8880',
          '--entrypoint','node',PINS['image'],'--no-warnings','/usr/src/yarn-project/aztec/dest/bin/index.js','start','--node','--network','testnet']
    # All arguments above are fixed or strict IPv4/digest; no shell is involved.
    unit='[Unit]\nDescription=Bounded private query fullnode\nRequires=docker.service rolling-egress.service\nAfter=docker.service rolling-egress.service\nRequiresMountsFor=/var/lib/rolling-node\n[Service]\nExecStartPre=/usr/bin/python3 /usr/local/lib/rolling-attest.py --check\nExecStart='+ ' '.join(args)+'\nExecStop=/usr/bin/docker stop -t 30 rolling-node\nRestart=no\nTimeoutStartSec=0\nTimeoutStopSec=45\nStandardOutput=null\nStandardError=null\n[Install]\nWantedBy=multi-user.target\n'
    write('/etc/systemd/system/rolling-node.service',unit,0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','rolling-node'])

def attest(check=False):
    good=False;count=0
    try: count=verify_controls();good=True
    except Exception: pass
    if check:
        if not good: raise ValueError('Control verification failed')
        return
    record=json.loads((BASE/'deadline.json').read_text())
    status=(BASE/'stage').read_text() if (BASE/'stage').exists() else 'initial'
    if status not in ('controls','package','node','installed','failed'): status='initial'
    output={'schemaVersion':1,'stage':status,'controlsVerified':good,'budgetStop':record['budgetStop'],
            'egressBytes':count if type(count)==int and count>=0 else 0,
            'runtimeArchiveSha256':record['runtimeArchiveSha256'],'manifestSha256':record['manifestSha256'],
            'proverPolicy':'masked-pending-qualification','linuxQueryQualified':False}
    minute=str(int(dt.datetime.now(dt.timezone.utc).timestamp())//60)
    last=BASE/'last-attestation'
    marker=minute+':'+status+':'+str(good)
    if not last.exists() or last.read_text()!=marker:
        with open('/dev/console','w') as f: f.write('ROLLING_BOOTSTRAP '+json.dumps(output,separators=(',',':'))+'\n')
        write(last,marker)
    if not good:
        run(['systemctl','stop','rolling-node.service','board-prover.service','board-prover-proxy.service'])
        run(['systemctl','start','rolling-budget.service'])

def install_attestation(source):
    write('/usr/local/lib/rolling-attest.py',source,0o700)
    write('/etc/systemd/system/rolling-attest.service','[Unit]\nDescription=Bounded public bootstrap attestation\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /usr/local/lib/rolling-attest.py\nStandardOutput=null\nStandardError=null\n',0o644)
    write('/etc/systemd/system/rolling-attest.timer','[Unit]\nDescription=Bootstrap controls monitor\n[Timer]\nOnBootSec=5s\nOnUnitActiveSec=5s\n[Install]\nWantedBy=timers.target\n',0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','rolling-attest.timer'])

def execute(config, attestation_source):
    global STAGE
    if platform.system()!='Linux' or platform.machine()!='x86_64' or os.geteuid()!=0: raise ValueError('Linux x64 root required')
    BASE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with open(BASE/'lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try:
            STAGE='controls';install_controls(config);write(BASE/'stage',STAGE)
            install_attestation(attestation_source)
            if not RELEASE.exists():
                STAGE='package';write(BASE/'stage',STAGE)
                archive=BASE/'runtime.tar.gz'
                if not archive.exists(): fetch_package(config['runtimeUrl'],archive)
                extract_verified(archive,RELEASE,config['runtimeArchiveSha256'])
            else: verify_release(RELEASE)
            node=str(RELEASE/'node/bin/node');bb=str(RELEASE/'node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb')
            if run([node,'--version'],capture=True)!='v24.21.0': raise ValueError('Wrong Node')
            if '6.0.0-rc.1' not in run([bb,'--version'],capture=True): raise ValueError('Wrong BB')
            run([node,'--input-type=module','--eval',"import {loadRollingArtifacts} from '"+(RELEASE/'prover/rolling-artifacts.mjs').as_uri()+"';loadRollingArtifacts();"],timeout=120)
            STAGE='node';write(BASE/'stage',STAGE);install_node();verify_controls()
            STAGE='installed';write(BASE/'stage',STAGE)
            # Only commissioning protection is retired; fixed budget control remains enabled.
            run(['systemctl','disable','--now','rolling-commissioning.timer']);attest()
        except Exception:
            write(BASE/'stage','failed')
            try: attest()
            except Exception: pass
            try: run(['systemctl','start','rolling-budget.service'])
            except Exception: run(['/usr/sbin/poweroff'])
            raise SystemExit(1) from None
'''


def generate(config, now=None):
    config = validate(config, now)
    pins = {'image':IMAGE, 'manifest':config['manifestSha256'], 'node':NODE_SHA, 'bb':BB_SHA, 'catalog':CATALOG_SHA}
    prefix = 'PINS = '+repr(pins)+'\nNETWORK = '+repr(NETWORK)+'\n'
    attestation = prefix + HOST + "\ntry: attest('--check' in sys.argv)\nexcept Exception:\n    run(['/usr/sbin/poweroff']); raise SystemExit(1) from None\n"
    program = prefix + HOST + '\nCONFIG = '+repr(config)+'\nATTESTATION = '+repr(attestation)+'\nexecute(CONFIG, ATTESTATION)\n'
    encoded = base64.b64encode(gzip.compress(program.encode(),mtime=0)).decode()
    return "#!/bin/sh\nset -eu\numask 077\nexec /usr/bin/python3 - <<'ROLLING_BOOTSTRAP_PY'\nimport base64,gzip\nexec(compile(gzip.decompress(base64.b64decode('"+encoded+"')), '<private-bootstrap>', 'exec'))\nROLLING_BOOTSTRAP_PY\n"


def private_file(path):
    path = pathlib.Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.getuid() or info.st_size>16384:
            raise Invalid('Input must be an owner-only bounded regular file')
        with os.fdopen(fd,'r',closefd=False) as f: return json.load(f)
    finally: os.close(fd)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args()
    try:
        output=pathlib.Path(args.output).absolute()
        repo=pathlib.Path(__file__).resolve().parents[2]
        if output.resolve().is_relative_to(repo) or output.parent.resolve()!=output.parent or pathlib.Path(args.config).resolve().is_relative_to(repo): raise Invalid('Private inputs and outputs must be outside checkout')
        info=output.parent.stat()
        if stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid(): raise Invalid('Private output directory required')
        body=gzip.compress(generate(private_file(args.config)).encode(),mtime=0)
        if len(body)>16384: raise Invalid('Compressed user data exceeds AWS limit')
        fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f: f.write(body);f.flush();os.fsync(f.fileno())
        fd=os.open(output.parent,os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
        print(json.dumps({'generated':True,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body)}))
    except Exception:
        print('Bootstrap generation failed; inspect private inputs locally.',file=sys.stderr)
        return 1
    return 0

if __name__=='__main__': sys.exit(main())
