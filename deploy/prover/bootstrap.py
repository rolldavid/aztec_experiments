"""Generate private, immutable cloud-init shell input; never calls AWS itself.

Host executable tokens are embedded and unit-tested through injected commands.
Only public pins are committed. Capability URLs belong in owner-only external files.
"""
import argparse, ast, base64, datetime as dt, gzip, hashlib, ipaddress, io, json, lzma, os, pathlib, re, signal, stat, subprocess, sys, tokenize, urllib.parse

IMAGE = "azteclabs/aztec@sha256:44479404b67dde931cf8f202a3ce34703876e709ce124924251da8435d5d8651"
NODE_SHA = "7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c"
BB_SHA = "fa4b12adaefd5684b53b802346b9fe839ab3d6a4a829a5ea4efd6bd200e0829f"
BB_VERSION = "6.0.0-rc.6"
CATALOG_SHA = "fafaf3387cdb360e11dff386f30be2fac40e5547ee642cb969aac449b40efb7e"
NETWORK = {'testnet': {'bootnodes': ['enr:-LO4QA4kHKdUJOirQ4NxtI-gjBNLRK1GPeKtmz664Uph-EqLW1B3EkCqu6ul5C7dejOBWbEWMOPZc07I0Bl8bmW5Vn0EhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIlCfmYlzZWNwMjU2azGhAoRffgRFcK_rV5ddbmtUW9cyXrPwrDFL18OFRVejOOXDg3VkcIKd0A', 'enr:-LO4QO3-kuKH3c-RgaxYBWk0PiV-97B4wnvHcgMxYpB-1WjoctKlpY3Fuh29AESLhBn1WtQXE-1G0Umo_VhTcu7bLloEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIicStolzZWNwMjU2azGhAxUvKI8xXnGpkj2VjRZk9VmMbtfHZUoszOvvl76qFrGeg3VkcIKd0A', 'enr:-LO4QNTdBJe-2tIfXpzJmu4Tise0rRdPSn2gwQMtkVPe40szAdpWRgixGub2iUXMcxSQuQ8nkKh-GSvQpRKqw2XzUhQEhWF6dGVjqDAwLTExMTU1MTExLTAwMDAwMDAwLTAtMjI3ODAyMzktMmRhOWY4MDGCaWSCdjSCaXCEIrZz14lzZWNwMjU2azGhApwZiWnsA8TFqvz-sGDrgbi1AypT4QXJfFWdYOz2yeVtg3VkcIKd0A', 'enr:-Nu4QLjG2KMKvsVOjnhELmYmUO-auKssB_HPKNJitPOwXN0IYC5XPwUwZucnlAE0towcJ9lemeu4gmZkRnYWiGL_lkIHhWF6dGVjsDAwLTExMTU1MTExLWViZDk5ZmYwLTg0NTIzMTcxMy0xMmU5YWEzNi0yMjllYWRiN4JpZIJ2NINpcDaQKgEE-AJiEJUAAAAAAAAAAolzZWNwMjU2azGhA5_JMPCAGUHSS3vWQU3LlQoXnUOaO7AUNylXu2ieLTlKhHRjcDaCnJCEdWRwNoKckIN2ZXKFMi4xLjI', 'enr:-Ku4QHA70JBzwsnhlg-Y-Ud_vH_xAJtaoIAGpEGwvBFu8jHxEEVBrzMCrgRTqYpwDgPgyWPEtEGg-pWlxsK3Gq1VGa4EhWF6dGVjoDAwLS0wMDAwMDAwMC0wLTIyNzgwMjM5LTBjNzU3NmQzgmlkgnY0gmlwhNU65vmJc2VjcDI1NmsxoQLj0Km-mQSLz-0Wz8JBhBv9r0AhFbctdeO0yuT-gqUlPYN1ZHCCndA'], 'snapshots': ['https://aztec-labs-snapshots.com/testnet/', 'https://files5.blacknodes.net/Aztec/', 'https://snapshots-data.aztec.graphops.xyz/'], 'blobFileStoreUrls': ['https://aztec-labs-snapshots.com/testnet/blobs'], 'txCollectionFileStoreUrls': ['https://aztec-labs-snapshots.com/testnet/txs'], 'registryAddress': '0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba', 'feeAssetHandlerAddress': '0x5602c39a6e9c5ace589f64f754927bcda4f4bfc9', 'l1ChainId': 11155111}}

# Public rc3 compatibility snapshot, not fresh network clearance or a deployed board.
# Query-only qualification never allocates a proof queue or worker.
QUALIFICATION = {'service': {'serviceMode':'query-only','proofs':'real','host':'127.0.0.1','port':0,'origins':[],
    'chainId':'11155111','rollupVersion':'3409706519',
    'queryNode':{'url':'http://127.0.0.1:8082/','rollupAddress':'0xed1eb2eb670b42e2fb5a478c076a264b9604089d','maxLagSeconds':120}},
    'adminUrl':'http://127.0.0.1:8882/','adminKeyFile':'/var/lib/rolling-admin/qualification-key','recoveryTimeoutMs':180000}

class Invalid(ValueError):
    pass

def require_linux_qualification(root=None):
    """Candidate bytes are not an execution qualification. Never promote a pin here."""
    root=pathlib.Path(root) if root is not None else pathlib.Path(__file__).resolve().parents[2]
    try:
        pins=json.loads((root/'toolchain.json').read_text())
        expected={'version':BB_VERSION,'sha256':BB_SHA}
        if pins.get('nativeProverPackage')!=BB_VERSION or pins.get('nativeProver',{}).get('linux-x64')!=expected:
            raise ValueError()
    except (OSError,ValueError,TypeError,AttributeError):
        raise Invalid('Active Linux prover qualification required') from None
    return expected

def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise Invalid("Invalid UTC deadline")
    try: return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError: raise Invalid("Invalid UTC deadline") from None

def receipt_url(value):
    if type(value) is not str or len(value)>4096 or any(ord(c)<33 or ord(c)>126 for c in value): raise ValueError('Invalid receipt capability')
    try:
        u=urllib.parse.urlsplit(value)
        if u.scheme!='https' or u.hostname!='anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com' or u.port not in (None,443) or u.username or u.password or u.fragment: raise ValueError()
        if not re.fullmatch(r'/receipts/[a-zA-Z0-9_-]{1,80}/[a-zA-Z0-9_-]{1,80}\.json',u.path): raise ValueError()
        q=urllib.parse.parse_qs(u.query,strict_parsing=True)
        required={'X-Amz-Algorithm','X-Amz-Credential','X-Amz-Date','X-Amz-Expires','X-Amz-SignedHeaders','X-Amz-Signature'}
        if not required<=set(q) or set(q)-required-{'X-Amz-Security-Token'} or any(len(v)!=1 for v in q.values()): raise ValueError()
        if q['X-Amz-Algorithm']!=['AWS4-HMAC-SHA256'] or q['X-Amz-SignedHeaders']!=['host'] or not re.fullmatch('[a-f0-9]{64}',q['X-Amz-Signature'][0]): raise ValueError()
        if not re.fullmatch('[0-9]{8}T[0-9]{6}Z',q['X-Amz-Date'][0]) or not re.fullmatch('[0-9]{1,6}',q['X-Amz-Expires'][0]) or not 1<=int(q['X-Amz-Expires'][0])<=28800: raise ValueError()
        if not re.fullmatch('[A-Z0-9]{16,128}/[0-9]{8}/eu-west-2/s3/aws4_request',q['X-Amz-Credential'][0]): raise ValueError()
    except Exception: raise ValueError('Invalid receipt capability') from None
    return value

def validate(config, now=None):
    keys = {"createdAt", "budgetStop", "commissioningStop", "runtimeUrl", "runtimeArchiveSha256", "manifestSha256"}
    if type(config) is not dict or not keys <= set(config) or set(config)-keys-{"receiptPutUrl"}: raise Invalid("Invalid bootstrap fields")
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
    if "receiptPutUrl" in config:
        try: receipt_url(config["receiptPutUrl"])
        except ValueError: raise Invalid("Invalid receipt capability") from None
    return dict(config)

