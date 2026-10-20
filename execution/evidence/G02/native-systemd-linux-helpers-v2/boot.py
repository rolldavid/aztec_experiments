"""Offline PID1 preflight. PUBLIC_FILES is hash-bound by future offline runner."""
import json,os,pathlib,subprocess,sys
PUBLIC_FILES={} # Future reviewed caller binds only driver and actual-source subset.

def fail():
 pathlib.Path('/run/preflight.json').write_text(json.dumps({'passed':False,'category':'confinement-or-startup'}))
 raise SystemExit(72)
try:
 if os.getpid()!=1 or os.environ.get('container')!='docker' or not PUBLIC_FILES:raise ValueError()
 if pathlib.Path('/proc/self/cgroup').read_text()!='0::/\n':raise ValueError()
 if pathlib.Path('/sys/fs/cgroup/cgroup.procs').read_text().split()!=['1']:raise ValueError()
 if pathlib.Path('/sys/fs/cgroup/memory.max').read_text().strip()!='536870912':raise ValueError()
 if pathlib.Path('/sys/fs/cgroup/cpu.max').read_text().strip()!='200000 100000':raise ValueError()
 if pathlib.Path('/sys/fs/cgroup/pids.max').read_text().strip()!='128':raise ValueError()
 mounts=[x.split() for x in pathlib.Path('/proc/self/mountinfo').read_text().splitlines()]
 cg=[x for x in mounts if x[4]=='/sys/fs/cgroup']
 if len(cg)!=1 or cg[0][3]!='/' or ' - cgroup2 ' not in ' '.join(cg[0]) or any(x.startswith(('shared:','master:')) for x in cg[0][6:cg[0].index('-')]):raise ValueError()
 # Host must independently inspect CgroupnsMode=private/no host binds and limits
 # before start. No namespace/cgroup fallback is permitted on any failure.
 subprocess.run(['/usr/bin/mount','-o','remount,rw','/sys/fs/cgroup'],timeout=3,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 probe=pathlib.Path('/sys/fs/cgroup/rolling-confinement-check');probe.mkdir();probe.rmdir()
 if set(PUBLIC_FILES)!={'driver.py','native-subset.py'}:raise ValueError()
 for name,text in PUBLIC_FILES.items():
  path=pathlib.Path('/run')/name
  with path.open('x') as f:f.write(text)
 for path in ('/opt/rolling-native-version','/var/lib/rolling-bootstrap-private','/var/lib/cloud'):
  pathlib.Path(path).mkdir(parents=True,exist_ok=True)
 os.chmod('/opt/rolling-native-version',0o755)
 pathlib.Path('/etc/systemd/system/rolling-driver.service').write_text('[Unit]\nAfter=basic.target\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /run/driver.py\nStandardOutput=null\nStandardError=null\nTimeoutStartSec=50s\n')
 pathlib.Path('/etc/systemd/system/rolling-test.target').write_text('[Unit]\nWants=rolling-driver.service\nAfter=rolling-driver.service\n')
 pathlib.Path('/run/preflight.json').write_text(json.dumps({'passed':True,'category':'confined'}))
 os.execve('/usr/lib/systemd/systemd',['/usr/lib/systemd/systemd','--system','--unit=rolling-test.target','--log-target=null','--show-status=no'],{'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','container':'docker','LANG':'C','LC_ALL':'C'})
except Exception:fail()
