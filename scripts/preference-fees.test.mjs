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
import {PREFERENCE_GAS_PROFILE as profile,preferenceFeeBudget,preferenceFeeLimit} from '../shared/preference-fees.mjs';
after(()=>BarretenbergSync.destroySingleton());
const address=n=>AztecAddress.fromFieldUnsafe(new Fr(n)),from=address(3),boardAddress=address(4),feeAddress=address(5);
function fixture(method='set_preference',revision=0n,available=11000000000000000000n){
 const prices=new GasFees(0n,2129014393943n),gasSettings=new GasSettings(new Gas(117624,6540000),new Gas(58812,817500),prices,GasFees.empty());
 const board={address:boardAddress,currentContractClassId:Fr.fromString(profile.boardClassId),originalContractClassId:Fr.fromString(profile.boardClassId)};
 const account={address:from,currentContractClassId:Fr.fromString(profile.accountClassId),originalContractClassId:Fr.fromString(profile.accountClassId)};
 const wallet={_accountManager:{getInstance:()=>account},pxe:{proveTxWithPublicValidation:()=>assert.fail('Quote must not prove')}};
 const application=new ExecutionPayload([FunctionCall.from({name:method,to:boardAddress,selector:FunctionSelector.fromString(profile.selectors[method]),type:'private',hideMsgSender:false,isStatic:false,args:method==='set_preference'?[new Fr(revision),Fr.ONE,new Fr(42),Fr.ONE]:[new Fr(revision),new Fr(42),new Fr(1)]})],[],[],[]);
 const prepared={gasSettings,networkGasLimits:{daGas:117624,l2Gas:6540000},metadata:{classId:profile.privateFeeClassId},paymentMethod:new PrivateFeePaymentMethod(feeAddress,1n),availableCredit:available};
 const input={wallet,prepared,qualifiedPreference:board,from,interaction:{request:async()=>application},deferSimulation:true,node:new Proxy({},{get(){assert.fail('Arithmetic quote must not read the node');}}),simulator:new Proxy({},{get(){assert.fail('Arithmetic quote must not simulate');}})};
 return {input,prepared,application,board,account,wallet};
}

