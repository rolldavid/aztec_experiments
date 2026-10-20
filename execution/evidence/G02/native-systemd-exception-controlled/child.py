import sys,json,os,subprocess,time
spec=json.load(sys.stdin);started=time.monotonic()
with open(spec['log'],'xb',buffering=0) as log:
 p=subprocess.run(spec['argv'],cwd=spec['cwd'],stdout=log,stderr=log)
 os.fsync(log.fileno())
print(json.dumps({'code':p.returncode,'elapsedMs':round((time.monotonic()-started)*1000)}),flush=True)
sys.exit(p.returncode if p.returncode>=0 else 1)
