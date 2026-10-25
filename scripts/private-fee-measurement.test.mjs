import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {PrivateCircuitPublicInputs,PrivateLogData,PublicCallRequest,CountedPublicCallRequest,ReadRequest} from '@aztec-labs/stdlib/kernel';
import {PrivateLog} from '@aztec-labs/stdlib/logs';
import {Gas,GasFees,GasSettings} from '@aztec-labs/stdlib/gas';
import {PrivateSimulationResult,TxSimulationResult,ExecutionPayload,HashedValues} from '@aztec-labs/stdlib/tx';
import {generateSimulatedProvingResult} from '@aztec-labs/pxe/simulator';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {createPrivateFeeSimulator} from '../shared/private-fee-simulation.mjs';
after(()=>BarretenbergSync.destroySingleton());
const address=AztecAddress.fromFieldUnsafe(new Fr(123));
const privateSettings=GasSettings.forEstimation({maxFeesPerGas:GasFees.empty(),maxPriorityFeesPerGas:GasFees.empty(),teardownGasLimits:Gas.empty()});
const probeSettings=teardown=>new GasSettings(new Gas(10000,1000000),teardown,new GasFees(2n,3n),GasFees.empty());
function execution(settings,reads=false){
 const call=counter=>{const publicInputs=PrivateCircuitPublicInputs.empty();publicInputs.callContext.contractAddress=address;
  publicInputs.txContext.gasSettings=settings.clone();const log=PrivateLog.empty();log.fields[0]=new Fr(counter+99);log.emittedLength=1;
  publicInputs.privateLogs.array[0]=new PrivateLogData(log,0,counter);publicInputs.privateLogs.claimedLength=1;
  return {publicInputs,contractClassLogs:[],nestedExecutionResults:[],noteHashNullifierCounterMap:new Map(),partialWitness:new Map([[1,'original']]),acir:Buffer.alloc(0),vk:Buffer.alloc(0)};};
 const entrypoint=call(3);entrypoint.nestedExecutionResults=[call(4)];
 if(reads)for(const [name,value]of [['noteHashReadRequests',101],['nullifierReadRequests',202]]){entrypoint.publicInputs[name].array[0]=new ReadRequest(new Fr(value),10).scope(AztecAddress.ZERO);entrypoint.publicInputs[name].claimedLength=1;}
 entrypoint.publicInputs.publicTeardownCallRequest=new PublicCallRequest(address,address,false,new Fr(7));
 return {entrypoint,firstNullifier:new Fr(1),publicFunctionCalldata:[new HashedValues([new Fr(9)],new Fr(7))]};
}
const snapshot=value=>[value.entrypoint,...value.entrypoint.nestedExecutionResults].map(call=>({inputs:call.publicInputs.toBuffer().toString('hex'),witness:[...call.partialWitness]}));
async function fixture(reads=false){
 const source=execution(privateSettings,reads),pristine=snapshot(source),reference=execution(privateSettings,reads),seen=[];let privateCalls=0;
 const node={findLeavesIndexes:()=>{assert(reads,'Empty read requests need no node read');return [1n];},simulatePublicCalls:async tx=>{seen.push(tx);return {gasUsed:{totalGas:tx.data.gasUsed,teardownGas:tx.data.constants.txContext.gasSettings.teardownGasLimits}};}};
 const {publicInputs}=await generateSimulatedProvingResult(reference,async()=> 'reference',node);
 const original=new TxSimulationResult(source,publicInputs);
 const pxe={proveTxWithPublicValidation:()=>assert.fail('Measurement never proves'),getSyncedBlockHeader:async()=>publicInputs.constants.anchorBlockHeader,simulateTx:async()=>{privateCalls++;return privateCalls===1?original:new TxSimulationResult(source,publicInputs);}};
 const wallet={pxe,completeFeeOptions:async value=>value,createTxExecutionRequestFromPayloadAndFee:async()=>({}),scopesFrom:from=>[from],senderForTagsFrom:from=>from,simulateTx:()=>assert.fail('No strict simulation during measurement')};
 const payload=new ExecutionPayload([],[],[],[]),adapter=createPrivateFeeSimulator(wallet,node);
 const measured=await adapter.private(payload,address,privateSettings);
 return {source,pristine,seen,node,wallet,pxe,payload,adapter,measured,privateCalls:()=>privateCalls};
}
for(const teardown of [Gas.empty(),new Gas(30,2000)])test('native regenerated probe equals fresh SDK assembly, teardown '+teardown.toString(),async()=>{
 const h=await fixture(),settings=probeSettings(teardown);
 await h.adapter.public(h.payload,address,settings,false,h.measured);
 const fresh=execution(settings),expected=await generateSimulatedProvingResult(fresh,async()=> 'reference',h.node);
 const expectedTx=await new PrivateSimulationResult(fresh,expected.publicInputs).toSimulatedTx();
 assert.deepEqual(h.seen[0].toBuffer(),expectedTx.toBuffer());assert.equal(await h.seen[0].validateTxHash(),true);
 assert.deepEqual(snapshot(h.source),h.pristine);assert.equal(h.privateCalls(),1);
});
test('zero/full probes reuse only one private execution and leave nested inputs/logs/witness untouched',async()=>{
 const h=await fixture();for(const teardown of [Gas.empty(),new Gas(30,2000)])await h.adapter.public(h.payload,address,probeSettings(teardown),false,h.measured);
 assert.equal(h.privateCalls(),1);assert.equal(h.seen.length,2);assert.deepEqual(snapshot(h.source),h.pristine);
 assert.notEqual(h.seen[0].data,h.measured.publicInputs);assert.notEqual(h.seen[0].data,h.seen[1].data);
 assert(h.seen[0].data.constants.txContext.gasSettings.teardownGasLimits.equals(Gas.empty()));
 assert(h.seen[1].data.constants.txContext.gasSettings.teardownGasLimits.equals(new Gas(30,2000)));
});
for(const change of ['payload','reservation','sender','pxe','anchor'])test('private measurement rejects changed '+change,async()=>{
 const h=await fixture();let payload=h.payload,from=address;
 if(change==='payload')payload=new ExecutionPayload([],[],[],[]);
 if(change==='reservation')h.payload.calls.push({name:'pay_fee',args:[new Fr(99)]});
 if(change==='sender')from=AztecAddress.fromFieldUnsafe(new Fr(321));
 if(change==='pxe')h.wallet.pxe={...h.pxe};
 if(change==='anchor')h.pxe.getSyncedBlockHeader=async()=>({hash:async()=>new Fr(999)});
 await assert.rejects(h.adapter.public(payload,from,probeSettings(Gas.empty()),false,h.measured),{code:'BB_SIMULATION_CHANGED'});assert.equal(h.seen.length,0);
});
test('a second reservation owns a distinct private execution and cannot take an earlier result',async()=>{
 const h=await fixture(),next=new ExecutionPayload([],[],[],[]);await h.adapter.private(next,address,privateSettings);
 await assert.rejects(h.adapter.public(next,address,probeSettings(Gas.empty()),false,h.measured),{code:'BB_SIMULATION_CHANGED'});assert.equal(h.privateCalls(),2);assert.equal(h.seen.length,0);
});
test('public probe awaits its node rejection and never modifies the original execution',async()=>{
 const h=await fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers(),failure=Error('public rejected');let settled=false;
 h.node.simulatePublicCalls=async()=>{entered.resolve();await gate.promise;throw failure;};
 const pending=h.adapter.public(h.payload,address,probeSettings(Gas.empty()),false,h.measured).finally(()=>{settled=true;});
 await entered.promise;assert.equal(settled,false);gate.resolve();await assert.rejects(pending,error=>error===failure);
 assert.deepEqual(snapshot(h.source),h.pristine);assert.equal(h.privateCalls(),1);
});

