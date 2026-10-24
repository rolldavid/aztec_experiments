import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Gas,GasFees,GasSettings} from '@aztec-labs/stdlib/gas';
import {ExecutionPayload,TxSimulationResult} from '@aztec-labs/stdlib/tx';
import {RevertCode} from '@aztec-labs/stdlib/avm';
import {SimulationError} from '@aztec-labs/stdlib/errors';
import {FunctionSelector} from '@aztec-labs/stdlib/abi';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {PrivateFeePaymentMethod,PrivateMintAndPayFeePaymentMethod} from '../shared/private-fee-payment.mjs';
import {estimatePrivateFeeTransaction,sendPrivateFeeTransaction} from '../shared/private-fee-estimation.mjs';
import {createPrivateFeeSimulator} from '../shared/private-fee-simulation.mjs';
import {consumePrivateFeeSimulationValidation} from '../shared/private-fee-validation.mjs';
const anchorBlockHeader={hash:async()=>new Fr(91)};
after(()=>BarretenbergSync.destroySingleton());
function fixture({available=500n,prices=new GasFees(2n,3n),privateGas=()=>new Gas(10,20),main=new Gas(2,10),refund=new Gas(1,5)}={}){
 const payer=AztecAddress.fromFieldUnsafe(new Fr(42)),selector=FunctionSelector.fromString('0x12345678'),calls=[],sends=[];
 const prepared={availableCredit:available,paymentMethod:new PrivateFeePaymentMethod(payer,1n),refundSelector:selector.toString(),gasSettings:new GasSettings(new Gas(100,1000),new Gas(50,500),prices,GasFees.empty())};
 const reservation=p=>p.calls.find(c=>c.name==='pay_fee')?.args[0].toBigInt()??p.calls.find(c=>c.name==='mint_and_pay_fee').args[3].toBigInt();
 const error=(address=payer,sel=selector,message='Not enough L2GAS gas left')=>new SimulationError(message,[{contractAddress:address,functionSelector:sel}]);
 const input={prepared,from:AztecAddress.fromFieldUnsafe(new Fr(43)),interaction:{request:async()=>new ExecutionPayload([],[],[],[])},node:{getNodeInfo:async()=>({txsLimits:{gas:new Gas(1000,10000)}})},wallet:{pxe:{getSyncedBlockHeader:async()=>anchorBlockHeader},sendTx:async(...args)=>{sends.push(args);return {receipt:{status:'checkpointed'}};}},simulator:{
  private:async(payload,_from,gas)=>{assert.equal(gas.getFeeLimit().toBigInt(),0n);assert(gas.teardownGasLimits.equals(Gas.empty()));calls.push({phase:'private',payload,gas});return new TxSimulationResult(undefined,{gasUsed:privateGas(reservation(payload))});},
  public:async(payload,_from,gas,enforce=false)=>{
   calls.push({phase:'public',payload,gas,enforce});assert(gas.maxFeesPerGas.equals(prices),'Public node must receive actual fee prices');assert(reservation(payload)>=gas.getFeeLimit().toBigInt(),'Contract reservation invariant');
   const work=privateGas(reservation(payload)).add(main),left=gas.gasLimits.sub(gas.teardownGasLimits),mainFits=work.daGas<=left.daGas&&work.l2Gas<=left.l2Gas;
   let reason;
   if(!mainFits)reason=error(AztecAddress.fromFieldUnsafe(new Fr(99)));
   else if(refund.daGas>gas.teardownGasLimits.daGas||refund.l2Gas>gas.teardownGasLimits.l2Gas)reason=error();
   const measured=gas.teardownGasLimits.equals(Gas.empty())?work:work.add(refund);
   return new TxSimulationResult(undefined,{forPublic:{},constants:{anchorBlockHeader}},{txEffect:{revertCode:reason?RevertCode.REVERTED:RevertCode.OK},gasUsed:{totalGas:measured,teardownGas:reason?Gas.empty():refund},revertReason:reason});
  },
 }};
 return {input,calls,sends,error,payer,selector};
}
test('credit below board ceiling funds a real-priced measured reservation',async()=>{
 const h=fixture();await sendPrivateFeeTransaction(h.input);assert.equal(h.sends.length,1);
 const [payload,opts]=h.sends[0];assert(opts.fee.gasSettings.getFeeLimit().toBigInt()<h.input.prepared.availableCredit);assert.equal(payload.calls[0].args[0].toBigInt(),opts.fee.gasSettings.getFeeLimit().toBigInt());
 assert(h.calls.filter(c=>c.phase==='public').every(c=>c.gas.maxFeesPerGas.equals(h.input.prepared.gasSettings.maxFeesPerGas)));assert.equal(h.calls.at(-1).enforce,true);assert.equal(h.input.prepared.paymentMethod.reservation,1n);
});
for(const prices of [new GasFees(0n,3n),new GasFees(2n,3n),new GasFees(2n,0n)])test('allocation respects both priced dimensions '+prices.toString(),async()=>{
 const h=fixture({prices});const result=await estimatePrivateFeeTransaction(h.input);assert(result.maximumFee<=h.input.prepared.availableCredit);assert.equal(h.sends.length,0);
});
test('only exact expected refund OOG is accepted as the zero-teardown probe',async()=>{
 const h=fixture();h.input.simulator.public=async()=>({publicInputs:{forPublic:{}},publicOutput:{revertReason:h.error(undefined,undefined,'Not allowed')}});await assert.rejects(sendPrivateFeeTransaction(h.input),/Not allowed/);assert.equal(h.sends.length,0);
});
test('an application shortage grows the probe and never returns its incomplete gas as a quote',async()=>{
 const h=fixture({main:new Gas(2,55)});const result=await estimatePrivateFeeTransaction(h.input);assert(result.passes>1);assert(result.gasSettings.gasLimits.l2Gas>=80);assert.equal(h.calls.at(-1).enforce,true);
});
test('search exhaustion is distinct from insufficient balance and cannot send',async()=>{
 const h=fixture({available:85n,main:new Gas(2,55)});await assert.rejects(sendPrivateFeeTransaction(h.input),{code:'BB_FEE_ESTIMATION_UNSTABLE'});assert.equal(h.sends.length,0);assert(h.calls.length<25);
});
test('a ceiling above credit can be affordable, while one gas unit priced above credit cannot',async()=>{
 const available=500n,oldPrice=available/1000n+1n;
 const affordable=fixture({available,prices:new GasFees(0n,oldPrice)});
 assert(affordable.input.prepared.gasSettings.getFeeLimit().toBigInt()>available);
 assert((await estimatePrivateFeeTransaction(affordable.input)).maximumFee<=available);
 const exhausted=fixture({available,prices:new GasFees(0n,available+1n)});
 await assert.rejects(estimatePrivateFeeTransaction(exhausted.input),{code:'BB_FEE_ESTIMATION_UNSTABLE'});
 assert(exhausted.calls.length>0&&exhausted.calls.every(c=>c.phase==='private'));
 assert.equal(exhausted.sends.length,0);
});
test('fragmentation cannot silently trigger another funding payment',async()=>{
 const h=fixture({available:120n,privateGas:r=>r>90n?new Gas(10,200):new Gas(10,20)});await assert.rejects(sendPrivateFeeTransaction(h.input),{code:'BB_FEE_ESTIMATION_UNSTABLE'});assert.equal(h.sends.length,0);
});
test('setup throws and final failures stop before any proof or submission',async()=>{
 for(const final of [false,true]){const h=fixture(),simulate=h.input.simulator.public;h.input.simulator.public=async(...args)=>{if(!final||args[3])throw h.error(undefined,undefined,'Setup denied');return simulate(...args);};await assert.rejects(sendPrivateFeeTransaction(h.input),/Setup denied/);assert.equal(h.sends.length,0);}
});
test('context changes stop measurement before simulation',async()=>{const h=fixture();h.input.guard=()=>{throw Object.assign(Error('changed'),{code:'BB_OPERATION_PAUSED'});};await assert.rejects(sendPrivateFeeTransaction(h.input),{code:'BB_OPERATION_PAUSED'});assert.equal(h.calls.length,0);assert.equal(h.sends.length,0);});
test('cold claim retains bridge witness and application payload',async()=>{
 const h=fixture();h.input.prepared.paymentMethod=new PrivateMintAndPayFeePaymentMethod(h.payer,{amount:500n,salt:new Fr(2),leafIndex:new Fr(3),secret:new Fr(4)},1n);
 const app=(await new PrivateFeePaymentMethod(AztecAddress.fromFieldUnsafe(new Fr(99)),1n).getExecutionPayload()).calls[0];app.name='application';const auth={},capsule={},extra={};h.input.interaction={request:async()=>new ExecutionPayload([app],[auth],[capsule],[extra])};
 const r=await estimatePrivateFeeTransaction(h.input);assert.deepEqual(r.payload.calls.map(c=>c.name),['claim','mint_and_pay_fee','application']);assert.equal(r.payload.calls[1].args[3].toBigInt(),r.reservation);assert.equal(r.payload.authWitnesses[0],auth);assert.equal(r.payload.capsules[0],capsule);assert.equal(r.payload.extraHashedArgs[0],extra);
});
test('SDK adapter sends zero-priced private measurement only to local PXE, with account scopes',async()=>{
 const calls=[],wallet={completeFeeOptions:async value=>{calls.push(value);return value;},createTxExecutionRequestFromPayloadAndFee:async()=>({request:true}),scopesFrom:from=>[from],senderForTagsFrom:from=>from,pxe:{simulateTx:async(_req,opts)=>{calls.push(opts);return 'private';}},simulateTx:async(_payload,opts)=>{calls.push(opts);return 'public';}};
 const adapter=createPrivateFeeSimulator(wallet),gas=GasSettings.forEstimation({maxFeesPerGas:GasFees.empty()});assert.equal(await adapter.private({feePayer:'payer'},'author',gas),'private');assert.equal(calls[1].simulatePublic,false);assert.deepEqual(calls[1].scopes,['author']);assert.equal(calls[1].senderForTags,'author');await adapter.public({},'author',gas,true);assert.equal(calls[2].skipTxValidation,false);assert.equal(calls[2].skipFeeEnforcement,false);
});

