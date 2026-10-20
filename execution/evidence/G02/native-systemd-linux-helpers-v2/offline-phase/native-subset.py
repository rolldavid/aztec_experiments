import hashlib,json,os,pathlib,re,selectors,signal,stat,subprocess,time
NATIVE_UNIT="rolling-native-version.service"
def bounded_capture(args,seconds,limit=8192):
    # Fixed callers only. Stream, hash and discard bytes past the cap; no native
    # output or exception text enters evidence. Wall bound includes full pipes.
    captures={k:{'bytes':0,'sha256':hashlib.sha256(),'data':bytearray()} for k in ('stdout','stderr')}
    child=None;timed=False;reaped=False;code=None
    try:
        child=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            start_new_session=True,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})
        with selectors.DefaultSelector() as selector:
            for key,pipe in (('stdout',child.stdout),('stderr',child.stderr)):
                os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,key)
            deadline=time.monotonic()+seconds
            while selector.get_map():
                if time.monotonic()>=deadline:timed=True;break
                for key,_ in selector.select(min(.05,max(0,deadline-time.monotonic()))):
                    data=os.read(key.fileobj.fileno(),4096)
                    if not data:selector.unregister(key.fileobj);continue
                    row=captures[key.data];row['bytes']+=len(data);row['sha256'].update(data)
                    if len(row['data'])<limit:row['data'].extend(data[:limit-len(row['data'])])
            if not timed:
                try:code=child.wait(timeout=max(.001,deadline-time.monotonic()));reaped=True
                except subprocess.TimeoutExpired:timed=True
    finally:
        if child is not None:
            if child.poll() is None or timed:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
            try:code=child.wait(timeout=2);reaped=True
            except subprocess.TimeoutExpired:pass
            for pipe in (child.stdout,child.stderr):
                if pipe is not None:pipe.close()
    summary={'started':child is not None,'timeout':timed,'reaped':reaped,'returnCode':code}
    for key,row in captures.items():summary[key]={'bytes':row['bytes'],'sha256':row['sha256'].hexdigest(),'truncated':row['bytes']>limit}
    return summary,{k:bytes(v['data']) for k,v in captures.items()}

