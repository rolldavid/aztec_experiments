"""Read-only deployment inventory. Usage: python3 SCRIPT app|moderator|bok."""
import hashlib,json,pathlib,shlex,sqlite3,subprocess,sys,urllib.request
kind=sys.argv[1];assert kind=='app'
units={'app':'rolling-application','moderator':'rolling-moderator','bok':'rolling-bok-testnet'}
run=lambda a:subprocess.check_output(a,text=True).strip()
sha=lambda b:hashlib.sha256(b).hexdigest()
u=units[kind]+'.service'; fragment=pathlib.Path(run(['systemctl','show',u,'-p','FragmentPath','--value'])); text=fragment.read_text()
root=pathlib.Path(run(['systemctl','show',u,'-p','WorkingDirectory','--value']))
result={'kind':kind,'unit':str(fragment),'unitSha256':sha(fragment.read_bytes()),'source':str(root),'active':run(['systemctl','is-active',u]),'pid':run(['systemctl','show',u,'-p','MainPID','--value']),'sourceReferences':[line for line in text.splitlines() if str(root) in line], 'privateHashes':{}}
paths={'app':['/etc/rolling-app/public.json','/etc/rolling-app/wallet.json','/etc/rolling-app/relay.json'],'moderator':['/var/lib/rolling-bootstrap-private/moderator-current/config.json','/var/lib/rolling-bootstrap-private/moderator-current/operator.json','/var/lib/rolling-bootstrap-private/moderator-current/query.env'],'bok':['/etc/rolling-bok-testnet/config.json']}[kind]
for line in text.splitlines():
 if line.startswith('LoadCredential='):
  p=line.split('=',1)[1].split(':',1)[1]; paths.append(p)
 if line.startswith('EnvironmentFile='):paths.append(line.split('=',1)[1].lstrip('-'))
for p in sorted(set(paths)):
 file=pathlib.Path(p)
 if file.is_file():result['privateHashes'][p]=sha(file.read_bytes())
result['buildHashes']={p:sha((root/p).read_bytes()) for p in ['.build/sdk/sdk-manifest.json','.build/rolling-wallet/manifest.json'] if (root/p).is_file()}
if kind=='app':
 f=pathlib.Path('/var/lib/private/rolling-application/funding-relay/funding-budget.json');result['idle']=f.is_file() and json.loads(f.read_text())['activePlan'] is None
elif kind=='moderator':
 args=shlex.split(next(l[10:] for l in text.splitlines() if l.startswith('ExecStart=')))
 values=[a.split('=',1)[1] for a in args if a.startswith('--state-dir=')]+[args[i+1] for i,a in enumerate(args[:-1]) if a=='--state-dir']
 assert len(values)==1 and pathlib.Path(values[0]).is_absolute()
 state=pathlib.Path(values[0]);assert state.is_dir() and state.resolve()==state and not state.is_symlink()
 proc_args=pathlib.Path('/proc/'+result['pid']+'/cmdline').read_bytes().decode().split('\0')
 proc_values=[a.split('=',1)[1] for a in proc_args if a.startswith('--state-dir=')]+[proc_args[i+1] for i,a in enumerate(proc_args[:-1]) if a=='--state-dir']
 assert proc_values==values,'Live moderator uses another state directory'
 lock=state/'hosted.lock';assert lock.is_file() and not lock.is_symlink() and lock.read_text().strip()==result['pid']
 stat=state.stat();files=sorted(state.glob('*.sqlite'));assert all(f.is_file() and not f.is_symlink() for f in files)
 result['stateDirectory']=str(state);result['stateIdentity']={'device':stat.st_dev,'inode':stat.st_ino}
 result['databases']=[f.name for f in files];result['emptyStateVerified']=not files
 rows=[]
 for file in files:
  con=sqlite3.connect('file:'+str(file)+'?mode=ro',uri=True)
  try:
   counts={}; leased=0
   for (raw,) in con.execute('SELECT record FROM jobs'):
    r=json.loads(raw);state=r['job']['state'];counts[state]=counts.get(state,0)+1;leased+=bool(r.get('lease'))
   rows.append({'database':file.name,'states':counts,'leased':leased})
  finally:con.close()
 result['jobs']=rows;result['idle']=all(r['leased']==0 for r in rows)
else:
 c=json.loads(pathlib.Path('/etc/rolling-bok-testnet/config.json').read_text())
 try:
  with urllib.request.urlopen('http://127.0.0.1:'+str(c.get('port',8787))+'/health',timeout=20) as r:h=json.load(r)
  result['health']={k:h.get(k) for k in ['status','active','lastFailure']};result['idle']=h.get('active')==0
 except Exception:result['idle']=False
candidates=['apps/rolling/reader.mjs', 'apps/rolling/wallet-panel.mjs', 'apps/rolling/style.css']
result['fileHashes']={p:sha((root/p).read_bytes()) for p in candidates if (root/p).is_file() and not (root/p).is_symlink()}
result['absentCandidates']=[p for p in candidates if not (root/p).is_file()]
print(json.dumps(result))
