/** Explicit configuration-provider adapter and diagnostic stage instrumentation
 * for the pinned trusted node CLI. Only its full getL1Config call selects
 * PublicNode; ordinary/history and debug settings are preserved. No fallback.
 * No SDK file is modified. This is not malicious-process attestation or health.
 * No arguments, values, error objects, stdout or network responses enter records.
 */
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, readSync, fstatSync, lstatSync, realpathSync, writeFileSync, fsyncSync, renameSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const RECORD_DIRECTORY = '/rolling-startup';
export const RECORD_NAME = 'stages.json';
export const MAX_RECORD_BYTES = 8192;
const CLI = '/usr/src/yarn-project/aztec/dest/bin/index.js';
export const RUNTIME_ADAPTER = 'publicnode-config-v1';
export const CONFIG_CALL = '    const { addresses, config } = await getL1Config(nodeConfig.registryAddress, nodeConfig.l1RpcUrls, nodeConfig.l1ChainId, nodeConfig.rollupVersion);';
export const SELECTED_CONFIG_CALL = CONFIG_CALL.replace('nodeConfig.l1RpcUrls', "['https://ethereum-sepolia-rpc.publicnode.com']");
const CONFIG_MODULE = '/usr/src/yarn-project/aztec/dest/cli/cmds/start_node.js';
const HOOK_URL = 'file:///etc/rolling-node/startup-stages.mjs';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const failure = () => new Error('ROLLING_STARTUP_DIAGNOSTIC_UNAVAILABLE');
export const SOURCE_PLAN = Object.freeze([
  {
    "path": "/usr/src/yarn-project/aztec/dest/cli/cmds/start_node.js",
    "sha256": "1d89163502863e60d6c0d5e03dcd00e23d483795ffdcd8a312e3ea275b8a626a",
    "points": [
      {
        "phase": "registry-guard",
        "before": "    if (!nodeConfig.registryAddress",
        "after": "    // Wait for a compatible rollup"
      },
      {
        "phase": "rollup-compatibility",
        "before": "    await waitForCompatibleRollup",
        "after": "    const { addresses, config } = await getL1Config"
      },
      {
        "phase": "l1-config",
        "before": "    const { addresses, config } = await getL1Config",
        "after": "    process.env.ROLLUP_CONTRACT_ADDRESS"
      },
      {
        "phase": "genesis-compare",
        "before": "    if (!Fr.fromHexString(config.genesisArchiveTreeRoot)",
        "after": "    nodeConfig = {"
      },
      {
        "phase": "telemetry",
        "before": "    const telemetryConfig = extractRelevantOptions",
        "after": "    // Create and start Aztec Node"
      },
      {
        "phase": "factory",
        "before": "    const node = await createAztecNode",
        "after": "    registerAztecNodeRpcHandlers(node, services, adminServices, {"
      }
    ]
  },
  {
    "path": "/usr/src/yarn-project/aztec-node/dest/factory.js",
    "sha256": "67726f96a7df3817c5cf30d8f1161055f487f34a4824e2baecb7c56833fe0259",
    "points": [
      {
        "phase": "factory-bb",
        "before": "    const { BarretenbergSync } = await import",
        "after": "    // Warm the KZG trusted-setup"
      },
      {
        "phase": "factory-kzg",
        "before": "    getKzg(log);",
        "after": "    const packageVersion = getPackageVersion();"
      },
      {
        "phase": "factory-keystore",
        "before": "    let keyStoreManager;",
        "after": "    // validate that the actual chain id"
      },
      {
        "phase": "factory-addresses",
        "before": "    const l1ContractsAddresses = await RegistryContract.collectAddresses",
        "after": "    Object.assign(config, l1ContractsAddresses);"
      },
      {
        "phase": "factory-l1-constants",
        "before": "    const [l1GenesisTime, slotDuration",
        "after": "    config.rollupVersion ??="
      },
      {
        "phase": "factory-blob",
        "before": "    const blobClient = await createBlobClientWithFileStores",
        "after": "    // attempt snapshot sync"
      },
      {
        "phase": "factory-snapshot",
        "before": "    await trySnapshotSync(config, log);",
        "after": "    const epochCache = await EpochCache.create"
      },
      {
        "phase": "factory-epoch-cache",
        "before": "    const epochCache = await EpochCache.create",
        "after": "    // Track started resources"
      },
      {
        "phase": "factory-world-state",
        "before": "        config.skipOrphanProposedBlockPruning",
        "after": "        // AVM execution backend"
      },
      {
        "phase": "factory-avm",
        "before": "        const avmSimulator = await AvmSimulatorPool.spawn",
        "after": "        started.push({\n            stop: ()=>avmSimulator"
      },
      {
        "phase": "factory-archiver",
        "before": "        const archiver = await createArchiver",
        "after": "        started.push(archiver);"
      },
      {
        "phase": "factory-world-state-sync",
        "before": "        const worldStateSynchronizer = await createWorldStateSynchronizer",
        "after": "        started.push(worldStateSynchronizer);"
      },
      {
        "phase": "factory-verifiers",
        "before": "        const useRealVerifiers =",
        "after": "        started.push(peerProofVerifier, rpcProofVerifier);"
      },
      {
        "phase": "factory-fee-provider",
        "before": "        const feeProvider = new FeeProviderImpl",
        "after": "        started.push(feeProvider);"
      },
      {
        "phase": "factory-p2p",
        "before": "        const p2pClient = await createP2PClient",
        "after": "        started.push(p2pClient);"
      },
      {
        "phase": "factory-start",
        "before": "        await worldStateSynchronizer.start();",
        "after": "        let dataWithholdingWatcher;"
      }
    ]
  },
  {
    "path": "/usr/src/yarn-project/aztec/dest/cli/aztec_start_action.js",
    "sha256": "33fbbf4d8a1b7c1b148d30fb283e61e25076b07dc2f99ba7a64bb6698d9e95e4",
    "points": [
      {
        "phase": "public-rpc-bind",
        "before": "        const { port } = await startHttpRpcServer(rpcServer, {\n            port: options.port,",
        "after": "        debugLogger.info(`Aztec Server listening on port"
      },
      {
        "phase": "admin-auth",
        "before": "        const apiKeyResolution = await resolveAdminApiKey",
        "after": "        if (!apiKeyResolution)"
      },
      {
        "phase": "admin-rpc-bind",
        "before": "        const { port } = await startHttpRpcServer(rpcServer, {\n            port: options.adminPort",
        "after": "        debugLogger.info(`Aztec Server admin API listening on port"
      }
    ]
  }
]);
export const PHASES = Object.freeze(SOURCE_PLAN.flatMap(module => module.points.map(point => point.phase)));

