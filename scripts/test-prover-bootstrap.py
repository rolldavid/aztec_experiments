"""Development unit tests; no Linux services, cloud calls, or proof jobs are run."""
import base64, datetime as dt, gzip, hashlib, importlib.util, io, json, pathlib, subprocess, tarfile, tempfile, unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'deploy/prover/bootstrap.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
NOW=dt.datetime(2026,10,11,18,0,tzinfo=dt.timezone.utc)
def config():
    return dict(createdAt='2026-10-11T18:00:00Z',budgetStop='2026-10-12T02:00:00Z',commissioningStop='2026-10-11T18:30:00Z',
                runtimeUrl='https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.us-east-1.amazonaws.com/releases/test/runtime.tar.gz?X-Amz-Signature=PRIVATE_SENTINEL',
                runtimeArchiveSha256='a'*64,manifestSha256='b'*64)
def host():
    ns={'PINS':{'manifest':'b'*64,'node':b.NODE_SHA,'bb':b.BB_SHA,'catalog':b.CATALOG_SHA,'image':b.IMAGE},'NETWORK':b.NETWORK}
    exec(b.HOST,ns)
    return ns

class Bootstrap(unittest.TestCase):
    def test_valid_input_frozen_and_bounded_userdata_shell_syntax(self):
        c=config();text=b.generate(c,NOW)
        self.assertEqual(c,config());self.assertNotIn('PRIVATE_SENTINEL',text)
        self.assertLess(len(gzip.compress(text.encode(),mtime=0)),16384)
        subprocess.run(['/bin/sh','-n'],input=text,text=True,check=True)
        encoded=text.split("base64.b64decode('")[1].split("')")[0]
        source=gzip.decompress(base64.b64decode(encoded)).decode();compile(source,'generated','exec')
        self.assertIn('PRIVATE_SENTINEL',source) # private artifact, never public evidence
        self.assertNotIn('PRIVATE_SENTINEL',source.split('ATTESTATION = ')[1])

    def test_malicious_inputs_rejected_without_echo(self):
        bad=[('runtimeUrl','https://evil.example/releases/runtime.tar.gz'),('runtimeUrl',config()['runtimeUrl']+'\n$(id)'),
             ('runtimeUrl','https://user:pass@anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.us-east-1.amazonaws.com/releases/a.tar.gz'),
             ('runtimeUrl','https://anonymous-message-board-testnet-backups-nvdhcyurtoga.s3.us-east-1.amazonaws.com/releases/../a.tar.gz'),
             ('runtimeArchiveSha256','a'*63+';'),('manifestSha256',None),('budgetStop','2026-10-12T02:00:01Z'),
             ('commissioningStop','2026-10-11T18:31:00Z'),('createdAt','2026-10-11T15:00:00Z'),('budgetStop','tomorrow; poweroff')]
        for key,value in bad:
            with self.subTest(key=key,value=value):
                c=config();c[key]=value
                with self.assertRaises(b.Invalid) as e:b.generate(c,NOW)
                self.assertNotIn('PRIVATE_SENTINEL',str(e.exception))
        c=config();c['command']='id'
        with self.assertRaises(b.Invalid):b.generate(c,NOW)

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

    def test_lost_or_overwide_shaping_fails_controls(self):
        ns=host()
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);(pathlib.Path(t)/'interface').write_text('ens5')
            (pathlib.Path(t)/'deadline.json').write_text(json.dumps({'budgetStop':'2099-01-01T00:00:00Z'}))
            rate=[6250000]
            def run(args,**kw):
                if 'class' in args:return json.dumps([{'classid':'1:1','kind':'htb','bytes':123,'options':{'rate':rate[0],'ceil':rate[0]}}])
                if 'qdisc' in args:return '[{"kind":"htb","handle":"1:","root":true}]'
            ns['run']=run;self.assertEqual(ns['verify_controls'](),123)
            rate[0]=12500000
            with self.assertRaises(ValueError):ns['verify_controls']()

    def test_fail_closed_pipeline_controls_before_download_no_retry(self):
        ns=host();events=[]
        with tempfile.TemporaryDirectory() as t:
            ns['BASE']=pathlib.Path(t);ns['RELEASE']=pathlib.Path(t)/'release'
            ns['install_controls']=lambda _:events.append('controls')
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

if __name__=='__main__':unittest.main()
