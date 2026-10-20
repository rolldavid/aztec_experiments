import hashlib, json, os, pathlib, pwd, grp, shutil, subprocess, tarfile
os.umask(63)
run = lambda a: subprocess.check_output(a, text=True, timeout=30).strip()
for unit in ('rolling-bok-testnet.service', 'rolling-bok-artifact-proxy.service'):
    assert run(['systemctl', 'show', unit, '-p', 'MainPID', '--value']) == '0'
    assert run(['systemctl', 'show', unit, '-p', 'LoadState', '--value']) == 'masked'
assert RECEIPT['sourceInstance'] == 'i-0a56b0bc2dd7727b2' and RECEIPT['destinationInstance'] == 'i-0a7d9957f2b3d7f19'
assert RECEIPT['oldWriterTerminated'] is True
assert RECEIPT['operatorAddress'] == '0x17d5f49a10c969293812ab72418fa947414e704ea13f540486b46dae4fad139e'
assert json.loads(pathlib.Path('/var/lib/rolling-bootstrap/deadline.json').read_text())['budgetStop'] == '2026-10-21T06:42:00Z'
run(['/usr/bin/python3', '/usr/local/lib/rolling-attest.py'])
P = pathlib.Path('/var/lib/rolling-bootstrap-private/dedicated-bok-restore-20261020')
P.mkdir(mode=448)
targets = ['var/lib/rolling-bok-testnet', 'etc/rolling-bok-testnet', 'var/lib/rolling-bootstrap-private/bok-testnet']
assert all((not pathlib.Path('/' + n).exists() for n in targets)), 'Existing identity/state must not be overwritten'
subprocess.run(['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '120', '--output', str(P / 'state.cms'), GET_URL], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sha = lambda f: hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()
assert (P / 'state.cms').stat().st_size == RECEIPT['bytes'] <= 268435456 and sha(P / 'state.cms') == RECEIPT['sha256']
stage = P / 'stage'
stage.mkdir(mode=448)
child = subprocess.Popen(['openssl', 'cms', '-decrypt', '-binary', '-inform', 'DER', '-in', str(P / 'state.cms'), '-inkey', '/var/lib/rolling-bootstrap-private/bok-cutover-recipient/decrypt-key.pem'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
try:
    with tarfile.open(fileobj=child.stdout, mode='r|gz') as archive:
        total = 0
        directories = []
        for member in archive:
            total += member.size
            assert total <= 268435456
            assert not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts
            allowed = targets + ['etc/systemd/system/rolling-bok-testnet.service', 'etc/systemd/system/rolling-bok-artifact-proxy.service', 'etc/systemd/system/rolling-bok-testnet.service.d/native-crs.conf', 'restore-inventory.json']
            assert any((member.name.rstrip('/') == prefix or member.name.startswith(prefix + '/') for prefix in allowed)), 'Unexpected transfer path'
            if member.isdir():
                directories.append({'path': member.name.rstrip('/'), 'mode': member.mode & 511, 'uid': member.uid, 'gid': member.gid})
            archive.extract(member, stage, filter='data')
finally:
    child.stdout.close()
assert child.wait(timeout=15) == 0
inventory = stage / 'restore-inventory.json'
assert sha(inventory) == RECEIPT['inventorySha256']
audit = json.loads(inventory.read_text())
assert audit['operatorAddress'] == RECEIPT['operatorAddress']
assert sorted(directories, key=lambda x: x['path']) == sorted(audit['directories'], key=lambda x: x['path']), 'Directory metadata changed'
for entry in [*audit['files'], *directories]:
    if any((entry['path'] == top or entry['path'].startswith(top + '/') for top in targets)):
        assert entry['uid'] in (0, audit['oldBokUid']) and entry['gid'] in (0, audit['oldBokGid']), 'Unexpected restored ownership'
for f in audit['files']:
    path = stage / f['path']
    assert path.is_file() and path.stat().st_size == f['bytes'] and (sha(path) == f['sha256'])
try:
    group = grp.getgrnam('rolling-bok')
except KeyError:
    subprocess.run(['groupadd', '--system', 'rolling-bok'], check=True)
    group = grp.getgrnam('rolling-bok')
try:
    user = pwd.getpwnam('rolling-bok')
except KeyError:
    subprocess.run(['useradd', '--system', '--gid', 'rolling-bok', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', 'rolling-bok'], check=True)
    user = pwd.getpwnam('rolling-bok')
assert user.pw_gid == group.gr_gid and user.pw_shell == '/usr/sbin/nologin'
for rel in targets:
    dest = pathlib.Path('/' + rel)
    dest.parent.mkdir(parents=True, exist_ok=True, mode=448)
    os.rename(stage / rel, dest)
state = pathlib.Path('/var/lib/rolling-bok-testnet')
for path in [state, *state.rglob('*')]:
    os.chown(path, user.pw_uid, group.gr_gid, follow_symlinks=False)
os.chmod(state, 448)
for f in audit['files']:
    if any((f['path'] == top or f['path'].startswith(top + '/') for top in targets)):
        path = pathlib.Path('/' + f['path'])
        os.chmod(path, f['mode'])
        if not path.is_relative_to(state):
            assert f['uid'] in (0, audit['oldBokUid']) and f['gid'] in (0, audit['oldBokGid']), 'Unexpected configuration ownership'
            os.chown(path, user.pw_uid if f['uid'] == audit['oldBokUid'] else 0, group.gr_gid if f['gid'] == audit['oldBokGid'] else 0)
for top in ('/var/lib/rolling-bootstrap-private/bok-testnet',):
    os.chown(top, 0, 0)
    os.chmod(top, 448)
for entry in directories:
    if any((entry['path'] == top or entry['path'].startswith(top + '/') for top in targets)):
        path = pathlib.Path('/' + entry['path'])
        os.chmod(path, entry['mode'])
        os.chown(path, user.pw_uid if entry['uid'] == audit['oldBokUid'] else 0, group.gr_gid if entry['gid'] == audit['oldBokGid'] else 0)
assert not pathlib.Path('/var/lib/rolling-bok-testnet/hosted.lock').exists()
print(json.dumps({'restored': True, 'operatorAddress': audit['operatorAddress'], 'filesVerified': len(audit['files']), 'unitsRemainMasked': True, 'started': False, 'scope': 'exact original Bok identity/state/config; no replay'}))
