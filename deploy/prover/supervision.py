"""Persistent-host observation. Reports state; never starts or stops a service."""
import ast,json,pathlib,subprocess,sys,time

SERVICES={
 'core':('rolling-node','rolling-query','board-prover','board-prover-proxy','rolling-application','rolling-application-proxy','rolling-moderator'),
 'bok':('rolling-bok-testnet','rolling-bok-artifact-proxy'),
}

def service_states(role,run=subprocess.check_output):
 result={}
 for name in SERVICES[role]:
  raw=run(['systemctl','show',name+'.service','--property=ActiveState,SubState,MainPID,Result,NRestarts'],text=True,timeout=5)
  row=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
  result[name]={'active':row.get('ActiveState')=='active','running':row.get('SubState')=='running',
                'pid':int(row['MainPID']),'restarts':int(row['NRestarts']), 'successful':row.get('Result')=='success'}
 return result

def observe_current_prover(h,control,qualify_files=False,record_path=pathlib.Path('/etc/rolling-supervision/current-prover.json')):
 # Explicit root-owned current deployment, with no discovery or fallback.
 # Historical bootstrap/proxy records and h.RELEASE remain unchanged.
 import hashlib,os,stat,pwd,grp,re
 def regular(path):
  if path.resolve()!=path:raise ValueError('Current prover symlink')
  info=path.stat()
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise ValueError('Current prover ownership')
  for parent in path.parents:
   item=parent.stat()
   if item.st_uid!=0 or item.st_mode&0o022:raise ValueError('Current prover parent ownership')
  return info
 def digest(path):
  regular(path);value=hashlib.sha256()
  with path.open('rb') as stream:
   for chunk in iter(lambda:stream.read(1024*1024),b''):value.update(chunk)
  return value.hexdigest()
 info=regular(record_path)
 if stat.S_IMODE(info.st_mode)!=0o600 or info.st_size>4096:raise ValueError('Current prover record permissions')
 expected=json.loads(record_path.read_bytes())
 if type(expected) is not dict or set(expected)!={'schemaVersion','target','stagePath','stageSha256','activationPath','activationSha256'} or type(expected['schemaVersion']) is not int or expected['schemaVersion']!=1:raise ValueError('Current prover record schema')
 for key in ('target','stagePath','stageSha256','activationPath','activationSha256'):
  if type(expected[key]) is not str:raise ValueError('Current prover record types')
 if not re.fullmatch('/opt/board-prover/releases/[a-z0-9][a-z0-9-]{0,127}',expected['target']):raise ValueError('Current prover target')
 if not re.fullmatch(r'/var/lib/rolling-bootstrap-private/[a-zA-Z0-9_-]+/config/prover-stage\.json',expected['stagePath']):raise ValueError('Current prover stage path')
 target=pathlib.Path(expected['target']);stage_path=pathlib.Path(expected['stagePath'])
 if expected['activationPath']!=str(stage_path.with_name('prover-activation.json')):raise ValueError('Current prover activation path')
 for key in ('stageSha256','activationSha256'):
  if not re.fullmatch('[a-f0-9]{64}',expected[key]):raise ValueError('Current prover receipt SHA')
 def receipt(path,sha256):
  info=regular(path)
  if stat.S_IMODE(info.st_mode)!=0o600 or info.st_size>262144 or stat.S_IMODE(path.parent.stat().st_mode)!=0o700:raise ValueError('Current prover receipt permissions')
  data=path.read_bytes()
  if hashlib.sha256(data).hexdigest()!=sha256:raise ValueError('Current prover receipt binding')
  return json.loads(data)
 stage=receipt(stage_path,expected['stageSha256'])
 active=receipt(pathlib.Path(expected['activationPath']),expected['activationSha256'])
 if stage['target']!=str(target) or active['source']!=str(target) or active['activated'] is not True or active['files']!=stage['files'] or active['configSha256']!=stage['configSha256']:raise ValueError('Current prover activation binding')
 if pathlib.Path('/opt/board-prover/current').resolve()!=target:raise ValueError('Current prover release changed')
 # Full overlay/native validation is performed once when admitting this exact
 # replacement. Recurring observation preserves the existing control contract:
 # immutable receipt pins, exact config/current source, service identity/health.
 if qualify_files:
  for name,expected in stage['files'].items():
   rel=pathlib.PurePosixPath(name)
   if rel.is_absolute() or '..' in rel.parts or '\\' in name or not re.fullmatch('[a-f0-9]{64}',expected):raise ValueError('Current prover source path')
   if digest(target/rel)!=expected:raise ValueError('Current prover source changed')
  for name,key in [('node/bin/node','node'),('node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb','bb'),('prover-release.json','manifest')]:
   if digest(target/name)!=h['PINS'][key]:raise ValueError('Current prover native runtime changed')
  if digest(target/'crs-manifest.json')!=stage['baseline']['runtimePins'][stage['baseline']['base']+'/crs-manifest.json']:raise ValueError('Current prover CRS changed')
 owner=pwd.getpwnam('board-prover');group=grp.getgrnam('board-prover')
 if owner.pw_uid!=995 or owner.pw_gid!=986 or group.gr_gid!=986:raise ValueError('Current prover identity changed')
 # Preserve native host, UID traffic, proxy, systemd and real-health checks.
 proxy=control['proxy_host_observe'](h,runtime=True)
 control['activation_traffic'](h,owner.pw_uid)
 current={**h,'RELEASE':target}
 control['activation_service'](current,owner.pw_uid,group.gr_gid,stage['configSha256'])
 def identity():
  pid=h['run'](['systemctl','show','board-prover.service','--property=MainPID','--value'],capture=True,timeout=5)
  if not re.fullmatch('[1-9][0-9]*',pid):raise ValueError('Current prover PID')
  proc=pathlib.Path('/proc')/pid
  if (proc/'cwd').resolve()!=target or (proc/'exe').resolve()!=target/'node/bin/node':raise ValueError('Current prover process source')
  return pid,(proc/'stat').read_text().rsplit(')',1)[1].split()[19]
 before=identity();health=control['activation_health'](observation=True)
 control['activation_service'](current,owner.pw_uid,group.gr_gid,stage['configSha256'])
 if identity()!=before:raise ValueError('Current prover restarted during observation')
 return {'proverActivated':True,'proverAvailability':'ready' if health['query']['ready'] and proxy.get('proxyQuery',{}).get('ready',True) else 'degraded'}