test('actual deployed artifacts pin all classes and both preference ABI selectors',async()=>{
 for(const[file,key]of [['billboard/target/rolling_contract-RollingBoard.json','boardClassId'],['node_modules/@aztec-labs/accounts/artifacts/SchnorrInitializerlessAccount.json','accountClassId'],['apps/src/billboard/private_fee_artifact.json','privateFeeClassId']]){
  const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(key==='boardClassId'&&process.env.ROLLING_TEST_ARTIFACT?process.env.ROLLING_TEST_ARTIFACT:new URL('../'+file,import.meta.url))));
  assert.equal((await getContractClassFromArtifact(artifact)).id.toString(),profile[key]);
  if(key==='accountClassId')assert(!artifact.functions.some(fn=>fn.isInitializer));
  if(key==='boardClassId')for(const[name,selector]of Object.entries(profile.selectors)){const fn=artifact.functions.find(fn=>fn.name===name);assert.equal(fn.functionType,'private');assert.equal((await FunctionSelector.fromNameAndParameters(fn.name,fn.parameters)).toString(),selector);}
 }
 assert.equal(profile.privateFeeClassId,PRIVATE_FEE_REFUND_PROFILE.classId);assert.deepEqual(profile.teardownGas,{daGas:PRIVATE_FEE_REFUND_PROFILE.daGas,l2Gas:PRIVATE_FEE_REFUND_PROFILE.l2Gas});
});
for(const method of ['set_preference','mark_thread_read'])for(const revision of [0n,7n])test(`qualified ${method} revision${revision} retains single exact payload and no preliminary simulation`,async()=>{
 const f=fixture(method,revision),result=await estimatePrivateFeeTransaction(f.input);
 assert.equal(result.passes,0);assert.equal(result.atomicSimulation,true);assert.equal(result.simulationValidation,undefined);assert.deepEqual(result.gasSettings.gasLimits,new Gas(37216,2757260));assert.equal(result.maximumFee,preferenceFeeLimit(f.prepared.gasSettings));
 assert.equal(result.payload.calls.length,2);assert.equal(result.payload.calls[0].name,'pay_fee');assert.equal(result.payload.calls[1],f.application.calls[0]);
});
for(const kind of [1n,2n,3n,4n,5n])for(const enabled of [0n,1n])test(`qualified preference validates native toggle kind${kind} value${enabled}`,async()=>{
 const f=fixture();f.application.calls[0].args=[Fr.ZERO,new Fr(kind),new Fr(kind===2n||kind===5n?0:42),new Fr(enabled)];assert.equal((await estimatePrivateFeeTransaction(f.input)).passes,0);
});
for(const change of ['board-original','account-original','board-class','account-class','fee-class','from','board','selector','name','extra-call','auth','capsule','hashed','payer','mint','public','static','hidden','network-cap','configured-cap','teardown-cap','unpatched','revision','kind','target','enabled','extra-argument','read-thread','read-height','mixed-profile'])test('qualified preferences reject '+change+' before native balance or simulation',async()=>{
 const f=fixture(change.startsWith('read-')?'mark_thread_read':'set_preference'),call=f.application.calls[0];
 if(change==='board-original')f.board.originalContractClassId=Fr.ONE;if(change==='account-original')f.account.originalContractClassId=Fr.ONE;
 if(change==='board-class')f.board.currentContractClassId=Fr.ONE;if(change==='account-class')f.account.currentContractClassId=Fr.ONE;if(change==='fee-class')f.prepared.metadata.classId=Fr.ONE.toString();
 if(change==='from')f.input.from=address(9);if(change==='board')call.to=address(9);if(change==='selector')call.selector=FunctionSelector.fromString('0x00000001');if(change==='name')call.name='set_like';
 if(change==='extra-call')f.application.calls.push(call);if(change==='auth')f.application.authWitnesses.push({});if(change==='capsule')f.application.capsules.push({});if(change==='hashed')f.application.extraHashedArgs.push({});if(change==='payer')f.application.feePayer=feeAddress;
 if(change==='mint')f.prepared.paymentMethod=new PrivateMintAndPayFeePaymentMethod(feeAddress,{amount:1n,salt:Fr.ONE,secret:new Fr(2),leafIndex:new Fr(3)},1n);
 if(change==='public')call.type='public';if(change==='static')call.isStatic=true;if(change==='hidden')call.hideMsgSender=true;
 if(change==='network-cap')f.prepared.networkGasLimits.l2Gas=2757259;if(change==='configured-cap')f.prepared.gasSettings.gasLimits.l2Gas=2757259;if(change==='teardown-cap')f.prepared.gasSettings.teardownGasLimits.l2Gas=27509;if(change==='unpatched')delete f.wallet.pxe.proveTxWithPublicValidation;
 if(change==='revision')call.args[0]=new Fr(1n<<64n);if(change==='kind')call.args[1]=new Fr(6);if(change==='target')call.args[2]=Fr.ZERO;if(change==='enabled')call.args[3]=new Fr(2);if(change==='extra-argument')call.args.push(Fr.ZERO);
 if(change==='read-thread')call.args[1]=Fr.ZERO;if(change==='read-height')call.args[2]=new Fr(1n<<32n);if(change==='mixed-profile')f.input.qualifiedLike=f.board;
 await assert.rejects(estimatePrivateFeeTransaction(f.input),{code:change==='mixed-profile'?'BB_LIKE_FEE_PROFILE_MISMATCH':'BB_PREFERENCE_FEE_PROFILE_MISMATCH'});
});
for(const head of ['new','replacement','protocol-maximum'])test(`native synthetic kernel bounds ${head} preference head effects`,async()=>{
 const f=fixture(),budget=preferenceFeeBudget({wallet:f.wallet,prepared:f.prepared,board:f.board});
 const calls=Array.from({length:4},(_,j)=>{
  const publicInputs=PrivateCircuitPublicInputs.empty();publicInputs.callContext.contractAddress=boardAddress;publicInputs.txContext.gasSettings=budget.gasSettings;
  if(j===0){for(let i=0;i<2;i++)publicInputs.noteHashes.array[i]=new NoteHash(new Fr(10+i),10+i);publicInputs.noteHashes.claimedLength=2;}
  const count=head==='protocol-maximum'?(j===3?15:16):(j===0?(head==='new'?1:2):0);publicInputs.nullifiers.claimedLength=count;
  for(let i=0;i<count;i++)publicInputs.nullifiers.array[i]=new Nullifier(new Fr(100+j*16+i),Fr.ZERO,100+j*16+i);
  for(let i=0;i<16;i++){const log=PrivateLog.empty();log.fields=log.fields.map((_,k)=>new Fr(1000+j*256+i*16+k));log.emittedLength=16;publicInputs.privateLogs.array[i]=new PrivateLogData(log,0,1000+j*16+i);}
  publicInputs.privateLogs.claimedLength=16;
  return {publicInputs,contractClassLogs:[],nestedExecutionResults:[],noteHashNullifierCounterMap:new Map(),partialWitness:new Map(),acir:Buffer.alloc(0),vk:Buffer.alloc(0)};
 });
 const entrypoint=calls[0];entrypoint.nestedExecutionResults=calls.slice(1);
 entrypoint.publicInputs.publicTeardownCallRequest=new PublicCallRequest(from,feeAddress,false,new Fr(8));
 const execution={entrypoint,firstNullifier:new Fr(1),publicFunctionCalldata:[new HashedValues([new Fr(10)],new Fr(8))]};
 const result=await generateSimulatedProvingResult(execution,async()=> 'qualified profile',new Proxy({},{get(){assert.fail('No read witnesses in metering fixture');}}));
 for(const key of ['daGas','l2Gas'])assert(result.publicInputs.gasUsed[key]<=budget.gasSettings.gasLimits[key]);
 if(head==='protocol-maximum')assert.deepEqual(result.publicInputs.gasUsed,budget.gasSettings.gasLimits);
});