# Executed only on the future Linux host, never while generating or testing.
HOST = r'''
import datetime as dt, fcntl, hashlib, ipaddress, json, os, pathlib, platform, re, shutil, signal, stat, subprocess, sys, tarfile, time, urllib.request, urllib.parse
BASE = pathlib.Path('/var/lib/rolling-bootstrap')
RELEASE = pathlib.Path('/opt/board-prover/releases') / ('rolling-'+PINS['manifest'][:16])
PRIVATE = pathlib.Path('/var/lib/rolling-bootstrap-private')
ADMIN_HASH_FILE = pathlib.Path('/var/lib/rolling-node/data/admin/api_key_hash')
def receipt_url(value):
    if type(value) is not str or len(value)>4096 or any(ord(c)<33 or ord(c)>126 for c in value): raise ValueError('Invalid receipt capability')
    try:
        u=urllib.parse.urlsplit(value)
        if u.scheme!='https' or u.hostname!='anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com' or u.port not in (None,443) or u.username or u.password or u.fragment: raise ValueError()
        if not re.fullmatch(r'/receipts/[a-zA-Z0-9_-]{1,80}/[a-zA-Z0-9_-]{1,80}\.json',u.path): raise ValueError()
        q=urllib.parse.parse_qs(u.query,strict_parsing=True)
        required={'X-Amz-Algorithm','X-Amz-Credential','X-Amz-Date','X-Amz-Expires','X-Amz-SignedHeaders','X-Amz-Signature'}
        if not required<=set(q) or set(q)-required-{'X-Amz-Security-Token'} or any(len(v)!=1 for v in q.values()): raise ValueError()
        if q['X-Amz-Algorithm']!=['AWS4-HMAC-SHA256'] or q['X-Amz-SignedHeaders']!=['host'] or not re.fullmatch('[a-f0-9]{64}',q['X-Amz-Signature'][0]): raise ValueError()
        if not re.fullmatch('[0-9]{8}T[0-9]{6}Z',q['X-Amz-Date'][0]) or not re.fullmatch('[0-9]{1,6}',q['X-Amz-Expires'][0]) or not 1<=int(q['X-Amz-Expires'][0])<=28800: raise ValueError()
        if not re.fullmatch('[A-Z0-9]{16,128}/[0-9]{8}/eu-west-2/s3/aws4_request',q['X-Amz-Credential'][0]): raise ValueError()
    except Exception: raise ValueError('Invalid receipt capability') from None
    return value

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
    pins=json.loads((target/'toolchain.json').read_text())
    if pins.get('nativeProverPackage')!=PINS['bbVersion'] or pins.get('nativeProver',{}).get('linux-x64')!={'version':PINS['bbVersion'],'sha256':PINS['bb']}: raise ValueError('Unqualified Linux prover')
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

def prepare_admin_key():
    # Trusted installer only. Never rotate an existing capability or node hash.
    keyfile=pathlib.Path(QUALIFICATION['adminKeyFile']);directory=keyfile.parent
    directory.mkdir(mode=0o700,exist_ok=True)
    info=directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid(): raise ValueError('Unsafe admin capability')
    prior=ADMIN_HASH_FILE
    if not keyfile.exists() and (prior.exists() or prior.is_symlink()): raise ValueError('Existing admin authority needs retained capability')
    try:
        fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    except FileExistsError: pass
    else:
        with os.fdopen(fd,'w') as f:
            f.write(os.urandom(32).hex());f.flush();os.fsync(f.fileno())
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    fd=os.open(keyfile,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd) as f:
        info=os.fstat(f.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.getuid() or info.st_size!=64: raise ValueError('Unsafe admin capability')
        key=f.read(65)
    if not re.fullmatch('[a-f0-9]{64}',key): raise ValueError('Unsafe admin capability')
    value=hashlib.sha256(key.encode()).hexdigest()
    if (prior.exists() or prior.is_symlink()) and (prior.is_symlink() or not prior.is_file() or prior.stat().st_size>65 or prior.read_text().strip()!=value): raise ValueError('Existing admin authority mismatch')
    return value

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
    ip=public_ip();admin_hash=prepare_admin_key()
    args=['/usr/bin/docker','run','--log-driver','none','--name','rolling-node','--platform','linux/amd64','--memory','24g','--memory-swap','24g','--pids-limit','512','--cap-drop','ALL','--security-opt','no-new-privileges',
          '-p','127.0.0.1:8082:8080','-p','127.0.0.1:8882:8880','-p','40400:40400/tcp','-p','40400:40400/udp',
          '-v','/var/lib/rolling-node/data:/var/lib/data','-v','/etc/rolling-node/network.json:/etc/aztec/network.json:ro',
          '-e','DATA_DIRECTORY=/var/lib/data','-e','NETWORK_CONFIG_LOCATION=/etc/aztec/network.json',
          '-e','ETHEREUM_HOSTS=https://sepolia.gateway.tenderly.co','-e','ETHEREUM_DEBUG_HOSTS=https://ethereum-sepolia-rpc.publicnode.com',
          '-e','L1_CONSENSUS_HOST_URLS=https://ethereum-sepolia-beacon-api.publicnode.com','-e','ETHEREUM_ALLOW_NO_DEBUG_HOSTS=false','-e','BLOB_ALLOW_EMPTY_SOURCES=false',
          '-e','PROVER_REAL_PROOFS=true','-e','SYNC_MODE=snapshot','-e','P2P_IP='+ip,'-e','P2P_PORT=40400','-e','AZTEC_PORT=8080','-e','AZTEC_ADMIN_PORT=8880','-e','AZTEC_ADMIN_API_KEY_HASH='+admin_hash,
          '--entrypoint','node',PINS['image'],'--no-warnings','/usr/src/yarn-project/aztec/dest/bin/index.js','start','--node','--network','testnet']
    # All arguments above are fixed or strict IPv4/digest; no shell is involved.
    unit='[Unit]\nDescription=Bounded private query fullnode\nRequires=docker.service rolling-egress.service\nAfter=docker.service rolling-egress.service\nRequiresMountsFor=/var/lib/rolling-node\n[Service]\nExecStartPre=/usr/bin/python3 /usr/local/lib/rolling-attest.py --check\nExecStart=/usr/bin/python3 '+str(RELEASE/'deploy/prover/bootstrap.py')+' --node-wrapper '+ ' '.join(args)+'\nExecStop=/usr/bin/docker stop -t 30 rolling-node\nRestart=no\nTimeoutStartSec=0\nTimeoutStopSec=45\nStandardOutput=null\nStandardError=null\n[Install]\nWantedBy=multi-user.target\n'
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

def read_bounded_json(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size>16384: raise ValueError('Invalid bounded record')
        with os.fdopen(fd,'rb',closefd=False) as f:
            data=f.read(16385)
        if len(data)>16384: raise ValueError('Invalid bounded record')
        value=json.loads(data)
        if type(value) is not dict: raise ValueError('Invalid bounded record')
        return value
    finally: os.close(fd)

def readiness_observation(value):
    if type(value) is not dict or type(value.get('attempts')) is not int or not 1<=value['attempts']<=10000: raise ValueError('Invalid readiness observation')
    if value.get('ready') is True and set(value)=={'attempts','ready','snapshot'}:
        return {'attempts':value['attempts'],'ready':True,'snapshot':readiness_projection(value['snapshot'])}
    if value.get('ready') is False and set(value)=={'attempts','ready','category'} and value.get('category') in ('CONFIG','IDENTITY','UNAVAILABLE','UNSYNCED','STALE','TIMEOUT','PROCESS_EXIT'):
        return {'attempts':value['attempts'],'ready':False,'category':value['category']}
    raise ValueError('Invalid readiness observation')

def startup_observation():
    try:
        helper=RELEASE/'deploy/prover/bootstrap.py'
        if digest(helper)!=PINS['startup']:raise ValueError()
        return json.loads(run(['/usr/bin/python3',str(helper),'--startup-observation'],timeout=3,capture=True))
    except Exception:return {'available':False}

def service_observations():
    # Only explicit State properties. Never inspect container config, Error,
    # command lines, environment, journal/log output, or exception messages.
    result={}
    enums={'LoadState':('loaded','not-found','error','masked'),
        'ActiveState':('active','inactive','failed','activating','deactivating','reloading'),
        'SubState':('running','exited','dead','failed','start','start-pre','start-post','stop','stop-sigterm','stop-sigkill','stop-post','auto-restart'),
        'Result':('success','exit-code','signal','core-dump','timeout','watchdog','oom-kill','resources','start-limit-hit','protocol')}
    numeric=('ExecMainCode','ExecMainStatus','NRestarts')
    for role,unit in [('node','rolling-node.service'),('qualification','rolling-qualification.service')]:
        try:
            raw=run(['systemctl','show',unit,'--property='+','.join((*enums,*numeric))],timeout=3,capture=True)
            if len(raw)>4096: raise ValueError()
            lines=raw.splitlines();values=dict(line.split('=',1) for line in lines)
            if len(lines)!=len(values) or set(values)!=set(enums)|set(numeric): raise ValueError()
            if any(values[k] not in allowed for k,allowed in enums.items()): raise ValueError()
            if any(not re.fullmatch('[0-9]{1,10}',values[k]) or int(values[k])>2**32-1 for k in numeric): raise ValueError()
            result[role]={'available':True,**{k:values[k] for k in enums},**{k:int(values[k]) for k in numeric}}
        except Exception: result[role]={'available':False}
    try:
        fmt='{"status":{{json .State.Status}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"oomKilled":{{json .State.OOMKilled}},"exitCode":{{json .State.ExitCode}}}'
        raw=run(['/usr/bin/docker','inspect','--format',fmt,'rolling-node'],timeout=3,capture=True)
        if len(raw)>1024: raise ValueError()
        v=json.loads(raw)
        if set(v)!={'status','running','restarting','oomKilled','exitCode'} or v['status'] not in ('created','running','paused','restarting','removing','exited','dead'): raise ValueError()
        if any(type(v[k]) is not bool for k in ('running','restarting','oomKilled')) or type(v['exitCode']) is not int or not 0<=v['exitCode']<=255: raise ValueError()
        result['container']={'available':True,**v}
    except Exception: result['container']={'available':False}
    return result

def upload_receipt(data):
    # Intent is outside the qualifier-writable tree. Once present, even an
    # absent/unknown outcome forbids a second request. No SDK retry machinery.
    if not (PRIVATE/'receipt-put.json').exists(): return
    intent=PRIVATE/'upload-intent.json'
    if intent.exists(): return
    capability=read_bounded_json(PRIVATE/'receipt-put.json')
    if set(capability)!={'url'}: raise ValueError('Invalid receipt capability')
    url=receipt_url(capability['url'])
    if type(data) is not bytes or len(data)>16384: raise ValueError('Receipt limit')
    exclusive_record(intent,{'schemaVersion':1,'receiptSha256':hashlib.sha256(data).hexdigest(),'attempts':1})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): raise ValueError('Redirect rejected')
    outcome={'schemaVersion':1,'receiptSha256':hashlib.sha256(data).hexdigest(),'status':'unknown'}
    try:
        # No ambient proxy/credentials/cookies and no redirect. Ignore the
        # response body entirely; even a hostile response cannot fill memory.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        request=urllib.request.Request(url,data=data,method='PUT',headers={'Content-Type':'application/json'})
        with opener.open(request,timeout=5) as response:
            if response.status in (200,204): outcome['status']='acknowledged'
            else: outcome['status']='rejected'
    except Exception: pass
    exclusive_record(PRIVATE/'upload-result.json',outcome)

def final_receipt():
    # Runs in a separate trusted root unit, never inside the qualifier's
    # loopback-only cgroup. Public receipt survives a lost/unknown upload.
    passed=False
    try:
        PRIVATE.mkdir(mode=0o700,parents=True,exist_ok=True)
        with open(PRIVATE/'receipt-lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            path=PRIVATE/'final-receipt.json'
            if path.exists():
                # Previously sealed bytes are immutable, not a new attempt.
                receipt=read_bounded_json(path)
                q=validated_qualification(receipt.get('qualification',{}))
                passed=q.get('passed') is True and q.get('stage')=='complete' and bool(q.get('checks')) and all(q['checks'].values()) and 'readiness' in q and 'anchors' in q
                return
            else:
                try: q=validated_qualification(read_bounded_json(BASE/'qualification/result.json'))
                except Exception: q=qualification_failure('interrupted-unknown')
                try: observation=readiness_observation(read_bounded_json(BASE/'qualification/readiness-observation.json'))
                except Exception: observation={'available':False}
                receipt={'schemaVersion':1,'manifestSha256':PINS['manifest'],'qualification':q,
                         'readinessObservation':observation,'services':service_observations(),'startup':startup_observation()}
                if type(PINS.get('bootstrap')) is str and re.fullmatch('[a-f0-9]{64}',PINS['bootstrap']): receipt['bootstrapSourceSha256']=PINS['bootstrap']
                exclusive_record(path,receipt)
            data=json.dumps(receipt,separators=(',',':')).encode()
            if len(data)>16384: raise ValueError('Receipt limit')
            q=receipt['qualification']
            passed=q.get('passed') is True and q.get('stage')=='complete' and bool(q.get('checks')) and all(q['checks'].values()) and 'readiness' in q and 'anchors' in q
            emit_diagnostic(b'ROLLING_QUALIFICATION_RECEIPT '+data+b'\n')
            upload_receipt(data)
    except Exception:
        # Disk/transport setup failure must still leave a bounded console attempt.
        # This diagnostic is explicitly not a durable qualification receipt.
        emit_diagnostic(b'ROLLING_QUALIFICATION_RECEIPT_ERROR {"schemaVersion":1,"category":"FINALIZATION_FAILED"}\n')
        raise
    finally:
        if not passed: run(['systemctl','start','--no-block','rolling-budget.service'],timeout=5)

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
        'rollup':scope['queryNode']['rollupAddress'],'serviceMode':'query-only','nodeProofs':'real','maxLagSeconds':120}
    result['release']=report.get('release',{}).get('manifestSha256')==PINS['manifest']
    result['noProofJobs']=type(report.get('proofJobs')) is int and report['proofJobs']==0
    lifecycle=checks.get('noProofLifecycle',{});expected={'passed':True,'proofEndpointsDisabled':True,'queueAllocated':False,'workerAllocated':False}
    result['noProofLifecycle']=type(lifecycle) is dict and set(lifecycle)==set(expected) and all(type(lifecycle[k]) is bool and lifecycle[k] is v for k,v in expected.items())
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
    return {'schemaVersion':1,'passed':False,'stage':stage,'scope':'current-network-query-only','manifestSha256':PINS['manifest']}

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
            readiness="import {createAztecNodeClient} from '@aztec-labs/stdlib/interfaces/client';import {jsonStringify} from '@aztec-labs/foundation/json-rpc';import {inspectTrustedNode} from '"+(RELEASE/'shared/trusted-private-node.mjs').as_uri()+"';try {const opts="+json.dumps(options)+";const node=createAztecNodeClient(opts.url,{maxBatchSize:1,fetch:async(host,body)=>{const r=await fetch(host,{method:'POST',headers:{'content-type':'application/json'},body:jsonStringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();let n=0;const c=[];for await(const b of r.body){n+=b.length;if(n>33554432)throw Error();c.push(b);}return {response:JSON.parse(Buffer.concat(c).toString('utf8')),headers:r.headers};}});process.stdout.write(JSON.stringify(await inspectTrustedNode(node,opts)));} catch(e) {const codes=['CONFIG','IDENTITY','UNAVAILABLE','UNSYNCED','STALE'];const category=codes.find(x=>e?.code==='BB_TRUSTED_NODE_'+x)||'UNAVAILABLE';process.stdout.write(JSON.stringify({ready:false,category}));}"
            attempts=0;ready=False;poll_deadline=min(deadline-900,epoch('createdAt')+90*60)
            while time.time()<poll_deadline:
                verify_controls();attempts+=1
                try:
                    raw=run([str(RELEASE/'node/bin/node'),'--input-type=module','--eval',readiness],timeout=min(60,max(1,poll_deadline-time.time())),capture=True,cwd=RELEASE)
                    if len(raw)>16384: raise ValueError('Readiness output limit')
                    observed=json.loads(raw)
                    if observed.get('ready') is False:
                        observation=readiness_observation({'attempts':attempts,**observed})
                        write(directory/'readiness-observation.json',json.dumps(observation))
                    else:
                        snapshot=readiness_projection(observed)
                        write(directory/'readiness-observation.json',json.dumps({'attempts':attempts,'ready':True,'snapshot':snapshot}))
                        ready=True;break
                except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as error:
                    write(directory/'readiness-observation.json',json.dumps({'attempts':attempts,'ready':False,'category':'TIMEOUT' if type(error) is subprocess.TimeoutExpired else 'PROCESS_EXIT'}))
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
                    'scope':'current-network-query-only','manifestSha256':PINS['manifest'],'reportSha256':digest(output),'checks':checks,'readiness':snapshot}
            if checks['healthy'] and checks['recovered']: result['anchors']=qualification_anchors(report['checks'])
            # Preserve the actual bounded report durably before acknowledging result.
            with open(output,'rb') as f: os.fsync(f.fileno())
        except Exception: result=qualification_failure(stage+'-failed')
        exclusive_record(result_path,result)

def install_qualification():
    unit='[Unit]\nDescription=One bounded Linux query qualification\nRequires=rolling-node.service rolling-egress.service\nAfter=rolling-node.service rolling-egress.service\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /usr/local/lib/rolling-attest.py --qualify\nExecStopPost=/usr/bin/python3 /usr/local/lib/rolling-attest.py --qualification-stop\nTimeoutStartSec=6300\nTimeoutStopSec=45\nKillMode=control-group\nRestart=no\nUMask=0077\nEnvironment=LOG_LEVEL=silent\nUnsetEnvironment=NODE_PATH NODE_OPTIONS BB\nPrivateTmp=yes\nPrivateDevices=yes\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nProtectSystem=strict\nProtectHome=yes\nReadWritePaths=/var/lib/rolling-bootstrap\nReadOnlyPaths=/var/lib/rolling-admin/qualification-key\nInaccessiblePaths=-/var/lib/rolling-bootstrap-private -/var/lib/cloud\nIPAddressDeny=any\nIPAddressAllow=localhost\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK\nStandardOutput=null\nStandardError=null\n[Install]\nWantedBy=multi-user.target\n'
    write('/etc/systemd/system/rolling-qualification.service',unit,0o644)
    write('/etc/systemd/system/rolling-qualification-receipt.service','[Unit]\nDescription=Trusted bounded final receipt publisher\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /usr/local/lib/rolling-attest.py --qualification-receipt\nTimeoutStartSec=35\nTimeoutStopSec=3\nRestart=no\nUMask=0077\nStandardOutput=null\nStandardError=null\n',0o644)
    run(['systemctl','daemon-reload']);run(['systemctl','enable','rolling-qualification.service'])
    run(['systemctl','start','--no-block','rolling-qualification.service'])

def validated_qualification(q):
    allowed={'schemaVersion','passed','stage','scope','manifestSha256','reportSha256','checks','readiness','anchors'}
    if type(q.get('schemaVersion')) is not int or q['schemaVersion']!=1 or type(q.get('passed')) is not bool or set(q)-allowed or q.get('manifestSha256')!=PINS['manifest'] or q.get('scope')!='current-network-query-only': raise ValueError('Bad result')
    if q.get('stage') not in ('complete','qualification-failed','readiness-failed','qualifier-failed','interrupted-unknown'): raise ValueError('Bad stage')
    if 'checks' in q and (set(q['checks'])!=set(qualification_projection({})) or any(type(v) is not bool for v in q['checks'].values())): raise ValueError('Bad checks')
    if 'reportSha256' in q and not re.fullmatch('[a-f0-9]{64}',q['reportSha256']): raise ValueError('Bad hash')
    if 'readiness' in q: q['readiness']=readiness_projection(q['readiness'])
    if 'anchors' in q: q['anchors']=qualification_anchors(q['anchors'])
    return q

def attest(check=False):
    good=False;count=0
    try: count=verify_controls();good=True
    except Exception: pass
    if check:
        if not good or digest(RELEASE/'deploy/prover/bootstrap.py')!=PINS['startup']: raise ValueError('Control verification failed')
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
            q=validated_qualification(read_bounded_json(result_path))
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
            if 'receiptPutUrl' in config: write(PRIVATE/'receipt-put.json',json.dumps({'url':receipt_url(config['receiptPutUrl'])}))
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
            if run([bb,'--version'],capture=True).strip()!=PINS['bbVersion']: raise ValueError('Wrong BB')
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



# Dedicated records from the exact pinned process with an explicit configuration-provider adapter; not adversarial attestation.
STARTUP_HELPER_SHA = 'f10d47fa2f26f50197bb36c44c75f2d34b41a2e5726caed26c935e42f2c69d15'
# Entire relative-import closure. SDK imports intentionally resolve in the image.
STARTUP_SOURCES = {
    'deploy/prover/startup-stages.mjs': STARTUP_HELPER_SHA,
    'prover/compact-node-transform.mjs': 'd7e7e95a1061342e7aaa301e826fbf4bd21cfb9ea2de605e2a2aa17452160545',
    'prover/compact-node-registration.mjs': '07316d9a6629dff67fbb8d033360a45b9a1492febdd18520e6ffe6c1023c546c',
    'prover/compact-block-native.mjs': '5040454029af8c78bac67dc9961e80bf4918ce2ee000277000a4fdd32fb64f07',
    'shared/trusted-private-node.mjs': '50fa3642a777cb2eca66e595d72a6e639781cc7d0fc2deb4d1903c0a2a0d81d5',
}
STARTUP_ADAPTER = 'publicnode-config-v1'
DIAGNOSTIC_PHASES = ('registry-guard', 'rollup-compatibility', 'l1-config', 'genesis-compare', 'telemetry', 'factory', 'factory-bb', 'factory-kzg', 'factory-keystore', 'factory-addresses', 'factory-l1-constants', 'factory-blob', 'factory-snapshot', 'factory-epoch-cache', 'factory-world-state', 'factory-avm', 'factory-archiver', 'factory-world-state-sync', 'factory-verifiers', 'factory-fee-provider', 'factory-p2p', 'factory-start', 'public-rpc-bind', 'admin-auth', 'admin-rpc-bind', 'archiver-store', 'archiver-protocol-register', 'archiver-constants', 'archiver-start-header', 'archiver-start', 'archiver-blob-test', 'archiver-clock-test', 'archiver-trace-test', 'archiver-history-test', 'archiver-initial-sync')

def stage_directory(base):
    directory=base/'startup-stages'
    info=directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid():raise ValueError('Invalid stage directory')
    return directory

def startup_sources(root=None):
    """Capture exact regular public bytes before any destination or evidence write."""
    root=(pathlib.Path(root) if root is not None else pathlib.Path(__file__).resolve().parents[2]).resolve()
    captured={}
    for rel,expected in STARTUP_SOURCES.items():
        path=root/rel
        if path.resolve()!=path or any(not stat.S_ISDIR(parent.lstat().st_mode) for parent in path.parents if parent!=root and root in parent.parents):
            raise ValueError('Invalid helper source path')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            info=os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=1048576:raise ValueError('Invalid helper source file')
            with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(1048577)
            if len(raw)!=info.st_size or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('Invalid helper source hash')
            captured[rel]=raw
        finally:os.close(fd)
    return captured

def instrument_node_args(args,base):
    captured=startup_sources() # complete closure is checked before creating either directory
    i=args.index(IMAGE)
    directory=base/'startup-stages';directory.mkdir(mode=0o700) # exclusive, retain failures/prior evidence
    stage_directory(base)
    code=base/'startup-code';code.mkdir(mode=0o700)
    for rel,raw in captured.items():
        destination=code/rel;destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            with os.fdopen(fd,'wb',closefd=False) as stream:stream.write(raw);stream.flush();os.fsync(fd)
        finally:os.close(fd)
    for path in sorted([code,*[p for p in code.rglob('*') if p.is_dir()]],key=lambda p:len(p.parts),reverse=True)+[base]:
        fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
    # No mounted node_modules: this exact local closure shares the image SDK classes.
    return args[:i]+['-v',str(code)+':/usr/src/yarn-project/rolling:ro','-v',str(directory)+':/rolling-startup']+args[i:i+1]+['--import','/usr/src/yarn-project/rolling/deploy/prover/startup-stages.mjs']+args[i+1:]

def validate_archiver_progress(p):
    counters=('passesStarted','passesCompleted','passesFailed','lastObservationMs','lastProgressMs','droppedObservations')
    heights=('localL1Block','observedHeadL1Block','lastCheckpoint')
    if type(p) is not dict or set(p)!=set(counters+heights+('inFlight','error')):raise ValueError()
    def uint(n):return type(n) is int and 0<=n<=4294967295
    if any(not uint(p[k]) for k in counters) or any(p[k] is not None and not uint(p[k]) for k in heights):raise ValueError()
    if type(p['inFlight']) is not bool or p['passesCompleted']+p['passesFailed']+int(p['inFlight'])!=p['passesStarted'] or p['lastProgressMs']>p['lastObservationMs']:raise ValueError()
    e=p['error']
    if e is not None:
        if type(e) is not dict or set(e)!={'category','httpStatus','rpcCode'} or e['category'] not in ('http','rpc','blob','old-block','unknown'):raise ValueError()
        if e['httpStatus'] is not None and (type(e['httpStatus']) is not int or not 100<=e['httpStatus']<=599):raise ValueError()
        if e['rpcCode'] is not None and (type(e['rpcCode']) is not int or not -(2**31)<=e['rpcCode']<2**31):raise ValueError()
    return p

def stage_observation(base):
    try:
        directory=stage_directory(base)
        for name in ('.stages.failed','.stages.tmp'):
            try:(directory/name).lstat()
            except FileNotFoundError:continue
            raise ValueError()
        fd=os.open(directory/'stages.json',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            info=os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.getuid() or info.st_size>8192:raise ValueError()
            with os.fdopen(fd,'rb',closefd=False) as f:data=f.read(8193)
            if len(data)>8192:raise ValueError()
            v=json.loads(data)
        finally:os.close(fd)
        if type(v) is not dict or set(v)!={'schemaVersion','instrumented','runtimeAdapter','helperSha256','history','archiver'} or type(v['schemaVersion']) is not int or v['schemaVersion']!=2 or v['instrumented'] is not True or v['runtimeAdapter']!=STARTUP_ADAPTER or v['helperSha256']!=STARTUP_HELPER_SHA:raise ValueError()
        validate_archiver_progress(v['archiver'])
        if type(v['history']) is not list or len(v['history'])>2*len(DIAGNOSTIC_PHASES):raise ValueError()
        stack=[];started=set()
        for pair in v['history']:
            if type(pair) is not list or len(pair)!=2 or pair[0] not in DIAGNOSTIC_PHASES or pair[1] not in ('begin','complete'):raise ValueError()
            phase,state=pair
            if state=='begin':
                if phase in started:raise ValueError()
                started.add(phase);stack.append(phase)
            elif not stack or stack.pop()!=phase:raise ValueError()
        return {'available':True,**v}
    except Exception:return {'available':False}

NODE_STAGES=('process-spawned','crs','genesis','rollup-standby','node-construction','public-rpc','admin-rpc')
NODE_ERRORS=('native-load','module-load','permission','disk-full','memory','fetch','unknown')

def node_startup_observation(base):
    try:
        v=private_file(base/'node-startup.json')
        if set(v)-{'cleanup'}!={'schemaVersion','stages','errors','oversizedLines','complete','exitCode','signal'} or type(v['schemaVersion']) is not int or v['schemaVersion']!=1 or type(v['complete']) is not bool: raise ValueError()
        if 'cleanup' in v and (type(v['cleanup']) is not dict or set(v['cleanup'])!={'attempted','reaped','terminateSent','killSent','failed'} or any(type(x) is not bool for x in v['cleanup'].values())):raise ValueError()
        for key,allowed in [('stages',NODE_STAGES),('errors',NODE_ERRORS)]:
            if type(v[key]) is not list or len(v[key])>len(allowed) or any(type(x) is not str or x not in allowed for x in v[key]) or len(set(v[key]))!=len(v[key]): raise ValueError()
        if type(v['oversizedLines']) is not int or not 0<=v['oversizedLines']<=2**32-1: raise ValueError()
        for key,limit in [('exitCode',255),('signal',64)]:
            if v[key] is not None and (type(v[key]) is not int or not 0<=v[key]<=limit): raise ValueError()
        if v['signal']==0:raise ValueError()
        if v['complete']!=(sum(v[k] is not None for k in ('exitCode','signal'))==1) or (not v['complete'] and (v['exitCode'] is not None or v['signal'] is not None)): raise ValueError()
        return {'available':True,**v,'instrumentation':stage_observation(base)}
    except Exception:return {'available':False}

class NodeOutput:
    def __init__(self):
        self.pending=b'';self.dropping=False
        self.value={'schemaVersion':1,'stages':[],'errors':[],'oversizedLines':0,'complete':False,'exitCode':None,'signal':None}
    def line(self,line):
        # Matches are never copied. These are observed log signatures, not health.
        for prefix,stage in [(b'Downloading CRS of size ','crs'),(b'Downloading Grumpkin CRS of size ','crs'),(b'Using cached ','crs'),(b'Genesis archive root: ','genesis')]:
            if line.startswith(prefix) and stage not in self.value['stages']:self.value['stages'].append(stage)
        for phrase,stage in [(b'Entering standby mode.','rollup-standby'),(b'Aztec Node version: ','node-construction'),(b'Aztec Server listening on port ','public-rpc'),(b'Aztec Server admin API listening on port ','admin-rpc')]:
            if phrase in line and stage not in self.value['stages']:self.value['stages'].append(stage)
        for token,category in [(b'ERR_DLOPEN_FAILED','native-load'),(b'ERR_MODULE_NOT_FOUND','module-load'),(b'EACCES','permission'),(b'ENOSPC','disk-full'),(b'ENOMEM','memory'),(b'fetch failed','fetch')]:
            if token in line and category not in self.value['errors']:self.value['errors'].append(category)
    def feed(self,chunk):
        # Caller reads <=4096 bytes. An oversized line is discarded in full.
        if len(chunk)>4096:raise ValueError('Chunk bound')
        parts=chunk.split(b'\n')
        for i,part in enumerate(parts):
            if not self.dropping:
                if len(self.pending)+len(part)>8192:
                    self.pending=b'';self.dropping=True;self.value['oversizedLines']=min(2**32-1,self.value['oversizedLines']+1)
                else:self.pending+=part
            if i<len(parts)-1:
                if not self.dropping:self.line(self.pending)
                self.pending=b'';self.dropping=False
    def finish(self,code):
        if not self.dropping:self.line(self.pending)
        self.pending=b''
        if code and not self.value['errors']:self.value['errors'].append('unknown')
        self.value.update(complete=True,exitCode=code if code>=0 else None,signal=-code if code<0 else None)

def reap_failed_node(process):
    # One TERM, then one KILL on timeout. systemd retains the outer cgroup limit.
    result={'attempted':process is not None,'reaped':False,'terminateSent':False,'killSent':False,'failed':False};code=None
    if process is None:return result,code
    try:
        if process.poll() is None:
            try:process.terminate();result['terminateSent']=True
            except ProcessLookupError:pass
            except Exception:result['failed']=True
        try:code=process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:process.kill();result['killSent']=True
            except ProcessLookupError:pass
            code=process.wait(timeout=2)
        result['reaped']=True
    except Exception:result['failed']=True
    return result,code

def node_wrapper(args,base):
    # Fixed generated systemd argv; never network/caller-selected commands.
    if args[:2]!=['/usr/bin/docker','run'] or args[-1]!='testnet' or IMAGE not in args:raise ValueError('Node command')
    output=NodeOutput();saved=None;process=None;requested=None
    def persist():
        nonlocal saved
        value=json.dumps(output.value,separators=(',',':'))
        if value!=saved:
            target=base/'node-startup.json';fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'w') as f:f.write(value);f.flush();os.fsync(f.fileno())
            fd=os.open(base,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(fd)
            finally:os.close(fd)
            saved=value
    def stop(number,frame):
        nonlocal requested
        requested=number
        if process is not None:
            try:process.send_signal(number)
            except ProcessLookupError:pass
    original_failure=None
    previous={n:signal.signal(n,stop) for n in (signal.SIGTERM,signal.SIGINT)}
    try:
        persist()
        if requested is not None:output.finish(-requested);persist();return -requested
        args=instrument_node_args(args,base)
        process=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0)
        output.value['stages'].append('process-spawned');persist()
        if requested is not None:stop(requested,None)
        while True:
            chunk=process.stdout.read(4096)
            if not chunk:break
            before=(len(output.value['stages']),len(output.value['errors']))
            output.feed(chunk)
            if before!=(len(output.value['stages']),len(output.value['errors'])):persist()
        code=process.wait();output.finish(code);persist();return code
    except BaseException as error:
        original_failure=error
        cleanup,code=reap_failed_node(process);output.value['cleanup']=cleanup
        if code is not None:output.finish(code)
        try:persist()
        except Exception:pass # Failed storage cannot replace the original failure.
        try:error.node_cleanup=dict(cleanup)
        except Exception:pass
        raise
    finally:
        try:
            if process is not None:process.stdout.close()
        except Exception:
            if original_failure is None:raise
        finally:
            for n,handler in previous.items():signal.signal(n,handler)


def generate(config, now=None):
    config = validate(config, now)
    require_linux_qualification()
    # Remove comments only to stay within AWS's 16KiB compressed user-data cap.
    # Tokenization preserves every string, executable token and line boundary.
    runtime=tokenize.untokenize(t._replace(string='') if t.type==tokenize.COMMENT else t for t in tokenize.generate_tokens(io.StringIO(HOST).readline))
    pins = {'image':IMAGE, 'manifest':config['manifestSha256'], 'node':NODE_SHA, 'bb':BB_SHA, 'bbVersion':BB_VERSION, 'catalog':CATALOG_SHA, 'bootstrap':hashlib.sha256(runtime.encode()).hexdigest(),'startup':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
    prefix = 'PINS = '+repr(pins)+'\nNETWORK = '+repr(NETWORK)+'\nQUALIFICATION = '+repr(QUALIFICATION)+'\n'
    dispatch = "\ntry:\n    if '--qualify' in sys.argv: qualify()\n    elif '--qualification-stop' in sys.argv:\n        qualify(aborted=True);run(['systemctl','start','rolling-qualification-receipt.service'],timeout=40)\n    elif '--qualification-receipt' in sys.argv: final_receipt()\n    else: attest('--check' in sys.argv)\nexcept Exception as error:\n    shutdown_failure(error)\n"
    program = 'SOURCE = '+repr(prefix+runtime)+'\nCONFIG = '+repr(config)+'\nATTESTATION = SOURCE + '+repr(dispatch)+'\nexec(SOURCE)\nexecute(CONFIG, ATTESTATION)\n'
    encoded = base64.b64encode(lzma.compress(program.encode(),format=lzma.FORMAT_ALONE,
        filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'pb':0}])).decode()
    return "#!/bin/sh\nset -eu\numask 077\nexec /usr/bin/python3 - <<'B'\nimport base64,lzma\nexec(lzma.decompress(base64.b64decode('"+encoded+"')))\nB\n"


# This closed diagnostic does not qualify normal deployment or run node/proof work.
NATIVE_BYTES = 44698432
NATIVE_REUSE = ('receipt_url','diagnostic','emit_diagnostic','mark','version_facts','run','write','digest',
                'immutable_deadline','install_controls','class_bytes','verify_controls','exclusive_record',
                'read_bounded_json','upload_receipt')
NATIVE_GLOBALS = ('BASE','PRIVATE','STAGE','DIAGNOSTICS_ACTIVE','STEP','STEPS')

def native_control_source():
    # Explicit AST membership, in original order. No text-pattern extraction or
    # inferred dependency traversal. The generated program binds the full bytes.
    selected=[];found=[]
    for node in ast.parse(HOST).body:
        if isinstance(node,(ast.Import,ast.ImportFrom)):
            selected.append(ast.get_source_segment(HOST,node))
        elif isinstance(node,ast.FunctionDef) and node.name in NATIVE_REUSE:
            found.append(node.name);selected.append(ast.get_source_segment(HOST,node))
        elif isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in NATIVE_GLOBALS:
            found.append(node.targets[0].id);selected.append(ast.get_source_segment(HOST,node))
    if len(found)!=len(set(found)) or set(found)!=set(NATIVE_REUSE+NATIVE_GLOBALS):raise Invalid('Native control closure changed')
    return '\n\n'.join(selected)+'\n'

def native_binary_url(value):
    # Same scoped S3 capability grammar, but a single immutable public-binary key.
    if type(value) is not str:raise Invalid('Invalid binary capability')
    try:
        u=urllib.parse.urlsplit(value)
        expected='/releases/native-bb-'+BB_SHA+'/bb'
        if u.path!=expected:raise ValueError()
        receipt_url(urllib.parse.urlunsplit((u.scheme,u.netloc,'/receipts/native/binary.json',u.query,u.fragment)))
    except Exception:raise Invalid('Invalid binary capability') from None
    return value

def validate_native(config,now=None):
    keys={'mode','createdAt','budgetStop','commissioningStop','binaryUrl','binarySha256','binaryBytes','expectedVersion','receiptPutUrl'}
    if type(config) is not dict or set(config)!=keys:raise Invalid('Invalid native diagnostic fields')
    if config['mode']!='native-version-only' or type(config['binarySha256']) is not str or config['binarySha256']!=BB_SHA or type(config['binaryBytes']) is not int or config['binaryBytes']!=NATIVE_BYTES or type(config['expectedVersion']) is not str or config['expectedVersion']!=BB_VERSION:raise Invalid('Invalid native diagnostic pins')
    created,stop,commission=(timestamp(config[k]) for k in ('createdAt','budgetStop','commissioningStop'))
    now=now or dt.datetime.now(dt.timezone.utc)
    if not now-dt.timedelta(minutes=5)<=created<=now+dt.timedelta(minutes=5) or stop!=created+dt.timedelta(minutes=45) or commission!=created+dt.timedelta(minutes=30):raise Invalid('Invalid native diagnostic deadlines')
    native_binary_url(config['binaryUrl']);receipt_url(config['receiptPutUrl'])
    return dict(config)

NATIVE_CAPTURE = r'''
import hashlib, json, os, pathlib, selectors, signal, subprocess, time

