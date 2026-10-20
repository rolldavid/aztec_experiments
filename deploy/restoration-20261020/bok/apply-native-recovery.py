FROZEN={'var/lib/rolling-bok-testnet/1939117d069084c9abbb1374c3133c620638a72e40a69aff61b84b7be7ece6f6.json': '5707997e908cf69f0a66420c9a37a8d913052d48d6f2672fa199eecd852fb777', 'var/lib/rolling-bok-testnet/09ddf25ed1099f85c80ea78f26e977fea03473f03290f8f329816959381e701f.json': '2177f95c9a5d256f22322df7e171c8c7391047816def16f73c272d1b80b51ef3', 'var/lib/rolling-bok-testnet/f2918c87fad42f72ba7caf5bdbb525f354130acb3b6293da16ff7e7c2d29ffd6.json': 'dd7f93fbd587e104cb5a082b12c085571110cbcae27d63b3d600218e9b0df9f8'}
EXPECTED={'rolling-bok-testnet.service': '115bfde5f17b0c04abdb977c71bce0c8c9429ecfa78a5a7c1a12a4f44374acb8', 'rolling-bok-artifact-proxy.service': '5ed75ee5eafaff581c58d4dbcd6ed44e79f429d7103d0aa329c223ac6f56b248'}
import pathlib,subprocess,json,hashlib,os
p=pathlib.Path('/var/lib/rolling-bootstrap-private/dedicated-bok-effective');r=lambda a:subprocess.check_output(a,text=True,timeout=30).strip()
r(['/usr/bin/python3','/usr/local/lib/rolling-attest.py'])
assert not pathlib.Path('/var/lib/rolling-bok-testnet/hosted.lock').exists()
for rel,h in FROZEN.items():assert hashlib.sha256((pathlib.Path('/')/rel).read_bytes()).hexdigest()==h
for name,expected in EXPECTED.items():
 assert r(['systemctl','show',name,'-p','MainPID','--value'])=='0'
 assert hashlib.sha256((p/(name+'.recovery')).read_bytes()).hexdigest()==expected
for name in EXPECTED:
 dest=pathlib.Path('/etc/systemd/system')/name;dest.write_bytes((p/(name+'.recovery')).read_bytes());os.chown(dest,0,0);os.chmod(dest,0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
print(json.dumps({'nativeRecoveryInstalled':True,'started':False,'units':{n:{k:r(['systemctl','show',n,'-p',k,'--value']) for k in ['Restart','RestartUSec','StartLimitBurst','StartLimitIntervalUSec','MainPID']} for n in EXPECTED},'journalGuardUnchanged':True}))
