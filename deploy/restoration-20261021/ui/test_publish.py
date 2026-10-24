"""Exercise the actual activation functions with local files and labelled service facts."""
import ast
import hashlib
import io
import json
import os
import pathlib
import re
import stat
import shutil
import tempfile
import types
import unittest

SOURCE_FILE = pathlib.Path(__file__).with_name('publish.py')
TREE = ast.parse(SOURCE_FILE.read_text())
FUNCTIONS = ast.Module(body=[node for node in TREE.body if isinstance(node, ast.FunctionDef)], type_ignores=[])


class RepeatPublication(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.base = self.root / 'ui'
        self.old_ui = self.base / 'releases' / ('a' * 40)
        self.new_ui = self.base / 'releases' / ('b' * 40)
        for directory in (self.old_ui, self.new_ui):
            (directory / 'wallet').mkdir(parents=True)
        (self.old_ui / 'wallet/runtime.json').write_bytes(b'old runtime')
        (self.new_ui / 'wallet/runtime.json').write_bytes(b'new runtime')
        os.symlink(self.old_ui, self.base / 'current')
        self.packet = self.root / ('ui-' + 'b' * 12)
        self.packet.mkdir()
        self.old_source = self.root / 'old-source'
        self.new_source = self.root / 'new-source'
        self.old_source.mkdir()
        self.new_source.mkdir()
        self.unit = self.root / 'application.service'
        self.unit.write_text('WorkingDirectory=' + str(self.old_source) + '\n')
        self.original_unit = self.unit.read_bytes()
        self.caddy = self.root / 'Caddyfile'
        self.caddy.write_bytes(b'existing static routing')
        self.notify = self.root / '90-ui-ready.conf'
        self.notify.write_bytes(b'[Service]\nType=notify\nNotifyAccess=main\n')
        self.pids = {'rolling-application.service': 101, 'rolling-application-proxy.service': 102, 'rolling-query.service': 103}
        self.configured = self.old_source
        self.calls = []
        self.fail_reload = False
        self.fail_readback = False
        proc = self.root / 'proc' / '101'
        proc.mkdir(parents=True)
        os.symlink(self.old_source, proc / 'cwd')
        (proc / 'stat').write_text('101 (node) ' + ' '.join(['S'] + ['0'] * 18 + ['987']))

        def path(value):
            text = str(value)
            return self.root / text.lstrip('/') if text.startswith('/proc/') else pathlib.Path(value)

        self.ns = {'hashlib': hashlib, 'json': json, 'os': os, 'pathlib': types.SimpleNamespace(Path=path, PurePosixPath=pathlib.PurePosixPath),
                   're': re, 'stat': stat, 'shutil': shutil, 'PACKET_ROOT': self.root, 'SOURCE': self.old_source, 'RUNNING': self.old_source, 'NEXT': self.new_source,
                   'UI': self.new_ui, 'BASE': self.base, 'P': self.packet, 'CADDY': self.caddy, 'NOTIFY': self.notify,
                   '__file__': str(SOURCE_FILE), 'sha': lambda data: hashlib.sha256(data).hexdigest(),
                   'urllib': types.SimpleNamespace(request=types.SimpleNamespace(urlopen=self.urlopen))}
        exec(compile(FUNCTIONS, str(SOURCE_FILE), 'exec'), self.ns)
        self.ns['run'] = self.run_command
        original_atomic = self.ns['atomic']
        self.ns['atomic'] = lambda p, data, mode=0o644, uid=None, gid=None: original_atomic(p, data, mode, os.getuid() if uid is None else uid, os.getgid() if gid is None else gid)
        digest = self.ns['digest']
        self.plan = {'commit': 'b' * 40, 'appPid': 101, 'appStartTime': '987', 'appUnit': str(self.unit),
                     'unitFiles': {str(self.unit): digest(self.unit)}, 'configHashes': {}, 'files': {},
                     'protectedPids': {unit: pid for unit, pid in self.pids.items() if unit != 'rolling-application.service'},
                     'expectedCurrentUi': str(self.old_ui), 'caddySha256': digest(self.caddy), 'notifySha256': digest(self.notify)}
        self.ns['m'] = self.plan
        (self.packet / 'plan.json').write_text(json.dumps(self.plan))
        (self.packet / 'application.service.next').write_text('WorkingDirectory=' + str(self.new_source) + '\n')
        self.result = {'schemaVersion': 1, 'commit': self.plan['commit'], 'source': str(self.new_source), 'ui': str(self.new_ui),
                       'planSha256': digest(self.packet / 'plan.json'), 'publisherSha256': digest(SOURCE_FILE),
                       'expectedCurrentUi': str(self.old_ui), 'caddySha256': self.plan['caddySha256'], 'notifySha256': self.plan['notifySha256'],
                       'unitSha256': digest(self.packet / 'application.service.next'), 'files': {'wallet/runtime.json': digest(self.new_ui / 'wallet/runtime.json')}}
        (self.packet / 'stage-result.json').write_text(json.dumps(self.result))

    def run_command(self, args):
        self.calls.append(args)
        if args == ['systemctl', 'daemon-reload']:
            self.configured = pathlib.Path(self.unit.read_text().strip().split('=', 1)[1])
            if self.fail_reload:
                self.fail_reload = False
                raise RuntimeError('Labelled lost daemon-reload response')
            return ''
        self.assertEqual(args[0:2], ['systemctl', 'show'])
        unit, key = args[2], args[4]
        if key == 'MainPID':
            return str(self.pids[unit])
        if key == 'WorkingDirectory':
            return str(self.configured)
        raise AssertionError(args)

    def urlopen(self, _url, timeout):
        self.assertEqual(timeout, 10)
        if self.fail_readback:
            raise OSError('Labelled static readback failure')
        return io.BytesIO((self.base / 'current/wallet/runtime.json').read_bytes())

    def assert_unchanged_controls(self):
        self.assertEqual(self.ns['digest'](self.caddy), self.plan['caddySha256'])
        self.assertEqual(self.ns['digest'](self.notify), self.plan['notifySha256'])
        self.assertEqual(self.pids, {'rolling-application.service': 101, 'rolling-application-proxy.service': 102, 'rolling-query.service': 103})
        self.assertTrue(all(call[1] in ('show', 'daemon-reload') for call in self.calls))

    def test_repeat_activation_switches_files_and_future_start_without_restarting(self):
        self.ns['activate']()
        self.assertEqual(os.readlink(self.base / 'current'), str(self.new_ui))
        self.assertEqual(self.configured, self.new_source)
        self.assertEqual((self.packet / 'application.service.before').read_bytes(), self.original_unit)
        self.assert_unchanged_controls()

    def test_readback_failure_restores_exact_pointer_and_unit(self):
        self.fail_readback = True
        with self.assertRaises(OSError):
            self.ns['activate']()
        self.assertEqual(os.readlink(self.base / 'current'), str(self.old_ui))
        self.assertEqual(self.unit.read_bytes(), self.original_unit)
        self.assertEqual(self.configured, self.old_source)
        self.assertTrue((self.new_ui / 'wallet/runtime.json').exists())
        self.assert_unchanged_controls()

    def test_daemon_reload_response_failure_restores_unit_without_switching_ui(self):
        self.fail_reload = True
        with self.assertRaises(RuntimeError):
            self.ns['activate']()
        self.assertEqual(os.readlink(self.base / 'current'), str(self.old_ui))
        self.assertEqual(self.unit.read_bytes(), self.original_unit)
        self.assert_unchanged_controls()

    def test_failure_after_pointer_replacement_still_restores_exact_previous_pointer(self):
        original_switch = self.ns['switch_current']
        calls = []

        def fail_after_first_replace(expected, target):
            original_switch(expected, target)
            calls.append(target)
            if len(calls) == 1:
                raise OSError('Labelled directory fsync failure after replace')

        self.ns['switch_current'] = fail_after_first_replace
        with self.assertRaises(OSError):
            self.ns['activate']()
        self.assertEqual(os.readlink(self.base / 'current'), str(self.old_ui))
        self.assertEqual(self.unit.read_bytes(), self.original_unit)
        self.assert_unchanged_controls()

    def test_wallet_update_is_release_local_and_preserves_existing_config(self):
        config = self.old_source / 'deploy/runtime-wallet.json'
        config.parent.mkdir(parents=True)
        old = {'config': {'bok': {'contract': 'unchanged'}, 'aggregateFunding': {'router': 'unchanged'}}}
        config.write_text(json.dumps(old))
        update = {'router': '0x' + '1' * 40, 'routerCodeHash': '0x' + '2' * 64}
        self.ns['install_wallet_update'](self.old_source, self.new_source, update)
        self.assertEqual(json.loads(config.read_text()), old)
        new = json.loads((self.new_source / 'deploy/runtime-wallet.json').read_text())
        self.assertEqual(new, {'config': {**old['config'], 'bokTopup': update}})
        self.assertEqual(self.ns['wallet_file'](self.new_source), self.new_source / 'deploy/runtime-wallet.json')
        with self.assertRaises(AssertionError):
            self.ns['install_wallet_update'](self.old_source, self.new_source, {**update, 'privateKey': 'invalid'})

    def test_tampered_staged_wallet_config_refuses_before_activation(self):
        config = self.new_source / 'deploy/runtime-wallet.json'
        config.parent.mkdir(parents=True)
        config.write_bytes(b'changed')
        self.result['walletConfigSha256'] = hashlib.sha256(b'expected').hexdigest()
        (self.packet / 'stage-result.json').write_text(json.dumps(self.result))
        with self.assertRaises(AssertionError):
            self.ns['activate']()
        self.assertEqual(os.readlink(self.base / 'current'), str(self.old_ui))
        self.assertNotIn(['systemctl', 'daemon-reload'], self.calls)

    def test_changed_proxy_pid_refuses_before_mutation(self):
        self.pids['rolling-application-proxy.service'] = 999
        with self.assertRaises(AssertionError):
            self.ns['activate']()
        self.assertEqual(self.unit.read_bytes(), self.original_unit)
        self.assertEqual(os.readlink(self.base / 'current'), str(self.old_ui))
        self.assertNotIn(['systemctl', 'daemon-reload'], self.calls)

    def test_changed_static_control_or_pointer_refuses_before_mutation(self):
        for name in ('caddy', 'notify', 'pointer'):
            with self.subTest(name=name):
                original = getattr(self, name).read_bytes() if name != 'pointer' else None
                if name == 'pointer':
                    (self.base / 'current').unlink()
                    os.symlink(self.new_ui, self.base / 'current')
                else:
                    getattr(self, name).write_bytes(b'changed')
                with self.assertRaises(AssertionError):
                    self.ns['activate']()
                self.assertEqual(self.unit.read_bytes(), self.original_unit)
                self.assertNotIn(['systemctl', 'daemon-reload'], self.calls)
                if name != 'pointer':
                    getattr(self, name).write_bytes(original)


    def payload_fixture(self, name='apps/rolling/reader.mjs'):
        for directory in (self.packet / 'files', self.new_source):
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'verified installed payload')
        self.plan['files'] = {name: {'sha256': self.ns['digest'](self.new_source / name), 'previousSha256': None}}
        (self.packet / 'payload.tgz').write_bytes(b'owned uploaded archive')
        self.result['payloadArchiveSha256'] = self.ns['digest'](self.packet / 'payload.tgz')
        (self.packet / 'plan.json').write_text(json.dumps(self.plan))
        self.result['planSha256'] = self.ns['digest'](self.packet / 'plan.json')
        (self.packet / 'stage-result.json').write_text(json.dumps(self.result))
        return name

    def test_success_removes_only_verified_packet_payload_and_keeps_rollback_metadata(self):
        name = self.payload_fixture()
        self.ns['activate']()
        self.assertFalse((self.packet / 'files').exists())
        self.assertFalse((self.packet / 'payload.tgz').exists())
        self.assertEqual((self.new_source / name).read_bytes(), b'verified installed payload')
        self.assertEqual((self.new_ui / 'wallet/runtime.json').read_bytes(), b'new runtime')
        for name in ['plan.json', 'stage-result.json', 'activation-result.json', 'application.service.before',
                     'application.service.next', 'current.before', 'payload-cleanup-result.json']:
            self.assertTrue((self.packet / name).is_file(), name)
        self.assert_unchanged_controls()

    def test_failed_activation_keeps_payload_for_inspection(self):
        name = self.payload_fixture()
        self.fail_readback = True
        with self.assertRaises(OSError): self.ns['activate']()
        self.assertTrue((self.packet / 'files' / name).exists())
        self.assertTrue((self.packet / 'payload.tgz').exists())
        self.assertFalse((self.packet / 'payload-cleanup-result.json').exists())

    def test_cleanup_authenticates_entire_tree_archive_and_installed_copies_before_any_delete(self):
        name = self.payload_fixture()
        for damage in ['extra', 'symlink', 'archive', 'installed', 'static']:
            with self.subTest(damage=damage):
                changed = None
                if damage == 'extra':
                    changed = self.packet / 'files/unrelated'; changed.write_bytes(b'do not delete')
                elif damage == 'symlink':
                    changed = self.packet / 'files/unrelated'; os.symlink(self.old_source, changed)
                else:
                    changed = {'archive': self.packet / 'payload.tgz', 'installed': self.new_source / name,
                               'static': self.new_ui / 'wallet/runtime.json'}[damage]
                    original = changed.read_bytes(); changed.write_bytes(b'tampered')
                with self.assertRaises(AssertionError): self.ns['cleanup_packet_payload'](self.result)
                self.assertTrue((self.packet / 'files' / name).is_file())
                self.assertTrue((self.packet / 'payload.tgz').is_file())
                if damage in ['extra', 'symlink']: changed.unlink()
                else: changed.write_bytes(original)
        self.ns['P'] = self.new_source
        with self.assertRaises(AssertionError): self.ns['cleanup_packet_payload'](self.result)
        self.assertTrue((self.packet / 'files' / name).exists())

    def test_capacity_counts_replacements_and_new_assets_once_before_stage_mutations(self):
        source = self.old_source
        old_bytes, new_bytes = b'old artifact', b'new artifact contents'
        asset = '.build/sdk/sdk.mjs'
        manifest = '.build/rolling-wallet/manifest.json'
        for directory in [source, self.packet / 'files']:
            (directory / asset).parent.mkdir(parents=True, exist_ok=True)
            (directory / manifest).parent.mkdir(parents=True, exist_ok=True)
        def description(data):
            return {'files': {'/wallet/sdk.mjs': {'file': asset, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}}}
        (source / asset).write_bytes(old_bytes)
        (source / manifest).write_text(json.dumps(description(old_bytes)))
        (self.packet / 'files' / asset).write_bytes(new_bytes)
        (self.packet / 'files' / manifest).write_text(json.dumps(description(new_bytes)))
        (source / 'apps/rolling').mkdir(parents=True)
        (source / 'apps/rolling/live.html').write_bytes(b'page')
        self.ns['PUBLIC'] = {'/': 'live.html'}
        self.plan['files'] = {name: {'sha256': self.ns['digest'](self.packet / 'files' / name)} for name in [asset, manifest]}
        existing = self.base / 'by-hash' / hashlib.sha256(old_bytes).hexdigest() / 'wallet/sdk.mjs'
        existing.parent.mkdir(parents=True); existing.write_bytes(old_bytes)
        payload_bytes = sum((self.packet / 'files' / name).stat().st_size for name in [asset, manifest])
        required_data = payload_bytes + len(new_bytes) + len(b'page') + 1024 * 1024
        self.ns['shutil'] = types.SimpleNamespace(disk_usage=lambda _: types.SimpleNamespace(free=required_data + 1024**3 - 1))
        with self.assertRaisesRegex(RuntimeError, 'Insufficient disk space'): self.ns['capacity_preflight']()
        self.assertEqual(list(self.new_source.iterdir()), [])
        self.assertFalse((self.base / 'by-hash' / hashlib.sha256(new_bytes).hexdigest()).exists())
        self.ns['shutil'] = types.SimpleNamespace(disk_usage=lambda _: types.SimpleNamespace(free=required_data + 1024**3))
        self.assertEqual(self.ns['capacity_preflight'](), required_data)
        stage = next(node for node in TREE.body if isinstance(node, ast.If) and ast.unparse(node.test) == "mode == 'stage'")
        calls = [ast.unparse(node) for node in stage.body]
        check = next(i for i, value in enumerate(calls) if value == 'capacity_preflight()')
        copy = next(i for i, value in enumerate(calls) if "['cp', '-al'" in value)
        export = next(i for i, value in enumerate(calls) if value.startswith('export_assets('))
        self.assertLess(check, copy); self.assertLess(check, export)


    def test_native_overlay_allows_only_the_exact_owner_oracle(self):
        native = 'node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js'
        self.assertEqual(str(self.ns['safe_relative'](native)), native)
        for name in ['node_modules/other.js', native + '.backup', 'apps/node_modules/other.js',
                     '../' + native, '/' + native, native.replace('/oracle/', '/oracle/../oracle/'),
                     native.replace('/oracle/', '/oracle//')]:
            with self.subTest(name=name), self.assertRaises(AssertionError): self.ns['safe_relative'](name)

    def test_native_overlay_rejects_symlinked_roots_parents_and_leaf(self):
        native = 'node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js'
        for count in [0, 1, 3, len(pathlib.PurePosixPath(native).parts)]:
            with self.subTest(depth=count):
                base = self.root / ('tree-' + str(count)); base.mkdir()
                external = self.root / ('outside-' + str(count)); external.mkdir()
                parts = pathlib.PurePosixPath(native).parts
                link = base.joinpath(*parts[:count]) if count else base
                if count: link.parent.mkdir(parents=True, exist_ok=True)
                else: base.rmdir()
                os.symlink(external, link)
                with self.assertRaises(AssertionError): self.ns['confined_payload_file'](base, native)
                self.assertEqual(list(external.iterdir()), [])

    def test_native_overlay_atomic_write_breaks_old_release_hardlink(self):
        native = 'node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js'
        old = self.old_source / native; new = self.new_source / native
        old.parent.mkdir(parents=True); new.parent.mkdir(parents=True)
        old.write_bytes(b'old pinned SDK source'); os.link(old, new)
        self.assertEqual(old.stat().st_ino, new.stat().st_ino)
        target = self.ns['confined_payload_file'](self.new_source, native)
        self.ns['atomic'](target, b'new pinned SDK source', 0o644)
        self.assertEqual(old.read_bytes(), b'old pinned SDK source')
        self.assertEqual(new.read_bytes(), b'new pinned SDK source')
        self.assertNotEqual(old.stat().st_ino, new.stat().st_ino)

    def test_native_overlay_passes_exact_activation_hash_and_payload_cleanup(self):
        native = self.payload_fixture('node_modules/@aztec-labs/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js')
        target = self.new_source / native
        original = target.read_bytes(); target.write_bytes(b'wrong source')
        with self.assertRaises(AssertionError): self.ns['activate']()
        self.assertNotIn(['systemctl', 'daemon-reload'], self.calls)
        target.write_bytes(original); self.ns['activate']()
        self.assertEqual(target.read_bytes(), original)
        self.assertFalse((self.packet / 'files').exists())


if __name__ == '__main__':
    unittest.main()
