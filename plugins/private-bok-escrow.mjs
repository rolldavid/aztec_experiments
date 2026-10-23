import {measureBokStage} from './bok-timing.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = (value, bytes = 32) => {
 const text = String(value); assert(new RegExp('^0x[0-9a-f]{' + bytes * 2 + '}$').test(text), 'Invalid public identifier'); return text;
};
const integer = (value, bits) => {
 assert(typeof value==='bigint'||(typeof value==='number'&&Number.isSafeInteger(value))||(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)), 'Invalid integer input');
 const n = BigInt(value); assert(n >= 0n && n < 2n ** BigInt(bits), 'Invalid unsigned value'); return n; };
const amount = value => { assert(typeof value === 'bigint', 'Amount must be bigint'); return integer(value, 128); };
const sequence = value => { assert(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff, 'Invalid call sequence'); return value; };
const statuses = ['pending', 'proposed', 'checkpointed', 'proven', 'finalized', 'dropped'];
const methods = ['reserve','settle','close_uncertain','reconcile','finish','publish_reply','finalize_reply'];
const requestFields = ['state','invocation_hash','sequence','deadline','budget','available','reserved','charged','refunded','primary_refund','secondary_refund','primary_done','secondary_done','receipt'];

/** Existing pinned V6 SDK only; no wallet/node/service lifecycle is created here. */
export async function createPrivateBokEscrow(options) {
 const [{Contract,BatchCall}, {Fr}, {AztecAddress}, {TxHash}, {getContractClassFromArtifact}, {deriveStorageSlotInMap}, {getFunctionReturnType}, {waitForTx}, {BBBundlePrivateKernelProver}, {BBLazyPrivateKernelProver}] = await Promise.all([
  import('@aztec-labs/aztec.js/contracts'), import('@aztec-labs/foundation/curves/bn254'),
  import('@aztec-labs/stdlib/aztec-address'), import('@aztec-labs/stdlib/tx'),
  import('@aztec-labs/stdlib/contract'), import('@aztec-labs/stdlib/hash'), import('@aztec-labs/stdlib/abi'), import('@aztec-labs/aztec.js/node'),
  import('@aztec-labs/bb-prover/client/bundle'), import('@aztec-labs/bb-prover/client/lazy'),
 ]);
 return createPrivateBokEscrowFactory({Contract, BatchCall, Fr, AztecAddress, TxHash, getContractClassFromArtifact, deriveStorageSlotInMap, getFunctionReturnType,
  waitForTx,isTrustedProver: prover => prover instanceof BBBundlePrivateKernelProver || prover instanceof BBLazyPrivateKernelProver})(options);
}

/** Dependency seam for labelled unit fakes. Production callers use createPrivateBokEscrow.
 * artifact is a normal processed, trusted release artifact, NOT user-supplied code.
 * store is durable operations.fileState; lease.assertHeld() belongs to its exclusive
 * parent owner. Both must survive/reconcile an unknown write outcome before reuse.
 * Only public transaction hashes, arguments and observations are persisted here.
 * V6 derived Packable assigns one field/member (types/src/traits/packable.nr),
 * PublicMutable stores consecutive slots, PublicImmutable puts the value first,
 * and Map uses the installed deriveStorageSlotInMap. A changed contract needs a
 * reviewed adapter: no latest-state simulation is called a finalized read.
 */
