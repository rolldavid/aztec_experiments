import json,subprocess,os,time,signal,datetime,hashlib
from pathlib import Path
d=Path(__file__).parent; prep=json.loads((d/'preparation.json').read_text()); w=Path(prep['cwd']); sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
assert Path.cwd()==w
assert subprocess.check_output(['/usr/bin/git','rev-parse','HEAD'],cwd=w,text=True).strip()==prep['source']
assert not subprocess.check_output(['/usr/bin/git','status','--porcelain'],cwd=w,text=True).strip()
for rel,h in json.loads((d/'before-source.json').read_text()).items(): assert sha(w/rel)==h
for absolute,h in json.loads((d/'before-tools.json').read_text()).items(): assert sha(Path(absolute))==h
r=json.loads((d/'readiness-plan.json').read_text()); r['startedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (d/'readiness-intent.json').open('x') as f: json.dump(r,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
r['results']=[];start=time.monotonic();passed=True
for c in r['commands']:
 left=30-(time.monotonic()-start)
 if left<=0:passed=False;break
 p=subprocess.Popen(c['argv'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LANG':'en_US.UTF-8','HOME':'/Users/zac','HARDWARE_CONCURRENCY':'1'})
 row={'label':c['label'],'pid':p.pid};r['results'].append(row)
 try:
  out,_=p.communicate(timeout=min(8,left)); text=out.decode('utf-8'); row.update({'code':p.returncode,'output':text[:2048],'withinOutputBound':len(out)<=2048});ok=p.returncode==0 and len(out)<=2048 and all(x in text for x in c.get('mustContain',[])) and ('exact' not in c or text.strip()==c['exact'])
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);p.communicate(timeout=2);row.update({'timeout':True,'code':p.returncode});ok=False
 row['passed']=ok;row['reaped']=p.returncode is not None
 if not ok:passed=False;break
r.update({'passed':passed and len(r['results'])==4,'elapsedSeconds':time.monotonic()-start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
with (d/'readiness-result.json').open('x') as f:json.dump(r,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps(r));raise SystemExit(0 if r['passed'] else 1)