def bounded_capture(args,seconds,limit=8192):
    # Fixed callers only. Stream, hash and discard bytes past the cap; no native
    # output or exception text enters evidence. Wall bound includes full pipes.
    captures={k:{'bytes':0,'sha256':hashlib.sha256(),'data':bytearray()} for k in ('stdout','stderr')}
    child=None;timed=False;reaped=False;code=None
    try:
        child=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            start_new_session=True,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})
        with selectors.DefaultSelector() as selector:
            for key,pipe in (('stdout',child.stdout),('stderr',child.stderr)):
                os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,key)
            deadline=time.monotonic()+seconds
            while selector.get_map():
                if time.monotonic()>=deadline:timed=True;break
                for key,_ in selector.select(min(.05,max(0,deadline-time.monotonic()))):
                    data=os.read(key.fileobj.fileno(),4096)
                    if not data:selector.unregister(key.fileobj);continue
                    row=captures[key.data];row['bytes']+=len(data);row['sha256'].update(data)
                    if len(row['data'])<limit:row['data'].extend(data[:limit-len(row['data'])])
            if not timed:
                try:code=child.wait(timeout=max(.001,deadline-time.monotonic()));reaped=True
                except subprocess.TimeoutExpired:timed=True
    finally:
        if child is not None:
            if child.poll() is None or timed:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
            try:code=child.wait(timeout=2);reaped=True
            except subprocess.TimeoutExpired:pass
            for pipe in (child.stdout,child.stderr):
                if pipe is not None:pipe.close()
    summary={'started':child is not None,'timeout':timed,'reaped':reaped,'returnCode':code}
    for key,row in captures.items():summary[key]={'bytes':row['bytes'],'sha256':row['sha256'].hexdigest(),'truncated':row['bytes']>limit}
    return summary,{k:bytes(v['data']) for k,v in captures.items()}

