// Local test environment only. Pinned TXE 6.0 has public version2/private version1.
// Configure consistent scope without removing the application's chain/version assertions.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { createLogger } from '@aztec-labs/foundation/log';
import { startHttpRpcServer } from '@aztec-labs/foundation/json-rpc/server';
import { ROOT, assertNodeVersion, assertAztecPackages } from '../../scripts/toolchain.mjs';
assertNodeVersion(); assertAztecPackages();
assert.equal(process.env.TXE_WORKERS, '1');
process.env.HARDWARE_CONCURRENCY ??= '2';
// Published unbundled TXE loads account JSON without an import attribute.
// Supply only the Node-required JSON attribute for this pinned local artifact directory.
const artifactRoots = ['accounts', 'protocol-contracts', 'standard-contracts'].map(name => pathToFileURL(path.join(ROOT, 'node_modules/@aztec-labs', name, 'artifacts/')).href);
registerHooks({ load(url, context, nextLoad) {
  const ownerPins = {
    '/pxe/dest/logs/log_service.js':'550699709c5616e58abc56886e9a99e428345aa0d76a56d1fbe6ea65be225aba',
    '/pxe/dest/contract_function_simulator/oracle/utility_execution_oracle.js':'c74cd5039138e457018b44f1ff5c76c099a2921455edd3a8078c383adbde930c',
    '/pxe/dest/contract_function_simulator/oracle/oracle_registry.js':'9f58bf12b859914a64d8f36830cdec037bba14a8d38ed8cfda5c2fe413e4e2a2',
  };
  const ownerPath=Object.keys(ownerPins).find(suffix=>url.endsWith(suffix));
  if(ownerPath){
    const result=nextLoad(url,context);let source=Buffer.from(result.source).toString();
    assert.equal(createHash('sha256').update(source).digest('hex'),ownerPins[ownerPath]);
    if(ownerPath.endsWith('/log_service.js')) source=source.replace('async fetchTaggedLogs(contractAddress, recipient, providedSecrets) {','async fetchTaggedLogs(contractAddress, recipient, providedSecrets, providedOnly=false) {').replace('...await this.#getPointDerivedSecrets(contractAddress, recipient),','...(providedOnly ? [] : await this.#getPointDerivedSecrets(contractAddress, recipient)),');
    if(ownerPath.endsWith('/utility_execution_oracle.js')) source=source.replace('async getPendingTaggedLogsV2(scope, providedSecrets) {','async getPendingOwnerTaggedLogsV1(scope, providedSecrets) { return this.getPendingTaggedLogsV2(scope,providedSecrets,true); }\n    async getPendingTaggedLogsV2(scope, providedSecrets, providedOnly=false) {').replace('fetchTaggedLogs(this.contractAddress, scope, secrets)','fetchTaggedLogs(this.contractAddress, scope, secrets, providedOnly)');
    if(ownerPath.endsWith('/oracle_registry.js')) source+='\nORACLE_REGISTRY.aztec_utl_getPendingOwnerTaggedLogsV1 = ORACLE_REGISTRY.aztec_utl_getPendingTaggedLogsV2;\n';
    return {...result,source};
  }
  if (url.endsWith('/txe/dest/oracle/txe_oracle_top_level_context.js')) {
    const result = nextLoad(url, context);
    const source = Buffer.from(result.source).toString();
    assert.equal(createHash('sha256').update(source).digest('hex'),'ae6c9ed494136f9a85ce8f0066ce9d0de79583a746c174eb7efa66981b4f6a65');
    // TXE normally throws before mining an AVM-reverted transaction. This test-only
    // opt-in retains the actual PublicProcessor revert and mines its native effects.
    const marker = '} else if (!processedTx.revertCode.isOK()) {';
    assert.equal(source.split(marker).length,3);
    return {...result,source:source.replace(marker, `} else if (!processedTx.revertCode.isOK() && !globalThis.__ownerDeliveryAcceptRevert?.(processedTx)) {`).replace('const minRevertibleSideEffectCounter = 1;','let minRevertibleSideEffectCounter = globalThis.__ownerDeliverySetup ? 0 : 1;').replace('await noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);','if (minRevertibleSideEffectCounter) await noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);').replace('sideEffectCounter: minRevertibleSideEffectCounter,','sideEffectCounter: 1,').replace('// We pass the non-zero minRevertibleSideEffectCounter to make sure the side effects are split correctly.','// Read the native end_setup boundary for explicitly armed setup tests.\n            if (globalThis.__ownerDeliverySetup) minRevertibleSideEffectCounter = noteCache.minRevertibleSideEffectCounter;')};
  }
  if (artifactRoots.some(root => url.startsWith(root)) && url.endsWith('.json')) {
    return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return nextLoad(url, context);
} });
const base = path.join(ROOT, 'node_modules/@aztec-labs/txe/dest');
const { TXEGlobalVariablesBuilder } = await import(pathToFileURL(path.join(base, 'state_machine/global_variable_builder.js')).href);
const { TXEDispatcher } = await import(pathToFileURL(path.join(base, 'index.js')).href);
const { TXEStateMachine } = await import(pathToFileURL(path.join(base, 'state_machine/index.js')).href);
const {WASMSimulator} = await import('@aztec-labs/simulator/client');
const {createOwnerEnvelopeOracles,wrapOwnerEnvelopeCallbacks} = await import('../../shared/owner-envelope.mjs');
const ownerOracles = createOwnerEnvelopeOracles();
const originalExecute = WASMSimulator.prototype.executeUserCircuit;
WASMSimulator.prototype.executeUserCircuit = function(input, artifact, callback) {
  return originalExecute.call(this,input,artifact,wrapOwnerEnvelopeCallbacks(callback,ownerOracles));
};
const {PrivateExecutionOracle} = await import('@aztec-labs/pxe/simulator');
const originalNextIndex=PrivateExecutionOracle.prototype.getNextTaggingIndex;
PrivateExecutionOracle.prototype.getNextTaggingIndex=async function(...args){
  const nativeIndex=await originalNextIndex.apply(this,args);
  if(globalThis.__ownerTestForcedIndex!==undefined){
    const index=globalThis.__ownerTestForcedIndex; delete globalThis.__ownerTestForcedIndex;
    assert(index<=nativeIndex); return index;
  }
  return nativeIndex;
};
const originalResolve = TXEDispatcher.prototype.resolve_foreign_call;
TXEDispatcher.prototype.resolve_foreign_call = async function(call) {
  if(Object.hasOwn(ownerOracles,call.function)) return {values:await ownerOracles[call.function](...call.inputs)};
  return originalResolve.call(this,call);
};
const {TXESession} = await import(pathToFileURL(path.join(base,'txe_session.js')).href);
const originalSessionFunction = TXESession.prototype.processFunction;
TXESession.prototype.processFunction = async function(name,inputs) {
  if(name==='rolling_test_report_counts') {
    console.log(JSON.stringify({ownerDiscoveryQueries:this.stateMachine.ownerQueryCounts}));
    return {values:[]};
  }
  if(name==='rolling_test_use_tag_index') {
    assert.equal(this.state.name,'TOP_LEVEL');
    assert.equal(globalThis.__ownerTestForcedIndex,undefined);
    globalThis.__ownerTestForcedIndex=Number(BigInt(Array.isArray(inputs[0])?inputs[0][0]:inputs[0]));
    return {values:[]};
  }
  if(name==='rolling_test_assert_event_count') {
    await this.cycleOperation();
    let count=0;for await(const _ of this.sessionStore.openMap('private_event_logs').keysAsync()) count++;
    assert.equal(count,Number(BigInt(Array.isArray(inputs[0])?inputs[0][0]:inputs[0])));
    return {values:[]};
  }
  if(name==='rolling_test_assert_effects') {
    const effects=await this.handlerAsTxe().getLastTxEffects();
    assert.equal(effects.noteHashes.length,Number(BigInt(Array.isArray(inputs[0])?inputs[0][0]:inputs[0])));
    assert.equal(effects.privateLogs.length,Number(BigInt(Array.isArray(inputs[1])?inputs[1][0]:inputs[1])));
    return {values:[]};
  }
  if(name==='rolling_test_allow_setup_revert') { globalThis.__ownerDeliverySetup=true; name='rolling_test_allow_mined_revert'; }
  if(name==='rolling_test_allow_mined_revert') {
    assert.equal(this.state.name,'TOP_LEVEL');
    assert.equal(globalThis.__ownerDeliveryAcceptRevert,undefined);
    this.ownerJournalObservedRevert=false;
    globalThis.__ownerDeliveryAcceptRevert=(processed)=>{
      assert.equal(processed.revertCode.isOK(),false);
      assert.match(processed.revertReason.getMessage(),/^Assertion failed:/);
      this.ownerJournalObservedRevert=true;
      delete globalThis.__ownerDeliveryAcceptRevert;
      return true;
    };
    return {values:[]};
  }
  if(name==='rolling_test_assert_mined_revert') {
    assert.equal(this.ownerJournalObservedRevert,true);
    assert.equal(globalThis.__ownerDeliveryAcceptRevert,undefined);
    this.ownerJournalObservedRevert=false;
    delete globalThis.__ownerDeliverySetup;
    return {values:[]};
  }
  if(name==='rolling_test_forget_private_state') {
    assert.equal(this.state.name,'TOP_LEVEL');
    await this.cycleOperation();
    this.stagedWriteCoordinator.abort(this.currentChangeSetId);
    for(const contributor of this.operationContributors) contributor.onOperationEnd?.(this.currentChangeSetId,'discarded');
    await this.sessionStore.transactionAsync(async()=>{
      await this.noteStore.rollbackToBlock(0);
      await this.factStore.rollbackToBlock(0);
      await this.privateEventStore.rollbackToBlock(0);
      for(const name of ['highest_aged_index','highest_finalized_index','pending_indexes','last_finalized_indexes']) {
        const map=this.sessionStore.openMap(name);
        for await(const key of map.keysAsync()) await map.delete(key);
      }

    });
    this.stateMachine.contractSyncService.wipe();
    this.currentChangeSetId=this.stagedWriteCoordinator.begin();
    return {values:[]};
  }
  return originalSessionFunction.call(this,name,inputs);
};
const originalCreate = TXEStateMachine.create;
TXEStateMachine.create = async function (...args) {
  const machine = await originalCreate.apply(this,args);
  assert.equal(await machine.node.getChainId(),1);
  assert.equal(await machine.node.getVersion(),1);
  const getLogs=machine.node.getPrivateLogsByTags.bind(machine.node);
  machine.ownerQueryCounts={calls:0,tags:0,effectsCalls:0};
  machine.node.getPrivateLogsByTags=async request=>{
    machine.ownerQueryCounts.calls++; machine.ownerQueryCounts.tags+=request.tags.length;
    if(request.includeEffects) machine.ownerQueryCounts.effectsCalls++;
    return getLogs(request);
  };
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
  delete globalThis.__ownerDeliveryAcceptRevert; delete globalThis.__ownerDeliverySetup;
  const pending = originalDispose.apply(this,args); disposals.add(pending);
  pending.then(()=>disposals.delete(pending),()=>disposals.delete(pending));
  return pending;
};
const { createTXERpcServer } = await import(pathToFileURL(path.join(base,'rpc_server.js')).href);
const rpc = await createTXERpcServer(createLogger('txe:owner-delivery'));
const server = await startHttpRpcServer(rpc,{ host:'127.0.0.1',port:Number(process.env.TXE_PORT),timeoutMs:300000 });
console.log(JSON.stringify({profile:'Owner-only v6 TXE',chain:1,version:1,originalPublicVersion:2,realProofs:false,port:server.port}));
let stopping=false;
async function stop() {
  if(stopping)return; stopping=true;
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  await Promise.all([...disposals]);
  // Match upstream TXE service termination after closing owned connections/sessions.
  process.exit(0);
}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
