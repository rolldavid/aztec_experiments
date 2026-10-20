# Appended to the existing generated bootstrap instead of its execute() call.
# CONFIG, SOURCE, ATTESTATION and all production HOST functions are unchanged.
if platform.system() != 'Linux' or platform.machine() != 'x86_64' or os.geteuid() != 0:
    raise ValueError('Native Linux x64 root required')
BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
DIAGNOSTICS_ACTIVE=True
mark('entry')
commissioning_phase='controls'
with open(BASE/'lock', 'a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        run(['systemctl','mask','--now','rolling-node.service','rolling-query.service',
             'board-prover.service','board-prover-proxy.service'])
        install_controls(CONFIG)
        write(BASE/'stage','controls')
        install_attestation(ATTESTATION)
        # Only public immutable HOST definitions; no capability/config is included.
        write('/usr/local/lib/rolling-commission-source.py', SOURCE)
        for name in ('budget','commissioning'):
            run(['systemctl','is-active','--quiet','rolling-'+name+'.timer'])
        before = verify_controls()
        commissioning_phase='package'
        if not RELEASE.exists():
            write(BASE/'stage','package')
            archive=BASE/'runtime.tar.gz'
            mark('runtime-download')
            if not archive.exists(): fetch_package(CONFIG['runtimeUrl'], archive)
            mark('runtime-verify');extract_verified(archive, RELEASE, CONFIG['runtimeArchiveSha256'])
        else: mark('runtime-verify');verify_release(RELEASE)
        commissioning_phase='native-checks';mark('native-checks')
        node=str(RELEASE/'node/bin/node')
        bb=str(RELEASE/'node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb')
        if run([node,'--version'],capture=True)!='v24.21.0': raise ValueError('Wrong Node')
        if run([bb,'--version'],capture=True)!=PINS['bbVersion']: raise ValueError('Wrong BB')
        script="for(const p of ['lmdb','@crate-crypto/node-eth-kzg','snappy','msgpackr-extract','@aztec-labs/pxe/server','./prover/service.mjs','./prover/worker-native-profile.mjs'])await import(p);"
        run([node,'--input-type=module','--eval',script],cwd=RELEASE,timeout=120)
        commissioning_phase='controls'
        for unit in ('rolling-node.service','rolling-query.service','board-prover.service','board-prover-proxy.service'):
            if run(['systemctl','show',unit,'--property=LoadState','--value'],capture=True)!='masked':
                raise ValueError('Workload unmasked')
        after=verify_controls()
        write(BASE/'commission-native.json',json.dumps({'manifestSha256':PINS['manifest'],
              'node':'24.21.0','bb':PINS['bbVersion'],'nativeImports':True,
              'controlsVerified':True,'workloadsMasked':True,'egressBefore':before,'egressAfter':after}))
        print('ROLLING_COMMISSION_NATIVE_READY')
    except Exception as error:
        # A package/import failure is repairable while the already-qualified
        # original controls remain live. A control failure always shuts down.
        if commissioning_phase not in ('package','native-checks'):
            shutdown_failure(error)
        failed_step=STEP
        try:
            verify_controls()
            immutable_deadline(CONFIG)
            if dt.datetime.now(dt.timezone.utc)>=dt.datetime.fromisoformat(CONFIG['commissioningStop'].replace('Z','+00:00')):
                raise ValueError('Commissioning expired')
            for name in ('budget','commissioning'):
                run(['systemctl','is-active','--quiet','rolling-'+name+'.timer'])
            run(['systemctl','is-active','--quiet','rolling-attest.timer'])
            for unit in ('rolling-node.service','rolling-query.service','board-prover.service','board-prover-proxy.service'):
                if run(['systemctl','show',unit,'--property=LoadState','--value'],capture=True)!='masked':
                    raise ValueError('Workload unmasked')
                try: run(['systemctl','is-active','--quiet',unit])
                except subprocess.CalledProcessError as stopped:
                    if stopped.returncode not in (3,4): raise
                else: raise ValueError('Workload active')
        except BaseException as control_error:
            shutdown_failure(control_error)
        STEP=failed_step;diagnostic(error);write(BASE/'stage','failed')
        print('ROLLING_COMMISSION_SETUP_FAILED '+json.dumps({'phase':commissioning_phase,'step':STEP,'controlsVerified':True,'workloadsMasked':True,'deadlinesUnchanged':True}),flush=True)
        raise SystemExit(1) from None
    except BaseException as error:
        shutdown_failure(error)
    finally:
        DIAGNOSTICS_ACTIVE=False