def native_worker():
    output=pathlib.Path('/var/lib/rolling-native-version/result.json')
    # StateDirectory is disposable, but an acknowledged intent is never replayed.
    with open(output.parent/'intent.json','x') as file:
        file.write('{"schemaVersion":1,"attempts":1}');file.flush();os.fsync(file.fileno())
    directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)
    result,raw=bounded_capture(['/opt/rolling-native-version/bb','--version'],15)
    result.update(schemaVersion=1,versionMatches=raw['stdout'].strip()==EXPECTED_VERSION.encode() and not result['stdout']['truncated'])
    with open(output,'x') as file:
        file.write(json.dumps(result,separators=(',',':')));file.flush();os.fsync(file.fileno())
    directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)
'''

NATIVE_HOST = r'''
NATIVE_UNIT='rolling-native-version.service'
NATIVE_ROOT=pathlib.Path('/opt/rolling-native-version')

CPU_FLAGS=('sse4_2','avx','avx2','avx512f','bmi2','adx')

def native_read(path,limit):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):raise ValueError('Guest file type')
        with os.fdopen(fd,'rb',closefd=False) as file:data=file.read(limit+1)
        if len(data)>limit:raise ValueError('Guest file limit')
        return data
    finally:os.close(fd)

def native_cpu(data):
    if type(data) is not bytes or len(data)>65536:raise ValueError('CPU limit')
    processors=[];flags=[];vendors=[]
    for block in data.decode('ascii').strip().split('\n\n'):
        fields={}
        for line in block.splitlines():
            key,separator,value=line.partition(':');key=key.strip()
            if key not in ('processor','vendor_id','flags'):continue
            if not separator or key in fields:raise ValueError('CPU fields')
            fields[key]=value.strip()
        if set(fields)!={'processor','vendor_id','flags'} or not re.fullmatch('[0-9]{1,4}',fields['processor']) or int(fields['processor'])>1023:raise ValueError('CPU record')
        index=int(fields['processor'])
        if index in processors or len(processors)>=8:raise ValueError('CPU count')
        tokens=fields['flags'].split()
        if not 1<=len(tokens)<=256 or any(not re.fullmatch('[a-z0-9_]{1,32}',value) for value in tokens):raise ValueError('CPU flags')
        processors.append(index);flags.append(set(tokens));vendors.append({'AuthenticAMD':'amd','GenuineIntel':'intel'}.get(fields['vendor_id'],'other'))
    if not processors:raise ValueError('CPU missing')
    common=set.intersection(*flags)
    return {'status':'observed','processors':len(processors),'vendor':vendors[0] if len(set(vendors))==1 else 'mixed','flags':{flag:flag in common for flag in CPU_FLAGS}}

