"""Development unit tests; no Linux services, cloud calls, or proof jobs are run."""
import base64, datetime as dt, gzip, hashlib, importlib.util, io, json, lzma, pathlib, subprocess, tarfile, tempfile, unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'deploy/prover/bootstrap.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
NOW=dt.datetime(2026,10,11,18,0,tzinfo=dt.timezone.utc)
def config():
    return dict(createdAt='2026-10-11T18:00:00Z',budgetStop='2026-10-12T02:00:00Z',commissioningStop='2026-10-11T18:30:00Z',
                runtimeUrl='https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com/releases/test/runtime.tar.gz?X-Amz-Signature=PRIVATE_SENTINEL',
                runtimeArchiveSha256='a'*64,manifestSha256='b'*64)
def host(diagnostic_devices=False):
    ns={'PINS':{'manifest':'b'*64,'node':b.NODE_SHA,'bb':b.BB_SHA,'catalog':b.CATALOG_SHA,'image':b.IMAGE},'NETWORK':b.NETWORK,'QUALIFICATION':b.QUALIFICATION}
    exec(b.HOST,ns)
    if not diagnostic_devices:ns['emit_diagnostic']=lambda data:None # never write Mac device output
    return ns

def ready_fixture():
    scope=b.QUALIFICATION['service']
    return {'ready':True,'chainId':scope['chainId'],'rollupVersion':scope['rollupVersion'],'rollupAddress':scope['queryNode']['rollupAddress'],'proofsEnabled':True,
            'latestBlockNumber':100,'latestBlockHash':'0x'+'a'*64,'checkpointedBlockNumber':99,'finalizedBlockNumber':98,'oldestHistoricBlockNumber':0,
            'syncedL1Timestamp':'1791741600','checkedAtSeconds':1791741630,'lagSeconds':30}
def qualifier_fixture():
    scope=b.QUALIFICATION['service']
    anchor={'ready':True,'blockNumber':99,'blockHash':'0x'+'b'*64}
    checks={k:{'rejected':True} for k in ('wrong-chain','wrong-version','wrong-rollup','proof-config-floor')}
    checks.update(healthy=anchor,recovered=anchor,nativeAndRollingCatalog={'passed':True,'circuitCount':16},missingHelper={'missingHelperRejected':True},manifestUnchanged=True,
                  freshness={k:True for k in ('paused','stale','queriesRejected','resumed','recovered')})
    return {'schemaVersion':1,'passed':True,'stage':'complete','checks':checks,'cleanup':{k:True for k in ('serviceClosed','temporaryFilesRemoved','childProcessesExited')},
            'release':{'manifestSha256':'b'*64},'proofJobs':0,
            'publicScope':{'chainId':scope['chainId'],'version':scope['rollupVersion'],'rollup':scope['queryNode']['rollupAddress'],'applicationProfile':'legacy','board':scope['board'],'proofs':'real','maxLagSeconds':120}}

