import pathlib,hashlib,json,subprocess
p=pathlib.Path('/var/lib/rolling-bootstrap-private/dedicated-bok-effective');files={}
for name,expected in [('rolling-bok-testnet.service','45e8f5824aa1b40062cd9309a58ff14d0295cb1318d41c22ba04cd8e33994c94'),('rolling-bok-artifact-proxy.service','56bde10e051232d11a3a6095ec48b17600810f767177aae5ada7856660f83f67')]:
 src=pathlib.Path('/etc/systemd/system')/name;data=src.read_text();assert hashlib.sha256(data.encode()).hexdigest()==expected
 data=data.replace('[Unit]\n','[Unit]\nStartLimitIntervalSec=300\nStartLimitBurst=3\n',1).replace('Restart=no','Restart=on-failure\nRestartSec=5s')
 if name=='rolling-bok-testnet.service':data=data.replace('Wants=network-online.target','Wants=network-online.target rolling-bok-artifact-proxy.service')
 (p/(name+'.recovery')).write_text(data);files[name]={'sha256':hashlib.sha256(data.encode()).hexdigest(),'content':data}
# systemd-analyze expects unit suffix; validate temporary named copies.
v=p/'native-recovery';v.mkdir(mode=0o700)
for name,value in files.items():(v/name).write_text(value['content'])
subprocess.run(['systemd-analyze','verify',*(str(v/name) for name in files)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(json.dumps({'prepared':True,'units':{name:{'sha256':value['sha256']} for name,value in files.items()},'nativeRestarts':'on-failure,5s,3attempts/300s','noStaleLockRemoval':True,'started':False}))
