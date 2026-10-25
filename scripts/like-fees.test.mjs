import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {Gas,GasFees,GasSettings} from '@aztec-labs/stdlib/gas';
import {ExecutionPayload,HashedValues} from '@aztec-labs/stdlib/tx';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {loadContractArtifact,FunctionCall,FunctionSelector} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {PrivateCircuitPublicInputs,PrivateLogData,PublicCallRequest,CountedPublicCallRequest,NoteHash,Nullifier} from '@aztec-labs/stdlib/kernel';
import {PrivateLog} from '@aztec-labs/stdlib/logs';
import {generateSimulatedProvingResult} from '@aztec-labs/pxe/simulator';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {PrivateFeePaymentMethod,PrivateMintAndPayFeePaymentMethod} from '../shared/private-fee-payment.mjs';
import {PRIVATE_FEE_REFUND_PROFILE} from '../shared/private-fee-client.mjs';
import {estimatePrivateFeeTransaction,sendPrivateFeeTransaction} from '../shared/private-fee-estimation.mjs';
import {RevertCode} from '@aztec-labs/stdlib/avm';
import {LIKE_GAS_PROFILE as profile,likeFeeBudget,likeFeeLimit} from '../shared/like-fees.mjs';
after(()=>BarretenbergSync.destroySingleton());
const address=n=>AztecAddress.fromFieldUnsafe(new Fr(n)),from=address(3),boardAddress=address(4),feeAddress=address(5);
function fixture(available=11000000000000000000n){
 const prices=new GasFees(0n,2129014393943n),gasSettings=new GasSettings(new Gas(117624,6540000),new Gas(58812,817500),prices,GasFees.empty());
 const board={address:boardAddress,currentContractClassId:Fr.fromString(profile.boardClassId),originalContractClassId:Fr.fromString(profile.boardClassId)};
 const account={address:from,currentContractClassId:Fr.fromString(profile.accountClassId),originalContractClassId:Fr.fromString(profile.accountClassId)};
 const wallet={_accountManager:{getInstance:()=>account},pxe:{proveTxWithPublicValidation:()=>assert.fail('Quote must not prove')}};
 const application=new ExecutionPayload([FunctionCall.from({name:'set_like',to:boardAddress,selector:FunctionSelector.fromString(profile.selector),type:'private',hideMsgSender:false,isStatic:false,args:[new Fr(42),Fr.ONE]})],[],[],[]);
 const prepared={gasSettings,networkGasLimits:{daGas:117624,l2Gas:6540000},metadata:{classId:profile.privateFeeClassId},paymentMethod:new PrivateFeePaymentMethod(feeAddress,1n),availableCredit:available};
 const input={wallet,prepared,qualifiedLike:board,from,interaction:{request:async()=>application},deferSimulation:true,node:new Proxy({},{get(){assert.fail('Arithmetic quote must not read the node');}}),simulator:new Proxy({},{get(){assert.fail('Arithmetic quote must not simulate');}})};
 return {input,prepared,application,board,account,wallet};
}
test('all pinned class IDs come from actual artifacts and the qualified refund profile',async()=>{
 for(const [file,key]of [['billboard/target/rolling_contract-RollingBoard.json','boardClassId'],['node_modules/@aztec-labs/accounts/artifacts/SchnorrInitializerlessAccount.json','accountClassId'],['apps/src/billboard/private_fee_artifact.json','privateFeeClassId']]){
  const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(key==='boardClassId'&&process.env.ROLLING_TEST_ARTIFACT?process.env.ROLLING_TEST_ARTIFACT:new URL('../'+file,import.meta.url))));
  assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),profile[key]);
  if(key==='accountClassId')assert(!artifact.functions.some(fn=>fn.isInitializer));
  if(key==='boardClassId'){const fn=artifact.functions.find(fn=>fn.name==='set_like');assert.equal((await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters)).toString(),profile.selector);}
 }
 assert.equal(profile.privateFeeClassId,PRIVATE_FEE_REFUND_PROFILE.classId);assert.equal(profile.teardownGas.daGas,PRIVATE_FEE_REFUND_PROFILE.daGas);assert.equal(profile.teardownGas.l2Gas,PRIVATE_FEE_REFUND_PROFILE.l2Gas);
});
test('qualified like credit below global ceiling quotes in under one second without any node, simulation or proof call',async()=>{
 const f=fixture(),start=performance.now(),result=await estimatePrivateFeeTransaction(f.input),duration=performance.now()-start;
 assert(duration<1000);assert(result.maximumFee<f.prepared.availableCredit);assert(f.prepared.availableCredit<f.prepared.gasSettings.getFeeLimit().toBigInt());
 assert.equal(result.passes,0);assert.equal(result.atomicSimulation,true);assert.equal(result.simulationValidation,undefined);
 assert.equal(result.reservation,result.maximumFee);assert.equal(result.payload.calls.length,2);assert.equal(result.payload.calls[0].name,'pay_fee');assert.equal(result.payload.calls[1],f.application.calls[0]);
 assert.deepEqual(result.gasSettings.gasLimits,new Gas(37568,2850425));assert.equal(likeFeeLimit(f.prepared.gasSettings),result.maximumFee);
});
test('qualified public reservation is identical across sufficient balances',async()=>{
 const a=fixture(),b=fixture(100000000000000000000n),x=await estimatePrivateFeeTransaction(a.input),y=await estimatePrivateFeeTransaction(b.input);
 assert.equal(x.reservation,y.reservation);assert.deepEqual(x.gasSettings,y.gasSettings);
});
for(const change of ['board-original-class','account-original-class','post-zero','active-invalid','extra-argument','board-class','account-class','fee-class','account','board','selector','name','extra-call','auth-witness','capsule','extra-args','fee-payer','mint','public','static','hidden','network-cap','configured-cap','teardown-cap','unpatched'])test('qualified like fixed quote rejects '+change+' without simulation or fallback',async()=>{
 const f=fixture();
 if(change==='board-original-class')f.board.originalContractClassId=new Fr(1);
 if(change==='account-original-class')f.account.originalContractClassId=new Fr(1);
 if(change==='post-zero')f.application.calls[0].args[0]=Fr.ZERO;
 if(change==='active-invalid')f.application.calls[0].args[1]=new Fr(2);
 if(change==='extra-argument')f.application.calls[0].args.push(Fr.ZERO);
 if(change==='board-class')f.board.currentContractClassId=new Fr(1);
 if(change==='account-class')f.account.currentContractClassId=new Fr(1);
 if(change==='fee-class')f.prepared.metadata.classId=new Fr(1).toString();
 if(change==='account')f.input.from=address(9);
 if(change==='board')f.application.calls[0].to=address(9);
 if(change==='selector')f.application.calls[0].selector=FunctionSelector.fromString('0x00000001');
 if(change==='name')f.application.calls[0].name='post_with_bok';
 if(change==='extra-call')f.application.calls.push(f.application.calls[0]);
 if(change==='auth-witness')f.application.authWitnesses.push({});
 if(change==='capsule')f.application.capsules.push({});
 if(change==='extra-args')f.application.extraHashedArgs.push({});
 if(change==='fee-payer')f.application.feePayer=feeAddress;
 if(change==='mint')f.prepared.paymentMethod=new PrivateMintAndPayFeePaymentMethod(feeAddress,{amount:1n,salt:new Fr(1),secret:new Fr(2),leafIndex:new Fr(3)},1n);
 if(change==='public')f.application.calls[0].type='public';
 if(change==='static')f.application.calls[0].isStatic=true;
 if(change==='hidden')f.application.calls[0].hideMsgSender=true;
 if(change==='network-cap')f.prepared.networkGasLimits.l2Gas=2850424;
 if(change==='configured-cap')f.prepared.gasSettings.gasLimits.l2Gas=2850424;
 if(change==='teardown-cap')f.prepared.gasSettings.teardownGasLimits.l2Gas=27509;
 if(change==='unpatched')delete f.wallet.pxe.proveTxWithPublicValidation;
 await assert.rejects(estimatePrivateFeeTransaction(f.input),{code:'BB_LIKE_FEE_PROFILE_MISMATCH'});
});
test('native synthetic kernel meters maximum private effects within the arithmetic bound',async()=>{
 const f=fixture(),budget=likeFeeBudget({wallet:f.wallet,prepared:f.prepared,board:f.board});
 const calls=Array.from({length:4},(_,j)=>{
  const publicInputs=PrivateCircuitPublicInputs.empty();publicInputs.callContext.contractAddress=boardAddress;publicInputs.txContext.gasSettings=budget.gasSettings;
  if(j===0){publicInputs.noteHashes.array[0]=new NoteHash(new Fr(10),10);publicInputs.noteHashes.claimedLength=1;}
  const count=j===3?15:16;publicInputs.nullifiers.claimedLength=count;
  for(let i=0;i<count;i++)publicInputs.nullifiers.array[i]=new Nullifier(new Fr(100+j*16+i),Fr.ZERO,100+j*16+i);
  for(let i=0;i<16;i++){const log=PrivateLog.empty();log.fields=log.fields.map((_,k)=>new Fr(1000+j*256+i*16+k));log.emittedLength=16;publicInputs.privateLogs.array[i]=new PrivateLogData(log,0,1000+j*16+i);}
  publicInputs.privateLogs.claimedLength=16;
  return {publicInputs,contractClassLogs:[],nestedExecutionResults:[],noteHashNullifierCounterMap:new Map(),partialWitness:new Map(),acir:Buffer.alloc(0),vk:Buffer.alloc(0)};
 });
 const entrypoint=calls[0];entrypoint.nestedExecutionResults=calls.slice(1);
 entrypoint.publicInputs.publicCallRequests.array[0]=new CountedPublicCallRequest(new PublicCallRequest(from,boardAddress,false,new Fr(7)),2000);entrypoint.publicInputs.publicCallRequests.claimedLength=1;
 entrypoint.publicInputs.publicTeardownCallRequest=new PublicCallRequest(from,feeAddress,false,new Fr(8));
 const execution={entrypoint,firstNullifier:new Fr(1),publicFunctionCalldata:[new HashedValues([new Fr(9)],new Fr(7)),new HashedValues([new Fr(10)],new Fr(8))]};
 const result=await generateSimulatedProvingResult(execution,async()=> 'qualified profile',new Proxy({},{get(){assert.fail('No read witnesses in metering fixture');}}));
 assert.deepEqual(result.publicInputs.gasUsed.add(Gas.from(profile.publicGas)),budget.gasSettings.gasLimits);
});