test('native regenerated read verification drains independent reads before releasing a failed probe',async()=>{
 const h=await fixture(true),gate=Promise.withResolvers(),entered=Promise.withResolvers(),failure=Error('note read rejected');let calls=0,settled=false;
 h.node.findLeavesIndexes=async()=>{calls++;if(calls===1)throw failure;entered.resolve();await gate.promise;return [1n];};
 const pending=h.adapter.public(h.payload,address,probeSettings(Gas.empty()),false,h.measured).finally(()=>{settled=true;});
 await entered.promise;assert.equal(settled,false);gate.resolve();await assert.rejects(pending,error=>error===failure||error.errors?.includes(failure));
 assert.equal(calls,2);assert.equal(h.seen.length,0);assert.deepEqual(snapshot(h.source),h.pristine);
});

test('unpatched EmbeddedWallet path does not regenerate its already-siloed private measurement',async()=>{
 const h=await fixture();delete h.pxe.proveTxWithPublicValidation;
 const initialExecution=execution(privateSettings),initial=await generateSimulatedProvingResult(initialExecution,async()=> 'reference',h.node);
 h.pxe.simulateTx=async()=>new TxSimulationResult(initialExecution,initial.publicInputs);
 const adapter=createPrivateFeeSimulator(h.wallet,h.node),first=await adapter.private(h.payload,address,privateSettings),before=snapshot(initialExecution);
 // A real unpatched SDK returns a native result with already-mutated logs.
 // Using it as a reusable input would double-silo; a fresh public probe owns
 // its own native private execution and uses that result directly instead.
 const probe=execution(probeSettings(Gas.empty())),assembled=await generateSimulatedProvingResult(probe,async()=> 'reference',h.node);
 const nativeResult=TxSimulationResult.fromPrivateSimulationResultAndPublicOutput(new PrivateSimulationResult(probe,assembled.publicInputs));
 let fresh=0;h.pxe.simulateTx=async()=>{fresh++;return nativeResult;};
 await adapter.public(h.payload,address,probeSettings(Gas.empty()),false,first);
 assert.equal(fresh,1);assert.deepEqual(snapshot(initialExecution),before);assert.equal(h.seen.length,1);
 assert.deepEqual(h.seen[0].data.toBuffer(),assembled.publicInputs.toBuffer());
});