test('SDK adapter retains native public revert gas while strict wallet validation still rejects it',async()=>{
 const failure=new SimulationError('Out of gas',[]),request={tx:true},privateResult=new TxSimulationResult(undefined,{forPublic:{},gasUsed:Gas.empty()});privateResult.toSimulatedTx=async()=>request;
 let strict=0,publicCalls=0;const wallet={completeFeeOptions:async value=>value,createTxExecutionRequestFromPayloadAndFee:async()=>request,scopesFrom:from=>[from],senderForTagsFrom:from=>from,pxe:{simulateTx:async(_tx,opts)=>{assert.equal(opts.simulatePublic,false);return privateResult;}},simulateTx:async()=>{strict++;throw failure;}},node={simulatePublicCalls:async(tx,skip)=>{assert.equal(tx,request);assert.equal(skip,true);publicCalls++;return {txEffect:{revertCode:RevertCode.REVERTED},revertReason:failure,gasUsed:{totalGas:new Gas(3,9),teardownGas:Gas.empty()}};}};
 const adapter=createPrivateFeeSimulator(wallet,node),gas=new GasSettings(new Gas(100,1000),Gas.empty(),new GasFees(2n,3n),GasFees.empty());const measured=await adapter.public({},'author',gas);assert.equal(measured.publicOutput.revertReason,failure);assert.equal(measured.gasUsed.totalGas.l2Gas,9);assert.equal(strict,0);assert.equal(publicCalls,1);await assert.rejects(adapter.public({},'author',gas,true),error=>error===failure);assert.equal(strict,1);
});
test('native refund out-of-gas spelling is measured, never accepted as a final result',async()=>{const h=fixture(),simulate=h.input.simulator.public;h.input.simulator.public=async(...args)=>{const result=await simulate(...args);if(result.publicOutput?.revertReason)result.publicOutput.revertReason.setOriginalMessage('Out of gas: total L2 used 1 of 0, total DA used 0 of 0');return result;};const estimated=await estimatePrivateFeeTransaction(h.input);assert(estimated.reservation<=h.input.prepared.availableCredit);assert.equal(h.calls.at(-1).enforce,true);});

