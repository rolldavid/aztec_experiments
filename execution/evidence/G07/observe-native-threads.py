"""Read-only numeric evidence helper; no process control and no raw environment output."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

root_pid = int(sys.argv[1])
candidate = sys.argv[2]
output = Path(sys.argv[3])
if output.exists():
    raise RuntimeError('Observation already exists; do not overwrite')
record = {
    'supervisorPid': root_pid, 'candidate': candidate,
    'kind': 'Read-only numeric native child configuration, not measured CPU parallelism',
    'observerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'observations': [], 'errors': []
}
seen = set()
start = time.monotonic()
while time.monotonic() - start < 540:
    rows = {}
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,comm='], text=True).splitlines():
        fields = line.strip().split(None, 2)
        if len(fields) == 3:
            rows[int(fields[0])] = (int(fields[1]), fields[2])
    if root_pid not in rows:
        record['supervisorAbsentAtEnd'] = True
        break
    owned = {root_pid}
    while True:
        extended = owned | {pid for pid, (ppid, _) in rows.items() if ppid in owned}
        if extended == owned:
            break
        owned = extended
    for pid in owned - seen:
        ppid, comm = rows[pid]
        if os.path.basename(comm) not in ['bb', 'bb-one-thread', 'bb-two-threads']:
            continue
        try:
            result = subprocess.run(['/bin/ps', 'eww', '-p', str(pid), '-o', 'command='],
                                    capture_output=True, text=True, timeout=2)
            values = {}
            for key in ['HARDWARE_CONCURRENCY', 'PROVER_THREADS']:
                found = re.findall(r'(?:^|\s)' + key + r'=([0-9]+)(?=\s|$)', result.stdout)
                if len(found) == 1:
                    values[key] = int(found[0])
            if values:
                record['observations'].append({
                    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'pid': pid, 'ppid': ppid, **values
                })
                seen.add(pid)
        except Exception as error:
            record['errors'].append({'pid': pid, 'category': type(error).__name__})
    output.write_text(json.dumps(record, indent=2) + '\n')
    time.sleep(1)
record['elapsedSeconds'] = round(time.monotonic() - start, 3)
record['finished'] = True
output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'observations': len(record['observations']), 'errors': len(record['errors']),
                  'supervisorAbsentAtEnd': record.get('supervisorAbsentAtEnd', False)}))