class Bootstrap(unittest.TestCase):
    def test_current_reviewed_catalog_matches_bootstrap_pin(self):
        # A newly packaged profile catalog must not reach a paid host with the
        # historical catalog pin. The immutable runtime validator still rejects
        # substituted bytes; updates require explicit source review.
        catalog=ROOT/'prover/rolling-artifacts.json'
        self.assertEqual(hashlib.sha256(catalog.read_bytes()).hexdigest(),b.CATALOG_SHA)

    def test_valid_input_frozen_and_bounded_userdata_shell_syntax(self):
        c=config();text=b.generate(c,NOW)
        self.assertEqual(c,config());self.assertNotIn('PRIVATE_SENTINEL',text)
        self.assertLess(len(gzip.compress(text.encode(),mtime=0)),16384)
        subprocess.run(['/bin/sh','-n'],input=text,text=True,check=True)
        encoded=text.split("base64.b64decode('")[1].split("')")[0]
        source=lzma.decompress(base64.b64decode(encoded)).decode();compile(source,'generated','exec')
        self.assertIn('PRIVATE_SENTINEL',source) # private artifact, never public evidence
        self.assertNotIn('PRIVATE_SENTINEL',source.split('ATTESTATION = ')[1])

    def test_alone_encoding_preserves_exact_program_and_executes_real_wrapper(self):
        # Encoding comparison uses the same source hash and config. Only the
        # final host entry is a labelled stub; no cloud or host operation runs.
        compressor=lzma.compress;captured=[]
        def legacy_encoding(data,**kwargs):
            captured.append(data)
            return compressor(data,preset=6)
        c=config()
        with patch.object(b.lzma,'compress',side_effect=legacy_encoding):legacy=b.generate(c,NOW)
        current=b.generate(c,NOW)
        def decode(text):
            encoded=text.split("base64.b64decode('")[1].split("')")[0]
            return lzma.decompress(base64.b64decode(encoded))
        self.assertEqual(decode(current),decode(legacy));self.assertEqual(decode(current),captured[0])
        # Exercise the actual new shell/Python wrapper, rather than only its
        # decompressor. Replace exactly the final entry in its decoded payload.
        program=decode(current)
        self.assertEqual(program.count(b'\nexecute(CONFIG, ATTESTATION)\n'),1)
        harmless=program.replace(b'\nexecute(CONFIG, ATTESTATION)\n',b'\nprint("WRAPPER_DEFINITIONS_READY")\n')
        encoded=current.split("base64.b64decode('")[1].split("')")[0]
        replacement=base64.b64encode(compressor(harmless,format=lzma.FORMAT_ALONE,
            filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'pb':0}])).decode()
        wrapper=current.replace(encoded,replacement)
        result=subprocess.run(['/bin/sh'],input=wrapper,text=True,capture_output=True,timeout=5)
        self.assertEqual(result.returncode,0);self.assertEqual(result.stdout,'WRAPPER_DEFINITIONS_READY\n')
        self.assertEqual(result.stderr,'');self.assertNotIn('PRIVATE_SENTINEL',result.stdout)
        self.assertIn('set -eu\numask 077\n',wrapper)

    def test_malicious_inputs_rejected_without_echo(self):
        bad=[('runtimeUrl','https://evil.example/releases/runtime.tar.gz'),('runtimeUrl',config()['runtimeUrl']+'\n$(id)'),
             ('runtimeUrl','https://user:pass@anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com/releases/a.tar.gz'),
             ('runtimeUrl','https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com/releases/../a.tar.gz'),
             ('runtimeArchiveSha256','a'*63+';'),('manifestSha256',None),('budgetStop','2026-10-12T02:00:01Z'),
             ('commissioningStop','2026-10-11T18:31:00Z'),('createdAt','2026-10-11T15:00:00Z'),('budgetStop','tomorrow; poweroff')]
        for key,value in bad:
            with self.subTest(key=key,value=value):
                c=config();c[key]=value
                with self.assertRaises(b.Invalid) as e:b.generate(c,NOW)
                self.assertNotIn('PRIVATE_SENTINEL',str(e.exception))
        c=config();c['command']='id'
        with self.assertRaises(b.Invalid):b.generate(c,NOW)

    def test_bucket_region_binding_and_redirect_rejection(self):
        actual=config();self.assertEqual(b.validate(actual,NOW),actual)
        wrong=config();wrong['runtimeUrl']=wrong['runtimeUrl'].replace('.s3.eu-west-2.','.s3.us-east-1.')
        with self.assertRaises(b.Invalid):b.validate(wrong,NOW)
        # Labelled transport fake: invoke the actual NoRedirect handler with the
        # observed S3 wrong-region301 shape. No network, redirect follow or retry.
        ns=host();calls=[]
        class Opener:
            def __init__(self,handler):self.handler=handler
            def open(self,url,**kwargs):
                calls.append(url)
                return self.handler.redirect_request(None,None,301,'Moved',{'x-amz-bucket-region':'eu-west-2'},actual['runtimeUrl'])
        with tempfile.TemporaryDirectory() as t,patch.object(ns['urllib'].request,'build_opener',side_effect=lambda handler:Opener(handler)):
            destination=pathlib.Path(t)/'archive.tar.gz'
            with self.assertRaisesRegex(ValueError,'^Redirect rejected$'):ns['fetch_package'](wrong['runtimeUrl'],destination)
            self.assertEqual(calls,[wrong['runtimeUrl']]);self.assertFalse(destination.exists())

    def test_deadline_cannot_be_extended_or_package_replaced(self):
        ns=host()
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t)
            # Dates far enough ahead for the host's clock; generator checks launch freshness separately.
            c=config();c['budgetStop']='2099-10-12T02:00:00Z'
            ns['immutable_deadline'](c);ns['immutable_deadline'](c)
            for key,value in [('budgetStop','2100-10-12T02:00:00Z'),('runtimeArchiveSha256','c'*64),('manifestSha256','d'*64)]:
                changed=dict(c,**{key:value})
                with self.assertRaises(ValueError):ns['immutable_deadline'](changed)
                self.assertEqual(json.loads((pathlib.Path(t)/'deadline.json').read_text())['budgetStop'],c['budgetStop'])

    def test_corrupt_archive_never_extracts(self):
        ns=host()
        with tempfile.TemporaryDirectory() as t:
            archive=pathlib.Path(t)/'bad.tar.gz';archive.write_bytes(b'corrupt')
            target=pathlib.Path(t)/'target'
            with self.assertRaises(ValueError):ns['extract_verified'](archive,target,'0'*64)
            self.assertFalse(target.exists())

    def test_archive_external_path_rejected_before_any_execution(self):
        ns=host();called=[];ns['verify_release']=lambda _:called.append('verify')
        with tempfile.TemporaryDirectory() as t:
            archive=pathlib.Path(t)/'bad.tar.gz'
            with tarfile.open(archive,'w:gz') as tar:
                entry=tarfile.TarInfo('../outside');entry.size=1;tar.addfile(entry,io.BytesIO(b'x'))
            with self.assertRaises(tarfile.FilterError):ns['extract_verified'](archive,pathlib.Path(t)/'target',ns['digest'](archive))
            self.assertFalse((pathlib.Path(t)/'outside').exists());self.assertEqual(called,[])

    def test_manifest_all_files_hashes_and_native_pins(self):
        ns=host()
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);files={}
            paths=['node/bin/node','node_modules/@aztec-foundation/bb.js/build/amd64-linux/bb','prover/rolling-artifacts.json']
            for rel in paths:
                p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(rel.encode());files[rel]=ns['digest'](p)
            m={'platform':'linux-x64','applicationProfile':'rolling','files':files}
            (root/'prover-release.json').write_text(json.dumps(m));ns['PINS']={'manifest':ns['digest'](root/'prover-release.json'),**dict(zip(['node','bb','catalog'],files.values()))}
            ns['verify_release'](root)
            (root/paths[0]).write_text('tampered')
            with self.assertRaises(ValueError):ns['verify_release'](root)
            (root/paths[0]).write_bytes(paths[0].encode());(root/'extra').write_text('unmanifested')
            with self.assertRaises(ValueError):ns['verify_release'](root)

    def test_actual_control_install_order_and_persistent_absolute_timers(self):
        ns=host();events=[];written={}
        ns['immutable_deadline']=lambda _:events.append('deadline')
        ns['write']=lambda p,s,*args:written.update({str(p):s})
        def run(args,**kw):
            events.append(args)
            if args[:4]==['ip','-j','route','show']:return '[{"dev":"ens5"}]'
        ns['run']=run;ns['verify_controls']=lambda:events.append('verified')
        ns['install_controls'](config())
        self.assertEqual(events[0],'deadline');self.assertEqual(events[-1],'verified')
        timer=written['/etc/systemd/system/rolling-budget.timer']
        self.assertIn('OnCalendar=2026-10-12 02:00:00 UTC',timer);self.assertIn('Persistent=true',timer)
        self.assertIn('rate 50mbit ceil 50mbit',written['/usr/local/sbin/rolling-egress'])
        self.assertTrue(any(e[:2]==['systemctl','mask'] for e in events if type(e)==list))
        self.assertFalse(any('curl' in e or 'docker' in e for e in events if type(e)==list))

    def test_noble_source_derived_class_fixture_and_mandatory_accounting(self):
        # Source-derived, NOT Linux-captured. Noble 6.1.0 tc_class.c:347-375,
        # q_htb.c:292-330, tc_util.c:671-725, sch_htb.c:htb_dump_class.
        ns=host()
        fixture = """class htb 1:1 root rate 50Mbit ceil 50Mbit burst 1Mb cburst 1Mb
 Sent 123456789012 bytes 1234 pkt (dropped 0, overlimits 56 requeues 0)
 backlog 0b 0p requeues 0
 lended: 12 borrowed: 0 giants: 0
 tokens: -43 ctokens: 22
class htb 1:10 parent 1:1 prio 0 rate 25Mbit ceil 50Mbit burst 4725b cburst 7850b
 Sent 123456789000 bytes 1233 pkt (dropped 0, overlimits 0 requeues 0)
 backlog 0b 0p requeues 0
 lended: 12 borrowed: 0 giants: 0
 tokens: 120 ctokens: 220
class htb 1:20 parent 1:1 prio 0 rate 25Mbit ceil 50Mbit burst 4725b cburst 7850b
 Sent 12 bytes 1 pkt (dropped 0, overlimits 0 requeues 0)
 backlog 0b 0p requeues 0
 lended: 0 borrowed: 1 giants: 0
 tokens: 1 ctokens: 2"""
        self.assertEqual(ns['class_bytes'](fixture),123456789012)
        self.assertEqual(ns['class_bytes'](fixture.replace('123456789012 bytes','0 bytes')),0)
        self.assertEqual(ns['class_bytes'](fixture.replace('parent 1:1 prio','parent 1:1 leaf 8001: prio',1)),123456789012)
        invalid=[fixture.replace('rate 50Mbit','rate 100Mbit',1), fixture.replace('ceil 50Mbit','ceil 100Mbit',1),
                 fixture.replace('class htb 1:1 root','class htb 1:1 parent 1:1'),
                 fixture.replace('1:20 parent 1:1','1:20 root'),fixture.replace('1:20','1:10'),
                 fixture[:fixture.index('class htb 1:20')],fixture+"\n"+fixture,
                 fixture.replace(' Sent 123456789012 bytes 1234 pkt (dropped 0, overlimits 56 requeues 0)\n',''),
                 fixture.replace('123456789012 bytes','18446744073709551616 bytes'),
                 fixture.replace('123456789012 bytes','-1 bytes'),fixture.replace('123456789012 bytes','null bytes'),
                 '[{"class":"htb","handle":"1:1","rate":6250000,"ceil":6250000}]']
        for sample in invalid:
            with self.subTest(sample=sample[:90]),self.assertRaises(ValueError):ns['class_bytes'](sample)
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);(pathlib.Path(t)/'interface').write_text('ens5')
            (pathlib.Path(t)/'deadline.json').write_text(json.dumps({'budgetStop':'2099-01-01T00:00:00Z'}))
            values={'class':fixture,'version':'tc utility, iproute2-6.1.0, libbpf 1.3.0','package':'6.1.0-1ubuntu6.4',
                    'qdisc':[{'kind':'htb','handle':'1:','root':True,'refcnt':2,
                              'options':{'r2q':10,'default':'0x10','direct_packets_stat':0,'direct_qlen':1000}}]}
            calls=[]
            def run(args,**kw):
                calls.append(args)
                if args==['tc','-V']:return values['version']
                if args[0]=='dpkg-query':return values['package']
                if 'class' in args:return values['class']
                if 'qdisc' in args:return json.dumps(values['qdisc'])
            ns['run']=run;self.assertEqual(ns['verify_controls'](),123456789012)
            self.assertIn(['tc','-s','class','show','dev','ens5'],calls)
            original=json.loads(json.dumps(values))
            for key,bad in [('version','tc utility, iproute2-6.14.0'),('package','6.1.0-1ubuntu6.5'),
                            ('class',invalid[0]),('qdisc',[]),('qdisc',[{'kind':'htb','handle':'1:','root':True}]),
                            ('qdisc',original['qdisc']*2),('qdisc',[dict(original['qdisc'][0],options={'default':'0x20'})])]:
                values.update(original);values[key]=bad
                with self.subTest(key=key),self.assertRaises(ValueError):ns['verify_controls']()
                self.assertEqual(ns['STEP'],{'version':'tc-version','package':'tc-package','class':'tc-class-parse','qdisc':'tc-qdisc-parse'}[key])

    def test_fail_closed_pipeline_controls_before_download_no_retry(self):
        ns=host();events=[]
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);ns['RELEASE']=pathlib.Path(t)/'release'
            ns['install_controls']=lambda _:events.append('controls');ns['verify_controls']=lambda:0
            ns['install_attestation']=lambda _:events.append('attestation')
            def fetch(*_):events.append('download');raise ValueError('PRIVATE_SENTINEL')
            ns['fetch_package']=fetch;ns['attest']=lambda:events.append('safe-attestation')
            ns['run']=lambda args,**kw:events.append(args)
            with patch.object(ns['platform'],'system',return_value='Linux'), patch.object(ns['platform'],'machine',return_value='x86_64'), patch.object(ns['os'],'geteuid',return_value=0):
                with self.assertRaises(SystemExit):ns['execute'](config(),'static')
            self.assertEqual(events[:3],['controls','attestation','download'])
            self.assertEqual(events.count('download'),1)
            self.assertIn(['systemctl','start','rolling-budget.service'],events)
            self.assertEqual((pathlib.Path(t)/'stage').read_text(),'failed')

    def test_actual_node_unit_maps_admin_and_rpc_to_loopback_only(self):
        ns=host();writes={};calls=[]
        ns['prepare_data']=lambda:None;ns['verify_controls']=lambda:0
        ns['write']=lambda p,s,*_:writes.update({str(p):s})
        ns['public_ip']=lambda:'203.0.113.10'
        ns['prepare_admin_key']=lambda:'a'*64
        ns['run']=lambda args,**kw:calls.append(args)
        with patch.object(ns['shutil'],'which',return_value='/usr/bin/docker'):
            ns['install_node']()
        unit=writes['/etc/systemd/system/rolling-node.service']
        command=next(line for line in unit.splitlines() if line.startswith('ExecStart='))
        import shlex
        args=shlex.split(command.removeprefix('ExecStart='))
        mappings=[args[i+1] for i,arg in enumerate(args) if arg=='-p']
        self.assertEqual(mappings,['127.0.0.1:8082:8080','127.0.0.1:8882:8880','40400:40400/tcp','40400:40400/udp'])
        self.assertEqual(args[:3],['/usr/bin/python3',str(ns['RELEASE']/'deploy/prover/bootstrap.py'),'--node-wrapper'])
        self.assertEqual(args[3:5],['/usr/bin/docker','run'])
        self.assertIn('ExecStop=/usr/bin/docker stop -t 30 rolling-node',unit)
        self.assertIn('Restart=no',unit);self.assertIn('TimeoutStopSec=45',unit)
        self.assertIn('AZTEC_ADMIN_API_KEY_HASH='+'a'*64,args)
        self.assertNotIn('qualification-key',command)
        self.assertNotIn('AZTEC_DISABLE_ADMIN_API_KEY',command)
        self.assertNotIn('/var/run/docker.sock',command)
        self.assertNotIn('--privileged',args)
        # Labelled generated-unit test: ordinary/history and debug are explicit,
        # single endpoints. No automatic fallback or permissive validation.
        environment=[args[i+1] for i,arg in enumerate(args) if arg=='-e']
        keys=[item.split('=',1)[0] for item in environment]
        self.assertEqual(len(keys),len(set(keys)))
        env=dict(item.split('=',1) for item in environment)
        self.assertEqual(env['ETHEREUM_HOSTS'],'https://sepolia.gateway.tenderly.co')
        self.assertEqual(env['ETHEREUM_DEBUG_HOSTS'],'https://ethereum-sepolia-rpc.publicnode.com')
        self.assertEqual(env['L1_CONSENSUS_HOST_URLS'],'https://ethereum-sepolia-beacon-api.publicnode.com')
        self.assertEqual(env['ETHEREUM_ALLOW_NO_DEBUG_HOSTS'],'false')
        self.assertEqual(env['BLOB_ALLOW_EMPTY_SOURCES'],'false')
        self.assertEqual(env['PROVER_REAL_PROOFS'],'true')

    def test_controls_failure_never_downloads_and_requests_shutdown(self):
        ns=host();events=[]
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);ns['RELEASE']=pathlib.Path(t)/'release'
            def fail(_): raise ValueError('missing control')
            ns['install_controls']=fail;ns['fetch_package']=lambda *_:events.append('download')
            ns['attest']=lambda:None;ns['run']=lambda args,**kw:events.append(args)
            with patch.object(ns['platform'],'system',return_value='Linux'), patch.object(ns['platform'],'machine',return_value='x86_64'), patch.object(ns['os'],'geteuid',return_value=0):
                with self.assertRaises(SystemExit):ns['execute'](config(),'static')
            self.assertNotIn('download',events)
            self.assertIn(['systemctl','start','rolling-budget.service'],events)

    def qualification_environment(self,directory):
        ns=host();ns['BASE']=pathlib.Path(directory);ns['RELEASE']=pathlib.Path(directory)/'release'
        (ns['RELEASE']/'prover').mkdir(parents=True);(ns['RELEASE']/'prover/qualify-runtime.mjs').write_text('// labelled test fake')
        (ns['BASE']/'deadline.json').write_text(json.dumps(config()))
        ns['verify_release']=lambda _:None;ns['verify_controls']=lambda:123
        return ns

    def test_once_only_qualification_actual_ready_projection_and_safe_report(self):
        with tempfile.TemporaryDirectory() as t:
            ns=self.qualification_environment(t);calls=[]
            def run(args,**kwargs):
                calls.append((args,kwargs))
                if '--eval' in args:return json.dumps(ready_fixture())
                # Intent must be on disk before executing the sole qualifier.
                self.assertTrue((ns['BASE']/'qualification/intent.json').is_file())
                report=qualifier_fixture();report['PRIVATE_SENTINEL']='PRIVATE_SENTINEL'
                pathlib.Path(args[-1]).write_text(json.dumps(report));return None
            ns['run']=run
            with patch.object(ns['time'],'time',return_value=NOW.timestamp()):
                ns['qualify']();ns['qualify']();ns['qualify'](aborted=True)
            self.assertEqual(len(calls),2)
            self.assertIn('createAztecNodeClient',calls[0][0][-1]);self.assertIn('inspectTrustedNode',calls[0][0][-1])
            self.assertNotIn('createTrustedPrivateNode',calls[0][0][-1])
            self.assertEqual(calls[0][1]['cwd'],ns['RELEASE'])
            # Actual JS syntax check only; imports/network never execute here.
            subprocess.run(['node','--input-type=module','--check'],input=calls[0][0][-1],text=True,check=True)
            result=json.loads((ns['BASE']/'qualification/result.json').read_text())
            self.assertTrue(result['passed']);self.assertTrue(all(result['checks'].values()))
            self.assertEqual(result['readiness'],ready_fixture());self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))
            self.assertEqual(result['reportSha256'],hashlib.sha256((ns['BASE']/'qualification/report.json').read_bytes()).hexdigest())
            self.assertEqual((ns['BASE']/'qualification/intent.json').stat().st_mode&0o777,0o600)

    def test_qualification_interrupt_or_fsync_failure_never_replays(self):
        for boundary in ('existing-intent','fsync-after-intent','systemd-abort'):
            with self.subTest(boundary=boundary),tempfile.TemporaryDirectory() as t:
                ns=self.qualification_environment(t);calls=[];ns['run']=lambda *a,**k:calls.append(a)
                directory=ns['BASE']/'qualification';directory.mkdir(mode=0o700)
                if boundary=='existing-intent':(directory/'intent.json').write_text('{') # partial record still prohibits replay
                if boundary=='fsync-after-intent':
                    with patch.object(ns['os'],'fsync',side_effect=OSError('PRIVATE_SENTINEL')):
                        with self.assertRaises(OSError):ns['qualify']()
                ns['qualify'](aborted=boundary=='systemd-abort');ns['qualify']()
                self.assertEqual(calls,[])
                result=json.loads((directory/'result.json').read_text())
                self.assertFalse(result['passed']);self.assertEqual(result['stage'],'interrupted-unknown')
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))

    def test_qualification_failures_and_deadline_are_never_retried(self):
        for boundary in ('readiness-deadline','identity','qualifier-timeout','missing-report','failed-check','wrong-scope','nonzero-with-passed-report'):
            with self.subTest(boundary=boundary),tempfile.TemporaryDirectory() as t:
                ns=self.qualification_environment(t);calls=[]
                def run(args,**kwargs):
                    calls.append(args)
                    if '--eval' in args:
                        r=ready_fixture()
                        if boundary=='identity':r['rollupVersion']='1'
                        return json.dumps(r)
                    if boundary=='qualifier-timeout':raise subprocess.TimeoutExpired('PRIVATE_SENTINEL',900)
                    if boundary=='missing-report':return
                    r=qualifier_fixture()
                    if boundary=='failed-check':r['checks']['freshness']['recovered']=False
                    if boundary=='wrong-scope':r['publicScope']['board']='0x'+'0'*64
                    pathlib.Path(args[-1]).write_text(json.dumps(r))
                    if boundary=='nonzero-with-passed-report':raise subprocess.CalledProcessError(1,args)
                ns['run']=run
                now=NOW.timestamp()+(91*60 if boundary=='readiness-deadline' else 0)
                with patch.object(ns['time'],'time',return_value=now):ns['qualify']();ns['qualify']()
                result=json.loads((ns['BASE']/'qualification/result.json').read_text())
                self.assertFalse(result['passed']);self.assertLessEqual(len(calls),2)
                if boundary=='readiness-deadline':self.assertEqual(calls,[])
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))

    def test_readiness_public_fields_are_validated_and_no_unknowns_projected(self):
        ns=host();r=ready_fixture();r['secret']='PRIVATE_SENTINEL'
        self.assertEqual(ns['readiness_projection'](r),ready_fixture())
        for name,value in [('proofsEnabled',1),('lagSeconds',121),('latestBlockNumber',True),('syncedL1Timestamp','0'),('latestBlockHash','PRIVATE_SENTINEL')]:
            r=ready_fixture();r[name]=value
            with self.subTest(name=name),self.assertRaises(ValueError):ns['readiness_projection'](r)

    def test_console_qualification_projection_rejects_unknown_fields(self):
        ns=host()
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);ns['verify_controls']=lambda:99
            (ns['BASE']/'deadline.json').write_text(json.dumps(config()));(ns['BASE']/'stage').write_text('installed')
            directory=ns['BASE']/'qualification';directory.mkdir()
            result={'schemaVersion':1,'passed':True,'stage':'complete','scope':'legacy-query-only','manifestSha256':'b'*64,
                    'checks':ns['qualification_projection'](qualifier_fixture(),True),'readiness':ready_fixture(),
                    'anchors':ns['qualification_anchors'](qualifier_fixture()['checks']),'reportSha256':'d'*64}
            captured=[]
            class Console(io.StringIO):
                def close(self):captured.append(self.getvalue());super().close()
            original_open=open
            ns['open']=lambda p,*a,**k:Console() if p=='/dev/console' else original_open(p,*a,**k)
            for mode in ('valid','unknown','bad-boolean'):
                sample=dict(result)
                if mode=='unknown':sample['secret']='PRIVATE_SENTINEL'
                if mode=='bad-boolean':sample['passed']='PRIVATE_SENTINEL'
                (directory/'result.json').write_text(json.dumps(sample))
                (ns['BASE']/'last-attestation').unlink(missing_ok=True)
                ns['attest']()
                output=json.loads(captured[-1].removeprefix('ROLLING_BOOTSTRAP '))
                self.assertEqual(output['linuxQueryQualified'],mode=='valid')
                self.assertNotIn('PRIVATE_SENTINEL',captured[-1])
                if mode=='valid':self.assertEqual(output['qualification']['anchors'],result['anchors'])

    def test_generated_config_passes_actual_service_preflight_without_startup(self):
        # Extract exact public config from the generated payload; execute only
        # definitions, never bootstrap or a service. No mirrored validator.
        import ast
        generated=b.generate(config(),NOW)
        encoded=generated.split("base64.b64decode('")[1].split("')")[0]
        program=lzma.decompress(base64.b64decode(encoded)).decode()
        assignment=ast.parse(program).body[0]
        self.assertEqual(assignment.targets[0].id,'SOURCE')
        namespace={};exec(ast.literal_eval(assignment.value),namespace)
        actual=namespace['QUALIFICATION']
        script="""
import assert from 'node:assert/strict';
import {startProverService} from SERVICE_URI;
import {validateQualification} from QUALIFIER_URI;
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const config=JSON.parse(raw);validateQualification(config);
assert.deepEqual(config.service.origins,[]);
const boundary=new Error('development pre-start boundary');
async function probe(includeOrigins){
  let reads=0;const s={...config.service};
  if(!includeOrigins)delete s.origins;
  Object.defineProperty(s,'queryNode',{enumerable:true,get(){
    if(++reads===1)return config.service.queryNode;
    throw boundary;
  }});
  // Actual service validates queryNode first; its next access is the config
  // spread immediately before createPrivateQuery. Throw before any I/O starts.
  await assert.rejects(()=>startProverService(s),e=>includeOrigins?e===boundary:e.message==='Invalid network, origins or threads');
  assert.equal(reads,includeOrigins?2:0);
}
await probe(false);await probe(true);
""".replace('SERVICE_URI',json.dumps((ROOT/'prover/service.mjs').as_uri())).replace('QUALIFIER_URI',json.dumps((ROOT/'prover/qualify-runtime.mjs').as_uri()))
        subprocess.run(['node','--input-type=module','--eval',script],input=json.dumps(actual),text=True,check=True,
                       env={'PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin','LOG_LEVEL':'silent'})

    def test_qualification_unit_enforces_process_and_network_boundary(self):
        ns=host();written={};calls=[]
        ns['write']=lambda p,s,*_:written.update({str(p):s});ns['run']=lambda a,**k:calls.append(a)
        ns['install_qualification']()
        unit=written['/etc/systemd/system/rolling-qualification.service']
        for line in ('TimeoutStartSec=6300','KillMode=control-group','Restart=no','IPAddressDeny=any','IPAddressAllow=localhost','PrivateTmp=yes','ProtectSystem=strict','ReadWritePaths=/var/lib/rolling-bootstrap','UnsetEnvironment=NODE_PATH NODE_OPTIONS BB','Environment=LOG_LEVEL=silent'):
            self.assertIn(line+'\n',unit)
        self.assertIn('--qualification-stop',unit)
        self.assertNotIn('docker.sock',unit)
        self.assertEqual(calls[-1],['systemctl','start','--no-block','rolling-qualification.service'])

    def test_qualification_tc_readback_has_required_netlink_socket_family(self):
        # Source-derived dependency model, NOT Linux seccomp execution:
        # iproute2 v6.1.0 lib/libnetlink.c:182-243 rtnl_open uses
        # socket(AF_NETLINK, SOCK_RAW|SOCK_CLOEXEC, NETLINK_ROUTE).
        # systemd v255 systemd.exec.xml:1850-1868 filters socket() by family.
        ns=host();written={};ns['write']=lambda p,s,*_:written.update({str(p):s})
        ns['run']=lambda *a,**k:None;ns['install_qualification']()
        unit=written['/etc/systemd/system/rolling-qualification.service']
        settings=dict(line.split('=',1) for line in unit.splitlines() if '=' in line)
        families=set(settings['RestrictAddressFamilies'].split())
        self.assertEqual(settings['CapabilityBoundingSet'],'') # no CAP_NET_ADMIN
        self.assertEqual(settings['IPAddressDeny'],'any');self.assertEqual(settings['IPAddressAllow'],'localhost')
        self.assertEqual(families-{'AF_NETLINK'},{'AF_UNIX','AF_INET','AF_INET6'})
        classes='\n'.join('class htb '+h+' '+parent+' rate '+rate+'Mbit ceil 50Mbit burst 1Mb cburst 1Mb\n Sent 123 bytes 1 pkt (dropped 0, overlimits 0 requeues 0)' for h,parent,rate in [('1:1','root','50'),('1:10','parent 1:1','25'),('1:20','parent 1:1','25')])
        reads=[]
        def command(args,**kwargs):
            if args[0]=='systemctl':
                self.assertIn('AF_UNIX',families);return
            if args==['tc','-V']:return 'tc utility, iproute2-6.1.0, libbpf 1.3.0'
            if args[0]=='dpkg-query':return '6.1.0-1ubuntu6.4'
            if args[0]=='tc' and ('class' in args or 'qdisc' in args):
                if 'AF_NETLINK' not in families:raise PermissionError('model: socket family denied')
                reads.append('class' if 'class' in args else 'qdisc')
                if 'class' in args:return classes
                return json.dumps([{'kind':'htb','handle':'1:','root':True,'options':{'default':'0x10'}}])
            self.fail('Unexpected command dependency')
        ns['run']=command
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t)
            (ns['BASE']/'deadline.json').write_text(json.dumps({'budgetStop':'2099-01-01T00:00:00Z'}))
            (ns['BASE']/'interface').write_text('ens5')
            self.assertEqual(ns['verify_controls'](),123);self.assertEqual(reads,['class','qdisc'])
            families.remove('AF_NETLINK')
            with self.assertRaises(PermissionError):ns['verify_controls']()
            self.assertEqual(reads,['class','qdisc']) # rejection cannot become success or bypass tc

    def test_early_diagnostics_classify_failures_without_raw_data(self):
        ns=host();records=[];ns['emit_diagnostic']=lambda data:records.append(json.loads(data.decode().removeprefix('ROLLING_BOOTSTRAP_DIAGNOSTIC ')))
        ns['DIAGNOSTICS_ACTIVE']=True
        for step,error,category,code in [('budget-timer',subprocess.CalledProcessError(1,['PRIVATE_SENTINEL'],output='PRIVATE_SENTINEL'),'command-exit',1),
                                         ('mask-prover',subprocess.CalledProcessError(5,['PRIVATE_SENTINEL']),'command-exit',5),
                                         ('shaper-start',subprocess.TimeoutExpired('PRIVATE_SENTINEL',10),'command-timeout',None),
                                         ('tc-version',ValueError('PRIVATE_SENTINEL'),'validation',None),
                                         ('tc-class-parse',ValueError('PRIVATE_SENTINEL'),'validation',None),
                                         ('state-directory',PermissionError('PRIVATE_SENTINEL'),'permission',None)]:
            ns['mark'](step);ns['diagnostic'](error)
            self.assertEqual(records[-1]['step'],step);self.assertEqual(records[-1]['category'],category)
            self.assertEqual(records[-1].get('returnCode'),code)
        class HostileError(Exception):
            @property
            def returncode(self):raise AssertionError('must not read arbitrary getter')
            def __str__(self):raise AssertionError('must not format raw error')
        ns['diagnostic'](HostileError());self.assertEqual(records[-1]['category'],'internal')
        ns['diagnostic'](subprocess.CalledProcessError(99999,'PRIVATE_SENTINEL'))
        self.assertNotIn('returnCode',records[-1]);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(records))
        facts=ns['version_facts']('tc utility, iproute2-6.1.0, libbpf 1.3')
        self.assertEqual(facts,{'tcVersion':[6,1,0],'libbpfVersion':[1,3]})
        self.assertEqual(ns['version_facts']('6.1.0-1ubuntu6.4',True),{'packageVersion':[6,1,0,1,6,4]})
        self.assertEqual(ns['version_facts']('tc utility, iproute2-6.1.0, PRIVATE_SENTINEL'),{})
        ns['diagnostic'](status='observed',facts={**facts,'classFormat':'PRIVATE_SENTINEL','secret':'PRIVATE_SENTINEL','packageVersion':[True,1]})
        self.assertEqual(records[-1]['tcVersion'],[6,1,0]);self.assertNotIn('packageVersion',records[-1]);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(records))

    def test_first_timer_mask_shaper_faults_record_real_control_step(self):
        for boundary,expected in [('budget','budget-timer'),('mask','mask-prover'),('shaper','shaper-start')]:
            with self.subTest(boundary=boundary):
                ns=host();records=[]
                ns['immutable_deadline']=lambda _:None;ns['write']=lambda *a:None;ns['verify_controls']=lambda:0
                ns['emit_diagnostic']=lambda data:records.append(json.loads(data.decode().removeprefix('ROLLING_BOOTSTRAP_DIAGNOSTIC ')))
                calls=[]
                def command(args,**kwargs):
                    calls.append(args)
                    matches=(boundary=='budget' and args==['systemctl','enable','--now','rolling-budget.timer']) or (boundary=='mask' and args[1]=='mask') or (boundary=='shaper' and 'rolling-egress.service' in args)
                    if matches:raise subprocess.CalledProcessError(7,args,output='PRIVATE_SENTINEL')
                    if args[0]=='ip':return '[{"dev":"ens5"}]'
                    if args[:3]==['systemctl','is-active','--quiet'] and args[-1].endswith('.service'):raise subprocess.CalledProcessError(3,args)
                ns['run']=command
                with self.assertRaises(subprocess.CalledProcessError) as failure:ns['install_controls'](config())
                ns['diagnostic'](failure.exception)
                self.assertEqual(records[-1]['step'],expected);self.assertEqual(records[-1]['returnCode'],7)
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(records))

    def test_early_failure_and_failed_diagnostics_still_request_shutdown(self):
        for stage in ('preflight','directory','lock'):
            with self.subTest(stage=stage),tempfile.TemporaryDirectory() as t:
                ns=host();ns['BASE']=pathlib.Path(t)/'state';calls=[]
                ns['emit_diagnostic']=lambda _:(_ for _ in ()).throw(OSError('PRIVATE_SENTINEL'))
                ns['write']=lambda *a:(_ for _ in ()).throw(OSError('PRIVATE_SENTINEL'))
                def command(args,**kw):
                    calls.append(args)
                    if args[0]=='systemctl':raise subprocess.TimeoutExpired('PRIVATE_SENTINEL',10)
                ns['run']=command
                with patch.object(ns['platform'],'system',return_value='Darwin' if stage=='preflight' else 'Linux'),patch.object(ns['platform'],'machine',return_value='x86_64'),patch.object(ns['os'],'geteuid',return_value=0):
                    if stage=='directory':ns['BASE'].write_text('not directory')
                    if stage=='lock':ns['BASE'].mkdir();(ns['BASE']/'lock').mkdir()
                    with self.assertRaises(SystemExit):ns['execute'](config(),'unused')
                self.assertIn(['systemctl','start','rolling-budget.service'],calls)
                self.assertIn(['/usr/sbin/poweroff'],calls)
                self.assertFalse((ns['BASE']/'deadline.json').exists())

    def test_diagnostic_sinks_nonblocking_character_devices_no_create_or_follow(self):
        ns=host(diagnostic_devices=True);opened=[];writes=[];closed=[]
        def opening(device,flags):opened.append((device,flags));return len(opened)
        class Device:st_mode=0o020600
        with patch.object(ns['os'],'open',side_effect=opening),patch.object(ns['os'],'fstat',return_value=Device()),patch.object(ns['os'],'write',side_effect=lambda fd,data:writes.append(fd)),patch.object(ns['os'],'close',side_effect=lambda fd:closed.append(fd)):
            ns['diagnostic'](ValueError('PRIVATE_SENTINEL'))
        self.assertEqual([x[0] for x in opened],['/dev/ttyS0','/dev/console']);self.assertEqual(writes,[1,2]);self.assertEqual(closed,[1,2])
        for _,flags in opened:
            self.assertTrue(flags&ns['os'].O_NONBLOCK);self.assertTrue(flags&ns['os'].O_NOFOLLOW);self.assertFalse(flags&ns['os'].O_CREAT)
        with patch.object(ns['os'],'open',side_effect=OSError('PRIVATE_SENTINEL')):ns['diagnostic'](ValueError('PRIVATE_SENTINEL'))
        class RegularFile:st_mode=0o100600
        with patch.object(ns['os'],'open',return_value=1),patch.object(ns['os'],'fstat',return_value=RegularFile()),patch.object(ns['os'],'write') as write,patch.object(ns['os'],'close'):
            ns['diagnostic'](ValueError('PRIVATE_SENTINEL'));write.assert_not_called()

    def test_cli_private_compressed_output_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as t:
            directory=pathlib.Path(t).resolve();directory.chmod(0o700)
            now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
            c=config()
            for key,delta in [('createdAt',dt.timedelta()),('budgetStop',dt.timedelta(hours=8)),('commissioningStop',dt.timedelta(minutes=30))]:
                c[key]=(now+delta).strftime('%Y-%m-%dT%H:%M:%SZ')
            source=directory/'input.json';source.write_text(json.dumps(c));source.chmod(0o600)
            output=directory/'user-data.gz'
            args=['python3',str(ROOT/'deploy/prover/bootstrap.py'),'--config',str(source),'--output',str(output)]
            result=subprocess.run(args,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertNotIn('PRIVATE_SENTINEL',result.stdout+result.stderr)
            self.assertEqual(output.stat().st_mode & 0o777,0o600)
            data=output.read_bytes();self.assertLessEqual(len(data),16384)
            subprocess.run(['/bin/sh','-n'],input=gzip.decompress(data),check=True)
            result=subprocess.run(args,capture_output=True,text=True)
            self.assertEqual(result.returncode,1);self.assertEqual(output.read_bytes(),data)
            self.assertNotIn('PRIVATE_SENTINEL',result.stdout+result.stderr)

    def test_private_input_permissions_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            p=pathlib.Path(t)/'input.json';p.write_text(json.dumps(config()));p.chmod(0o600)
            self.assertEqual(b.private_file(p),config());p.chmod(0o644)
            with self.assertRaises(b.Invalid):b.private_file(p)
            link=pathlib.Path(t)/'link';link.symlink_to(p)
            with self.assertRaises(OSError):b.private_file(link)


class FinalReceipt(unittest.TestCase):
    """Labelled development transport/process fakes, not Linux evidence."""
    def capability(self):
        return ('https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.eu-west-2.amazonaws.com/receipts/campaign-04/final.json?'
                'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ABCDEFGHIJKLMNOP%2F20261011%2Feu-west-2%2Fs3%2Faws4_request&'
                'X-Amz-Date=20261011T180000Z&X-Amz-Expires=28800&X-Amz-SignedHeaders=host&X-Amz-Signature='+('c'*64))

    def environment(self,directory):
        ns=host();ns['BASE']=pathlib.Path(directory)/'public';ns['PRIVATE']=pathlib.Path(directory)/'private'
        (ns['BASE']/'qualification').mkdir(parents=True);ns['PRIVATE'].mkdir(mode=0o700)
        return ns

    def test_capability_scope_and_private_generation(self):
        c=config();c['receiptPutUrl']=self.capability();self.assertEqual(b.validate(c,NOW),c)
        self.assertEqual(host()['receipt_url'](self.capability()),self.capability())
        for old,new in [('/receipts/','/releases/'),('final.json','../final.json'),('final.json','final%2ejson'),('.s3.eu-west-2.','.s3.us-east-1.'),('https:','http:'),('X-Amz-Expires=28800','X-Amz-Expires=28801'),('X-Amz-SignedHeaders=host','X-Amz-SignedHeaders=host%3Bauthorization')]:
            bad=dict(c,receiptPutUrl=c['receiptPutUrl'].replace(old,new))
            with self.subTest(new=new),self.assertRaises(b.Invalid):b.validate(bad,NOW)
        bad=dict(c,receiptPutUrl=c['receiptPutUrl']+'&unexpected=PRIVATE_SENTINEL')
        with self.assertRaises(b.Invalid):b.validate(bad,NOW)
        text=b.generate(c,NOW);self.assertLess(len(gzip.compress(text.encode())),16384)
        source=lzma.decompress(base64.b64decode(text.split("base64.b64decode('")[1].split("')")[0])).decode()
        self.assertNotIn(self.capability(),source.split('ATTESTATION = ')[1])
        compile(source,'generated-private','exec')

    def test_lzma_roundtrip_executes_definitions_and_binds_runtime_hash(self):
        # Actual stdlib decompression/compilation; only the final host entry is a
        # labelled stub. No host command or installed service runs in this test.
        c=config();c['receiptPutUrl']=self.capability()
        # Realistic-sized synthetic capabilities, never real tokens.
        import random,string
        rng=random.Random(14)
        token=''.join(rng.choice(string.ascii_letters+string.digits) for _ in range(1024))
        c['runtimeUrl']+='&X-Amz-Security-Token='+token
        c['receiptPutUrl']+='&X-Amz-Security-Token='+token
        text=b.generate(c,NOW);self.assertLess(len(gzip.compress(text.encode())),16384)
        encoded=text.split("base64.b64decode('")[1].split("')")[0]
        source=lzma.decompress(base64.b64decode(encoded)).decode()
        definitions,entry=source.rsplit('execute(CONFIG, ATTESTATION)',1)
        self.assertEqual(entry.strip(),'');ns={};exec(compile(definitions,'generated','exec'),ns)
        calls=[];ns['execute']=lambda conf,script:calls.append((conf,script))
        exec('execute(CONFIG, ATTESTATION)',ns)
        self.assertEqual(calls[0][0],c);compile(calls[0][1],'attestor','exec')
        runtime=ns['SOURCE'][ns['SOURCE'].index('\nimport datetime as dt, fcntl'):]
        self.assertEqual(ns['PINS']['bootstrap'],hashlib.sha256(runtime.encode()).hexdigest())
        self.assertEqual(ns['PINS']['startup'],hashlib.sha256(pathlib.Path(b.__file__).read_bytes()).hexdigest())
        self.assertNotIn(token,calls[0][1])
        # Verify the executed decoded payload, not just the generator's source.
        writes={};ns['prepare_data']=lambda:None;ns['verify_controls']=lambda:0
        ns['write']=lambda p,s,*_:writes.update({str(p):s})
        ns['public_ip']=lambda:'203.0.113.10';ns['prepare_admin_key']=lambda:'a'*64
        ns['run']=lambda *args,**kwargs:None
        with patch.object(ns['shutil'],'which',return_value='/usr/bin/docker'):
            ns['install_node']()
        unit=writes['/etc/systemd/system/rolling-node.service']
        import shlex
        command=next(line for line in unit.splitlines() if line.startswith('ExecStart='))
        args=shlex.split(command.removeprefix('ExecStart='))
        environment=[args[i+1] for i,arg in enumerate(args) if arg=='-e']
        self.assertEqual([v for v in environment if v.startswith('ETHEREUM_HOSTS=')],
                         ['ETHEREUM_HOSTS=https://sepolia.gateway.tenderly.co'])
        self.assertEqual([v for v in environment if v.startswith('ETHEREUM_DEBUG_HOSTS=')],
                         ['ETHEREUM_DEBUG_HOSTS=https://ethereum-sepolia-rpc.publicnode.com'])
        self.assertIn('ETHEREUM_ALLOW_NO_DEBUG_HOSTS=false',environment)
        self.assertIn('BLOB_ALLOW_EMPTY_SOURCES=false',environment)
        # Worst-case permitted URL lengths can exceed AWS storage; no truncation.
        c['runtimeUrl']+=''.join(rng.choice(string.ascii_letters+string.digits) for _ in range(4096-len(c['runtimeUrl'])))
        c['receiptPutUrl']+=''.join(rng.choice(string.ascii_letters+string.digits) for _ in range(4096-len(c['receiptPutUrl'])))
        self.assertEqual(len(b.validate(c,NOW)['receiptPutUrl']),4096)
        with tempfile.TemporaryDirectory() as t:
            directory=pathlib.Path(t);directory.chmod(0o700)
            now=dt.datetime.now(dt.timezone.utc)
            for key,delta in [('createdAt',dt.timedelta()),('budgetStop',dt.timedelta(hours=8)),('commissioningStop',dt.timedelta(minutes=30))]:c[key]=(now+delta).strftime('%Y-%m-%dT%H:%M:%SZ')
            source=directory/'input.json';source.write_text(json.dumps(c));source.chmod(0o600)
            output=directory/'output.gz'
            result=subprocess.run(['python3',str(ROOT/'deploy/prover/bootstrap.py'),'--config',str(source),'--output',str(output)],capture_output=True,text=True)
            self.assertEqual(result.returncode,1);self.assertFalse(output.exists());self.assertNotIn(token,result.stdout+result.stderr)

    def test_success_and_persistence_failure_do_not_masquerade_as_receipts(self):
        for boundary in ('success','disk-failure'):
            with self.subTest(boundary=boundary),tempfile.TemporaryDirectory() as t:
                ns=self.environment(t);events=[]
                report=qualifier_fixture();q={'schemaVersion':1,'passed':True,'stage':'complete','scope':'legacy-query-only','manifestSha256':'b'*64,
                    'checks':ns['qualification_projection'](report,True),'readiness':ready_fixture(),'anchors':ns['qualification_anchors'](report['checks'])}
                ns['exclusive_record'](ns['BASE']/'qualification/result.json',q)
                ns['service_observations']=lambda:{};ns['emit_diagnostic']=lambda data:events.append(data)
                ns['upload_receipt']=lambda data:events.append('upload');ns['run']=lambda *a,**k:events.append('shutdown')
                if boundary=='disk-failure':
                    with patch.object(ns['os'],'fsync',side_effect=OSError('PRIVATE_SENTINEL')):
                        with self.assertRaises(OSError):ns['final_receipt']()
                    self.assertNotIn('upload',events);self.assertEqual(events[-1],'shutdown')
                    self.assertIn(b'FINALIZATION_FAILED',events[0]);self.assertNotIn('PRIVATE_SENTINEL',str(events))
                else:
                    ns['final_receipt']();ns['final_receipt']()
                    self.assertNotIn('shutdown',events);self.assertEqual(events[-1],'upload');self.assertEqual(len(events),2)

    def test_service_state_projection_and_failures(self):
        good='LoadState=loaded\nActiveState=failed\nSubState=failed\nResult=oom-kill\nExecMainCode=2\nExecMainStatus=9\nNRestarts=0'
        for boundary in ('healthy','timeout','malformed','secret','missing-container'):
            with self.subTest(boundary=boundary):
                ns=host();calls=[]
                def run(args,**kwargs):
                    calls.append((args,kwargs));self.assertEqual(kwargs['timeout'],3)
                    if boundary=='timeout':raise subprocess.TimeoutExpired('PRIVATE_SENTINEL',3)
                    if args[0]=='systemctl':return good+('\nSECRET=PRIVATE_SENTINEL' if boundary=='secret' else '')
                    self.assertNotIn('.State.Error',args[3]);self.assertNotIn('.Config',args[3])
                    if boundary=='missing-container':raise subprocess.CalledProcessError(1,args)
                    return json.dumps({'status':'exited','running':False,'restarting':False,'oomKilled':True,'exitCode':137 if boundary!='malformed' else True})
                ns['run']=run;v=ns['service_observations']();self.assertEqual(len(calls),3)
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(v))
                if boundary=='healthy':self.assertTrue(v['container']['oomKilled']);self.assertEqual(v['node']['ExecMainStatus'],9)
                if boundary in ('timeout','secret'):self.assertFalse(v['node']['available'])
                if boundary in ('timeout','malformed','missing-container'):self.assertFalse(v['container']['available'])

    def test_readiness_categories_exact_and_unknown_rejected(self):
        ns=host()
        for category in ('CONFIG','IDENTITY','UNAVAILABLE','UNSYNCED','STALE','TIMEOUT','PROCESS_EXIT'):
            value={'ready':False,'category':category,'attempts':1}
            self.assertEqual(ns['readiness_observation'](value),value)
        for value in ({'ready':False,'category':'PRIVATE_SENTINEL','attempts':1},
                      {'ready':False,'category':'STALE','attempts':True},
                      {'ready':False,'category':'STALE','attempts':1,'error':'PRIVATE_SENTINEL'}):
            with self.assertRaises(ValueError):ns['readiness_observation'](value)
        value={'ready':True,'snapshot':ready_fixture(),'attempts':9}
        self.assertEqual(ns['readiness_observation'](value),value)

    def test_failed_poll_retains_fixed_category_before_deadline(self):
        with tempfile.TemporaryDirectory() as t:
            ns=Bootstrap().qualification_environment(t)
            ns['run']=lambda *a,**k:json.dumps({'ready':False,'category':'UNSYNCED'})
            times=iter([NOW.timestamp(),NOW.timestamp(),NOW.timestamp()+91*60,NOW.timestamp()+91*60])
            with patch.object(ns['time'],'time',side_effect=lambda:next(times)),patch.object(ns['time'],'sleep'):
                ns['qualify']()
            value=json.loads((ns['BASE']/'qualification/readiness-observation.json').read_text())
            self.assertEqual(value,{'ready':False,'category':'UNSYNCED','attempts':1})
            self.assertFalse(json.loads((ns['BASE']/'qualification/result.json').read_text())['passed'])

    def test_final_receipt_durable_emit_upload_shutdown_order(self):
        with tempfile.TemporaryDirectory() as t:
            ns=self.environment(t);events=[]
            ns['exclusive_record'](ns['BASE']/'qualification/result.json',ns['qualification_failure']('readiness-failed'))
            ns['service_observations']=lambda:{'node':{'available':False},'qualification':{'available':False},'container':{'available':False}}
            def emit(data):
                self.assertTrue((ns['PRIVATE']/'final-receipt.json').is_file());events.append('emit')
                self.assertNotIn(b'PRIVATE_SENTINEL',data)
            ns['emit_diagnostic']=emit
            ns['upload_receipt']=lambda data:events.append('upload')
            ns['run']=lambda args,**kw:events.append('shutdown')
            ns['final_receipt']();self.assertEqual(events,['emit','upload','shutdown'])
            frozen=(ns['PRIVATE']/'final-receipt.json').read_bytes()
            ns['final_receipt']();self.assertEqual(events,['emit','upload','shutdown','shutdown'])
            self.assertEqual((ns['PRIVATE']/'final-receipt.json').read_bytes(),frozen)
            self.assertEqual((ns['PRIVATE']/'final-receipt.json').stat().st_mode&0o777,0o600)

    def test_malformed_or_secret_qualification_never_reaches_receipt(self):
        for change in ('extra','stage','checks','symlink','size'):
            with self.subTest(change=change),tempfile.TemporaryDirectory() as t:
                ns=self.environment(t);p=ns['BASE']/'qualification/result.json'
                q=ns['qualification_failure']('readiness-failed')
                if change=='extra':q['secret']='PRIVATE_SENTINEL'
                if change=='stage':q['stage']='PRIVATE_SENTINEL'
                if change=='checks':q['checks']={'secret':'PRIVATE_SENTINEL'}
                if change=='symlink':p.symlink_to(ns['PRIVATE']/'secret');(ns['PRIVATE']/'secret').write_text('PRIVATE_SENTINEL')
                else:p.write_text('PRIVATE_SENTINEL'*2000 if change=='size' else json.dumps(q))
                (ns['BASE']/'qualification/readiness-observation.json').write_text('{"secret":"PRIVATE_SENTINEL"}')
                ns['service_observations']=lambda:{};ns['run']=lambda *a,**k:None
                ns['final_receipt']();raw=(ns['PRIVATE']/'final-receipt.json').read_text()
                self.assertNotIn('PRIVATE_SENTINEL',raw)
                self.assertEqual(json.loads(raw)['qualification']['stage'],'interrupted-unknown')

    def test_single_put_unknown_redirect_and_success_never_repeat(self):
        for boundary in ('success','timeout','redirect','rejected','partial-intent','fsync'):
            with self.subTest(boundary=boundary),tempfile.TemporaryDirectory() as t:
                ns=self.environment(t);calls=[];data=b'{"schemaVersion":1}'
                ns['exclusive_record'](ns['PRIVATE']/'receipt-put.json',{'url':self.capability()})
                if boundary=='partial-intent':(ns['PRIVATE']/'upload-intent.json').write_text('{')
                class Reply:
                    status=200 if boundary=='success' else 403
                    def __enter__(self):return self
                    def __exit__(self,*args):pass
                class Opener:
                    def open(inner,request,timeout):
                        calls.append(request);self.assertEqual(timeout,5);self.assertEqual(request.method,'PUT');self.assertEqual(request.data,data)
                        self.assertTrue((ns['PRIVATE']/'upload-intent.json').is_file())
                        if boundary=='timeout':raise TimeoutError('PRIVATE_SENTINEL')
                        if boundary=='redirect':raise ValueError('PRIVATE_SENTINEL')
                        return Reply()
                def build(*handlers):
                    self.assertEqual(handlers[0].proxies,{})
                    with self.assertRaisesRegex(ValueError,'^Redirect rejected$'):handlers[1].redirect_request(None,None,307,'secret',{},self.capability())
                    return Opener()
                with patch.object(ns['urllib'].request,'build_opener',side_effect=build):
                    if boundary=='fsync':
                        with patch.object(ns['os'],'fsync',side_effect=OSError('PRIVATE_SENTINEL')):
                            with self.assertRaises(OSError):ns['upload_receipt'](data)
                    else:ns['upload_receipt'](data)
                    ns['upload_receipt'](data)
                self.assertEqual(len(calls),0 if boundary in ('partial-intent','fsync') else 1)
                result=ns['PRIVATE']/'upload-result.json'
                if result.exists():
                    value=json.loads(result.read_text());self.assertNotIn('PRIVATE_SENTINEL',json.dumps(value))
                    self.assertEqual(value['status'],'acknowledged' if boundary=='success' else 'rejected' if boundary=='rejected' else 'unknown')

    def test_qualifier_cannot_read_capabilities_and_publisher_is_separate(self):
        ns=host();files={};ns['write']=lambda path,data,*mode:files.update({str(path):data});ns['run']=lambda *a,**k:None
        ns['install_qualification']();unit=files['/etc/systemd/system/rolling-qualification.service']
        self.assertIn('IPAddressDeny=any\nIPAddressAllow=localhost',unit)
        self.assertIn('InaccessiblePaths=-/var/lib/rolling-bootstrap-private -/var/lib/cloud',unit)
        self.assertIn('TimeoutStopSec=45',unit)
        publisher=files['/etc/systemd/system/rolling-qualification-receipt.service']
        self.assertIn('--qualification-receipt',publisher);self.assertIn('TimeoutStartSec=35',publisher)
        self.assertIn('Restart=no',publisher);self.assertNotIn('receiptPutUrl',publisher)
        self.assertIn("'--log-driver','none'",b.HOST);self.assertNotIn("'run','--rm'",b.HOST)