/** Pure single-call rewrite. transformSource supplies the independent whole-file
 * SHA gate first; the unique full call and call-name counts are additional gates.
 * No caller URL/config input exists, and no SDK disk file is ever changed. */
export function selectConfigurationProvider(source) {
  if (typeof source !== 'string' || source.split(CONFIG_CALL).length !== 2 || source.split('getL1Config(').length !== 2) throw failure();
  return source.replace(CONFIG_CALL,SELECTED_CONFIG_CALL);
}
export function transformSource(source, plan, helperUrl = HOOK_URL) {
  if (typeof source !== 'string' || sha256(source) !== plan.sha256 || source.includes('__rollingStartupStage')) throw failure();
  const selectProvider = plan.path === CONFIG_MODULE;
  if (selectProvider) {
    if (plan.sha256 !== SOURCE_PLAN[0].sha256) throw failure();
    selectConfigurationProvider(source); // validate before producing any transformed module
  }
  const changes = [];
  for (const {phase, before, after} of plan.points) {
    if (!PHASES.includes(phase) || !before || !after || source.split(before).length !== 2 || source.split(after).length !== 2) throw failure();
    const start = source.indexOf(before), end = source.indexOf(after);
    if (start >= end) throw failure();
    changes.push({at:start, state:'begin', phase}, {at:end, state:'complete', phase});
  }
  // At a shared boundary the previous operation completes before the next starts.
  changes.sort((a,b) => a.at - b.at || (a.state === 'complete' ? -1 : 1));
  let result = `import { mark as __rollingStartupStage } from ${JSON.stringify(helperUrl)};\n`, previous = 0;
  for (const {at,state,phase} of changes) {
    result += source.slice(previous,at) + `__rollingStartupStage(${JSON.stringify(phase)},${JSON.stringify(state)});\n`;
    previous = at;
  }
  result += source.slice(previous);
  return selectProvider ? selectConfigurationProvider(result) : result;
}