for(const nested of [false,true])test('refund probe cannot accept '+(nested?'nested':'wrong-selector')+' native out-of-gas',async()=>{const h=fixture(),simulate=h.input.simulator.public;h.input.simulator.public=async(...args)=>{const result=await simulate(...args);if(result.publicOutput?.revertReason){const frames=[{contractAddress:h.payer,functionSelector:nested?h.selector:FunctionSelector.fromString('0x87654321')}];if(nested)frames.push({contractAddress:h.payer,functionSelector:h.selector});result.publicOutput.revertReason=new SimulationError('Out of gas: total L2 used 1 of 0, total DA used 0 of 0',frames);}return result;};await assert.rejects(sendPrivateFeeTransaction(h.input),{code:'BB_FEE_ESTIMATION_UNSTABLE'});assert.equal(h.sends.length,0);});

test('operator ceilings above node limits do not reject a small measured transaction',async()=>{const h=fixture();h.input.node.getNodeInfo=async()=>({txsLimits:{gas:new Gas(90,900)}});const r=await estimatePrivateFeeTransaction(h.input);assert(r.gasSettings.gasLimits.l2Gas<=900);});
test('reverted final simulation without optional reason cannot be accepted',async()=>{const h=fixture(),simulate=h.input.simulator.public;h.input.simulator.public=async(...args)=>{const r=await simulate(...args);if(args[3])r.publicOutput.txEffect.revertCode=RevertCode.REVERTED;return r;};await assert.rejects(sendPrivateFeeTransaction(h.input),{code:'BB_SIMULATION_FAILED'});assert.equal(h.sends.length,0);});
test('cold setup out-of-gas fails closed rather than disguising rejection as funding shortage',async()=>{const h=fixture();h.input.simulator.public=async()=>{throw Error('[SETUP] UNRECOVERABLE ERROR! The transaction will be thrown out. Not enough L2GAS gas left');};await assert.rejects(sendPrivateFeeTransaction(h.input),/SETUP/);assert.equal(h.sends.length,0);});

