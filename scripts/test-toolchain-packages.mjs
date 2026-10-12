// Labelled package-file fixtures; these tests do not execute SDK/native code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertAztecPackages, bbBinary, pins } from './toolchain.mjs';

const labs = '@aztec-labs/aztec.js', bb = '@aztec-foundation/bb.js', transitive = '@aztec-labs/stdlib';
const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-packages-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const toolchain = {aztec: '6.0.0-rc.3', aztecPackages: {[labs]: '6.0.0-rc.3', [bb]: '6.0.0-rc.6'}, aztecLockPackages: {[labs]: '6.0.0-rc.3', [bb]: '6.0.0-rc.6', [transitive]: '6.0.0-rc.3'}};
  const manifest = {dependencies: {...toolchain.aztecPackages}};
  const lock = {lockfileVersion: 3, packages: {'': structuredClone(manifest)}};
  const write = (relative, data) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(data)); };
  for (const [name, version] of Object.entries(toolchain.aztecLockPackages)) {
    lock.packages[`node_modules/${name}`] = {version, integrity};
    write(`node_modules/${name}/package.json`, {name, version});
  }
  function check() { write('package.json', manifest); write('package-lock.json', lock); return assertAztecPackages({root, toolchain}); }
  return {root, toolchain, manifest, lock, write, check};
}

test('labelled fixtures accept exact labs rc3 and foundation rc6, with scoped closure', t => fixture(t).check());
for (const [label, mutate, pattern] of [
  ['release label mismatch', f => f.toolchain.aztec = '6.0.0-rc.1', /SDK release identity/],
  ['missing map', f => delete f.toolchain.aztecPackages, /Missing explicit/],
  ['unknown direct package', f => f.manifest.dependencies['@aztec-labs/unknown'] = '6.0.0-rc.3', /Unpinned/],
  ['unused direct pin', f => f.toolchain.aztecPackages['@aztec-labs/unknown'] = '6.0.0-rc.3', /Unused/],
  ['range declaration', f => f.manifest.dependencies[labs] = '^6.0.0-rc.3', /Unpinned/],
  ['range pin', f => f.toolchain.aztecPackages[bb] = '^6.0.0-rc.6', /Invalid/],
  ['blanket rc3 foundation downgrade', f => f.manifest.dependencies[bb] = '6.0.0-rc.3', /Unpinned/],
  ['duplicate declarations', f => f.manifest.devDependencies = {[labs]: '6.0.0-rc.3'}, /Duplicate/],
  ['missing lock closure', f => delete f.toolchain.aztecLockPackages, /Missing explicit/],
  ['direct and closure disagree', f => f.toolchain.aztecLockPackages[labs] = '6.0.0-rc.1', /Unpinned/],
  ['stale lock root', f => f.lock.packages[''].dependencies[labs] = '6.0.0-rc.1', /Lock root/],
  ['extra lock root', f => f.lock.packages[''].devDependencies = {[transitive]: '6.0.0-rc.3'}, /Extra lock/],
  ['missing direct lock', f => delete f.lock.packages[`node_modules/${labs}`], /Missing direct/],
  ['stale transitive lock', f => f.lock.packages[`node_modules/${transitive}`].version = '6.0.0-rc.1', /Unpinned lock/],
  ['missing integrity', f => delete f.lock.packages[`node_modules/${transitive}`].integrity, /Unpinned lock/],
  ['linked lock', f => f.lock.packages[`node_modules/${transitive}`].link = true, /Unpinned lock/],
  ['unreviewed closure member', f => delete f.toolchain.aztecLockPackages[transitive], /Unpinned lock/],
  ['unused closure pin', f => f.toolchain.aztecLockPackages['@aztec-labs/missing'] = '6.0.0-rc.3', /Unused Aztec lock/],
  ['lock path escape', f => f.lock.packages[`../node_modules/${transitive}`] = {version:'6.0.0-rc.3', integrity}, /Invalid scoped lock path/],
  ['old installed SDK', f => f.write(`node_modules/${labs}/package.json`, {name: labs, version: '6.0.0-rc.1'}), /Installed/],
  ['wrong installed identity', f => f.write(`node_modules/${labs}/package.json`, {name: bb, version: '6.0.0-rc.3'}), /Installed/],
  ['old installed transitive', f => f.write(`node_modules/${transitive}/package.json`, {name: transitive, version:'6.0.0-rc.1'}), /Installed/],
]) test(`labelled fixtures reject ${label}`, t => {const f = fixture(t); mutate(f); assert.throws(f.check, pattern);});

test('missing installed package is a failure', t => {
  const f = fixture(t); fs.rmSync(path.join(f.root, 'node_modules', transitive), {recursive:true}); assert.throws(f.check, /ENOENT/);
});
test('nested scoped lock cannot hide an older installed SDK', t => {
  const f = fixture(t), location = `node_modules/parent/node_modules/${transitive}`;
  f.lock.packages[location] = {version:'6.0.0-rc.3', integrity};
  f.write(`${location}/package.json`, {name:transitive, version:'6.0.0-rc.1'}); assert.throws(f.check, /Installed/);
});
test('unsupported optional native platform may be absent, current platform may not', t => {
  const f = fixture(t), entry = f.lock.packages[`node_modules/${transitive}`];
  fs.rmSync(path.join(f.root, 'node_modules', transitive), {recursive:true});
  entry.optional = true; entry.os = [process.platform === 'linux' ? 'darwin' : 'linux']; f.check();
  entry.os = [process.platform]; assert.throws(f.check, /ENOENT/);
  entry.os = []; assert.throws(f.check, /Invalid optional/);
});
test('Node pin remains exact and old native qualification cannot run with new SDK', () => {
  assert.equal(pins.node, '24.21.0');
  assert.notEqual(pins.nativeProverPackage, pins.aztecPackages[bb]);
  assert.throws(bbBinary, /not qualified/); // Throws before filesystem/native execution.
});
