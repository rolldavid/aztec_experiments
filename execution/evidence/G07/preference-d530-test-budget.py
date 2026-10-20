import subprocess,time,json,os,signal,sys,hashlib
from pathlib import Path
label=sys.argv[1];cmd=sys.argv[2:]; started=time.monotonic();peak=0;reason=None
with open('/tmp/'+label+'.log','w') as log:
 p=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 def group():
  rows=subprocess.check_output(['ps','-axo','pid=,pgid=,rss='],text=True).splitlines();result=[]
  for row in rows:
   vals=row.split()
   if len(vals)==3 and int(vals[1])==p.pid:result.append((int(vals[0]),int(vals[2])*1024))
  return result
 while p.poll() is None:
  peak=max(peak,sum(rss for _,rss in group()))
  if time.monotonic()-started>540 or peak>4294967296:
   reason='deadline' if time.monotonic()-started>540 else 'aggregate-memory';os.killpg(p.pid,signal.SIGTERM);break
  time.sleep(.25)
 try:code=p.wait(timeout=10)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait()
 remaining=group()
 if remaining:
  os.killpg(p.pid,signal.SIGTERM);time.sleep(3)
  if group():os.killpg(p.pid,signal.SIGKILL);time.sleep(1)
 remaining=group()
record={'command':cmd,'cwd':os.getcwd(),'exitCode':code,'durationSeconds':round(time.monotonic()-started,3),'peakAggregateRssBytes':peak,'limitFailure':reason,'cleanupComplete':not remaining,'remainingPids':[pid for pid,_ in remaining],'logSha256':hashlib.sha256(Path('/tmp/'+label+'.log').read_bytes()).hexdigest()}
Path('/tmp/'+label+'.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));print(Path('/tmp/'+label+'.log').read_text()[-6500:]);sys.exit(code if code>=0 else 1)