def observe(role,h,control,states):
 checks={}
 def check(name,fn):
  try:value=fn();checks[name]={'ok':value is not False}
  except Exception as error:
   kind=type(error).__name__
   checks[name]={'ok':False,'error':kind if kind in ('TimeoutError','ConnectionError','URLError','HTTPError','Invalid','ValueError','CalledProcessError','TimeoutExpired','OSError') else 'ObservationError'}
 check('host-controls',h['verify_controls'])
 if role=='core':
  def prover():
   result=observe_current_prover(h,control)
   return result.get('proverActivated') is True and result.get('proverAvailability')=='ready'
  def query():
   result=control['query_host_readback'](h,runtime=True)
   return result.get('listenerAvailable') is True
  check('prover',prover);check('query-boundary',query)
 return {'schemaVersion':1,'role':role,'observedAt':int(time.time()),'services':states,'checks':checks,
         'ready':all(s['active'] and s['running'] for s in states.values()) and all(c['ok'] for c in checks.values())}

def load_control():
 path=pathlib.Path('/usr/local/lib/rolling-attest.py');tree=ast.parse(path.read_bytes())
 h={'__name__':'rolling_observation','__file__':str(path)}
 declarations=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.Assign,ast.AnnAssign,ast.FunctionDef,ast.ClassDef))]
 exec(compile(ast.Module(body=declarations,type_ignores=[]),str(path),'exec'),h)
 source=h['control_source']();control={'__name__':'rolling_observation_control','__file__':str(source)}
 exec(compile(source.read_bytes(),str(source),'exec'),control)
 return h,control

def main(role):
 if role not in SERVICES:raise ValueError('Unknown host role')
 try:
  states=service_states(role);h,control=load_control();result=observe(role,h,control,states)
 except Exception:
  result={'schemaVersion':1,'role':role,'observedAt':int(time.time()),'ready':False,'error':'MONITOR_UNAVAILABLE'}
 text=json.dumps(result,sort_keys=True);print(text,flush=True)
 target=pathlib.Path('/var/lib/rolling-monitor/status.json');temporary=target.with_suffix('.new')
 temporary.write_text(text+'\n');temporary.replace(target)
 # A monitoring failure is visible in status/journal. No lifecycle side effects.
 return 0 if result['ready'] else 1


def monitor_unit(role):
 if role not in SERVICES:raise ValueError('Unknown host role')
 return ('[Unit]\nDescription=Rolling service availability report\nAfter=network-online.target\n'
  '[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /usr/local/lib/rolling-supervision/supervision.py '+role+'\n'
  'StateDirectory=rolling-monitor\nStateDirectoryMode=0755\nUMask=0022\nTimeoutStartSec=90\n'
  'NoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\n'
  'ReadWritePaths=/var/lib/rolling-monitor\nStandardOutput=journal\nStandardError=journal\n')

def monitor_timer():
 return ('[Unit]\nDescription=Observe Rolling service availability\n[Timer]\nOnBootSec=10s\nOnUnitInactiveSec=30s\n'
  'AccuracySec=1s\n[Install]\nWantedBy=timers.target\n')


def startup_check():
 try:
  h,_=load_control();h['attest'](check=True);return 0
 except Exception:
  print('ROLLING_STARTUP_CHECK_UNAVAILABLE',flush=True);return 1

if __name__=='__main__':raise SystemExit(startup_check() if sys.argv[1:] == ['--check'] else main(sys.argv[1]))