def native_os(data):
    if type(data) is not bytes or len(data)>4096:raise ValueError('OS limit')
    fields={}
    for line in data.decode('utf-8').splitlines():
        key,separator,value=line.partition('=')
        if key not in ('ID','VERSION_ID'):continue
        if not separator or key in fields:raise ValueError('OS fields')
        fields[key]=value
    if set(fields)!={'ID','VERSION_ID'}:raise ValueError('OS missing')
    return {'status':'observed','ubuntu2404':fields['ID'] in ('ubuntu','"ubuntu"') and fields['VERSION_ID'] in ('24.04','"24.04"')}

def native_loader():
    # Fixed Ubuntu ELF interpreter path; following its trusted system symlink is
    # intentional. Never serialize its target or load a caller-selected library.
    path=pathlib.Path('/lib64/ld-linux-x86-64.so.2')
    return path.is_file() and os.access(path,os.X_OK)

def native_guest():
    facts={'status':'failed','architecture':'unavailable','libc':{'status':'transport-error'},'loaderAvailable':False,'os':{'status':'unavailable'},'cpu':{'status':'unavailable'}}
    try:facts['architecture']='x86_64' if platform.machine()=='x86_64' else 'other'
    except Exception:pass
    try:
        capture,raw=bounded_capture(['/usr/bin/getconf','GNU_LIBC_VERSION'],3,256)
        if not capture['timeout'] and capture['returnCode']==0 and capture['reaped']:
            match=None if capture['stdout']['truncated'] else re.fullmatch(rb'glibc ([0-9]{1,3})\.([0-9]{1,3})\n?',raw['stdout'])
            facts['libc']={'status':'observed','major':int(match[1]),'minor':int(match[2])} if match else {'status':'projection-error'}
    except Exception:pass
    try:facts['loaderAvailable']=bool(native_loader())
    except Exception:pass
    for name,path,limit,parser in [('cpu','/proc/cpuinfo',65536,native_cpu),('os','/usr/lib/os-release',4096,native_os)]:
        try:data=native_read(path,limit)
        except Exception:continue
        try:facts[name]=parser(data)
        except Exception:facts[name]={'status':'projection-error'}
    libc=facts['libc'];cpu=facts['cpu'];os_facts=facts['os']
    if facts['architecture']=='x86_64' and libc['status']=='observed' and (libc['major'],libc['minor'])>=(2,34) and facts['loaderAvailable'] and os_facts.get('ubuntu2404') is True and cpu.get('processors')==2 and cpu.get('vendor')=='amd':facts['status']='passed'
    return facts