import vm from 'node:vm';import fs from 'node:fs/promises';
test('actual wallet consumes the strict estimation once without extra simulation, then proves and submits',async()=>{
 const h=fixture(),proved=[],journaled=[],submitted=[],hash=new Fr(77),tx={getTxHash:()=>hash};
 class SDKWalletBoundary {
  constructor(pxe){this.pxe=pxe;}
  completeFeeOptions(opts){return {gasSettings:opts.gasSettings};}
  async simulateViaEntrypoint(){assert.fail('Strict estimation already validated this exact send');}
  createTxExecutionRequestFromPayloadAndFee(payload,from,fee){return {payload,from,gasSettings:fee.gasSettings};}
  scopesFrom(from){return [from];}senderForTagsFrom(from){return from;}
 }
 const ctx=vm.createContext({performance,console,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout});vm.runInContext(await fs.readFile(new URL('../apps/src/billboard/user/engine.js',import.meta.url),'utf8'),ctx);
 const a={BaseWallet:SDKWalletBoundary,GasSettings,consumePrivateFeeSimulationValidation,submitOnceWithReconciliation:async(_node,value)=>submitted.push(value),waitForSuccessfulReceipt:async()=>({status:'checkpointed',transactionFee:1n})};
 const wallet=ctx.BillboardPrivateFeeRouting.createAztecWallet(a,{getSyncedBlockHeader:async()=>anchorBlockHeader,proveTx:async request=>{proved.push(request);return {toTx:async()=>tx};}},{},{},()=>{},Fr.ONE,{transactionJournal:{assertCanStart:async()=>null,prepare:async value=>journaled.push(value),confirmed(){}}});h.input.wallet=wallet;
 await sendPrivateFeeTransaction(h.input);assert.equal(proved.length,1);assert.equal(journaled.length,1);assert.equal(submitted.length,1);assert.equal(journaled[0],submitted[0]);
 const enforced=h.calls.filter(c=>c.enforce);assert.equal(enforced.length,1);for(const c of enforced){assert.deepEqual(c.gas,proved[0].gasSettings);assert.equal(c.payload,proved[0].payload);}assert.equal(proved[0].payload.calls[0].args[0].toBigInt(),proved[0].gasSettings.getFeeLimit().toBigInt());
});