test('reusable adapter rejects a replacement PXE before taking another private measurement',async()=>{
 const h=await fixture();h.wallet.pxe={...h.pxe};delete h.wallet.pxe.proveTxWithPublicValidation;
 await assert.rejects(h.adapter.private(h.payload,address,privateSettings),{code:'BB_SIMULATION_CHANGED'});
 assert.equal(h.privateCalls(),1);assert.equal(h.seen.length,0);
});

for(const change of ['none','payload','reservation','owner','pxe','anchor'])test('local measurement validation preserves exact candidate guard without public RPC: '+change,async()=>{
 const h=await fixture();let payload=h.payload,from=address;
 if(change==='payload')payload=new ExecutionPayload([],[],[],[]);
 if(change==='reservation')h.payload.calls.push({name:'pay_fee',args:[new Fr(99)]});
 if(change==='owner')from=AztecAddress.fromFieldUnsafe(new Fr(321));
 if(change==='pxe')h.wallet.pxe={...h.pxe};
 if(change==='anchor')h.pxe.getSyncedBlockHeader=async()=>({hash:async()=>new Fr(999)});
 if(change==='none')await h.adapter.validateMeasurement(payload,from,h.measured);
 else await assert.rejects(h.adapter.validateMeasurement(payload,from,h.measured),{code:'BB_SIMULATION_CHANGED'});
 assert.equal(h.seen.length,0);assert.equal(h.privateCalls(),1);assert.deepEqual(snapshot(h.source),h.pristine);
});
for(const publicCall of [false,true])test('native low-credit private metering includes each startup once; Board public call='+publicCall,async()=>{
 const refund=new Gas(192,27510),publicBody=publicCall?new Gas(384,92440):Gas.empty();
 async function meter(teardown){
  const publicInputs=PrivateCircuitPublicInputs.empty();publicInputs.callContext.contractAddress=address;publicInputs.txContext.gasSettings=probeSettings(teardown);
  publicInputs.publicTeardownCallRequest=new PublicCallRequest(address,address,false,new Fr(7));
  const calldata=[new HashedValues([new Fr(9)],new Fr(7))];
  if(publicCall){publicInputs.publicCallRequests.array[0]=new CountedPublicCallRequest(new PublicCallRequest(address,address,false,new Fr(8)),3);publicInputs.publicCallRequests.claimedLength=1;calldata.push(new HashedValues([new Fr(10)],new Fr(8)));}
  const entrypoint={publicInputs,contractClassLogs:[],nestedExecutionResults:[],noteHashNullifierCounterMap:new Map(),partialWitness:new Map(),acir:Buffer.alloc(0),vk:Buffer.alloc(0)};
  const result=await generateSimulatedProvingResult({entrypoint,firstNullifier:Fr.ONE,publicFunctionCalldata:calldata},async()=> 'native low-credit accounting',new Proxy({},{get(){assert.fail('No external reads');}}));return result.publicInputs.gasUsed;
 }
 const zero=await meter(Gas.empty()),full=await meter(refund);
 assert.deepEqual(zero,new Gas(128,540000+30800+20000*(publicCall?2:1)));
 assert.deepEqual(zero.add(refund).add(publicBody),full.add(publicBody));
});