def native_fetch(url,path):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):raise ValueError('Redirect rejected')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    deadline=time.monotonic()+60;total=0;sha=hashlib.sha256()
    # This is a public binary, but the source capability remains root-only.
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as file:
        with opener.open(urllib.request.Request(url,method='GET'),timeout=5) as response:
            if response.status!=200:raise ValueError('Binary transport')
            while True:
                if time.monotonic()>=deadline:raise TimeoutError('Binary deadline')
                block=response.read1(min(65536,BINARY_BYTES-total+1))
                if not block:break
                total+=len(block)
                if total>BINARY_BYTES:raise ValueError('Binary size')
                sha.update(block);file.write(block)
        if total!=BINARY_BYTES or sha.hexdigest()!=PINS['bb']:raise ValueError('Binary integrity')
        file.flush();os.fsync(file.fileno());os.fchmod(file.fileno(),0o555)
    directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)

def native_state():
    try:
        capture,raw=bounded_capture(['systemctl','show',NATIVE_UNIT,'--property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestampMonotonic'],3,4096)
    except Exception:return {'status':'transport-error'}
    if capture['timeout'] or capture['returnCode']!=0 or not capture['reaped']:return {'status':'transport-error'}
    try:
        if capture['stdout']['truncated']:raise ValueError()
        fields={}
        for line in raw['stdout'].decode('ascii').splitlines():
            key,value=line.split('=',1)
            if key in fields:raise ValueError()
            fields[key]=value
        if set(fields)!={'ActiveState','SubState','Result','ExecMainCode','ExecMainStatus','ExecMainStartTimestampMonotonic'}:raise ValueError()
        allowed={'ActiveState':('active','inactive','failed','activating','deactivating'),
                 'SubState':('running','dead','failed','start','stop','stop-sigterm','stop-sigkill','exited'),
                 'Result':('success','exit-code','signal','core-dump','timeout','oom-kill','resources','start-limit-hit','protocol')}
        if any(fields[key] not in values for key,values in allowed.items()):raise ValueError()
        nums={}
        for key,maximum in [('ExecMainCode',6),('ExecMainStatus',255),('ExecMainStartTimestampMonotonic',2**63-1)]:
            if not re.fullmatch('[0-9]{1,19}',fields[key]) or int(fields[key])>maximum:raise ValueError()
            nums[key]=int(fields[key])
        return {'status':'observed',**{k:fields[k] for k in allowed},**nums}
    except Exception:return {'status':'projection-error'}