class AdminCapability(unittest.TestCase):
    def environment(self,t):
        ns=host();ns['QUALIFICATION']={**b.QUALIFICATION,'adminKeyFile':str(pathlib.Path(t)/'admin/key')}
        ns['ADMIN_HASH_FILE']=pathlib.Path(t)/'existing-hash'
        return ns

    def test_private_generation_reuse_hash_and_existing_authority(self):
        with tempfile.TemporaryDirectory() as t:
            ns=self.environment(t);value=ns['prepare_admin_key']();keyfile=pathlib.Path(ns['QUALIFICATION']['adminKeyFile']);key=keyfile.read_text()
            self.assertEqual(len(key),64);self.assertEqual(value,hashlib.sha256(key.encode()).hexdigest())
            self.assertEqual(keyfile.stat().st_mode&0o777,0o600);self.assertEqual(keyfile.parent.stat().st_mode&0o777,0o700)
            self.assertEqual(ns['prepare_admin_key'](),value);self.assertEqual(keyfile.read_text(),key)
            ns['ADMIN_HASH_FILE'].write_text(value);self.assertEqual(ns['prepare_admin_key'](),value)
            ns['ADMIN_HASH_FILE'].write_text('f'*64)
            with self.assertRaises(ValueError):ns['prepare_admin_key']()
            self.assertEqual(keyfile.read_text(),key);self.assertEqual(ns['ADMIN_HASH_FILE'].read_text(),'f'*64)
            keyfile.unlink()
            with self.assertRaises(ValueError):ns['prepare_admin_key']()
            self.assertFalse(keyfile.exists())

    def test_corrupt_or_unsafe_capability_is_never_replaced(self):
        for mode in ['short','permissions','symlink','directory']:
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as t:
                ns=self.environment(t);ns['prepare_admin_key']();keyfile=pathlib.Path(ns['QUALIFICATION']['adminKeyFile'])
                if mode=='short':keyfile.write_text('PRIVATE_SENTINEL')
                if mode=='permissions':keyfile.chmod(0o644)
                if mode=='directory':keyfile.parent.chmod(0o755)
                if mode=='symlink':
                    keyfile.unlink();keyfile.symlink_to(pathlib.Path(t)/'missing')
                with self.assertRaises((ValueError,OSError)):ns['prepare_admin_key']()
                if mode=='short':self.assertEqual(keyfile.read_text(),'PRIVATE_SENTINEL')
                if mode=='symlink':self.assertTrue(keyfile.is_symlink())

    def test_qualifier_can_read_only_dedicated_capability_private_transport_stays_hidden(self):
        ns=host();writes={};ns['write']=lambda p,s,*_:writes.update({str(p):s});ns['run']=lambda *a,**k:None
        ns['install_qualification']();unit=writes['/etc/systemd/system/rolling-qualification.service']
        self.assertIn('ReadOnlyPaths=/var/lib/rolling-admin/qualification-key\n',unit)
        self.assertIn('InaccessiblePaths=-/var/lib/rolling-bootstrap-private -/var/lib/cloud',unit)
        self.assertIn('IPAddressDeny=any\nIPAddressAllow=localhost',unit)
        self.assertNotIn('ReadWritePaths=/var/lib/rolling-admin',unit)

