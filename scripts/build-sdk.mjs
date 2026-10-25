import {prepareNativeContractAssets,relocateNativeContract,verifyNativeContractCopy,browserSdkEntry,browserSchnorrEntry} from './native-contract-assets.mjs';
import {efficientPxeStartup,PXE_STARTUP_PINS} from './pxe-startup.mjs';
import {assertTransformBindings} from './check-transform-bindings.mjs';
import {prepareNativeWasmAssets,relocateNativeWasm,verifyNativeWasmCopy} from './native-wasm-assets.mjs';
import {BB_WORKER_TIMING_PINS,instrumentBrowserWorker} from './bb-worker-timings.mjs';
import {selectedNoteWitnesses,SELECTED_NOTE_PINS} from './selected-note-witnesses.mjs';
import {efficientKernelWitnessWork,KERNEL_WORK_PINS} from './kernel-witness-work.mjs';
import {reusePrivateLogEffects} from './pxe-log-projection.mjs';
import {inspectOwnerDiscovery,OWNER_DISCOVERY_PINS} from './patch-pxe-owner-discovery.mjs';
import {parallelPxeAnchorSnapshot} from './pxe-sync-snapshot.mjs';
import {zeroWindowRpcMicrotasks} from './rpc-zero-window.mjs';
import {validatedKernelProve} from './pxe-validated-prove.mjs';
import {inspectOperationGuards,PXE_OPERATION_PINS,PXE_SOURCE_PINS} from './patch-pxe-operation-guards.mjs';
import {inspectIndexedDBAtomicity, INDEXEDDB_ATOMICITY_PINS} from './patch-indexeddb-atomicity.mjs';
import {inspectPxeReorgAnchor,PXE_REORG_ANCHOR_PINS} from './patch-pxe-reorg-anchor.mjs';
import {inspectPrivateEventQuery,PRIVATE_EVENT_QUERY_PINS} from './patch-private-event-query.mjs';
import {buildPortalRuntime} from './build-portal-runtime.mjs';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertNodeVersion, assertAztecPackages, pins } from './toolchain.mjs';

assertNodeVersion();
assertAztecPackages();
const privateEventQuery=await inspectPrivateEventQuery(fileURLToPath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url)));
if(privateEventQuery.state!=='patched')throw new Error('Run npm run bootstrap:dependencies before building the SDK');
const pxeReorgAnchor=await inspectPxeReorgAnchor(fileURLToPath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url)));
if(pxeReorgAnchor.state!=='patched')throw new Error('Run npm run bootstrap:dependencies before building the SDK');
const indexedDBAtomicity=await inspectIndexedDBAtomicity(fileURLToPath(new URL('../node_modules/@aztec-labs/kv-store',import.meta.url)));
if(indexedDBAtomicity.state!=='patched')throw new Error('Run npm run bootstrap:dependencies before building the SDK');
const operationGuards=await inspectOperationGuards(fileURLToPath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url)));
if(operationGuards.state!=='patched')throw new Error('Run npm run bootstrap:dependencies before building the SDK');
if((await inspectOwnerDiscovery(fileURLToPath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url)))).state!=='patched')throw new Error('Run npm run bootstrap:dependencies before building the SDK');
const portalMetadata=buildPortalRuntime();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || '.build/sdk');
const bb = 'node_modules/@aztec-foundation/bb.js/dest/browser/barretenberg_wasm';
const sha = data => createHash('sha256').update(data).digest('hex');
await fs.mkdir(out, { recursive: true });

