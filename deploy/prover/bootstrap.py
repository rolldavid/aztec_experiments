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

# Public historical deployment identity; qualification is explicitly legacy,
# never a Rolling deployment. Source: deploy/prover/live-deployment.json.
QUALIFICATION = {'service': {'applicationProfile':'legacy','proofs':'real','host':'127.0.0.1','port':0,'origins':[],
    'chainId':'11155111','rollupVersion':'2914217885',
    'board':'0x0346558fcce04c4bf0b0907c1ef20858b9583123ef55bceb7125cb3fc3fb3752',
    'queryNode':{'url':'http://127.0.0.1:8082/','rollupAddress':'0x8c2fb2a68a3d362ab1de99e06f83f8903160bbd9','maxLagSeconds':120}},
    'adminUrl':'http://127.0.0.1:8882/','recoveryTimeoutMs':180000}

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
        good = u.scheme == "https" and u.hostname == "anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com" and u.port in (None,443) and not u.username and not u.password and not u.fragment
    except ValueError: good = False
    if not good or not re.fullmatch(r"/releases/[a-zA-Z0-9._/-]+\.tar\.gz", u.path) or ".." in u.path.split("/"):
        raise Invalid("Invalid package URL")
    return dict(config)

# Executed only on the future Linux host, never while generating or testing.
HOST = r'''
import datetime as dt, fcntl, hashlib, ipaddress, json, os, pathlib, platform, re, shutil, stat, subprocess, sys, tarfile, time, urllib.request
BASE = pathlib.Path('/var/lib/rolling-bootstrap')
RELEASE = pathlib.Path('/opt/board-prover/releases') / ('rolling-'+PINS['manifest'][:16])
STAGE = 'initial'

DIAGNOSTICS_ACTIVE = False
STEP = 'entry'
STEPS = frozenset(('entry','host-preflight','state-directory','writer-lock','deadline','timer-files','timer-reload','budget-timer','commissioning-timer','mask-prover','inspect-prover','stop-prover','route-read','shaper-files','shaper-start','verify-budget','tc-version','tc-package','tc-classes','tc-class-parse','tc-qdisc','tc-qdisc-parse','monitor-install','runtime-download','runtime-verify','native-checks','node-install','egress-exercise','qualification-install','complete'))

def diagnostic(error=None, status='failed', facts=None):
    # Diagnostic output must never prevent shutdown. No raw exception attributes,
    # command arguments, configuration, or provider responses are serialized.
    try:
        out={'schemaVersion':1,'step':STEP if STEP in STEPS else 'entry','status':status if status in ('started','passed','failed','observed') else 'failed'}
        for key,label in [('manifest','manifestSha256'),('bootstrap','bootstrapSourceSha256'),('node','nodeSha256'),('bb','bbSha256'),('catalog','catalogSha256')]:
            v=PINS.get(key)
            if type(v) is str and re.fullmatch('[a-f0-9]{64}',v):out[label]=v
        category={subprocess.CalledProcessError:'command-exit',subprocess.TimeoutExpired:'command-timeout',FileNotFoundError:'missing-file',PermissionError:'permission',OSError:'io',ValueError:'validation',json.JSONDecodeError:'invalid-json',UnicodeDecodeError:'invalid-encoding'}.get(type(error),'internal')
        if error is not None:
            out['category']=category
            if type(error) is subprocess.CalledProcessError:
                code=vars(error).get('returncode')
                if type(code) is int and -255<=code<=255:out['returnCode']=code
        if type(facts) is dict:
            for key in ('tcVersion','libbpfVersion','packageVersion'):
                value=facts.get(key)
                if type(value) is list and 2<=len(value)<=6 and all(type(x) is int and 0<=x<=999 for x in value):out[key]=value
            for key in ('tcAccepted','packageAccepted'):
                if type(facts.get(key)) is bool:out[key]=facts[key]
            if facts.get('classFormat') in ('class-text','json','empty','other'):out['classFormat']=facts['classFormat']
        data=('ROLLING_BOOTSTRAP_DIAGNOSTIC '+json.dumps(out,separators=(',',':'))+'\n').encode()
        if len(data)>2048:return
        emit_diagnostic(data)
    except Exception:pass

def emit_diagnostic(data):
    # Fixed local character devices only; no create, follow, fsync, blocking retry,
    # permissions, serial getty or bootloader changes. Missing sinks are harmless.
    for device in ('/dev/ttyS0','/dev/console'):
        fd=None
        try:
            fd=os.open(device,os.O_WRONLY|os.O_NONBLOCK|os.O_NOFOLLOW|os.O_CLOEXEC)
            if stat.S_ISCHR(os.fstat(fd).st_mode):os.write(fd,data)
        except Exception:pass
        finally:
            if fd is not None:
                try:os.close(fd)
                except Exception:pass

def mark(step):
    global STEP
    STEP=step if step in STEPS else 'entry'
    if DIAGNOSTICS_ACTIVE:diagnostic(status='started')

def version_facts(text, package=False):
    if type(text) is not str or len(text)>256:return {}
    if package:
        m=re.fullmatch(r'([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})-([0-9]{1,3})ubuntu([0-9]{1,3})(?:\.([0-9]{1,3}))?',text)
        return {'packageVersion':[int(x) for x in m.groups() if x is not None]} if m else {}
    m=re.fullmatch(r'tc utility, iproute2-([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(?:, libbpf ([0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,3})?))?',text)
    if not m:return {}
    result={'tcVersion':[int(x) for x in m[1].split('.')]}
    if m[2]:result['libbpfVersion']=[int(x) for x in m[2].split('.')]
    return result

def shutdown_failure(error):
    diagnostic(error)
    try:write(BASE/'stage','failed')
    except Exception:pass
    try:run(['systemctl','start','rolling-budget.service'],timeout=10)
    except Exception:
        try:run(['/usr/sbin/poweroff'],timeout=10)
        except Exception:pass
    raise SystemExit(1) from None

def run(args, timeout=120, capture=False, cwd=None):
    result = subprocess.run(args, check=True, timeout=timeout, cwd=cwd, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin', 'HOME':'/root', 'LANG':'C', 'LC_ALL':'C', 'LOG_LEVEL':'silent'})
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
    mark('deadline');immutable_deadline(config)
    mark('timer-files')
    for name, stop in [('budget',config['budgetStop']),('commissioning',config['commissioningStop'])]:
        write('/etc/systemd/system/rolling-'+name+'.service', '[Unit]\nDescription=Rolling bounded shutdown\n[Service]\nType=oneshot\nExecStart=/usr/sbin/poweroff\n', 0o644)
        write('/etc/systemd/system/rolling-'+name+'.timer', '[Unit]\nDescription=Rolling absolute shutdown\n[Timer]\nOnCalendar='+stop.replace('T',' ').replace('Z',' UTC')+'\nPersistent=true\nAccuracySec=1s\nRandomizedDelaySec=0\n[Install]\nWantedBy=timers.target\n', 0o644)
    mark('timer-reload');run(['systemctl','daemon-reload'])
    for name in ('budget','commissioning'):
        mark(name+'-timer');run(['systemctl','enable','--now','rolling-'+name+'.timer'])
        run(['systemctl','is-active','--quiet','rolling-'+name+'.timer'])
    # No proof server can start accidentally during bootstrap or a reboot.
    mark('mask-prover');run(['systemctl','mask','board-prover.service','board-prover-proxy.service'])
    for service in ('board-prover.service','board-prover-proxy.service'):
        mark('inspect-prover')
        try: run(['systemctl','is-active','--quiet',service])
        except subprocess.CalledProcessError as error:
            if error.returncode not in (3,4): raise
        else: mark('stop-prover');run(['systemctl','stop',service])
    # One physical interface: forwarded Docker traffic also traverses this root qdisc.
    mark('route-read')
    routes = json.loads(run(['ip','-j','route','show','default'], capture=True))
    devices = {r['dev'] for r in routes if 'dev' in r}
    if len(devices) != 1: raise ValueError('Expected single egress interface')
    dev = devices.pop()
    if not dev or not all(c.isalnum() or c in '_-.' for c in dev): raise ValueError('Invalid interface')
    # Root ceiling is mandatory even if class classification changes. All IP families covered.
    mark('shaper-files');write(BASE/'interface', dev)
    shaper = '#!/bin/sh\nset -eu\nDEV='+dev+'\n'
    shaper += 'tc qdisc replace dev "$DEV" root handle 1: htb default 10\n'
    shaper += 'tc class replace dev "$DEV" parent 1: classid 1:1 htb rate 50mbit ceil 50mbit burst 1mb cburst 1mb\n'
    shaper += 'tc class replace dev "$DEV" parent 1:1 classid 1:10 htb rate 25mbit ceil 50mbit\n'
    shaper += 'tc class replace dev "$DEV" parent 1:1 classid 1:20 htb rate 25mbit ceil 50mbit\n'
    # The installed prover is disabled. Future enablement must classify its UID as mark20.
    shaper += 'tc filter replace dev "$DEV" parent 1: protocol all prio 1 handle 20 fw classid 1:20\n'
    write('/usr/local/sbin/rolling-egress', shaper, 0o700)
    write('/etc/systemd/system/rolling-egress.service', '[Unit]\nDescription=Whole host egress ceiling\nAfter=network-online.target\nWants=network-online.target\nBefore=docker.service rolling-node.service\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/rolling-egress\nRemainAfterExit=yes\n[Install]\nWantedBy=multi-user.target\n', 0o644)
    mark('shaper-start');run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','rolling-egress.service'])
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
    mark('verify-budget');run(['systemctl','is-active','--quiet','rolling-budget.timer'])
    config = json.loads((BASE/'deadline.json').read_text())
    if dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(config['budgetStop'].replace('Z','+00:00')): raise ValueError('Expired')
    dev = (BASE/'interface').read_text()
    mark('tc-version');tc=run(['tc','-V'],capture=True)
    accepted=bool(re.fullmatch(r'tc utility, iproute2-6\.1\.0(?:, libbpf [0-9]+\.[0-9]+\.[0-9]+)?',tc))
    if DIAGNOSTICS_ACTIVE or not accepted:diagnostic(status='observed',facts={**version_facts(tc),'tcAccepted':accepted})
    if not accepted:raise ValueError('Unreviewed tc version')
    mark('tc-package');package=run(['dpkg-query','-W','-f=${Version}','iproute2'],capture=True)
    accepted=package in ('6.1.0-1ubuntu6','6.1.0-1ubuntu6.4')
    if DIAGNOSTICS_ACTIVE or not accepted:diagnostic(status='observed',facts={**version_facts(package,True),'packageAccepted':accepted})
    if not accepted:raise ValueError('Unreviewed iproute2 package')
    mark('tc-classes');classes=run(['tc','-s','class','show','dev',dev],capture=True)
    mark('tc-class-parse')
    if DIAGNOSTICS_ACTIVE:diagnostic(status='observed',facts={'classFormat':'class-text' if classes.startswith('class ') else 'json' if classes.startswith('[') else 'empty' if not classes else 'other'})
    byte_count=class_bytes(classes)
    mark('tc-qdisc');qdisc_raw=run(['tc','-j','qdisc','show','dev',dev],capture=True)
    mark('tc-qdisc-parse');qdisc=json.loads(qdisc_raw)
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

def exclusive_record(path, value):
    # An acknowledged intent survives reboot. Even an incomplete file forbids replay.
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f:
        f.write(json.dumps(value,separators=(',',':')));f.flush();os.fsync(f.fileno())
    fd=os.open(pathlib.Path(path).parent,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def qualification_projection(report, process_exited=False):
    # Fixed booleans only: no messages, configuration, reply, logs or arbitrary keys.
    checks=report.get('checks',{});cleanup=report.get('cleanup',{})
    result={'processExitVerified':process_exited is True}
    for name in ('wrong-chain','wrong-version','wrong-rollup','proof-config-floor'):
        result[name]=checks.get(name,{}).get('rejected') is True
    for name in ('healthy','recovered'):
        r=checks.get(name,{})
        result[name]=r.get('ready') is True and type(r.get('blockNumber')) is int and r['blockNumber']>=0 and bool(re.fullmatch('0x[a-f0-9]{64}',str(r.get('blockHash'))))
    result['nativeAndRollingCatalog']=checks.get('nativeAndRollingCatalog',{}).get('passed') is True
    result['missingHelper']=checks.get('missingHelper',{}).get('missingHelperRejected') is True
    result['manifestUnchanged']=checks.get('manifestUnchanged') is True
    for name in ('paused','stale','queriesRejected','resumed','recovered'):
        result['freshness-'+name]=checks.get('freshness',{}).get(name) is True
    for name in ('serviceClosed','temporaryFilesRemoved','childProcessesExited'):
        result['cleanup-'+name]=cleanup.get(name) is True
    scope=QUALIFICATION['service'];expected={'chainId':scope['chainId'],'rollupVersion':scope['rollupVersion']}
    public=report.get('publicScope',{})
    result['scope']=public=={'chainId':expected['chainId'],'version':expected['rollupVersion'],
        'rollup':scope['queryNode']['rollupAddress'],'applicationProfile':'legacy','board':scope['board'],'proofs':'real','maxLagSeconds':120}
    result['release']=report.get('release',{}).get('manifestSha256')==PINS['manifest']
    result['noProofJobs']=type(report.get('proofJobs')) is int and report['proofJobs']==0
    result['complete']=report.get('passed') is True and report.get('stage')=='complete'
    return result

def qualification_anchors(checks):
    anchors={}
    for name in ('healthy','recovered'):
        value=checks[name]
        if type(value.get('blockNumber')) is not int or not 0<=value['blockNumber']<=2**53-1 or type(value.get('blockHash')) is not str or not re.fullmatch('0x[a-f0-9]{64}',value['blockHash']): raise ValueError('Invalid qualification anchor')
        anchors[name]={'blockNumber':value['blockNumber'],'blockHash':value['blockHash']}
    return anchors

def readiness_projection(value):
    scope=QUALIFICATION['service']
    exact={'ready':True,'chainId':scope['chainId'],'rollupVersion':scope['rollupVersion'],
           'rollupAddress':scope['queryNode']['rollupAddress'],'proofsEnabled':True}
    if any(value.get(k)!=v or type(value.get(k)) is not type(v) for k,v in exact.items()): raise ValueError('Readiness identity')
    for name in ('latestBlockNumber','checkpointedBlockNumber','finalizedBlockNumber','oldestHistoricBlockNumber','checkedAtSeconds','lagSeconds'):
        number=value.get(name)
        if type(number) is not int or not 0<=number<=2**53-1: raise ValueError('Readiness number')
        exact[name]=number
    if exact['lagSeconds']>120 or not exact['oldestHistoricBlockNumber']<=exact['checkpointedBlockNumber']<=exact['latestBlockNumber'] or exact['finalizedBlockNumber']>exact['checkpointedBlockNumber']: raise ValueError('Readiness ordering')
    for name,pattern in [('latestBlockHash','0x[a-f0-9]{64}'),('syncedL1Timestamp','[0-9]{1,16}')]:
        if type(value.get(name)) is not str or not re.fullmatch(pattern,value[name]): raise ValueError('Readiness anchor')
        exact[name]=value[name]
    if exact['checkedAtSeconds']-int(exact['syncedL1Timestamp'])!=exact['lagSeconds']: raise ValueError('Readiness timestamp')
    return exact

def qualification_failure(stage):
    return {'schemaVersion':1,'passed':False,'stage':stage,'scope':'legacy-query-only','manifestSha256':PINS['manifest']}

def qualify(aborted=False):
    directory=BASE/'qualification';directory.mkdir(mode=0o700,exist_ok=True)
    result_path=directory/'result.json';intent=directory/'intent.json'
    with open(directory/'lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if result_path.exists(): return
        if aborted or intent.exists():
            exclusive_record(result_path,qualification_failure('interrupted-unknown'));return
        deadline_record=json.loads((BASE/'deadline.json').read_text())
        epoch=lambda key:dt.datetime.fromisoformat(deadline_record[key].replace('Z','+00:00')).timestamp()
        deadline=min(epoch('budgetStop')-60,epoch('createdAt')+105*60)
        exclusive_record(intent,{'schemaVersion':1,'manifestSha256':PINS['manifest'],'deadline':int(deadline),'attempts':1})
        stage='readiness';result=qualification_failure(stage)
        try:
            verify_release(RELEASE);verify_controls()
            if not (RELEASE/'prover/qualify-runtime.mjs').is_file(): raise ValueError('Qualifier absent')
            config=directory/'config.json';exclusive_record(config,QUALIFICATION)
            scope=QUALIFICATION['service']
            options={'url':scope['queryNode']['url'],'expectedNetworkScope':{'chainId':scope['chainId'],'version':scope['rollupVersion'],'rollup':scope['queryNode']['rollupAddress']},'proofsEnabled':True,'allowLocalDev':True,'maxLagSeconds':120}
            readiness="import {createAztecNodeClient} from '@aztec-labs/stdlib/interfaces/client';import {jsonStringify} from '@aztec-labs/foundation/json-rpc';import {inspectTrustedNode} from '"+(RELEASE/'shared/trusted-private-node.mjs').as_uri()+"';try {const opts="+json.dumps(options)+";const node=createAztecNodeClient(opts.url,{maxBatchSize:1,fetch:async(host,body)=>{const r=await fetch(host,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();let n=0;const c=[];for await(const b of r.body){n+=b.length;if(n>33554432)throw Error();c.push(b);}return {response:JSON.parse(Buffer.concat(c).toString('utf8')),headers:r.headers};}});process.stdout.write(JSON.stringify(await inspectTrustedNode(node,opts)));} catch {process.exitCode=1;}"
            ready=False;poll_deadline=min(deadline-900,epoch('createdAt')+90*60)
            while time.time()<poll_deadline:
                verify_controls()
                try:
                    raw=run([str(RELEASE/'node/bin/node'),'--input-type=module','--eval',readiness],timeout=min(60,max(1,poll_deadline-time.time())),capture=True,cwd=RELEASE)
                    if len(raw)>16384: raise ValueError('Readiness output limit')
                    snapshot=readiness_projection(json.loads(raw))
                    ready=True;break
                except (subprocess.CalledProcessError,subprocess.TimeoutExpired): pass
                time.sleep(min(15,max(0,poll_deadline-time.time())))
            if not ready: raise ValueError('Readiness deadline')
            exclusive_record(directory/'ready.json',snapshot)
            stage='qualifier';verify_controls()
            output=directory/'report.json'
            # Exactly one attempt. The qualifier's nonzero result can still contain
            # useful fixed checks; timeout is unknown and never resumes or repeats it.
            process_exited=False
            try:
                run([str(RELEASE/'node/bin/node'),str(RELEASE/'prover/qualify-runtime.mjs'),str(config),PINS['manifest'],str(output)],timeout=min(900,max(1,deadline-time.time())))
                process_exited=True
            except subprocess.CalledProcessError: pass
            if output.is_symlink() or not output.is_file() or output.stat().st_size>16384: raise ValueError('Missing bounded result')
            report=json.loads(output.read_text());checks=qualification_projection(report,process_exited)
            result={'schemaVersion':1,'passed':all(checks.values()),'stage':'complete' if all(checks.values()) else 'qualification-failed',
                    'scope':'legacy-query-only','manifestSha256':PINS['manifest'],'reportSha256':digest(output),'checks':checks,'readiness':snapshot}
            if checks['healthy'] and checks['recovered']: result['anchors']=qualification_anchors(report['checks'])
            # Preserve the actual bounded report durably before acknowledging result.
            with open(output,'rb') as f: os.fsync(f.fileno())
        except Exception: result=qualification_failure(stage+'-failed')
        exclusive_record(result_path,result)

def install_qualification():
    unit='[Unit]\nDescription=One bounded Linux query qualification\nRequires=rolling-node.service rolling-egress.service\nAfter=rolling-node.service rolling-egress.service\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /usr/local/lib/rolling-attest.py --qualify\nExecStopPost=/usr/bin/python3 /usr/local/lib/rolling-attest.py --qualification-stop\nTimeoutStartSec=6300\nTimeoutStopSec=45\nKillMode=control-group\nRestart=no\nUMask=0077\nEnvironment=LOG_LEVEL=silent\nUnsetEnvironment=NODE_PATH NODE_OPTIONS BB\nPrivateTmp=yes\nPrivateDevices=yes\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nProtectSystem=strict\nProtectHome=yes\nReadWritePaths=/var/lib/rolling-bootstrap\nIPAddressDeny=any\nIPAddressAllow=localhost\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK\nStandardOutput=null\nStandardError=null\n[Install]\nWantedBy=multi-user.target\n'
    write('/etc/systemd/system/rolling-qualification.service',unit,0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','rolling-qualification.service'])
    run(['systemctl','start','--no-block','rolling-qualification.service'])

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
    exercise=BASE/'egress-exercise.json'
    if exercise.exists():
        e=json.loads(exercise.read_text())
        if set(e)=={'beforeBytes','afterBytes','deltaBytes','exercise'} and e['exercise']=='installation-egress-not-throughput' and all(type(e[k]) is int and 0<=e[k]<2**64 for k in ('beforeBytes','afterBytes','deltaBytes')) and e['afterBytes']-e['beforeBytes']==e['deltaBytes'] and e['deltaBytes']>0:
            output['egressExercise']=e
    result_path=BASE/'qualification/result.json'
    if result_path.exists():
        try:
            q=json.loads(result_path.read_text())
            allowed={'schemaVersion','passed','stage','scope','manifestSha256','reportSha256','checks','readiness','anchors'}
            if type(q.get('schemaVersion')) is not int or q['schemaVersion']!=1 or type(q.get('passed')) is not bool or set(q)-allowed or q.get('manifestSha256')!=PINS['manifest'] or q.get('scope')!='legacy-query-only': raise ValueError('Bad result')
            if q.get('stage') not in ('complete','qualification-failed','readiness-failed','qualifier-failed','interrupted-unknown'): raise ValueError('Bad stage')
            if 'checks' in q and (set(q['checks'])!=set(qualification_projection({})) or any(type(v) is not bool for v in q['checks'].values())): raise ValueError('Bad checks')
            if 'reportSha256' in q and not re.fullmatch('[a-f0-9]{64}',q['reportSha256']): raise ValueError('Bad hash')
            if 'readiness' in q: q['readiness']=readiness_projection(q['readiness'])
            if 'anchors' in q: q['anchors']=qualification_anchors(q['anchors'])
            output['qualification']=q
            output['linuxQueryQualified']=q.get('passed') is True and q.get('stage')=='complete' and bool(q.get('checks')) and all(q['checks'].values()) and 'readiness' in q and 'anchors' in q
        except Exception: output['qualification']=qualification_failure('interrupted-unknown')
    minute=str(int(dt.datetime.now(dt.timezone.utc).timestamp())//60)
    last=BASE/'last-attestation'
    marker=minute+':'+status+':'+str(good)+':'+str(output.get('qualification',{}).get('stage','pending'))
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
    global DIAGNOSTICS_ACTIVE
    DIAGNOSTICS_ACTIVE=True;mark('entry')
    try:_execute(config,attestation_source)
    except Exception as error:shutdown_failure(error)
    finally:DIAGNOSTICS_ACTIVE=False

def _execute(config, attestation_source):
    global STAGE
    mark('host-preflight')
    if platform.system()!='Linux' or platform.machine()!='x86_64' or os.geteuid()!=0: raise ValueError('Linux x64 root required')
    mark('state-directory');BASE.mkdir(parents=True,exist_ok=True,mode=0o700)
    mark('writer-lock')
    with open(BASE/'lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try:
            STAGE='controls';install_controls(config);write(BASE/'stage',STAGE)
            egress_before=verify_controls()
            mark('monitor-install');install_attestation(attestation_source)
            if not RELEASE.exists():
                STAGE='package';write(BASE/'stage',STAGE)
                archive=BASE/'runtime.tar.gz'
                mark('runtime-download')
                if not archive.exists(): fetch_package(config['runtimeUrl'],archive)
                mark('runtime-verify');extract_verified(archive,RELEASE,config['runtimeArchiveSha256'])
            else: mark('runtime-verify');verify_release(RELEASE)
            mark('native-checks');node=str(RELEASE/'node/bin/node');bb=str(RELEASE/'node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb')
            if run([node,'--version'],capture=True)!='v24.21.0': raise ValueError('Wrong Node')
            if '6.0.0-rc.1' not in run([bb,'--version'],capture=True): raise ValueError('Wrong BB')
            run([node,'--input-type=module','--eval',"import {loadRollingArtifacts} from '"+(RELEASE/'prover/rolling-artifacts.mjs').as_uri()+"';loadRollingArtifacts();"],timeout=120)
            STAGE='node';write(BASE/'stage',STAGE);mark('node-install');install_node();verify_controls()
            egress_after=verify_controls();mark('egress-exercise')
            if type(egress_before) is not int or type(egress_after) is not int or egress_after<=egress_before: raise ValueError('Egress counter exercise failed')
            write(BASE/'egress-exercise.json',json.dumps({'beforeBytes':egress_before,'afterBytes':egress_after,'deltaBytes':egress_after-egress_before,'exercise':'installation-egress-not-throughput'}))
            STAGE='installed';write(BASE/'stage',STAGE)
            # Only commissioning protection is retired; fixed budget control remains enabled.
            mark('qualification-install');run(['systemctl','disable','--now','rolling-commissioning.timer']);install_qualification();attest();mark('complete');diagnostic(status='passed')
        except Exception as error:shutdown_failure(error)
'''


def generate(config, now=None):
    config = validate(config, now)
    pins = {'image':IMAGE, 'manifest':config['manifestSha256'], 'node':NODE_SHA, 'bb':BB_SHA, 'catalog':CATALOG_SHA, 'bootstrap':hashlib.sha256(HOST.encode()).hexdigest()}
    prefix = 'PINS = '+repr(pins)+'\nNETWORK = '+repr(NETWORK)+'\nQUALIFICATION = '+repr(QUALIFICATION)+'\n'
    dispatch = "\ntry:\n    if '--qualify' in sys.argv: qualify()\n    elif '--qualification-stop' in sys.argv:\n        qualify(aborted=True);run(['systemctl','start','rolling-attest.service'])\n        result=json.loads((BASE/'qualification/result.json').read_text())\n        if result.get('passed') is not True: run(['systemctl','start','--no-block','rolling-budget.service'])\n    else: attest('--check' in sys.argv)\nexcept Exception as error:\n    shutdown_failure(error)\n"
    program = 'SOURCE = '+repr(prefix+HOST)+'\nCONFIG = '+repr(config)+'\nATTESTATION = SOURCE + '+repr(dispatch)+'\nexec(SOURCE)\nexecute(CONFIG, ATTESTATION)\n'
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