def run(args, timeout=120, capture=False, cwd=None):
    result = subprocess.run(args, check=True, timeout=timeout, cwd=cwd, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin', 'HOME':'/root', 'LANG':'C', 'LC_ALL':'C', 'LOG_LEVEL':'silent'})
    return result.stdout.decode().strip() if capture else None

def write(path, text, mode=0o600):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink(): raise ValueError('Unsafe destination')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'w') as f:
        os.fchmod(f.fileno(), mode); f.write(text); f.flush(); os.fsync(f.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def read_bounded_json(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size>16384: raise ValueError('Invalid bounded record')
        with os.fdopen(fd,'rb',closefd=False) as f:
            data=f.read(16385)
        if len(data)>16384: raise ValueError('Invalid bounded record')
        value=json.loads(data)
        if type(value) is not dict: raise ValueError('Invalid bounded record')
        return value
    finally: os.close(fd)

def native_ordering(unit):
    if unit not in ('rolling-budget.timer',NATIVE_UNIT):raise ValueError('Invalid retention unit')
    capture,raw=bounded_capture(['systemctl','show',unit,'--property=Before,After'],3,4096)
    if capture['timeout'] or capture['returnCode']!=0 or not capture['reaped'] or capture['stdout']['truncated']:raise ValueError('Retention readback unavailable')
    fields={}
    for line in raw['stdout'].decode('ascii').splitlines():
        key,value=line.split('=',1)
        if key not in ('Before','After') or key in fields:raise ValueError('Invalid retention readback')
        names=value.split()
        if len(names)>128 or len(names)!=len(set(names)) or any(not re.fullmatch(r'[A-Za-z0-9_.:@\\-]{1,255}',name) for name in names):raise ValueError('Invalid retention dependencies')
        fields[key]=set(names)
    if set(fields)!={'Before','After'}:raise ValueError('Incomplete retention readback')
    return fields

def native_retain_execution():
    # A file-declared ordering edge also holds a reference. The already-active
    # timer retains this inactive service across --wait / show, without starting
    # it. Before follows the normal timer -> basic.target -> service ordering.
    # Neither timer deadline nor its activation/stop dependencies are changed.
    write('/etc/systemd/system/rolling-budget.timer.d/native-version-reference.conf',
          '[Unit]\nBefore='+NATIVE_UNIT+'\n',0o644)
    run(['systemctl','daemon-reload'],timeout=5)
    for timer in ('budget','commissioning'):
        run(['systemctl','is-active','--quiet','rolling-'+timer+'.timer'],timeout=3)
    timer=native_ordering('rolling-budget.timer');service=native_ordering(NATIVE_UNIT)
    if NATIVE_UNIT not in timer['Before'] or NATIVE_UNIT in timer['After'] or 'rolling-budget.timer' not in service['After'] or 'rolling-budget.timer' in service['Before']:
        raise ValueError('Retention ordering mismatch')

def native_state():
    try:
        capture,raw=bounded_capture(['systemctl','show',NATIVE_UNIT,'--property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestampMonotonic'],3,4096)
    except Exception:return {'status':'transport-error'}
    if capture['timeout'] or capture['returnCode']!=0 or not capture['reaped']:return {'status':'transport-error'}
    try:
        if capture['stdout']['truncated']:raise ValueError()
        fields={}
        for line in raw['stdout'].decode('ascii').splitlines():
            key,value=line.split('=',1)
            if key in fields:raise ValueError()
            fields[key]=value
        if set(fields)!={'ActiveState','SubState','Result','ExecMainCode','ExecMainStatus','ExecMainStartTimestampMonotonic'}:raise ValueError()
        allowed={'ActiveState':('active','inactive','failed','activating','deactivating'),
                 'SubState':('running','dead','failed','start','stop','stop-sigterm','stop-sigkill','exited'),
                 'Result':('success','exit-code','signal','core-dump','timeout','oom-kill','resources','start-limit-hit','protocol')}
        if any(fields[key] not in values for key,values in allowed.items()):raise ValueError()
        nums={}
        for key,maximum in [('ExecMainCode',6),('ExecMainStatus',255),('ExecMainStartTimestampMonotonic',2**63-1)]:
            if not re.fullmatch('[0-9]{1,19}',fields[key]) or int(fields[key])>maximum:raise ValueError()
            nums[key]=int(fields[key])
        return {'status':'observed',**{k:fields[k] for k in allowed},**nums}
    except Exception:return {'status':'projection-error'}

def native_result(value):
    expected={'schemaVersion','started','timeout','reaped','returnCode','stdout','stderr','versionMatches'}
    if type(value) is not dict or set(value)!=expected or type(value['schemaVersion']) is not int or value['schemaVersion']!=1:raise ValueError('Invalid version result')
    if any(type(value[k]) is not bool for k in ('started','timeout','reaped','versionMatches')):raise ValueError('Invalid version flags')
    if value['returnCode'] is not None and (type(value['returnCode']) is not int or not -255<=value['returnCode']<=255):raise ValueError('Invalid version status')
    for key in ('stdout','stderr'):
        row=value[key]
        if type(row) is not dict or set(row)!={'bytes','sha256','truncated'} or type(row['bytes']) is not int or not 0<=row['bytes']<=2**53-1 or type(row['sha256']) is not str or not re.fullmatch('[a-f0-9]{64}',row['sha256']) or type(row['truncated']) is not bool or row['truncated']!=(row['bytes']>8192):raise ValueError('Invalid output projection')
    return json.loads(json.dumps(value))

def native_classify(state,result):
    if state['status']!='observed':return 'state-unreadable'
    if state['Result']=='oom-kill':return 'oom'
    if state['Result']=='timeout' or result and result['timeout']:return 'timeout'
    if state['Result'] in ('signal','core-dump') or result and result['returnCode'] is not None and result['returnCode']<0:return 'signal'
    if state['Result']=='exit-code' or result and result['returnCode'] not in (None,0):return 'nonzero'
    if state['ActiveState']=='active':return 'started'
    if result and result['started'] and result['reaped'] and result['returnCode']==0 and result['versionMatches'] and not result['stdout']['truncated'] and not result['stderr']['truncated'] and state['Result']=='success' and state['ActiveState']=='inactive' and state['ExecMainCode']==1 and state['ExecMainStatus']==0 and state['ExecMainStartTimestampMonotonic']>0:return 'passed'
    return 'unqualified'
CAPTURE='\nimport hashlib, json, os, pathlib, selectors, signal, subprocess, time\n\ndef bounded_capture(args,seconds,limit=8192):\n    # Fixed callers only. Stream, hash and discard bytes past the cap; no native\n    # output or exception text enters evidence. Wall bound includes full pipes.\n    captures={k:{\'bytes\':0,\'sha256\':hashlib.sha256(),\'data\':bytearray()} for k in (\'stdout\',\'stderr\')}\n    child=None;timed=False;reaped=False;code=None\n    try:\n        child=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,\n            start_new_session=True,env={\'PATH\':\'/usr/bin:/bin\',\'LANG\':\'C\',\'LC_ALL\':\'C\'})\n        with selectors.DefaultSelector() as selector:\n            for key,pipe in ((\'stdout\',child.stdout),(\'stderr\',child.stderr)):\n                os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,key)\n            deadline=time.monotonic()+seconds\n            while selector.get_map():\n                if time.monotonic()>=deadline:timed=True;break\n                for key,_ in selector.select(min(.05,max(0,deadline-time.monotonic()))):\n                    data=os.read(key.fileobj.fileno(),4096)\n                    if not data:selector.unregister(key.fileobj);continue\n                    row=captures[key.data];row[\'bytes\']+=len(data);row[\'sha256\'].update(data)\n                    if len(row[\'data\'])<limit:row[\'data\'].extend(data[:limit-len(row[\'data\'])])\n            if not timed:\n                try:code=child.wait(timeout=max(.001,deadline-time.monotonic()));reaped=True\n                except subprocess.TimeoutExpired:timed=True\n    finally:\n        if child is not None:\n            if child.poll() is None or timed:\n                try:os.killpg(child.pid,signal.SIGKILL)\n                except ProcessLookupError:pass\n            try:code=child.wait(timeout=2);reaped=True\n            except subprocess.TimeoutExpired:pass\n            for pipe in (child.stdout,child.stderr):\n                if pipe is not None:pipe.close()\n    summary={\'started\':child is not None,\'timeout\':timed,\'reaped\':reaped,\'returnCode\':code}\n    for key,row in captures.items():summary[key]={\'bytes\':row[\'bytes\'],\'sha256\':row[\'sha256\'].hexdigest(),\'truncated\':row[\'bytes\']>limit}\n    return summary,{k:bytes(v[\'data\']) for k,v in captures.items()}\n\ndef native_worker():\n    output=pathlib.Path(\'/var/lib/rolling-native-version/result.json\')\n    # StateDirectory is disposable, but an acknowledged intent is never replayed.\n    with open(output.parent/\'intent.json\',\'x\') as file:\n        file.write(\'{"schemaVersion":1,"attempts":1}\');file.flush();os.fsync(file.fileno())\n    directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)\n    try:os.fsync(directory)\n    finally:os.close(directory)\n    result,raw=bounded_capture([\'/opt/rolling-native-version/bb\',\'--version\'],15)\n    result.update(schemaVersion=1,versionMatches=raw[\'stdout\'].strip()==EXPECTED_VERSION.encode() and not result[\'stdout\'][\'truncated\'])\n    with open(output,\'x\') as file:\n        file.write(json.dumps(result,separators=(\',\',\':\')));file.flush();os.fsync(file.fileno())\n    directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)\n    try:os.fsync(directory)\n    finally:os.close(directory)\n'
UNIT='[Unit]\nDescription=Closed public binary version diagnostic\nAfter=rolling-egress.service\n[Service]\nType=exec\nDynamicUser=yes\nStateDirectory=rolling-native-version\nStateDirectoryMode=0700\nExecStart=/usr/bin/python3 /opt/rolling-native-version/capture.py\nRestart=no\nRuntimeMaxSec=20s\nTimeoutStopSec=2s\nKillMode=control-group\nMemoryMax=512M\nMemorySwapMax=0\nCPUQuota=200%\nTasksMax=64\nUMask=0077\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nPrivateNetwork=yes\nIPAddressDeny=any\nPrivateTmp=yes\nPrivateDevices=yes\nProtectSystem=strict\nProtectHome=yes\nProtectKernelTunables=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nInaccessiblePaths=/var/lib/rolling-bootstrap-private /var/lib/cloud\nStandardOutput=null\nStandardError=null\n'
SOURCE_FUNCTION_HASHES={'bounded_capture': 'd0ce3219a5b5f23a7eed5905eade1ac46732460b27cf9854d879232ef79a49eb', 'run': '2808f6f645ce91ef502d42d880f561869053ab92031c5b6cd88c82c4c5daf43e', 'write': '620b005c2a6c0bbc81a48f21eb538d5cb63b7f17ae68afd95c7df2a021132e13', 'read_bounded_json': '58452a43d40df7078817af7805e0ef606d2da6767159db9aefb9c27b3eb6104b', 'native_ordering': 'eb8c25378c0f60914a1f9fa5c1d3790e8efadee6e131012bdbea27d67f33e26e', 'native_retain_execution': 'f22b4b09803cca672ffee11c2338db4112dadb01b7bef55e99241cec4c6c85ad', 'native_state': '446cd06c2a6a3e8cb16df2ab65de49b716597b74d72f48194b6885639346c1b6', 'native_result': 'b52c17e3341fd2531ea937987d32dfa8e8f84b25bb1d65db945da76a0fb31a1a', 'native_classify': '7375b71e0671082c413635e3dce1df294216720e82d84554148679b2e158219e'}