for(const [da,l2]of [[0n,11n],[7n,0n],[7n,11n]])test(`qualified like maximum uses current supplied DA/L2 price caps without adding priority fees twice (${da}/${l2})`,async()=>{
 const f=fixture(),prices=new GasFees(da,l2),priority=new GasFees(da?da-1n:0n,l2?l2-1n:0n);
 f.prepared.gasSettings.maxFeesPerGas=prices;f.prepared.gasSettings.maxPriorityFeesPerGas=priority;
 const expected=37568n*da+2850425n*l2;
 const priced=await estimatePrivateFeeTransaction(f.input);
 assert.equal(priced.maximumFee,expected);assert.equal(priced.reservation,expected);
 assert.equal(likeFeeLimit(f.prepared.gasSettings),expected);
 assert(priced.gasSettings.maxFeesPerGas.equals(prices));assert(priced.gasSettings.maxPriorityFeesPerGas.equals(priority));
 f.prepared.gasSettings.maxPriorityFeesPerGas=GasFees.empty();
 const noPriority=await estimatePrivateFeeTransaction(f.input);assert.equal(noPriority.reservation,expected);
 f.prepared.gasSettings.maxFeesPerGas=new GasFees(da+1n,l2+1n);
 const changed=await estimatePrivateFeeTransaction(f.input);
 assert.equal(changed.reservation,expected+37568n+2850425n);
 assert.deepEqual(changed.gasSettings.gasLimits,priced.gasSettings.gasLimits);
});
test('qualified like native-credit mode carries no balance and cannot enter a generic estimate',async()=>{
 const f=fixture(0n);delete f.prepared.availableCredit;f.prepared.creditCheck='qualified-like-proof';
 f.prepared.withAvailableCredit=async()=>({...f.prepared,creditCheck:'read-balance',availableCredit:11000000000000000000n});
 const result=await estimatePrivateFeeTransaction(f.input);assert.equal(result.atomicSimulation,true);assert.equal(result.passes,0);
 await assert.rejects(estimatePrivateFeeTransaction({...f.input,qualifiedLike:undefined}),{code:'BB_LIKE_FEE_PROFILE_MISMATCH'});
 f.prepared.availableCredit=999999n;await assert.rejects(estimatePrivateFeeTransaction(f.input),{code:'BB_LIKE_FEE_PROFILE_MISMATCH'});
});

