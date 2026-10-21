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
   result=control['prover_activation'](h,'observe')
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
