FROZEN={'var/lib/rolling-bok-testnet/1939117d069084c9abbb1374c3133c620638a72e40a69aff61b84b7be7ece6f6.json': '5707997e908cf69f0a66420c9a37a8d913052d48d6f2672fa199eecd852fb777', 'var/lib/rolling-bok-testnet/09ddf25ed1099f85c80ea78f26e977fea03473f03290f8f329816959381e701f.json': '2177f95c9a5d256f22322df7e171c8c7391047816def16f73c272d1b80b51ef3', 'var/lib/rolling-bok-testnet/f2918c87fad42f72ba7caf5bdbb525f354130acb3b6293da16ff7e7c2d29ffd6.json': 'dd7f93fbd587e104cb5a082b12c085571110cbcae27d63b3d600218e9b0df9f8'}
import pathlib,json,hashlib,subprocess,urllib.request
p=pathlib.Path('/var/lib/rolling-bootstrap-private/dedicated-bok-effective')
run=lambda a:subprocess.check_output(a,text=True,timeout=30).strip()
config=json.loads(pathlib.Path('/etc/rolling-bok-testnet/config.json').read_text())
run(['/usr/bin/python3','/usr/local/lib/rolling-attest.py'])
assert json.loads(pathlib.Path('/var/lib/rolling-bootstrap/deadline.json').read_text())['budgetStop']=='2026-10-21T06:42:00Z'
result={'units':{u:{k:run(['systemctl','show',u,'-p',k,'--value']) for k in ['ActiveState','SubState','MainPID']} for u in ['rolling-bok-testnet.service','rolling-bok-artifact-proxy.service']},'operatorAddress':config['operatorAddress']}
try:
 with urllib.request.urlopen('http://127.0.0.1:'+str(config.get('port',8787))+'/health',timeout=30) as r:result['health']=json.load(r)
except Exception:result['health']={'status':'unavailable'}
result['journals']={}
for rel,expected in FROZEN.items():
 file=pathlib.Path('/')/rel;b=file.read_bytes();j=json.loads(b);result['journals'][file.name]={'hashUnchanged':hashlib.sha256(b).hexdigest()==expected,'phase':j['hostedPrivateBok']['phase'],'finished':j['privateBok']['finished'],'calls':len(j['privateBok']['calls']),'requestId':j['hostedPrivateBok']['binding']['requestId']}
result['artifacts']={}
for suffix,h in [('latest/','cceb89d0393b25e95f8058378414feef665aa73ce8a9de08dcace6915a1fe59a'),('source.json','30ed61c77f0def38de656206ee6d4d0249347b32f227e91a97a6712ad7091b46')]:
 url='http://172.31.45.95:8809/t/54f74bcaa3f0f1a59b0358a11dd85dcb885bf5aaec7f26e23b6c81c56db3ca1d/'+suffix
 try:
  req=urllib.request.Request(url,headers={'Host':'dy2q03rao3se7.cloudfront.net'})
  with urllib.request.urlopen(req,timeout=15) as r:body=r.read(20*1024*1024);result['artifacts'][suffix]={'status':r.status,'sha256':hashlib.sha256(body).hexdigest(),'originalMatches':hashlib.sha256(body).hexdigest()==h}
 except Exception:result['artifacts'][suffix]={'status':'unavailable'}
print(json.dumps(result))