for(const change of ['wallet','pxe','payload','payload-mutation','gas','owner','anchor','scopes','sender','replay'])test('strict simulation handoff rejects '+change,async()=>{
 const h=fixture({available:3200n}),estimated=await estimatePrivateFeeTransaction(h.input);
 const input={wallet:h.input.wallet,payload:estimated.payload,from:h.input.from,gasSettings:estimated.gasSettings};
 if(change==='wallet')input.wallet={...input.wallet};
 if(change==='pxe')input.wallet.pxe={...input.wallet.pxe};
 if(change==='payload')input.payload={...input.payload};
 if(change==='payload-mutation')input.payload.calls[0].args[0]=new Fr(1);
 if(change==='gas')input.gasSettings=GasSettings.from({...input.gasSettings,gasLimits:new Gas(1,1)});
 if(change==='owner')input.from=h.payer;
 if(change==='anchor')input.wallet.pxe.getSyncedBlockHeader=async()=>({hash:async()=>new Fr(92)});
 if(change==='scopes')input.additionalScopes=[h.payer];
 if(change==='sender')input.sendMessagesAs=h.payer;
 if(change==='replay')await consumePrivateFeeSimulationValidation(estimated.simulationValidation,input);
 await assert.rejects(consumePrivateFeeSimulationValidation(estimated.simulationValidation,input),{code:'BB_SIMULATION_CHANGED'});
 await assert.rejects(consumePrivateFeeSimulationValidation(estimated.simulationValidation,{wallet:h.input.wallet,payload:estimated.payload,from:h.input.from,gasSettings:estimated.gasSettings}),{code:'BB_SIMULATION_CHANGED'});
});


test('adequate credit uses one strict native simulation at the configured fee maximum',async()=>{
 const h=fixture({available:3200n});const result=await estimatePrivateFeeTransaction(h.input);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].phase,'public');assert.equal(h.calls[0].enforce,true);
 assert.equal(result.payload,h.calls[0].payload);assert.deepEqual(result.gasSettings,h.input.prepared.gasSettings);
 assert.equal(result.maximumFee,3200n);assert.equal(result.reservation,3200n);assert.equal(result.payload.calls[0].args[0].toBigInt(),3200n);
 assert(result.maximumFee<=h.input.prepared.availableCredit);assert.equal(h.sends.length,0);
 // The quoted maximum reserves credit; only measured execution is charged.
 const measured=new Gas(13,35),actual=BigInt(measured.daGas)*2n+BigInt(measured.l2Gas)*3n;
 assert(actual<result.reservation);assert.equal(result.reservation-actual,3069n);
});
test('adequate-credit maximum and teardown stay inside current native gas caps',async()=>{
 const h=fixture({available:3200n});h.input.node.getNodeInfo=async()=>({txsLimits:{gas:new Gas(90,900)}});
 const result=await estimatePrivateFeeTransaction(h.input);
 assert.equal(h.calls.length,1);assert.deepEqual(result.gasSettings.gasLimits,new Gas(90,900));assert.deepEqual(result.gasSettings.teardownGasLimits,new Gas(50,500));
 assert.equal(result.maximumFee,2880n);assert(result.maximumFee<=h.input.prepared.gasSettings.getFeeLimit().toBigInt());
});
for(const kind of ['gas','contract','transport'])test('adequate-credit '+kind+' failure propagates without another simulation or send',async()=>{
 const h=fixture({available:3200n}),error=kind==='gas'?h.error():Object.assign(Error(kind),{code:kind});let calls=0;
 h.input.simulator.public=async()=>{calls++;throw error;};await assert.rejects(sendPrivateFeeTransaction(h.input),e=>e===error);
 assert.equal(calls,1);assert.equal(h.calls.length,0);assert.equal(h.sends.length,0);
});
test('adequate-credit strict result must fit its declared limits and remain successful',async()=>{
 for(const failure of ['total','teardown','revert']){
  const h=fixture({available:3200n}),simulate=h.input.simulator.public;
  h.input.simulator.public=async(...args)=>{const result=await simulate(...args);if(failure==='total')result.gasUsed.totalGas.l2Gas=1001;else if(failure==='teardown')result.gasUsed.teardownGas.l2Gas=501;else result.publicOutput.txEffect.revertCode=RevertCode.REVERTED;return result;};
  await assert.rejects(sendPrivateFeeTransaction(h.input),{code:failure==='revert'?'BB_SIMULATION_FAILED':'BB_GAS_LIMIT_EXCEEDED'});assert.equal(h.calls.length,1);assert.equal(h.sends.length,0);
 }
});
test('adequate-credit bridge payload retains its claim and positive reservation at zero fees',async()=>{
 const h=fixture({available:500n,prices:GasFees.empty()});h.input.prepared.paymentMethod=new PrivateMintAndPayFeePaymentMethod(h.payer,{amount:500n,salt:new Fr(2),leafIndex:new Fr(3),secret:new Fr(4)},1n);
 const result=await estimatePrivateFeeTransaction(h.input);assert.equal(h.calls.length,1);assert.equal(result.maximumFee,0n);assert.equal(result.reservation,1n);assert.equal(result.payload.calls[1].name,'mint_and_pay_fee');assert.equal(result.payload.calls[1].args[0].toBigInt(),500n);assert.equal(result.payload.calls[1].args[3].toBigInt(),1n);
});

