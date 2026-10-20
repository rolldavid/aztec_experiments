FROZEN={'var/lib/rolling-bok-testnet/1939117d069084c9abbb1374c3133c620638a72e40a69aff61b84b7be7ece6f6.json': '5707997e908cf69f0a66420c9a37a8d913052d48d6f2672fa199eecd852fb777', 'var/lib/rolling-bok-testnet/09ddf25ed1099f85c80ea78f26e977fea03473f03290f8f329816959381e701f.json': '2177f95c9a5d256f22322df7e171c8c7391047816def16f73c272d1b80b51ef3', 'var/lib/rolling-bok-testnet/f2918c87fad42f72ba7caf5bdbb525f354130acb3b6293da16ff7e7c2d29ffd6.json': 'dd7f93fbd587e104cb5a082b12c085571110cbcae27d63b3d600218e9b0df9f8'}
import pathlib,hashlib,subprocess,json
r=lambda a:subprocess.check_output(a,text=True,timeout=30).strip()
r(['/usr/bin/python3','/usr/local/lib/rolling-attest.py'])
assert not pathlib.Path('/var/lib/rolling-bok-testnet/hosted.lock').exists()
for unit in ['rolling-bok-testnet.service','rolling-bok-artifact-proxy.service']:assert r(['systemctl','show',unit,'-p','MainPID','--value'])=='0'
for rel,h in FROZEN.items():assert hashlib.sha256((pathlib.Path('/')/rel).read_bytes()).hexdigest()==h
assert hashlib.sha256(pathlib.Path('/etc/systemd/system/rolling-bok-testnet.service').read_bytes()).hexdigest()=='115bfde5f17b0c04abdb977c71bce0c8c9429ecfa78a5a7c1a12a4f44374acb8'
assert hashlib.sha256(pathlib.Path('/etc/rolling-bok-testnet/config.json').read_bytes()).hexdigest()=='b25fdcb6de29354975fa67f9ed2ada9184ad36a62385f939d3bd9715ea5f81c2'
subprocess.run(['systemctl','start','rolling-bok-testnet.service','rolling-bok-artifact-proxy.service'],check=True,timeout=60)
print(json.dumps({'started':True,'reason':'declared peer DNS mapped consistently inside service allowlist','journalsUnchangedBeforeStart':True}))