for(const metadata of [false,true])test(`like below conservative bound uses measured affordable payload before proof, metadata=${metadata}`,async()=>{
 const f=fixture(4500000000000000000n),available=f.prepared.availableCredit,bound=likeFeeBudget({wallet:f.wallet,prepared:f.prepared,board:f.board});
 assert(available<bound.reservation);let requests=0,balances=0,privateCalls=0,publicCalls=0;
 f.prepared.refundGasLimits=Gas.from(profile.teardownGas);
 if(metadata){delete f.prepared.availableCredit;f.prepared.creditCheck='qualified-like-proof';f.prepared.withAvailableCredit=async()=>{balances++;return {...f.prepared,creditCheck:'read-balance',availableCredit:available};};}
 f.input.interaction.request=async()=>{requests++;return f.application;};
 f.input.simulator={detachedMeasurement:true,validateMeasurement:async()=>{},
  private:async(payload)=>{privateCalls++;assert.equal(payload.calls[1],f.application.calls[0]);return {gasUsed:{totalGas:new Gas(1200,700000)}};},
  public:async(payload,_from,_gas,strict)=>{publicCalls++;assert.equal(strict,false);assert.equal(payload.calls[1],f.application.calls[0]);return {publicInputs:{},gasUsed:{totalGas:new Gas(3000,1200000),teardownGas:Gas.from(profile.teardownGas)}};}};
 const result=await estimatePrivateFeeTransaction(f.input);
 assert(result.maximumFee<=available);assert(result.reservation<=available);assert(result.maximumFee<bound.maximumFee);assert(result.reservation!==available);
 assert.equal(result.atomicSimulation,true);assert.equal(result.simulationValidation,undefined);assert.equal(requests,1);assert.equal(balances,Number(metadata));assert.equal(privateCalls,2);assert.equal(publicCalls,0);
 assert.equal(result.payload.calls[0].args[0].toBigInt(),result.reservation);assert.equal(result.payload.calls[1],f.application.calls[0]);
});
test('like credit enrichment failure or zero credit never starts simulation/proof',async()=>{
 for(const zero of [false,true]){
  const f=fixture();delete f.prepared.availableCredit;f.prepared.creditCheck='qualified-like-proof';
  const failure=Error('credit read failed');f.prepared.withAvailableCredit=async()=>{if(!zero)throw failure;return {...f.prepared,creditCheck:'read-balance',availableCredit:0n};};
  await assert.rejects(estimatePrivateFeeTransaction(f.input),zero?{code:'PRIVATE_FEE_BALANCE_INSUFFICIENT'}:e=>e===failure);
 }
});