for(const phase of ['simulation','validation-anchor','consume-anchor'])test('simulation handoff rejects payload mutation during '+phase,async()=>{
 const h=fixture({available:3200n}),entered=Promise.withResolvers(),release=Promise.withResolvers();
 if(phase==='simulation'){
  const original=h.input.simulator.public;
  h.input.simulator.public=async(...args)=>{const result=await original(...args);entered.resolve();await release.promise;return result;};
 }else if(phase==='validation-anchor'){
  const original=h.input.simulator.public;
  h.input.simulator.public=async(...args)=>{const result=await original(...args);result.publicInputs.constants={anchorBlockHeader:{hash:async()=>{entered.resolve();await release.promise;return new Fr(91);}}};return result;};
 }
 if(phase==='consume-anchor'){
  const estimated=await estimatePrivateFeeTransaction(h.input);
  h.input.wallet.pxe.getSyncedBlockHeader=async()=>{entered.resolve();await release.promise;return anchorBlockHeader;};
  const pending=consumePrivateFeeSimulationValidation(estimated.simulationValidation,{wallet:h.input.wallet,payload:estimated.payload,from:h.input.from,gasSettings:estimated.gasSettings});
  await entered.promise;estimated.payload.calls[0].args[0]=new Fr(1);release.resolve();await assert.rejects(pending,{code:'BB_SIMULATION_CHANGED'});
 }else{
  const pending=estimatePrivateFeeTransaction(h.input);await entered.promise;h.calls[0].payload.calls[0].args[0]=new Fr(1);release.resolve();await assert.rejects(pending,{code:'BB_SIMULATION_CHANGED'});
 }
 assert.equal(h.sends.length,0);
});
test('immediate funded send defers exactly one strict simulation to atomic proving',async()=>{
 const h=fixture({available:10000n});
 const result=await estimatePrivateFeeTransaction({...h.input,deferSimulation:true});
 assert.equal(result.atomicSimulation,true);assert.equal(result.passes,0);assert.equal(h.calls.length,0);
 assert.equal(result.payload.calls[0].args[0].toBigInt(),result.maximumFee);
 assert(result.maximumFee<=h.input.prepared.availableCredit);
});