// Patch only URL relocation at pinned source boundaries. Actual upstream worker
// entrypoints are built separately, preserving their initialization and exports.
const nativeWasmAssets=await prepareNativeWasmAssets(root);
const relocations = new Map([
  [`${bb}/barretenberg_wasm_main/factory/browser/index.js`, ['./main.worker.js', './bb-main.worker.js']],
  [`${bb}/barretenberg_wasm_thread/factory/browser/index.js`, ['./thread.worker.js', './bb-thread.worker.js']],
  ['node_modules/@aztec-labs/kv-store/dest/sqlite-opfs/store.js', ['./worker.js', './sqlite.worker.js']],
  ['node_modules/@aztec-labs/sqlite3mc-wasm/dest/index.js', ['../vendor/jswasm/sqlite3.wasm', './sqlite3.wasm']],
]);
const relocationPlugin = {
  name: 'aztec-worker-url-relocation',
  setup(builder) {
    builder.onResolve({filter:/^rolling:pxe-startup$/},()=>({path:path.join(root,'shared/pxe-startup-cache.mjs')}));
    builder.onLoad({ filter: /\.js$/ }, async ({ path: filename }) => {
      const relative = path.relative(root, filename).split(path.sep).join('/');
      if(nativeWasmAssets.has(relative)){
        const original=await fs.readFile(filename,'utf8');
        return {contents:assertTransformBindings(original,relocateNativeWasm(original,nativeWasmAssets.get(relative)),relative),loader:'js'};
      }
      const transform = Object.hasOwn(PXE_STARTUP_PINS,relative) ? source => efficientPxeStartup(source,relative)
        : Object.hasOwn(BB_WORKER_TIMING_PINS,relative) ? source => instrumentBrowserWorker(source,relative)
        : Object.hasOwn(SELECTED_NOTE_PINS,relative) ? source => selectedNoteWitnesses(source,relative)
        : Object.hasOwn(KERNEL_WORK_PINS,relative) ? source => efficientKernelWitnessWork(source,relative)
        : relative==='node_modules/@aztec-labs/pxe/dest/node/caching_aztec_node.js' ? reusePrivateLogEffects
        : relative==='node_modules/@aztec-labs/foundation/dest/json-rpc/client/safe_json_rpc_client.js' ? zeroWindowRpcMicrotasks
        : relative==='node_modules/@aztec-labs/pxe/dest/block_synchronizer/block_synchronizer.js' ? parallelPxeAnchorSnapshot
        : relative==='node_modules/@aztec-labs/pxe/dest/private_kernel/private_kernel_execution_prover.js' ? validatedKernelProve : undefined;
      if (transform) {
        const original = await fs.readFile(filename,'utf8');
        return {contents:assertTransformBindings(original,transform(original),relative),loader:'js'};
      }
      const change = relocations.get(relative);
      if (!change) return;
      let contents = await fs.readFile(filename, 'utf8');
      const before = `new URL('${change[0]}', import.meta.url)`;
      if (contents.split(before).length !== 2) throw new Error(`SDK URL boundary changed: ${filename}`);
      contents = contents.replace(before, `new URL('${change[1]}', import.meta.url)`);
      return { contents, loader: 'js' };
    });
  },
};
const options = {
  absWorkingDir: root, bundle: true, platform: 'browser', target: 'es2022',
  mainFields: ['browser', 'module', 'main'], conditions: ['browser'],
  // Supported upstream CSP-safe codec; all imports share its record extension implementation.
  alias: { 'msgpackr/index-no-eval': 'msgpackr/index-no-eval', 'msgpackr/unpack-no-eval': 'msgpackr/unpack-no-eval', 'msgpackr': 'msgpackr/index-no-eval', 'msgpackr/pack': 'msgpackr/index-no-eval', 'msgpackr/unpack': 'msgpackr/index-no-eval' },
  plugins: [relocationPlugin, polyfillNode()],
  loader: { '.wasm': 'binary' }, legalComments: 'eof', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.LOG_LEVEL': '"silent"' }, logLevel: 'warning',
};
// Preserve the existing synchronous global while resolving import.meta URLs to
// the actual emitted bundle URL rather than esbuild's empty import_meta object.
const main = await build({ ...options, entryPoints: ['shared/sdk-entry.mjs'],
  format: 'iife', globalName: '__aztec', outfile: path.join(out, 'aztec_bundle.js'),
  define: { ...options.define, 'import.meta.url': '__aztecBundleUrl' },
  banner: { js: 'var __aztecBundleUrl = globalThis.__rollingWalletAssetBase ? new URL("aztec_bundle.js", globalThis.__rollingWalletAssetBase).href : typeof document !== "undefined" && document.currentScript ? document.currentScript.src : globalThis.location?.href;' },
});
// Keep the synchronous CLI bundle above unchanged. Browser builds preserve the
// SDK's existing lazy artifact imports rather than embedding every circuit and
// both WASM variants into the account tools' initial download.
const nativeContractAssets=await prepareNativeContractAssets(root);
const lazyAssets = new Map();
const lazyInputs = new Set();
const circuitImporter = path.join(root, 'node_modules/@aztec-labs/noir-protocol-circuits-types/dest/client_artifacts_helper.js');
const circuitDirectory = path.join(root, 'node_modules/@aztec-labs/noir-protocol-circuits-types/artifacts');
const wasmImporter = path.join(root, bb, 'fetch_code/browser/index.js');
const browserLazyAssets = {
  name: 'aztec-browser-lazy-assets',
  setup(builder) {
    builder.onLoad({filter:/shared[\\/]sdk-entry\.mjs$/},async({path:filename})=>({contents:browserSdkEntry(await fs.readFile(filename,'utf8')),loader:'js'}));
    builder.onLoad({filter: /\.js$/}, async args => {
      const relative=path.relative(root,args.path).split(path.sep).join('/'),nativeContract=nativeContractAssets.get(relative);
      if(relative==='node_modules/@aztec-labs/accounts/dest/schnorr/index.js')return {contents:browserSchnorrEntry(await fs.readFile(args.path,'utf8')),loader:'js'};
      if(nativeContract){const source=await fs.readFile(args.path,'utf8');return {contents:assertTransformBindings(source,relocateNativeContract(source,nativeContract),relative),loader:'js'};}

      if (args.path !== circuitImporter && args.path !== wasmImporter) return;
      let contents = await fs.readFile(args.path, 'utf8');
      const imports = [...contents.matchAll(/import\((['"])([^'"]+)\1\)/g)];
      for (const match of imports) {
        const requested = match[2];
        const circuit = args.path === circuitImporter && /^\.\.\/artifacts\/[a-z0-9_]+\.json$/.test(requested);
        const wasm = args.path === wasmImporter && ['./barretenberg.js', './barretenberg-threads.js'].includes(requested);
        if (!circuit && !wasm) throw new Error('Unexpected SDK lazy import: ' + requested);
        const filename = path.resolve(path.dirname(args.path), requested);
        if (circuit && path.dirname(filename) !== circuitDirectory) throw new Error('Unexpected SDK circuit asset');
        const original = await fs.readFile(filename, 'utf8');
        const asset = circuit ? 'export default ' + original + ';\n' : original;
        const digest = sha(asset);
        const name = 'sdk-lazy-' + digest + '.mjs';
        lazyAssets.set(name, asset);
        lazyInputs.add(path.relative(root, filename).split(path.sep).join('/'));
        // A verified Blob worker has no relative module base. Resolve lazy
        // imports against the same hosted bundle URL as WASM and child workers.
        contents = contents.replace(match[0], `import(new URL(${JSON.stringify('./' + name + '?sha256=' + digest)}, import.meta.url).href)`);
      }
      return {contents, loader: 'js'};
    });
  },
};
const browser = await build({ ...options, entryPoints: ['shared/sdk-entry.mjs'],
  plugins: [browserLazyAssets, ...options.plugins],
  format: 'iife', globalName: '__aztec', outfile: path.join(out, 'aztec_browser.js'),
  define: { ...options.define, 'import.meta.url': '__aztecBundleUrl' },
  banner: { js: 'var __aztecBundleUrl = globalThis.__rollingWalletAssetBase ? new URL("aztec_bundle.js", globalThis.__rollingWalletAssetBase).href : typeof document !== "undefined" && document.currentScript ? document.currentScript.src : globalThis.location?.href;' },
});
if (![...lazyInputs].some(name => name.startsWith(path.relative(root, circuitDirectory).split(path.sep).join('/') + '/')) ||
    !['barretenberg.js', 'barretenberg-threads.js'].every(name => lazyInputs.has(bb + '/fetch_code/browser/' + name))) {
  throw new Error('Expected native SDK lazy boundaries were not preserved');
}
for (const [name, contents] of lazyAssets) await fs.writeFile(path.join(out, name), contents);
for(const record of nativeContractAssets.values()){const bytes=await fs.readFile(path.join(root,record.input));verifyNativeContractCopy(bytes,record);await fs.writeFile(path.join(out,record.output),bytes);}
// Browser-only exports must not reintroduce eager copies of these native artifacts.
if(Object.values(browser.metafile.outputs).some(output=>Object.entries(output.inputs).some(([name,value])=>value.bytesInOutput>0&&(name.endsWith('/artifacts/SchnorrAccount.json')||name.includes('/artifacts/FeeJuice.json')))))throw Error('Browser SDK contains an obsolete or duplicate eager native artifact');
const workers = await build({ ...options, format: 'esm', outdir: out,
  entryPoints: {
    'bb-main.worker': `${bb}/barretenberg_wasm_main/factory/browser/main.worker.js`,
    'bb-thread.worker': `${bb}/barretenberg_wasm_thread/factory/browser/thread.worker.js`,
    'sqlite.worker': 'node_modules/@aztec-labs/kv-store/dest/sqlite-opfs/worker.js',
  },
});
// wasm-bindgen and SQLite use relative asset URLs at runtime.
const assets = [
  ['node_modules/@aztec-foundation/noir-acvm_js/web/acvm_js_bg.wasm', 'acvm_js_bg.wasm'],
  ['node_modules/@aztec-foundation/noir-noirc_abi/web/noirc_abi_wasm_bg.wasm', 'noirc_abi_wasm_bg.wasm'],
  ['node_modules/@aztec-labs/sqlite3mc-wasm/vendor/jswasm/sqlite3.wasm', 'sqlite3.wasm'],
  ['node_modules/@aztec-labs/sqlite3mc-wasm/vendor/jswasm/sqlite3-opfs-async-proxy.js', 'sqlite3-opfs-async-proxy.js'],
];
for (const [src, dest] of assets) {
  const record=[...nativeWasmAssets.values()].find(value=>value.input===src);
  if(record){const bytes=await fs.readFile(path.join(root,src));verifyNativeWasmCopy(bytes,record);await fs.writeFile(path.join(out,dest),bytes);}
  else await fs.copyFile(path.join(root,src),path.join(out,dest));
}
const inputs = [...new Set(['scripts/native-contract-assets.mjs',...nativeContractAssets.keys(),...[...nativeContractAssets.values()].map(value=>value.input),'scripts/native-wasm-assets.mjs',...nativeWasmAssets.keys(),'scripts/pxe-startup.mjs','shared/pxe-startup-cache.mjs','shared/trusted-node-snapshot.mjs',...Object.keys(PXE_STARTUP_PINS),'shared/bb-worker-timings.mjs','scripts/bb-worker-timings.mjs',...Object.keys(BB_WORKER_TIMING_PINS),'scripts/selected-note-witnesses.mjs',...Object.keys(SELECTED_NOTE_PINS),'scripts/kernel-witness-work.mjs',...Object.keys(KERNEL_WORK_PINS),'scripts/pxe-log-projection.mjs','node_modules/@aztec-labs/pxe/dest/node/caching_aztec_node.js','scripts/patch-pxe-owner-discovery.mjs',...OWNER_DISCOVERY_PINS.map(pin=>'node_modules/@aztec-labs/pxe/'+pin.path),...Object.keys(main.metafile.inputs), ...Object.keys(browser.metafile.inputs), ...Object.keys(workers.metafile.inputs), ...lazyInputs,
  ...assets.map(([src]) => src), 'scripts/pxe-simulation-logs.mjs', 'scripts/pxe-sync-snapshot.mjs', 'scripts/pxe-validated-prove.mjs', 'scripts/check-transform-bindings.mjs', 'shared/owner-envelope.mjs', 'shared/ordinary-post-fees.mjs', 'shared/like-fees.mjs', 'shared/ordinary-post-witnesses.mjs','scripts/rpc-zero-window.mjs', 'scripts/patch-indexeddb-atomicity.mjs',
  ...INDEXEDDB_ATOMICITY_PINS.map(pin=>'node_modules/@aztec-labs/kv-store/'+pin.path), 'scripts/toolchain.mjs', 'toolchain.json', 'scripts/patch-private-event-query.mjs',
  ...PRIVATE_EVENT_QUERY_PINS.map(pin=>'node_modules/@aztec-labs/pxe/'+pin.path), 'scripts/patch-pxe-reorg-anchor.mjs',
  ...PXE_REORG_ANCHOR_PINS.map(pin=>'node_modules/@aztec-labs/pxe/'+pin.path),
  'scripts/patch-pxe-operation-guards.mjs',
  ...[...PXE_OPERATION_PINS,...PXE_SOURCE_PINS].map(pin=>'node_modules/@aztec-labs/pxe/'+pin.path),
  'scripts/build-portal-runtime.mjs',...Object.keys(portalMetadata.sources).map(name=>'billboard/portal/'+name)])].sort();
const operationLiteralInputs = [
  ...Object.entries(PXE_STARTUP_PINS),
  ...PXE_OPERATION_PINS.map(pin=>['node_modules/@aztec-labs/pxe/'+pin.path,pin.after]),
  ...PXE_SOURCE_PINS.map(pin=>['node_modules/@aztec-labs/pxe/'+pin.path,pin.sha256]),
];
const operationRequiredInputs=new Set(['scripts/patch-pxe-owner-discovery.mjs',...OWNER_DISCOVERY_PINS.map(pin=>'node_modules/@aztec-labs/pxe/'+pin.path),'scripts/patch-pxe-operation-guards.mjs',...operationLiteralInputs.map(([name])=>name)]);
const inputHashes = {};
for (const filename of inputs) {
  try { inputHashes[filename] = sha(await fs.readFile(path.resolve(root, filename))); }
  catch (error) { if (error.code !== 'ENOENT'||operationRequiredInputs.has(filename)) throw error; }
}
for(const [loader,record] of nativeContractAssets)if(inputHashes[loader]!==record.sourceSha||inputHashes[record.input]!==record.sha256)throw Error('Native contract input changed during build: '+loader);
for(const [name,expected] of operationLiteralInputs)if(inputHashes[name]!==expected)throw new Error('SDK operation patch changed during build: '+name);
for(const pin of OWNER_DISCOVERY_PINS)if(inputHashes['node_modules/@aztec-labs/pxe/'+pin.path]!==pin.after)throw new Error('SDK owner discovery patch changed during build: '+pin.path);
const outputs = {};
const emitted = [...new Set([...Object.keys(main.metafile.outputs), ...Object.keys(browser.metafile.outputs), ...Object.keys(workers.metafile.outputs)].map(filename => path.basename(filename)).concat(assets.map(([, dest]) => dest), [...lazyAssets.keys()],[...nativeContractAssets.values()].map(value=>value.output)))].sort();
for (const name of emitted) outputs[name] = sha(await fs.readFile(path.join(out, name)));
await fs.writeFile(path.join(out, 'sdk-manifest.json'), JSON.stringify({
  aztecVersion: pins.aztec, lockfile: sha(await fs.readFile(path.join(root, 'package-lock.json'))),
  buildScript: sha(await fs.readFile(fileURLToPath(import.meta.url))), inputs: inputHashes, outputs,
}, null, 2) + '\n');
console.log(`Built pinned SDK and upstream workers: ${out}`);