for(const failure of [false,true])test(`low-credit like below branch maximum reuses exact candidate for affordable native measurement; revert=${failure}`,async()=>{
 const f=fixture(850000n);f.prepared.gasSettings.maxFeesPerGas=new GasFees(0n,1n);f.prepared.refundGasLimits=Gas.from(profile.teardownGas);
 const measured=new Map(),requests=[];let count=0;const rejected=Error('native like rejected');
 f.input.simulator={detachedMeasurement:true,validateMeasurement:async()=>assert.fail('Unaffordable bound must use actual public branch'),
  private:async(payload)=>{count++;const result={gasUsed:{totalGas:new Gas(1200,800000)}};measured.set(payload,result);return result;},
  public:async(payload,_from,_gas,strict,prior)=>{assert.equal(strict,false);assert.equal(prior,measured.get(payload));requests.push(payload);
   return {publicInputs:{forPublic:{}},publicOutput:{txEffect:{revertCode:failure?RevertCode.REVERTED:RevertCode.OK},...(failure?{revertReason:rejected}:{})},gasUsed:{totalGas:new Gas(1500,830000),teardownGas:Gas.from(profile.teardownGas)}};}};
 if(failure){await assert.rejects(estimatePrivateFeeTransaction(f.input),error=>error===rejected);assert.equal(requests.length,1);}
 else {const result=await estimatePrivateFeeTransaction(f.input);assert(result.maximumFee<=850000n);assert.equal(result.maximumFee,830000n);assert.equal(result.reservation,830000n);assert.equal(result.payload,requests.at(-1));assert.equal(requests.length,2);assert.equal(count,3);}
});
for(const change of ['anchor','owner','profile','payload'])test('qualified low-credit arithmetic still validates measurement and ownership: '+change,async()=>{
 const f=fixture(4500000000000000000n);f.prepared.refundGasLimits=Gas.from(profile.teardownGas);const rejected=Object.assign(Error('changed'),{code:'BB_SIMULATION_CHANGED'});
 f.input.simulator={detachedMeasurement:true,private:async()=>({gasUsed:{totalGas:new Gas(1200,700000)}}),public:()=>assert.fail('No public probe'),validateMeasurement:async()=>{
  if(change==='anchor')throw rejected;if(change==='owner')f.account.address=address(99);if(change==='profile')f.board.currentContractClassId=Fr.ONE;if(change==='payload')f.application.calls[0].args[1]=new Fr(9);
 }};
 // The guard belongs to the captured operation, independent of mutable input options.

 await assert.rejects(estimatePrivateFeeTransaction(f.input),change!=='anchor'?{code:'BB_LIKE_FEE_PROFILE_MISMATCH'}:error=>error===rejected);
});