def native_result(value):
    expected={'schemaVersion','started','timeout','reaped','returnCode','stdout','stderr','versionMatches'}
    if type(value) is not dict or set(value)!=expected or type(value['schemaVersion']) is not int or value['schemaVersion']!=1:raise ValueError('Invalid version result')
    if any(type(value[k]) is not bool for k in ('started','timeout','reaped','versionMatches')):raise ValueError('Invalid version flags')
    if value['returnCode'] is not None and (type(value['returnCode']) is not int or not -255<=value['returnCode']<=255):raise ValueError('Invalid version status')
    for key in ('stdout','stderr'):
        row=value[key]
        if type(row) is not dict or set(row)!={'bytes','sha256','truncated'} or type(row['bytes']) is not int or not 0<=row['bytes']<=2**53-1 or type(row['sha256']) is not str or not re.fullmatch('[a-f0-9]{64}',row['sha256']) or type(row['truncated']) is not bool or row['truncated']!=(row['bytes']>8192):raise ValueError('Invalid output projection')
    return json.loads(json.dumps(value))

def native_classify(state,result):
    if state['status']!='observed':return 'state-unreadable'
    if state['Result']=='oom-kill':return 'oom'
    if state['Result']=='timeout' or result and result['timeout']:return 'timeout'
    if state['Result'] in ('signal','core-dump') or result and result['returnCode'] is not None and result['returnCode']<0:return 'signal'
    if state['Result']=='exit-code' or result and result['returnCode'] not in (None,0):return 'nonzero'
    if state['ActiveState']=='active':return 'started'
    if result and result['started'] and result['reaped'] and result['returnCode']==0 and result['versionMatches'] and not result['stdout']['truncated'] and not result['stderr']['truncated'] and state['Result']=='success' and state['ActiveState']=='inactive' and state['ExecMainCode']==1 and state['ExecMainStatus']==0 and state['ExecMainStartTimestampMonotonic']>0:return 'passed'
    return 'unqualified'