export function createPrivateBokEscrowFactory(sdk) {
 return async function({node,wallet,artifact,address,operator,board,network,requestId,target,store,lease,
  development=false,proofMode='real'}) {
  const {Contract,Fr,AztecAddress,TxHash,getContractClassFromArtifact,deriveStorageSlotInMap,getFunctionReturnType,isTrustedProver} = sdk;
  assert.equal(typeof lease?.assertHeld, 'function'); assert.equal(typeof store?.read, 'function'); assert.equal(typeof store?.write, 'function');
  assert.equal(typeof development, 'boolean'); assert(['real','disabled'].includes(proofMode));
  assert(proofMode === (development ? 'disabled' : 'real'), 'Native proof policy requires disabled development and real testnet');
  const chainId = String(integer(network.chainId, 64)), version = String(integer(network.rollupVersion, 64));
  assert(BigInt(chainId) > 0n && BigInt(version) > 0n); assert.equal(chainId, development ? '31337' : '11155111');
  const rollup = hex(String(network.rollupAddress).toLowerCase(),20); assert(BigInt(rollup)>0n,'Zero rollup address');
  const addr = AztecAddress.fromStringUnsafe(hex(address)), op = AztecAddress.fromStringUnsafe(hex(operator));
  const boardAddress = hex(board), id = hex(requestId), invocation = hex(target);
  for (const value of [address,operator,boardAddress,id,invocation]) assert(BigInt(String(value)) > 0n);
  const idField = Fr.fromString(id); Fr.fromString(invocation);
  assert.equal(artifact.name,'PrivateBok');
  const classId = (await getContractClassFromArtifact(artifact)).id.toString();
  // Ordinary Rolling progression uses native checkpoint inclusion in both modes.
  // Proof verification remains real on testnet; checkpointed is not finalized.
  const finality = 'checkpointed';
  const identity = Object.freeze({network:`eip155-${chainId}:aztec-${version}:${rollup}`,escrow:addr.toString()});
  const binding = {...identity,requestId:id,target:invocation,operator:op.toString(),board:boardAddress,classId,finality,proofMode};
  for (const name of ['operator','board','l1_chain','version','requests']) assert(artifact.storageLayout[name]?.slot, 'Missing pinned storage layout');
  const layout = getFunctionReturnType(artifact.nonDispatchPublicFunctions.find(fn => fn.name === 'request'));
  // Match the exact source-backed, unpacked Request ABI before reading storage.
  assert.equal(layout?.kind,'struct'); assert.deepEqual(layout.fields.map(f=>f.name),requestFields);
  const widths={state:8,sequence:32,deadline:64,budget:128,available:128,reserved:128,charged:128,refunded:128};
  for(const {name,type} of layout.fields){
   if(widths[name])assert.deepEqual(type,{kind:'integer',sign:'unsigned',width:widths[name]},'Request integer layout changed');
   else assert.equal(type.kind,name.endsWith('_done')?'boolean':'field','Request field layout changed');
  }
  const requestSlot = await deriveStorageSlotInMap(artifact.storageLayout.requests.slot,idField);
  let busy=false,poisoned=false;
  const held = async()=>{assert(!poisoned,'Store write outcome unresolved'); await lease.assertHeld();};
  const journal=()=>{
   const value=store.read().privateBokEscrow;
   if(value){
    assert.equal(value.schemaVersion,1);
    // Known production policy evolution only. Preserve the original binding and
    // operation history; a changed account/network/class/proof policy still fails.
    const historicalFinalized=!development&&value.binding?.finality==='finalized';
    assert.deepEqual(value.binding,historicalFinalized?{...binding,finality:'finalized'}:binding,'Escrow journal identity mismatch');
   }
   return value ?? {schemaVersion:1,binding,operations:{}};
  };
  const save=async next=>{await held();try{await store.write({...store.read(),privateBokEscrow:next});}catch{poisoned=true;throw Error('Escrow journal persistence unresolved');}};
  const update=async(key,changes)=>{const j=journal();await save({...j,operations:{...j.operations,[key]:{...j.operations[key],...changes}}});};
  const exclusive=fn=>async(...args)=>{assert(!busy,'Escrow operation already running');busy=true;try{await held();return await fn(...args);}finally{busy=false;}};
  const scope=value=>assert.equal(String(value),id,'Escrow request mismatch');
  const checkNetwork=async()=>{
   await held();const info=await node.getNodeInfo();
   // Pinned PXE private-in-TypeScript fields remain ordinary JS properties. Do not
   // accept an unknown/custom prover or mistake a nonempty development blob for a proof.
   assert.equal(wallet.pxe?.proverEnabled,!development,'PXE native proof policy mismatch');
   if(!development){
    const prover=wallet.pxe.proofCreator;
    assert(isTrustedProver(prover),'Unsupported local proof creator');
    assert(prover.proofsEnabled===undefined||prover.proofsEnabled===true,'PXE proof mode mismatch');
   }
   assert.equal(info.realProofs,proofMode==='real','Node proof verification mode mismatch');
   assert.equal(String(info.l1ChainId),chainId,'Chain changed'); assert.equal(String(info.rollupVersion),version,'Rollup version changed');
   assert.equal(String(info.l1ContractAddresses.rollupAddress).toLowerCase(),rollup,'Rollup changed');
  };
  // One observation shares only reads of the same hash-pinned block. It is
  // discarded at the next public operation; mutable state never gets an age cache.
  const observation=()=>({network:null,blocks:new Map(),snapshots:new Map()});
  const checkedNetwork=read=>read.network??=(checkNetwork());
  const selectedBlock=async(tag,read)=>{
   await checkedNetwork(read);
   if(!read.blocks.has(tag))read.blocks.set(tag,node.getBlock(tag));
   return read.blocks.get(tag);
  };
  const anchored=async(tag=finality,read=observation())=>{
   const b=await selectedBlock(tag,read);assert(b?.header && Number.isSafeInteger(Number(b.number)),'Canonical block unavailable');
   const anchor={number:b.number,hash:b.hash};hex(b.hash);
   const key=String(b.number)+':'+String(b.hash);
   if(!read.snapshots.has(key))read.snapshots.set(key,(async()=>{
    const slots=['operator','board','l1_chain','version'].map(name=>artifact.storageLayout[name].slot)
     .concat(requestFields.map((_,i)=>new Fr(requestSlot.toBigInt()+BigInt(i))));
    const [instance,...values]=await Promise.all([node.getContract(addr,anchor),...slots.map(slot=>node.getPublicStorageAt(anchor,addr,slot))]);
    assert.equal(String(instance?.currentContractClassId),classId,'Escrow class mismatch');
    const expected=[BigInt(op.toString()),BigInt(boardAddress),BigInt(chainId),BigInt(version)];
    for(let i=0;i<expected.length;i++)assert.equal(values[i].toBigInt(),expected[i],'Escrow configuration mismatch');
    const r=Object.fromEntries(requestFields.map((name,i)=>[name,values[i+4].toBigInt()]));
    r.state=Number(integer(r.state,8));r.sequence=Number(integer(r.sequence,32));r.deadline=integer(r.deadline,64);
    for(const name of ['budget','available','reserved','charged','refunded'])r[name]=integer(r[name],128);
    for(const name of ['primary_done','secondary_done']){assert(r[name]===0n||r[name]===1n);r[name]=r[name]===1n;}
    for(const name of ['invocation_hash','primary_refund','secondary_refund','receipt'])r[name]=new Fr(r[name]).toString();
    assert([1,2,3,4].includes(r.state),'Request unavailable');assert.equal(r.invocation_hash,invocation,'Invocation target mismatch');
    assert(r.budget>0n&&r.available+r.reserved+r.charged+r.refunded===r.budget,'Request conservation failure');
    assert.equal(String((await node.getBlock(b.number))?.hash),String(b.hash),'Canonical block changed');
    return {canonical:true,request:r,anchor:{number:Number(b.number),hash:String(b.hash),timestamp:String(integer(b.header.globalVariables.timestamp,64)),finality},instance};
   })());
   return read.snapshots.get(key);
  };
  const initial=await anchored();await wallet.registerContract(initial.instance,artifact);
  const contract=await Contract.at(addr,artifact,wallet); if(!store.read().privateBokEscrow)await save(journal());else journal();
  const unsubmittedReserve=record=>record.method==='reserve'&&record.args?.[1]===0&&record.proofMode===proofMode&&record.phase==='preparing'&&!['recoveryAttempted','txHash','transactionSha256','submissionError'].some(key=>Object.hasOwn(record,key));
  const inspectOne=async (operationId,replacement=false,read=observation())=>{
   const readRecord=()=>replacement?journal().operations[operationId]?.replacement:journal().operations[operationId];
   const recordUpdate=changes=>replacement?update(operationId,{replacement:{...readRecord(),...changes}}):update(operationId,changes);
   assert(/^[0-9a-f]{64}$/.test(operationId));await held();
   const record=readRecord();if(!record){await checkedNetwork(read);return {status:'absent'};}
   assert(methods.includes(record.method) && record.args?.[0]===id,'Invalid recorded operation');
   assert.equal(digest(record.args),record.argsDigest,'Recorded arguments changed');
   // Current authority expires before the new read. Historical rows are evidence,
   // never a substitute for receipt availability, canonicality or finality now.
   await recordUpdate({result:{status:'pending',canonical:false},observation:{status:'inspecting'}});
   await checkedNetwork(read);
   if(!record.txHash)return {status:unsubmittedReserve(record)?'not-submitted':'pending',method:record.method,argsDigest:record.argsDigest,canonical:false};
   let receipt;
   try{receipt=await node.getTxReceipt(TxHash.fromString(record.txHash));}
   catch{await recordUpdate({observation:{status:'unavailable'}});return {status:'pending',canonical:false};}
   const observation={status:statuses.includes(receipt?.status)?receipt.status:'invalid',
    ...(typeof receipt?.transactionFee==='bigint'?{transactionFee:String(receipt.transactionFee)}:{}),
    ...(['success','reverted'].includes(receipt?.executionResult)?{executionResult:receipt.executionResult}:{})};
   // Preserve consumed fees and failure category before hash/finality assertions.
   await recordUpdate({observation});
   assert.equal(String(receipt.txHash),record.txHash,'Receipt hash mismatch');assert(statuses.includes(receipt.status),'Invalid receipt status');
   if(['pending','dropped'].includes(receipt.status))return {status:receipt.status==='dropped'?'failed':'pending',canonical:false,method:record.method,argsDigest:record.argsDigest};
   const [block,effect]=await Promise.all([node.getBlock(receipt.blockNumber),node.getTxEffect(TxHash.fromString(record.txHash))]);
   if(!block||!effect)return {status:'pending',canonical:false};
   observation.blockNumber=Number(receipt.blockNumber);observation.blockHash=String(receipt.blockHash);
   observation.effectSha256=bytesHash(effect.data.toBuffer());await recordUpdate({observation});
   assert.equal(String(block.hash),String(receipt.blockHash),'Receipt block mismatch');
   assert.equal(String(effect.l2BlockHash),String(block.hash),'Effect block mismatch'); assert.equal(Number(effect.l2BlockNumber),Number(receipt.blockNumber));
   assert.equal(String(effect.data.txHash),record.txHash,'Effect hash mismatch');
   assert(typeof receipt.transactionFee==='bigint'&&receipt.transactionFee>=0n,'Missing actual fee');
   assert.equal(effect.data.transactionFee.toBigInt(),receipt.transactionFee,'Effect fee mismatch');
   assert(['success','reverted'].includes(receipt.executionResult));assert.equal(effect.data.revertCode.isOK(),receipt.executionResult==='success','Effect result mismatch');
   assert.equal(String((await node.getBlock(receipt.blockNumber))?.hash),String(receipt.blockHash),'Receipt block changed during inspection');
   const included={...observation,txHash:record.txHash,canonicalAtObservation:true};
   const history=readRecord().includedHistory??[];
   if(!history.some(row=>digest(row)===digest(included))){
    // Stop on excessive distinct observations instead of silently dropping fees.
    assert(history.length<8,'Included receipt history limit; retain journal for reconciliation');
    await recordUpdate({includedHistory:[...history,included]});
   }
   if(!['checkpointed','proven','finalized'].includes(receipt.status))return {status:'pending',canonical:false,method:record.method,argsDigest:record.argsDigest};
   const tip=await selectedBlock(finality,read);assert(tip&&Number(tip.number)>=Number(receipt.blockNumber),'Checkpoint unavailable');
   // Recheck the configured class and state against the same required finality.
   await anchored(finality,read);
   assert.equal(String((await node.getBlock(receipt.blockNumber))?.hash),String(receipt.blockHash),'Receipt block changed during inspection');
   const result={status:receipt.executionResult==='success'?'succeeded':'failed',canonical:true,method:record.method,argsDigest:record.argsDigest,
    txHash:record.txHash,transactionFee:String(receipt.transactionFee),blockNumber:observation.blockNumber,blockHash:observation.blockHash};
   await recordUpdate({observation:{...observation,canonical:true},result});return result;
  };
  const inspect=async (operationId,read=observation())=>{
   const original=await inspectOne(operationId,false,read),record=journal().operations[operationId];
   if(!record?.replacement)return original;
   const replacement=record.replacement;
   assert.equal(replacement.originalTxHash,record.txHash,'Replacement original hash changed');
   assert.equal(replacement.argsDigest,record.argsDigest,'Replacement arguments changed');
   assert.deepEqual(replacement.args,record.args,'Replacement arguments changed');
   assert.equal(replacement.method,'settle');assert.equal(record.method,'settle');
   const observed=await inspectOne(operationId,true,read);
   // Observe both exact hashes: an original late inclusion is also authoritative,
   // while each included transaction keeps its own fee/effect history.
   const result=original.status==='succeeded'&&original.canonical?original:observed;
   await update(operationId,{result});return result;
  };
  const waitForOperation=async operationId=>{
   const observed=await inspect(operationId);
   if(observed.status==='succeeded'||observed.status==='failed')return observed;
   const original=journal().operations[operationId],record=original?.replacement??original;
   if(record&&!record.txHash)return observed;
   assert(record?.txHash&&record.phase==='submission-unknown','Original submitted operation required');
   assert.equal(typeof sdk.waitForTx,'function','Native receipt observer required');
   try{
    await measureBokStage('escrow.wait',()=>sdk.waitForTx(node,TxHash.fromString(record.txHash),{waitForStatus:finality,timeout:0,dontThrowOnRevert:true}));
   }catch{
    // A dropped transaction or a lost receipt response is not permission to send
    // again. Preserve authoritative failure/fee evidence if it is now available.
    const result=await inspect(operationId);
    if(result.status==='succeeded'||result.status==='failed')return result;
    throw Error('Escrow receipt observation unavailable; inspect original intent');
   }
   // The native waiter supplies progress, never canonical application authority.
   return inspect(operationId);
  };
  const usable=async(request,callId,maximum)=>{
   scope(request);sequence(callId);amount(maximum);
   // The artifact-bound board callback reserves the owner's full budget in the
   // posting transaction. Canonical state is authority, not a synthetic local tx.
   const read=observation();
   const [r,latest]=await Promise.all([anchored(finality,read),anchored('latest',read)]);
   for(const row of [r,latest])assert(row.request.state===2&&callId===0&&row.request.sequence===0&&row.request.reserved===maximum&&maximum===row.request.budget&&row.request.available===0n&&row.request.charged===0n&&row.request.refunded===0n&&BigInt(row.request.receipt)===0n&&maximum>0n,'Reservation not canonical');
   await held();const now=BigInt(Math.floor(Date.now()/1000)),chainTime=BigInt(latest.anchor.timestamp);
   assert((now>chainTime?now:chainTime)+180n<latest.request.deadline,'Reservation too close to expiry');
   // Recheck both snapshots at the guard boundary, including when both selectors
   // shared one snapshot. A reorg during the latest read cannot release paid work.
   const anchors=new Map([r,latest].map(row=>[row.anchor.number,row.anchor.hash]));
   for(const [number,hash]of anchors)assert.equal(String((await node.getBlock(number))?.hash),hash,'Canonical block changed during reservation guard');
   return {canonical:true,request:r.request,anchor:r.anchor,deadline:String(latest.request.deadline),finality,controlledSettlement:development};
  };
  const send=async(method,args,operation)=>{
   scope(args[0]);const operationId=operation?.operationId,argsDigest=digest(args.map(v=>typeof v==='bigint'?String(v):v));
   assert(/^[0-9a-f]{64}$/.test(operationId));assert.equal(operation.argsDigest,argsDigest,'Operation arguments mismatch');
   const old=journal().operations[operationId];
   if(old){assert.equal(old.method,method);assert.equal(old.argsDigest,argsDigest);if(!unsubmittedReserve(old))return old.txHash?waitForOperation(operationId):inspect(operationId);assert.deepEqual(old.args,args.map(v=>typeof v==='bigint'?String(v):v),'Original reserve arguments changed');}
   assert(Object.keys(journal().operations).length<256,'Escrow operation limit');
   await anchored();
   await update(operationId,{method,argsDigest,args:args.map(v=>typeof v==='bigint'?String(v):v),phase:'preparing',proofMode,...(old?{recoveryAttempted:true}:{})});
   return perform(method,args,operationId);
  };

  const perform=async(method,args,operationId,replacement=false,beforeSend=null)=>{
   const recordUpdate=changes=>replacement?update(operationId,{replacement:{...journal().operations[operationId].replacement,...changes}}):update(operationId,changes);
   try{
    const steps=method==='finalize_reply'?[['settle',args.slice(0,4)],['publish_reply',[args[0],...args.slice(4)]],['finish',[args[0]]]]:[[method,args]];
    const interactions=steps.map(([name,values])=>contract.methods[name](...values.map((v,i)=>Array.isArray(v)?v.map(value=>Fr.fromString(value)):i===0||(name==='publish_reply'&&i===1)||((name==='settle'||name==='reconcile')&&i===3)?Fr.fromString(v):v)));
    const interaction=method==='finalize_reply'?new sdk.BatchCall(wallet,interactions):interactions[0];
    const payload=await interaction.request({from:op,additionalScopes:[]});
    assert.equal(payload.calls.length,steps.length);
    for(const [i,call] of payload.calls.entries()){
     assert.equal(call.name,steps[i][0]);assert.equal(String(call.to),String(addr));assert.equal(call.type,'public');assert.equal(call.isStatic,false);
     assert.deepEqual(call.args.map(x=>x.toBigInt()),steps[i][1].flat().map(x=>BigInt(x)),'Payload arguments changed');
    }
    const fee=await wallet.completeFeeOptions({from:op,feePayer:payload.feePayer});
    const txRequest=await wallet.createTxExecutionRequestFromPayloadAndFee(payload,op,fee);
    const proven=await measureBokStage('escrow.prove',()=>wallet.pxe.proveTx(txRequest,{scopes:wallet.scopesFrom(op,[]),senderForTags:wallet.senderForTagsFrom(op)}));
    assert(!proven.chonkProof.isEmpty(),'Missing proof');const tx=await proven.toTx();
    assert.equal(String(tx.data.feePayer),String(op),'Operator fee payer changed');
    assert.equal(tx.data.constants.txContext.chainId.toBigInt(),BigInt(chainId),'Proven chain mismatch');
    assert.equal(tx.data.constants.txContext.version.toBigInt(),BigInt(version),'Proven version mismatch');
    const calls=tx.getPublicCallRequestsWithCalldata();assert.equal(calls.length,payload.calls.length,'Unexpected public calls');
    // The stable6 native SDK exposes public calls in execution order; the
    // contract integration qualifier checks this against an actual mined batch.
    const expected=payload.calls;
    for(const [i,call] of calls.entries()){
     assert.equal(String(call.request.contractAddress),String(addr));assert.equal(String(call.request.msgSender),String(op));
     assert.equal(String(call.functionSelector),String(expected[i].selector));assert.deepEqual(call.args.map(x=>x.toBigInt()),expected[i].args.map(x=>x.toBigInt()));
    }
    if(method==='finalize_reply'){
     assert.equal(tx.data.getNonRevertiblePublicCallRequests().length,0,'Final batch must be entirely revertible');
     assert.equal(tx.data.getRevertiblePublicCallRequests().length,3,'Final batch must contain exactly three revertible calls');
     assert.equal(tx.data.getTeardownPublicCallRequest(),undefined,'Unexpected final batch teardown');
    }
    const hash=hex(tx.getTxHash());
    await anchored();await lease.assertHeld();
    if(beforeSend&&!await beforeSend()){await recordUpdate({phase:'superseded-before-send'});return inspect(operationId);}
    await recordUpdate({phase:'submission-unknown',txHash:hash,transactionSha256:bytesHash(tx.toBuffer())});
    await held();
    // An exception may mean accepted-but-response-lost. Never send this action again.
    try{await measureBokStage('escrow.send',()=>node.sendTx(tx));}catch{await recordUpdate({submissionError:true});}
    return await waitForOperation(operationId);
   }catch{if(!poisoned)await recordUpdate({failure:'operation-unresolved'});throw Error('Escrow operation unresolved; inspect original intent');}
  };
  const replaceDroppedOperation=async authority=>{
   const {operationId,argsDigest,originalTxHash}=authority??{};
   assert(/^[0-9a-f]{64}$/.test(operationId));hex(originalTxHash);
   const original=journal().operations[operationId];
   assert(original?.method==='settle'&&original.phase==='submission-unknown','Submitted settlement required');
   assert.equal(original.argsDigest,argsDigest);assert.equal(digest(original.args),argsDigest);
   assert.equal(original.txHash,originalTxHash);assert(/^[0-9a-f]{64}$/.test(original.transactionSha256));
   assert.equal(original.args.length,4);scope(original.args[0]);sequence(original.args[1]);
   const charge=integer(original.args[2],128);hex(original.args[3]);assert(charge>0n);
   if(original.replacement)return waitForOperation(operationId);
   const check=async()=>{
    const observed=await inspectOne(operationId);
    if(observed.canonical&&observed.status==='succeeded')return false;
    assert.equal(journal().operations[operationId].observation?.status,'dropped','Explicit dropped receipt required');
    const checkpoint=await anchored(),latest=await anchored('latest');
    assert.deepEqual(latest.request,checkpoint.request,'Reservation changed after checkpoint');
    const request=checkpoint.request;
    assert(request.state===2&&request.sequence===original.args[1]&&request.reserved>=charge,'Original reservation required');
    assert(BigInt(latest.anchor.timestamp)<request.deadline,'Settlement deadline reached');
    assert(request.sequence===0&&request.reserved===request.budget&&request.available===0n&&request.charged===0n&&request.refunded===0n&&BigInt(request.receipt)===0n,'Original activation reservation required');
    // Bind the exact reservation, cumulative budget and preceding receipt across
    // proof construction. A changed request cannot authorize this replacement.
    const retained=journal().operations[operationId].replacement?.reservation;
    if(retained)assert.deepEqual(request,JSON.parse(retained,(_key,value)=>typeof value==='string'&&/^bigint:/.test(value)?BigInt(value.slice(7)):value),'Original reservation changed');
    return checkpoint;
   };
   const admitted=await check();if(!admitted)return inspect(operationId);
   await update(operationId,{replacement:{method:'settle',args:original.args,argsDigest,originalTxHash,
    originalTransactionSha256:original.transactionSha256,proofMode,phase:'preparing',
    reservation:JSON.stringify(admitted.request,(_key,value)=>typeof value==='bigint'?'bigint:'+value:value),anchor:admitted.anchor}});
   // Admission is consumed before proving. Any failure or ambiguous submission
   // can only inspect this lineage; it never produces another replacement.
   return perform('settle',[id,original.args[1],charge,original.args[3]],operationId,true,check);
  };
  const port={identity,mode:Object.freeze({proofMode,nodeVerifiesProofs:proofMode==='real',pxeProofMode:proofMode,finality,controlledSettlement:development}),
   request:exclusive(async value=>{scope(value);const {instance,...result}=await anchored();return result;}),
   assertUsable:exclusive(usable),inspectOperation:exclusive(inspect),
   waitForOperation:exclusive(waitForOperation),replaceDroppedOperation:exclusive(replaceDroppedOperation),
   reserve:exclusive((request,callId,maximum,operation)=>send('reserve',[request,sequence(callId),amount(maximum)],operation)),
   settle:exclusive((request,callId,actual,receipt,operation)=>send('settle',[request,sequence(callId),amount(actual),hex(receipt)],operation)),
   close_uncertain:exclusive((request,operation)=>send('close_uncertain',[request],operation)),
   reconcile:exclusive((request,callId,actual,receipt,operation)=>send('reconcile',[request,sequence(callId),amount(actual),hex(receipt)],operation)),
   finish:exclusive((request,operation)=>send('finish',[request],operation)),
   finalize_reply:exclusive((request,callId,actual,receipt,pluginId,fields,length,mainVersion,localVersion,operation)=>{
    assert.equal(typeof sdk.BatchCall,'function','Native batch capability required');
    assert(Array.isArray(fields)&&fields.length===32);const message=fields.map(value=>hex(value));
    assert(Number.isSafeInteger(length)&&length>0&&length<=992);
    return send('finalize_reply',[request,sequence(callId),amount(actual),hex(receipt),hex(pluginId),message,Number(integer(length,16)),sequence(mainVersion),sequence(localVersion)],operation);
   }),
   publish_reply:exclusive((request,pluginId,fields,length,mainVersion,localVersion,operation)=>{
    assert(Array.isArray(fields)&&fields.length===32);const message=fields.map(value=>hex(value));
    assert(Number.isSafeInteger(length)&&length>0&&length<=992);
    return send('publish_reply',[request,hex(pluginId),message,Number(integer(length,16)),sequence(mainVersion),sequence(localVersion)],operation);
   }),
  };
  return Object.freeze(port);
 };
}
