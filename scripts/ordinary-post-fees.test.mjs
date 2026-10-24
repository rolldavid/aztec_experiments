import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
import {estimatePrivateFeeTransaction} from '../shared/private-fee-estimation.mjs';
import {ORDINARY_POST_GAS_PROFILE as profile,ordinaryPostFeeBudget,ordinaryPostFeeLimit} from '../shared/ordinary-post-fees.mjs';
after(()=>BarretenbergSync.destroySingleton());
const address=n=>AztecAddress.fromFieldUnsafe(new Fr(n)),from=address(3),boardAddress=address(4),feeAddress=address(5);
function fixture(available=11000000000000000000n){
 const prices=new GasFees(0n,2129014393943n),gasSettings=new GasSettings(new Gas(117624,6540000),new Gas(58812,817500),prices,GasFees.empty());
 const board={address:boardAddress,currentContractClassId:Fr.fromString(profile.boardClassId),originalContractClassId:Fr.fromString(profile.boardClassId)};
 const account={address:from,currentContractClassId:Fr.fromString(profile.accountClassId),originalContractClassId:Fr.fromString(profile.accountClassId)};
 const wallet={_accountManager:{getInstance:()=>account},pxe:{proveTxWithPublicValidation:()=>assert.fail('Quote must not prove')}};
 const application=new ExecutionPayload([FunctionCall.from({name:'post',to:boardAddress,selector:FunctionSelector.fromString(profile.postSelector),type:'private',hideMsgSender:false,isStatic:false,args:[]})],[],[],[]);
 const prepared={gasSettings,networkGasLimits:{daGas:117624,l2Gas:6540000},metadata:{classId:profile.privateFeeClassId},paymentMethod:new PrivateFeePaymentMethod(feeAddress,1n),availableCredit:available};
 const input={wallet,prepared,ordinaryPost:board,from,interaction:{request:async()=>application},deferSimulation:true,node:new Proxy({},{get(){assert.fail('Arithmetic quote must not read the node');}}),simulator:new Proxy({},{get(){assert.fail('Arithmetic quote must not simulate');}})};
 return {input,prepared,application,board,account,wallet};
}
test('all pinned class IDs come from actual artifacts and the qualified refund profile',async()=>{
 for(const [file,key]of [['billboard/target/rolling_contract-RollingBoard.json','boardClassId'],['node_modules/@aztec-labs/accounts/artifacts/SchnorrInitializerlessAccount.json','accountClassId'],['apps/src/billboard/private_fee_artifact.json','privateFeeClassId']]){
  const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url))));
  assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),profile[key]);
  if(key==='accountClassId')assert(!artifact.functions.some(fn=>fn.isInitializer));
  if(key==='boardClassId'){const fn=artifact.functions.find(fn=>fn.name==='post');assert.equal((await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters)).toString(),profile.postSelector);}
 }
 assert.equal(profile.privateFeeClassId,PRIVATE_FEE_REFUND_PROFILE.classId);assert.equal(profile.teardownGas.daGas,PRIVATE_FEE_REFUND_PROFILE.daGas);assert.equal(profile.teardownGas.l2Gas,PRIVATE_FEE_REFUND_PROFILE.l2Gas);
});
test('ordinary credit below global ceiling quotes in under one second without any node, simulation or proof call',async()=>{
 const f=fixture(),start=performance.now(),result=await estimatePrivateFeeTransaction(f.input),duration=performance.now()-start;
 assert(duration<1000);assert(result.maximumFee<f.prepared.availableCredit);assert(f.prepared.availableCredit<f.prepared.gasSettings.getFeeLimit().toBigInt());
 assert.equal(result.passes,0);assert.equal(result.atomicSimulation,true);assert.equal(result.simulationValidation,undefined);
 assert.equal(result.reservation,result.maximumFee);assert.equal(result.payload.calls.length,2);assert.equal(result.payload.calls[0].name,'pay_fee');assert.equal(result.payload.calls[1],f.application.calls[0]);
 assert.deepEqual(result.gasSettings.gasLimits,new Gas(39648,4815810));assert.equal(ordinaryPostFeeLimit(f.prepared.gasSettings),result.maximumFee);
});
test('public reservation is identical across balances and low credit stops before requesting payload',async()=>{
 const a=fixture(),b=fixture(100000000000000000000n),x=await estimatePrivateFeeTransaction(a.input),y=await estimatePrivateFeeTransaction(b.input);
 assert.equal(x.reservation,y.reservation);assert.deepEqual(x.gasSettings,y.gasSettings);
 const low=fixture(x.maximumFee-1n);low.input.interaction.request=()=>assert.fail('No payload or transaction work with insufficient declared maximum');
 await assert.rejects(estimatePrivateFeeTransaction(low.input),{code:'BB_POST_FEE_CREDIT_REQUIRED'});
});
for(const change of ['board-class','account-class','fee-class','account','board','selector','name','extra-call','auth-witness','capsule','extra-args','fee-payer','mint','public','static','hidden','network-cap','configured-cap','teardown-cap','unpatched'])test('ordinary fixed quote rejects '+change+' without simulation or fallback',async()=>{
 const f=fixture();
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
 if(change==='network-cap')f.prepared.networkGasLimits.l2Gas=4815809;
 if(change==='configured-cap')f.prepared.gasSettings.gasLimits.l2Gas=4815809;
 if(change==='teardown-cap')f.prepared.gasSettings.teardownGasLimits.l2Gas=27509;
 if(change==='unpatched')delete f.wallet.pxe.proveTxWithPublicValidation;
 await assert.rejects(estimatePrivateFeeTransaction(f.input),{code:'BB_POST_FEE_PROFILE_MISMATCH'});
});
test('native synthetic kernel meters maximum private effects within the arithmetic bound',async()=>{
 const f=fixture(),budget=ordinaryPostFeeBudget({wallet:f.wallet,prepared:f.prepared,board:f.board});
 const calls=Array.from({length:4},(_,j)=>{
  const publicInputs=PrivateCircuitPublicInputs.empty();publicInputs.callContext.contractAddress=boardAddress;publicInputs.txContext.gasSettings=budget.gasSettings;
  publicInputs.noteHashes.array[0]=new NoteHash(new Fr(10+j),10+j);publicInputs.noteHashes.claimedLength=1;
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

for(const [da,l2]of [[0n,11n],[7n,0n],[7n,11n]])test(`ordinary maximum uses current supplied DA/L2 price caps without adding priority fees twice (${da}/${l2})`,async()=>{
 const f=fixture(),prices=new GasFees(da,l2),priority=new GasFees(da?da-1n:0n,l2?l2-1n:0n);
 f.prepared.gasSettings.maxFeesPerGas=prices;f.prepared.gasSettings.maxPriorityFeesPerGas=priority;
 const expected=39648n*da+4815810n*l2;
 const priced=await estimatePrivateFeeTransaction(f.input);
 assert.equal(priced.maximumFee,expected);assert.equal(priced.reservation,expected);
 assert.equal(ordinaryPostFeeLimit(f.prepared.gasSettings),expected);
 assert(priced.gasSettings.maxFeesPerGas.equals(prices));assert(priced.gasSettings.maxPriorityFeesPerGas.equals(priority));
 f.prepared.gasSettings.maxPriorityFeesPerGas=GasFees.empty();
 const noPriority=await estimatePrivateFeeTransaction(f.input);assert.equal(noPriority.reservation,expected);
 f.prepared.gasSettings.maxFeesPerGas=new GasFees(da+1n,l2+1n);
 const changed=await estimatePrivateFeeTransaction(f.input);
 assert.equal(changed.reservation,expected+39648n+4815810n);
 assert.deepEqual(changed.gasSettings.gasLimits,priced.gasSettings.gasLimits);
});
test('ordinary native-credit mode carries no balance and cannot enter a generic estimate',async()=>{
 const f=fixture(0n);delete f.prepared.availableCredit;f.prepared.creditCheck='ordinary-post-proof';
 const result=await estimatePrivateFeeTransaction(f.input);assert.equal(result.atomicSimulation,true);assert.equal(result.passes,0);
 await assert.rejects(estimatePrivateFeeTransaction({...f.input,ordinaryPost:undefined}),{code:'BB_POST_FEE_PROFILE_MISMATCH'});
 f.prepared.availableCredit=999999n;await assert.rejects(estimatePrivateFeeTransaction(f.input),{code:'BB_POST_FEE_PROFILE_MISMATCH'});
});
