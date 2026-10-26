// Local test environment only. Unmodified TXE 5.2 has public version2/private version1.
// Configure consistent scope without removing the application's chain/version assertions.
import assert from 'node:assert/strict';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import {drainMessageWitnessReads} from './txe-message-witness.mjs';
import {createHash} from 'node:crypto';
import {createOwnerEnvelopeOracles} from '../shared/owner-envelope.mjs';
import {withoutHexPrefix} from '@aztec-labs/foundation/string';
import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { createLogger } from '@aztec-labs/foundation/log';
import { startHttpRpcServer } from '@aztec-labs/foundation/json-rpc/server';
import { ROOT, assertNodeVersion, assertAztecPackages } from './toolchain.mjs';
assertNodeVersion(); assertAztecPackages();
assert.equal(process.env.TXE_WORKERS, '1');
process.env.HARDWARE_CONCURRENCY ??= '2';
// Published unbundled TXE loads account JSON without an import attribute.
// Supply only the Node-required JSON attribute for this pinned local artifact directory.
const artifactRoots = ['accounts', 'protocol-contracts', 'standard-contracts'].map(name => pathToFileURL(path.join(ROOT, 'node_modules/@aztec-labs', name, 'artifacts/')).href);
const messageWitnessUrl=pathToFileURL(path.join(ROOT,'node_modules/@aztec-labs/stdlib/dest/messaging/l1_to_l2_message.js')).href;
// TXE must use the same owner-envelope simulator composition as application PXEs.
// Restrict the load-time change to the two reviewed native construction sites.
const ownerEnvelopeUrl=pathToFileURL(path.join(ROOT,'shared/owner-envelope.mjs')).href;
const ownerSimulatorSources=new Map([
  ['txe_session.js','fc97ac2ae633b4ed028e6dd8a5207ec49f6b29c6ce185dd346a7a3c886b35f82',3],
  ['oracle/txe_oracle_top_level_context.js','ae6c9ed494136f9a85ce8f0066ce9d0de79583a746c174eb7efa66981b4f6a65',2],
].map(([file,sha256,count])=>[pathToFileURL(path.join(ROOT,'node_modules/@aztec-labs/txe/dest',file)).href,{sha256,count}]));
registerHooks({ load(url, context, nextLoad) {
  const ownerSource=ownerSimulatorSources.get(url);
  if(ownerSource){
    const loaded=nextLoad(url,context),source=String(loaded.source),needle='new WASMSimulator()';
    assert.equal(createHash('sha256').update(source).digest('hex'),ownerSource.sha256,'Pinned TXE simulator source changed');
    assert.equal(source.split(needle).length-1,ownerSource.count,'Pinned TXE simulator construction changed');
    return {...loaded,source:`import {withOwnerEnvelopeOracles} from ${JSON.stringify(ownerEnvelopeUrl)};\n`+
      source.replaceAll(needle,'withOwnerEnvelopeOracles(new WASMSimulator())')};
  }
  if(url===messageWitnessUrl){const loaded=nextLoad(url,context);return {...loaded,source:drainMessageWitnessReads(loaded.source)};}
  if (artifactRoots.some(root => url.startsWith(root)) && url.endsWith('.json')) {
    return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return nextLoad(url, context);
} });
const base = path.join(ROOT, 'node_modules/@aztec-labs/txe/dest');
// Noir tests also invoke oracles directly over TXE RPC, outside WASMSimulator.
// Reuse production crypto and native wire conversion; leave other dispatch unchanged.
const {RPCTranslator}=await import(pathToFileURL(path.join(base,'rpc_translator.js')).href);
const {toInputSlots,callTxeHandler,TXE_ORACLE_REGISTRY}=await import(pathToFileURL(path.join(base,'oracle/txe_oracle_registry.js')).href);
for(const [name,oracle] of Object.entries(createOwnerEnvelopeOracles())){
  assert.equal(name in RPCTranslator.prototype,false,'Owner oracle already registered');
  Object.defineProperty(RPCTranslator.prototype,name,{value:async function(...inputs){
    const output=await oracle(...toInputSlots(inputs));
    return {values:output.map(slot=>Array.isArray(slot)?slot.map(withoutHexPrefix):withoutHexPrefix(slot))};
  }});
}
const ownerDiscoveryName='aztec_utl_getPendingOwnerTaggedLogsV1';
assert(TXE_ORACLE_REGISTRY[ownerDiscoveryName],'Native owner discovery registration missing');
assert.equal(ownerDiscoveryName in RPCTranslator.prototype,false,'Owner discovery already registered');
Object.defineProperty(RPCTranslator.prototype,ownerDiscoveryName,{value:function(...inputs){
  return callTxeHandler({oracle:ownerDiscoveryName,inputs,
    handler:([scope,providedSecrets])=>this.handlerAsUtility().getPendingOwnerTaggedLogsV1(scope,providedSecrets)});
}});

const { TXEGlobalVariablesBuilder } = await import(pathToFileURL(path.join(base, 'state_machine/global_variable_builder.js')).href);
const { TXEDispatcher } = await import(pathToFileURL(path.join(base, 'index.js')).href);
const { TXEStateMachine } = await import(pathToFileURL(path.join(base, 'state_machine/index.js')).href);
const originalCreate = TXEStateMachine.create;
TXEStateMachine.create = async function (...args) {
  const machine = await originalCreate.apply(this,args);
  assert.equal(await machine.node.getChainId(),1);
  assert.equal(await machine.node.getVersion(),1);
  return machine;
};
const originalBuild = TXEGlobalVariablesBuilder.prototype.buildCheckpointGlobalVariables;
TXEGlobalVariablesBuilder.prototype.buildCheckpointGlobalVariables = async function (...args) {
  const values = await originalBuild.apply(this,args);
  assert.equal(values.chainId.toBigInt(),1n);
  assert.equal(values.version.toBigInt(),2n);
  return { ...values, version: new Fr(1) };
};
const disposals = new Set();
const originalDispose = TXEDispatcher.prototype.disposeSession;
TXEDispatcher.prototype.disposeSession = function (...args) {
  const pending = originalDispose.apply(this,args); disposals.add(pending);
  pending.then(()=>disposals.delete(pending),()=>disposals.delete(pending));
  return pending;
};
const { createTXERpcServer } = await import(pathToFileURL(path.join(base,'rpc_server.js')).href);
const rpc = await createTXERpcServer(createLogger('txe:c01'));
const server = await startHttpRpcServer(rpc,{ host:'127.0.0.1',port:Number(process.env.TXE_PORT),timeoutMs:300000 });
console.log(JSON.stringify({profile:'C01 consistent-scope TXE',chain:1,version:1,originalPublicVersion:2,realProofs:false,port:server.port}));
let stopping=false;
async function stop() {
  if(stopping)return; stopping=true;
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  await Promise.all([...disposals]);
  // Match upstream TXE service termination after closing owned connections/sessions.
  process.exit(0);
}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