for(const method of ['set_preference','mark_thread_read'])test(`low-credit ${method} retains measured affordable route without requesting payload twice`,async()=>{
 const f=fixture(method,7n,4500000000000000000n),available=f.prepared.availableCredit,bound=preferenceFeeBudget({wallet:f.wallet,prepared:f.prepared,board:f.board});assert(available<bound.reservation);
 f.prepared.refundGasLimits=Gas.from(profile.teardownGas);delete f.prepared.availableCredit;f.prepared.creditCheck='qualified-preference-proof';let reads=0,requests=0,measurements=0;
 f.prepared.withAvailableCredit=async()=>{reads++;return {...f.prepared,creditCheck:'read-balance',availableCredit:available};};f.input.interaction.request=async()=>{requests++;return f.application;};
 f.input.simulator={detachedMeasurement:true,private:async()=>({gasUsed:{totalGas:new Gas(1200,700000)}}),public:async(payload,_from,_gas,strict)=>{measurements++;assert.equal(strict,false);assert.equal(payload.calls[1],f.application.calls[0]);return {publicInputs:{},gasUsed:{totalGas:new Gas(3000,1200000),teardownGas:Gas.from(profile.teardownGas)}};}};
 const result=await estimatePrivateFeeTransaction(f.input);assert(result.maximumFee<=available);assert(result.reservation<=available);assert(result.maximumFee<bound.maximumFee);assert(result.reservation!==available);assert.equal(reads,1);assert.equal(requests,1);assert.equal(measurements,1);assert.equal(result.atomicSimulation,true);
});
for(const [da,l2]of [[0n,11n],[7n,0n],[7n,11n]])test(`preference maxfee uses current DA/L2caps and retains priority (${da}/${l2})`,async()=>{
 const f=fixture();f.prepared.gasSettings.maxFeesPerGas=new GasFees(da,l2);f.prepared.gasSettings.maxPriorityFeesPerGas=new GasFees(da?da-1n:0n,l2?l2-1n:0n);const result=await estimatePrivateFeeTransaction(f.input);assert.equal(result.maximumFee,37216n*da+2757260n*l2);assert(result.gasSettings.maxPriorityFeesPerGas.equals(f.prepared.gasSettings.maxPriorityFeesPerGas));
});