test('immediate low-credit send removes only the final strict simulation and preserves the measured payload and budget',async()=>{
 const review=fixture(),immediate=fixture();
 const checked=await estimatePrivateFeeTransaction(review.input);
 const deferred=await estimatePrivateFeeTransaction({...immediate.input,deferSimulation:true});
 assert.equal(deferred.atomicSimulation,true);assert.equal(deferred.simulationValidation,undefined);
 assert.equal(deferred.reservation,checked.reservation);assert.equal(deferred.maximumFee,checked.maximumFee);
 assert.deepEqual(deferred.gasSettings,checked.gasSettings);assert.deepEqual(deferred.payload,checked.payload);
 assert.equal(deferred.passes,checked.passes);assert(deferred.passes>0);
 assert.deepEqual(immediate.calls,review.calls.slice(0,-1));assert.equal(review.calls.at(-1).enforce,true);
 assert(immediate.calls.every(call=>!call.enforce));assert(deferred.maximumFee<=immediate.input.prepared.availableCredit);
});

for(const failure of [null,'BB_SIMULATION_FAILED','BB_GAS_LIMIT_EXCEEDED','TX_INVALID'])test('low-credit native atomic handoff '+(failure??'succeeds once'),async()=>{
 const h=fixture(),observed=[],journaled=[],submitted=[],tx={getTxHash:()=>new Fr(77)};
 let handedPayload,handedOptions;
 class SDKWalletBoundary {
  constructor(pxe){this.pxe=pxe;}
  completeFeeOptions(opts){return {gasSettings:opts.gasSettings};}
  async simulateViaEntrypoint(){assert.fail('The immediate send must not add a separate final simulation');}
  createTxExecutionRequestFromPayloadAndFee(payload,from,fee){return {payload,from,gasSettings:fee.gasSettings};}
  scopesFrom(from){return [from];}senderForTagsFrom(from){return from;}
 }
 const ctx=vm.createContext({performance,console,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout});
 vm.runInContext(await fs.readFile(new URL('../apps/src/billboard/user/engine.js',import.meta.url),'utf8'),ctx);
 const pxe={proveTx:async()=>assert.fail('Unvalidated proof must never be used'),proveTxWithPublicValidation:async(request,options)=>{
  observed.push('validate');assert.equal(request.payload,handedPayload);assert.deepEqual(request.gasSettings.toBuffer(),handedOptions.fee.gasSettings.toBuffer());
  assert.equal(request.from,h.input.from);assert.equal(options.senderForTags,h.input.from);assert.equal(options.scopes[0],h.input.from);
  assert.equal(request.payload.calls[0].args[0].toBigInt(),request.gasSettings.getFeeLimit().toBigInt());
  assert(request.gasSettings.getFeeLimit().toBigInt()<=h.input.prepared.availableCredit);
  if(failure)throw Object.assign(Error(failure),{code:failure});
  observed.push('prove');return {toTx:async()=>tx};
 }};
 const a={BaseWallet:SDKWalletBoundary,GasSettings,submitOnceWithReconciliation:async(_node,value)=>submitted.push(value),waitForSuccessfulReceipt:async()=>({status:'checkpointed',transactionFee:1n})};
 const wallet=ctx.BillboardPrivateFeeRouting.createAztecWallet(a,pxe,{},{},()=>{},Fr.ONE,{transactionJournal:{assertCanStart:async()=>null,prepare:async value=>journaled.push(value),confirmed(){}}});
 const send=wallet.sendTx.bind(wallet);wallet.sendTx=(payload,options)=>{handedPayload=payload;handedOptions=options;return send(payload,options);};h.input.wallet=wallet;
 const pending=sendPrivateFeeTransaction({...h.input,deferSimulation:true});
 if(failure){await assert.rejects(pending,{code:failure});assert.deepEqual(observed,['validate']);assert.equal(journaled.length,0);assert.equal(submitted.length,0);}
 else{await pending;assert.deepEqual(observed,['validate','prove']);assert.deepEqual(journaled,[tx]);assert.deepEqual(submitted,[tx]);}
 assert.equal(handedOptions.atomicSimulation,true);assert.equal(handedOptions.simulationValidation,undefined);assert(h.calls.every(call=>!call.enforce));
});

test('low-credit deferral cannot bypass a probe application failure',async()=>{
 const h=fixture();h.input.simulator.public=async()=>{throw h.error(undefined,undefined,'Application rejected');};
 await assert.rejects(sendPrivateFeeTransaction({...h.input,deferSimulation:true}),/Application rejected/);assert.equal(h.sends.length,0);
});