def native_shutdown():
    try:run(['systemctl','start','rolling-budget.service'],timeout=5)
    except Exception:
        try:run(['/usr/sbin/poweroff'],timeout=5)
        except Exception:pass

def native_execute(config,worker):
    receipt={'schemaVersion':1,'mode':'native-version-only','passed':False,'nodeStartupQualified':False,'proofJobs':0,
             'binarySha256':PINS['bb'],'binaryBytes':BINARY_BYTES,'expectedVersion':PINS['bbVersion'],
             'controlSourceSha256':PINS['bootstrap'],'workerSha256':hashlib.sha256(worker.encode()).hexdigest(),
             'budgetStop':config['budgetStop'],'commissioningStop':config['commissioningStop'],
             'stage':'host-preflight','state':{'status':'not-observed'},'resultStatus':'not-observed','guestPreflight':{'status':'not-observed'}}
    lock=None
    try:
        if platform.system()!='Linux' or platform.machine()!='x86_64' or os.geteuid()!=0:raise ValueError('Native host required')
        BASE.mkdir(mode=0o700,parents=True,exist_ok=True);PRIVATE.mkdir(mode=0o700,parents=True,exist_ok=True)
        lock=open(BASE/'native-writer.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # Existing controls use these names as immutable artifact identities; in
        # this closed mode they mean binary and control-source, not an archive.
        controls={**config,'runtimeArchiveSha256':PINS['bb'],'manifestSha256':PINS['bootstrap']}
        receipt['stage']='controls';install_controls(controls)
        for timer in ('budget','commissioning'):run(['systemctl','is-active','--quiet','rolling-'+timer+'.timer'],timeout=3)
        verify_controls();receipt['controlsVerified']=True
        exclusive_record(PRIVATE/'receipt-put.json',{'url':receipt_url(config['receiptPutUrl'])})
        exclusive_record(BASE/'native-intent.json',{'schemaVersion':1,'binarySha256':PINS['bb'],'controlSourceSha256':PINS['bootstrap'],'attempts':1})
        receipt['stage']='guest-preflight';receipt['guestPreflight']=native_guest()
        if receipt['guestPreflight']['status']!='passed':raise ValueError('Guest preflight failed')
        receipt['stage']='download';NATIVE_ROOT.mkdir(mode=0o755,parents=True,exist_ok=False)
        # The private bootstrap umask is 077. Only this newly owned directory
        # contains public bytes; DynamicUser needs traversal to read capture.py.
        directory=os.open(NATIVE_ROOT,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fchmod(directory,0o755);os.fsync(directory)
        finally:os.close(directory)
        native_fetch(config['binaryUrl'],NATIVE_ROOT/'bb')
        write(NATIVE_ROOT/'capture.py',worker,0o444)
        unit='[Unit]\nDescription=Closed public binary version diagnostic\nAfter=rolling-egress.service\n[Service]\nType=exec\nDynamicUser=yes\nStateDirectory=rolling-native-version\nStateDirectoryMode=0700\nExecStart=/usr/bin/python3 /opt/rolling-native-version/capture.py\nRestart=no\nRuntimeMaxSec=20s\nTimeoutStopSec=2s\nKillMode=control-group\nMemoryMax=512M\nMemorySwapMax=0\nCPUQuota=200%\nTasksMax=64\nUMask=0077\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nPrivateNetwork=yes\nIPAddressDeny=any\nPrivateTmp=yes\nPrivateDevices=yes\nProtectSystem=strict\nProtectHome=yes\nProtectKernelTunables=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nInaccessiblePaths=/var/lib/rolling-bootstrap-private /var/lib/cloud\nStandardOutput=null\nStandardError=null\n'
        write('/etc/systemd/system/'+NATIVE_UNIT,unit,0o644);run(['systemctl','daemon-reload'],timeout=5)
        receipt['stage']='version'
        try:run(['systemctl','start','--wait',NATIVE_UNIT],timeout=25)
        except Exception:pass # Exact state/result observed before stopping, never retry.
        receipt['state']=native_state();result=None
        try:result=native_result(read_bounded_json(pathlib.Path('/var/lib/rolling-native-version/result.json')));receipt['resultStatus']='observed';receipt['result']=result
        except FileNotFoundError:receipt['resultStatus']='absent'
        except Exception:receipt['resultStatus']='invalid-or-unreadable'
        receipt['outcome']=native_classify(receipt['state'],result);receipt['passed']=receipt['outcome']=='passed'
        receipt['stage']='complete'
    except Exception:
        receipt['outcome']='precondition-or-io-failure'
    finally:
        try:
            # Receipt is bounded before any publication; no raw capability, args,
            # native output, response or exception is retained.
            data=json.dumps(receipt,separators=(',',':')).encode()
            if len(data)>8192:raise ValueError('Native receipt limit')
            exclusive_record(BASE/'native-final.json',receipt)
            emit_diagnostic(b'ROLLING_NATIVE_VERSION '+data+b'\n')
            upload_receipt(data)
        finally:
            native_shutdown()
            if lock is not None:lock.close()
'''

def generate_native(config,now=None):
    config=validate_native(config,now)
    controls=native_control_source()
    runtime=controls+NATIVE_CAPTURE+NATIVE_HOST
    worker='EXPECTED_VERSION = '+repr(BB_VERSION)+'\n'+NATIVE_CAPTURE+'\nnative_worker()\n'
    pins={'bb':BB_SHA,'bbVersion':BB_VERSION,'bootstrap':hashlib.sha256(runtime.encode()).hexdigest()}
    source='PINS = '+repr(pins)+'\nBINARY_BYTES = '+repr(NATIVE_BYTES)+'\n'+runtime
    program='SOURCE = '+repr(source)+'\nWORKER = '+repr(worker)+'\nCONFIG = '+repr(config)+'\nexec(SOURCE)\ntry:\n    native_execute(CONFIG,WORKER)\nexcept BaseException:\n    sys.exit(1)\n'
    encoded=base64.b64encode(lzma.compress(program.encode(),format=lzma.FORMAT_ALONE,filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'pb':0}])).decode()
    return "#!/bin/sh\nset -eu\numask 077\nexec /usr/bin/python3 - <<'B'\nimport base64,lzma\nexec(lzma.decompress(base64.b64decode('"+encoded+"')))\nB\n"


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
    parser.add_argument('--native-version-only',action='store_true')
    args=parser.parse_args()
    try:
        output=pathlib.Path(args.output).absolute()
        repo=pathlib.Path(__file__).resolve().parents[2]
        if output.resolve().is_relative_to(repo) or output.parent.resolve()!=output.parent or pathlib.Path(args.config).resolve().is_relative_to(repo): raise Invalid('Private inputs and outputs must be outside checkout')
        info=output.parent.stat()
        if stat.S_IMODE(info.st_mode)!=0o700 or info.st_uid!=os.getuid(): raise Invalid('Private output directory required')
        generator=generate_native if args.native_version_only else generate
        body=gzip.compress(generator(private_file(args.config)).encode(),mtime=0)
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

if __name__=='__main__':
    if sys.argv[1:2] in (['--node-wrapper'],['--startup-observation']):
        try:
            base=pathlib.Path('/var/lib/rolling-bootstrap')
            if sys.argv[1]=='--startup-observation':print(json.dumps(node_startup_observation(base)));sys.exit(0)
            code=node_wrapper(sys.argv[2:],base)
            if code<0:signal.signal(-code,signal.SIG_DFL);os.kill(os.getpid(),-code)
            sys.exit(code)
        except Exception:sys.exit(1)
    sys.exit(main())