for(const failure of [null,'BB_SIMULATION_FAILED','TX_INVALID'])test('qualified low-credit handoff retains actual wallet final public validation: '+(failure??'success'),async()=>{
 const f=fixture(4500000000000000000n),calls=[],tx={getTxHash:()=>new Fr(77)};f.prepared.refundGasLimits=Gas.from(profile.teardownGas);
 class WalletBoundary {constructor(pxe){this.pxe=pxe;}completeFeeOptions(opts){return {gasSettings:opts.gasSettings};}createTxExecutionRequestFromPayloadAndFee(payload,from,fee){return {payload,from,gasSettings:fee.gasSettings};}scopesFrom(from){return [from];}senderForTagsFrom(from){return from;}simulateViaEntrypoint(){assert.fail('No duplicate final simulation');}}
 const ctx=vm.createContext({performance,console,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(new URL('../apps/src/billboard/user/engine.js',import.meta.url),'utf8'),ctx);
 const sdk={BaseWallet:WalletBoundary,GasSettings,submitOnceWithReconciliation:async()=>calls.push('send'),waitForSuccessfulReceipt:async()=>({status:'checkpointed',transactionFee:1n})};
 const pxe={proveTx:()=>assert.fail('Unvalidated proof forbidden'),proveTxWithPublicValidation:async(request)=>{calls.push('validate');assert(request.payload.calls[0].args[0].toBigInt()>=request.gasSettings.getFeeLimit().toBigInt());if(failure)throw Object.assign(Error(failure),{code:failure});calls.push('prove');return {toTx:async()=>tx};}};
 const wallet=ctx.BillboardPrivateFeeRouting.createAztecWallet(sdk,pxe,{},{},()=>{},Fr.ONE);wallet._accountManager=f.wallet._accountManager;f.input.wallet=wallet;
 f.input.simulator={detachedMeasurement:true,private:async()=>({gasUsed:{totalGas:new Gas(1200,700000)}}),validateMeasurement:async()=>{},public:()=>assert.fail('No public measurement probe')};
 if(failure){await assert.rejects(sendPrivateFeeTransaction(f.input),{code:failure});assert.deepEqual(calls,['validate']);}
 else {await sendPrivateFeeTransaction(f.input);assert.deepEqual(calls,['validate','prove','send']);}
});

test('affordable like maximum cannot grow reservation across a fee-note cliff instead of measuring its cheap branch',async()=>{
 const f=fixture(1700000n);f.prepared.gasSettings.maxFeesPerGas=new GasFees(0n,1n);f.prepared.refundGasLimits=Gas.from(profile.teardownGas);const privateCalls=[],publicCalls=[];
 f.input.simulator={detachedMeasurement:true,validateMeasurement:async()=>assert.fail('Current candidate does not cover conservative maximum'),private:async payload=>{
  const reservation=payload.calls[0].args[0].toBigInt(),gas=reservation===1n?300000:reservation<=600001n?500000:900000;
  const result={gasUsed:{totalGas:new Gas(1200,gas)}};privateCalls.push({payload,result});return result;
 },public:async(payload,_from,_settings,strict,prior)=>{assert.equal(strict,false);assert.equal(prior,privateCalls.at(-1).result);assert.equal(payload,privateCalls.at(-1).payload);publicCalls.push(payload);return {publicInputs:{},gasUsed:{totalGas:new Gas(1500,527510),teardownGas:Gas.from(profile.teardownGas)}};}};
 const result=await estimatePrivateFeeTransaction(f.input);assert.equal(result.reservation,600001n);assert.equal(privateCalls.length,2);assert.equal(publicCalls.length,1);assert.equal(result.payload,publicCalls[0]);
});

test('qualified low-credit return rechecks operation ownership after a held native anchor read',async()=>{
 const f=fixture(4500000000000000000n);f.prepared.refundGasLimits=Gas.from(profile.teardownGas);const entered=Promise.withResolvers(),release=Promise.withResolvers(),failure=Object.assign(Error('operation replaced'),{code:'ROLLING_CONTEXT_CHANGED'});let owned=true,settled=false;
 f.input.guard=()=>{if(!owned)throw failure;};
 f.wallet.pxe.getSyncedBlockHeader=async()=>{entered.resolve();await release.promise;return {hash:async()=>Fr.ONE};};
 f.input.simulator={detachedMeasurement:true,private:async()=>({gasUsed:{totalGas:new Gas(1200,700000)}}),public:()=>assert.fail('No public measurement'),validateMeasurement:async()=>{await (await f.wallet.pxe.getSyncedBlockHeader()).hash();}};
 const pending=estimatePrivateFeeTransaction(f.input).finally(()=>{settled=true;});await entered.promise;owned=false;assert.equal(settled,false);release.resolve();await assert.rejects(pending,error=>error===failure);
});