function privateDirectory(directory) {
  const st = lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o777) !== 0o700 || st.uid !== process.getuid()) throw failure();
}
function boundedFile(path, limit, privateMode = false) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > limit || (privateMode && ((st.mode & 0o777) !== 0o600 || st.uid !== process.getuid()))) throw failure();
    const bytes = Buffer.alloc(limit + 1);
    const length = readSync(fd,bytes,0,bytes.length,0);
    if (length > limit || length !== st.size) throw failure();
    return bytes.subarray(0,length);
  } finally { closeSync(fd); }
}
export function validateRecord(value, helperSha256) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== 'helperSha256,history,instrumented,runtimeAdapter,schemaVersion' || value.schemaVersion !== 1 || value.instrumented !== true || value.runtimeAdapter !== RUNTIME_ADAPTER || !/^[a-f0-9]{64}$/.test(helperSha256) || value.helperSha256 !== helperSha256 || !Array.isArray(value.history) || value.history.length > PHASES.length * 2) throw failure();
  const started = new Set(), stack = [];
  for (const pair of value.history) {
    if (!Array.isArray(pair) || pair.length !== 2 || !PHASES.includes(pair[0]) || !['begin','complete'].includes(pair[1])) throw failure();
    if (pair[1] === 'begin') {
      if (started.has(pair[0])) throw failure();
      started.add(pair[0]); stack.push(pair[0]);
    } else if (stack.pop() !== pair[0]) throw failure();
  }
  return value;
}
export function readRecord(directory, helperSha256) {
  privateDirectory(directory);
  return validateRecord(JSON.parse(boundedFile(join(directory,RECORD_NAME),MAX_RECORD_BYTES,true)), helperSha256);
}
function existsEntry(path) {
  try { lstatSync(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw failure(); }
}
export function createRecorder(directory, helperSha256) {
  privateDirectory(directory);
  if (!/^[a-f0-9]{64}$/.test(helperSha256) || existsEntry(join(directory, RECORD_NAME)) || existsEntry(join(directory, '.stages.tmp'))) throw failure();
  const value = {schemaVersion:1,instrumented:true,runtimeAdapter:RUNTIME_ADAPTER,helperSha256,history:[]};
  let unavailable = false;
  return (phase,state) => {
    if (unavailable) return false;
    let fd;
    try {
      value.history.push([phase,state]); validateRecord(value,helperSha256);
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX_RECORD_BYTES) throw failure();
      privateDirectory(directory);
      fd = openSync(join(directory,'.stages.tmp'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
      writeFileSync(fd,bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(join(directory,'.stages.tmp'),join(directory,RECORD_NAME));
      fd = openSync(directory,constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); fsyncSync(fd);
      return true;
    } catch {
      // Evidence failure must never replace the application's original outcome.
      unavailable = true; return false;
    } finally { if (fd !== undefined) { try { closeSync(fd); } catch { unavailable = true; } } }
  };
}
let recorder;
export function mark(phase,state) { return recorder?.(phase,state) ?? false; }
export function installRuntimeAdapter() {
  if (process.version !== 'v24.21.0' || import.meta.url !== HOOK_URL) throw failure();
  const prepared = new Map();
  // Validate the entire exact-source closure BEFORE the application imports.
  for (const plan of SOURCE_PLAN) {
    const bytes = boundedFile(plan.path,1024*1024);
    const canonical = realpathSync(plan.path);
    if (!canonical.startsWith('/usr/src/yarn-project/')) throw failure();
    prepared.set(pathToFileURL(canonical).href, {plan, transformed:transformSource(bytes.toString('utf8'),plan)});
  }
  recorder = createRecorder(RECORD_DIRECTORY,sha256(boundedFile(fileURLToPath(import.meta.url),1024*1024)));
  return registerHooks({load:createLoadHook(prepared)});
}
export function createLoadHook(prepared) {
  return (url,context,nextLoad) => {
    const original = nextLoad(url,context), target = prepared.get(url);
    if (!target) return original;
    if (original.format !== 'module' || sha256(original.source) !== target.plan.sha256) throw failure();
    return {...original,source:target.transformed};
  };
}
if (process.argv[1] === CLI) {
  try { installRuntimeAdapter(); } catch { throw failure(); }
}