class NodeStartup(unittest.TestCase):
    def test_stream_bounds_unknown_and_secret_output_are_not_evidence(self):
        ns=host();output=b.NodeOutput()
        secret=b'https://secret.example/?token=PRIVATE_SENTINEL x-api-key=PRIVATE_SENTINEL'
        for chunk in [b'Downloading CRS of size ',secret,b'\nGenesis archive ',b'root: PRIVATE_SENTINEL\n',b'Error: arbitrary PRIVATE_SENTINEL\n']:
            output.feed(chunk)
        for _ in range(20):output.feed(b'PRIVATE_SENTINEL'*200)
        self.assertLessEqual(len(output.pending),8192);self.assertTrue(output.dropping)
        output.feed(b'Aztec Server listening on port 8080\n');self.assertNotIn('public-rpc',output.value['stages'])
        output.feed(b'Aztec Server listening on port 8080\n');output.finish(1)
        self.assertEqual(output.value['errors'],['unknown']);self.assertEqual(output.value['oversizedLines'],1)
        self.assertIn('public-rpc',output.value['stages']);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(output.value))
        self.assertNotIn('secret.example',json.dumps(output.value));self.assertEqual(output.pending,b'')
        with self.assertRaises(ValueError):output.feed(b'x'*4097)

    def test_fixed_error_flags_deduplicated_and_validated_before_receipt(self):
        ns=host();output=b.NodeOutput();output.feed(b'Error: ERR_DLOPEN_FAILED PRIVATE_SENTINEL\nEACCES PRIVATE_SENTINEL\nEACCES\n');output.finish(-15)
        self.assertEqual(output.value['errors'],['native-load','permission']);self.assertIsNone(output.value['exitCode']);self.assertEqual(output.value['signal'],15)
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);p=ns['BASE']/'node-startup.json';p.write_text(json.dumps(output.value));p.chmod(0o600)
            self.assertTrue(b.node_startup_observation(ns['BASE'])['available'])
            for bad in [dict(output.value,extra='PRIVATE_SENTINEL'),dict(output.value,errors=['PRIVATE_SENTINEL']),dict(output.value,complete=False),dict(output.value,exitCode=1),dict(output.value,oversizedLines=-1)]:
                p.write_text(json.dumps(bad));self.assertEqual(b.node_startup_observation(ns['BASE']),{'available':False})

    def test_final_receipt_helper_hash_is_checked_before_execution(self):
        with tempfile.TemporaryDirectory() as t:
            ns=host();ns['RELEASE']=pathlib.Path(t);helper=ns['RELEASE']/'deploy/prover/bootstrap.py';helper.parent.mkdir(parents=True);helper.write_bytes(pathlib.Path(b.__file__).read_bytes())
            ns['PINS']['startup']=hashlib.sha256(helper.read_bytes()).hexdigest();calls=[]
            ns['run']=lambda args,**kw:(calls.append((args,kw)) or '{"available":false}')
            self.assertEqual(ns['startup_observation'](),{'available':False});self.assertEqual(len(calls),1);self.assertEqual(calls[0][1]['timeout'],3)
            helper.write_text('PRIVATE_SENTINEL');self.assertEqual(ns['startup_observation'](),{'available':False});self.assertEqual(len(calls),1)

    def test_forwarded_termination_reaps_exact_child_and_retains_signal(self):
        import sys,time,signal
        with tempfile.TemporaryDirectory() as t:
            script="""import importlib.util,pathlib,subprocess,sys,signal,os
spec=importlib.util.spec_from_file_location('b',sys.argv[1]);b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
base=pathlib.Path(sys.argv[2]);original=subprocess.Popen
def spawn(args,**kw):
 return original([sys.executable,'-c',"import pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text('ready');time.sleep(20)",str(base/'ready')],**kw)
b.subprocess.Popen=spawn
code=b.node_wrapper(['/usr/bin/docker','run',b.IMAGE,'testnet'],base)
if code<0:signal.signal(-code,signal.SIG_DFL);os.kill(os.getpid(),-code)
raise SystemExit(code)
"""
            process=subprocess.Popen([sys.executable,'-c',script,b.__file__,t],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+3
                while not (pathlib.Path(t)/'ready').exists() and time.monotonic()<deadline:time.sleep(.01)
                self.assertTrue((pathlib.Path(t)/'ready').exists());process.send_signal(signal.SIGTERM)
                stdout,stderr=process.communicate(timeout=3);self.assertEqual(process.returncode,-15);self.assertEqual(stdout,b'');self.assertEqual(stderr,b'')
                observed=b.node_startup_observation(pathlib.Path(t));self.assertEqual(observed['signal'],15);self.assertTrue(observed['complete'])
            finally:
                if process.poll() is None:process.kill();process.communicate()

    def test_real_disposable_process_exit_and_signal_are_preserved_without_raw_output(self):
        # Real short Python children stand in for Docker; no Docker/service runs.
        import sys
        original=subprocess.Popen
        for ending,expected in [('raise SystemExit(7)',7),('os.kill(os.getpid(),signal.SIGTERM)',-15)]:
            with self.subTest(ending=ending),tempfile.TemporaryDirectory() as t:
                ns=host();ns['BASE']=pathlib.Path(t);calls=[]
                def spawn(args,**kw):
                    calls.append(args)
                    return original([sys.executable,'-c',"import os,signal;print('Genesis archive root: PRIVATE_SENTINEL',flush=True);"+ending],**kw)
                with patch.object(ns['subprocess'],'Popen',side_effect=spawn):
                    code=b.node_wrapper(['/usr/bin/docker','run',b.IMAGE,'testnet'],ns['BASE'])
                self.assertEqual(code,expected);self.assertEqual(len(calls),1)
                observed=b.node_startup_observation(ns['BASE']);self.assertTrue(observed['complete']);self.assertTrue(observed['available'])
                self.assertIn('process-spawned',observed['stages']);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(observed))
                self.assertEqual(observed['exitCode'],7 if expected==7 else None);self.assertEqual(observed['signal'],15 if expected<0 else None)

    def test_real_child_fsync_enospc_is_reaped_and_original_error_preserved(self):
        import errno,sys,time
        original_spawn=subprocess.Popen;original_fsync=b.os.fsync
        for ignore_term in [False,True]:
            with self.subTest(ignore_term=ignore_term),tempfile.TemporaryDirectory() as t:
                children=[];syncs=0;failure=OSError(errno.ENOSPC,'PRIVATE_SENTINEL')
                def spawn(args,**kw):
                    code="import signal,time;"+("signal.signal(signal.SIGTERM,signal.SIG_IGN);" if ignore_term else '')+"print('ready',flush=True);time.sleep(30)"
                    child=original_spawn([sys.executable,'-c',code],**kw);children.append(child)
                    self.assertEqual(child.stdout.readline(),b'ready\n');return child
                def fsync(fd):
                    nonlocal syncs
                    syncs+=1
                    if children and syncs==4:raise failure
                    return original_fsync(fd)
                started=time.monotonic()
                try:
                    with patch.object(b.subprocess,'Popen',side_effect=spawn),patch.object(b.os,'fsync',side_effect=fsync):
                        with self.assertRaises(OSError) as caught:b.node_wrapper(['/usr/bin/docker','run',b.IMAGE,'testnet'],pathlib.Path(t))
                    self.assertIs(caught.exception,failure);self.assertLess(time.monotonic()-started,5)
                    self.assertEqual(len(children),1);self.assertIsNotNone(children[0].poll())
                    self.assertTrue(failure.node_cleanup['reaped']);self.assertEqual(failure.node_cleanup['killSent'],ignore_term);self.assertFalse(failure.node_cleanup['failed'])
                    observed=b.node_startup_observation(pathlib.Path(t));self.assertTrue(observed['available']);self.assertEqual(observed['cleanup'],failure.node_cleanup)
                    self.assertNotIn('PRIVATE_SENTINEL',json.dumps(observed));self.assertEqual(observed['signal'],9 if ignore_term else 15)
                finally:
                    for child in children:
                        if child.poll() is None:child.kill();child.wait(timeout=2)

    def test_stage_hook_command_is_narrow_and_preserves_prior_evidence(self):
        with tempfile.TemporaryDirectory() as t:
            base=pathlib.Path(t);args=['/usr/bin/docker','run','--log-driver','none','--entrypoint','node',b.IMAGE,'--no-warnings','/usr/src/yarn-project/aztec/dest/bin/index.js','start','--node','--network','testnet']
            actual=b.instrument_node_args(args,base)
            self.assertEqual(args[args.index(b.IMAGE)+1:],actual[actual.index(b.IMAGE)+3:])
            self.assertIn(str(pathlib.Path(b.__file__).parent/'startup-stages.mjs')+':/etc/rolling-node/startup-stages.mjs:ro',actual)
            self.assertIn(str(base/'startup-stages')+':/rolling-startup',actual)
            self.assertEqual(actual[actual.index(b.IMAGE)+1:actual.index(b.IMAGE)+3],['--import','/etc/rolling-node/startup-stages.mjs'])
            self.assertEqual((base/'startup-stages').stat().st_mode & 0o777,0o700)
            with self.assertRaises(FileExistsError):b.instrument_node_args(args,base)
        self.assertEqual(hashlib.sha256((pathlib.Path(b.__file__).parent/'startup-stages.mjs').read_bytes()).hexdigest(),b.STARTUP_HELPER_SHA)

    def test_actual_js_record_agrees_with_python_projection(self):
        import os
        node=os.environ.get('PROVER_VALIDATION_NODE','node')
        with tempfile.TemporaryDirectory() as t:
            base=pathlib.Path(t);directory=base/'startup-stages';directory.mkdir(mode=0o700)
            helper=pathlib.Path(b.__file__).parent/'startup-stages.mjs'
            code="import {createRecorder,PHASES} from "+json.dumps(helper.as_uri())+";const record=createRecorder(process.argv[1],process.argv[2]);if(!record('factory','begin')||!record('factory-bb','begin')||!record('factory-bb','complete'))throw Error('fixture');process.stdout.write(JSON.stringify(PHASES));"
            result=subprocess.run([node,'--input-type=module','--eval',code,str(directory),b.STARTUP_HELPER_SHA],capture_output=True,text=True,timeout=3,check=True)
            self.assertEqual(json.loads(result.stdout),list(b.DIAGNOSTIC_PHASES))
            observation=b.stage_observation(base);self.assertTrue(observation['available'])
            self.assertEqual(observation['history'],[['factory','begin'],['factory-bb','begin'],['factory-bb','complete']])

    def test_stage_projection_independent_of_native_output_and_rejects_forged_records(self):
        import os
        with tempfile.TemporaryDirectory() as t:
            base=pathlib.Path(t);directory=base/'startup-stages';directory.mkdir(mode=0o700);file=directory/'stages.json'
            good={'schemaVersion':1,'instrumented':True,'helperSha256':b.STARTUP_HELPER_SHA,'history':[['factory','begin'],['factory-bb','begin'],['factory-bb','complete']]}
            file.write_text(json.dumps(good));file.chmod(0o600)
            self.assertEqual(b.stage_observation(base),{'available':True,**good})
            output=b.NodeOutput();output.feed(b'__rollingStartupStage("admin-auth","complete"); PRIVATE_SENTINEL\n');output.finish(1)
            self.assertEqual(output.value['stages'],[])
            for bad in [{**good,'extra':'PRIVATE_SENTINEL'},{**good,'helperSha256':'a'*64},{**good,'history':[['factory','complete']]},{**good,'history':[['factory','begin'],['factory-bb','begin'],['factory','complete']]},{**good,'history':[['PRIVATE_SENTINEL','begin']]},{**good,'schemaVersion':True}]:
                file.write_text(json.dumps(bad));self.assertEqual(b.stage_observation(base),{'available':False})
            file.write_text('x'*8193);self.assertEqual(b.stage_observation(base),{'available':False})
            file.unlink();file.symlink_to(base/'elsewhere');self.assertEqual(b.stage_observation(base),{'available':False})
            file.unlink();os.mkfifo(file,0o600);self.assertEqual(b.stage_observation(base),{'available':False})
            file.unlink();file.write_text(json.dumps(good));file.chmod(0o644);self.assertEqual(b.stage_observation(base),{'available':False})
            file.chmod(0o600);directory.chmod(0o755);self.assertEqual(b.stage_observation(base),{'available':False})

    def test_cleanup_failure_remains_separate_and_bounded(self):
        class Unreapable:
            def __init__(self):self.waits=[];self.kills=0
            def poll(self):return None
            def terminate(self):raise OSError('PRIVATE_SENTINEL')
            def kill(self):self.kills+=1
            def wait(self,timeout):self.waits.append(timeout);raise subprocess.TimeoutExpired('PRIVATE_SENTINEL',timeout)
        child=Unreapable();result,code=b.reap_failed_node(child)
        self.assertTrue(result['failed']);self.assertFalse(result['reaped']);self.assertEqual(child.waits,[2,2]);self.assertEqual(child.kills,1);self.assertIsNone(code)
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))

if __name__=='__main__':unittest.main()
