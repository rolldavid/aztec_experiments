import pathlib,subprocess,os,time,signal,json,datetime,hashlib
OWN=pathlib.Path('/Users/zac/Documents/ChatGPT/Anonymous Message Board/aztec_experiments');ROOT=OWN;OUT=pathlib.Path('/private/tmp/rolling-prover-release-startup07-20261012');E=OWN/'execution/evidence/G02';clock=time.monotonic();record={'schemaVersion':1,'source':'96825e16271baf7d81442415565fe51b1533737e','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deadlineSeconds':540,'aggregateRssLimitKiB':4*1024*1024,'peakAggregateRssKiB':0,'steps':[],'noCloudMutation':True}
def save():
 p=E/'startup07-package-process.json';p.write_text(json.dumps(record,indent=2)+'\n')
 with p.open('rb') as f:os.fsync(f.fileno())
def run(label,args):
 step={'name':label,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};record['steps'].append(step);save()
 with (E/('startup07-'+label+'.log')).open('xb') as log:
  p=subprocess.Popen(args,cwd=OWN,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin','TMPDIR':'/private/tmp','LOG_LEVEL':'silent'})
  try:
   while p.poll() is None:
    rss=0
    for line in subprocess.check_output(['ps','-axo','pgid=,rss='],text=True).splitlines():
     fields=line.split()
     if len(fields)==2 and fields[0]==str(p.pid):rss+=int(fields[1])
    record['peakAggregateRssKiB']=max(record['peakAggregateRssKiB'],rss)
    if time.monotonic()-clock>540 or rss>record['aggregateRssLimitKiB']:raise RuntimeError('PACKAGE_RESOURCE_BOUND')
    time.sleep(.5)
   step['exitCode']=p.returncode
   if p.returncode:raise RuntimeError('PACKAGE_STEP_FAILED')
  finally:
   if p.poll() is None:
    os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
   step['ownedProcessGroupAbsent']=not any(line.split()[0]==str(p.pid) for line in subprocess.check_output(['ps','-axo','pgid='],text=True).splitlines() if line.split());step['exitCode']=p.returncode;step['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['elapsedSeconds']=round(time.monotonic()-clock,3);save()
assert not OUT.exists() and not pathlib.Path(str(OUT)+'.tar.gz').exists()
archive=ROOT/'.build/v6/infra/node-v24.21.0-linux-x64.tar.xz';assert hashlib.sha256(archive.read_bytes()).hexdigest()=='fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6'
try:
 run('build',['python3','deploy/prover/package.py',str(OUT),'--node-archive',str(archive),'--application-profile','rolling','--validation-node',str(ROOT/'.build/A02-node/node-v24.21.0-darwin-arm64/bin/node')])
 run('verify',['python3','/Users/zac/Documents/ChatGPT/Anonymous Message Board/rolling-controls/.build/verify-package-startup07.py'])
 record['passed']=True
finally:
 record['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['elapsedSeconds']=round(time.monotonic()-clock,3);save();print(json.dumps(record))
