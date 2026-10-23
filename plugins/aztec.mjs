import {Contract} from '@aztec-labs/aztec.js/contracts';
import {NO_FROM} from '@aztec-labs/aztec.js/account';
import assert from 'node:assert/strict';
import {deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {unpackText} from './protocol.mjs';

/** Reference implementation of the board port; workers import only its interface. */
export async function aztecBoardPort({node,wallet,scope,boardArtifact,adapterArtifact,operator,finality='checkpointed'}) {
  if(!['finalized','checkpointed'].includes(finality))throw Error('Invalid confirmation policy');
  const instance=await node.getContract(AztecAddress.fromStringUnsafe(scope.boardAddress),'latest');if(!instance)throw Error('Board not deployed');await wallet.registerContract(instance,boardArtifact);
  const board=await Contract.at(AztecAddress.fromStringUnsafe(scope.boardAddress),boardArtifact,wallet);
  const read=async(name,...args)=>(await board.methods[name](...args).simulate({from:NO_FROM})).result;
  return {
    async readRequest(postId){
      const info=await node.getNodeInfo();
      if(String(info.l1ChainId)!==scope.chainId||String(info.rollupVersion)!==scope.rollupVersion||info.l1ContractAddresses.rollupAddress.toString().toLowerCase()!==scope.rollupAddress)throw Error('Board network mismatch');
      const id=Fr.fromString(postId);
      if(!await read('get_post_exists',id))return null;
      const [handle,receiver,reply,publishedBlock]=await read('get_plugin_request',id);
      if(BigInt(handle)===0n)return null;
      const [,enabled]=await read('get_plugin',handle);
      const [fields,length,flagged,head]=await Promise.all([read('get_post',id),read('get_post_length',id),read('is_post_flagged',id),node.getBlockData(finality)]);
      const headNumber=head?.header?.getBlockNumber();
      return {text:unpackText(fields.map(String),Number(length)),receiver:receiver.toString(),enabled,flagged,
        replyPostId:BigInt(reply)===0n?null:new Fr(BigInt(reply)).toString(),
        // Compare the recorded publication block to the confirmed chain tip.
        confirmed:headNumber!==undefined&&BigInt(publishedBlock)>0n&&BigInt(publishedBlock)<=BigInt(headNumber)};
    },
  };
}


// Read-only predecessor admission shares the index owner's current snapshot.
// The caller owns each bounded-page scan until its canonical reads settle.
export async function rollingPredecessorsClear({index,request,isTerminal=async()=>false,admission={}}){
 assert(!admission.closed,'Canonical predecessor admission closed');
 assert(!admission.pending,'Canonical predecessor admission unavailable: prior read pending');
 const scan=async()=>{
  let after=null,revision;
  for(;;){
   assert(!admission.closed,'Canonical predecessor admission closed');
   const page=index.scanPendingPredecessors(BigInt(request.postId).toString(),{after,limit:64});
   assert(Array.isArray(page.rows)&&page.rows.length<=64&&typeof page.revision==='string');
   if(revision===undefined)revision=page.revision;else assert.equal(page.revision,revision,'Predecessor publication changed');
   let prior=after===null?-1n:BigInt(after);
   for(const row of page.rows){
    assert(!admission.closed,'Canonical predecessor admission closed');
    assert(BigInt(row.order)>prior&&BigInt(row.order)<BigInt(request.order),'Predecessor order changed');prior=BigInt(row.order);
    assert.equal(BigInt(row.threadId),BigInt(request.threadId));assert.equal(BigInt(row.pluginId),BigInt(request.pluginId));assert.equal(BigInt(row.adapter),BigInt(request.adapter));
    const field=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');
    const terminal=await isTerminal({...row,postId:field(row.postId),threadId:field(row.threadId),requestId:field(row.requestId),target:field(row.target),pluginId:field(row.pluginId),adapter:field(row.adapter)});
    assert(!admission.closed,'Canonical predecessor admission closed');
    if(!terminal)return false;
   }
   // Recheck ownership/revision after this bounded page of accounting reads.
   assert.equal(index.scanPendingPredecessors(BigInt(request.postId).toString(),{after,limit:1}).revision,revision,'Predecessor publication changed');
   if(page.nextAfter===null)return true;
   assert(page.rows.length===64&&page.nextAfter===page.rows.at(-1).order&&(after===null||BigInt(page.nextAfter)>BigInt(after)),'Invalid predecessor cursor');after=page.nextAfter;
  }
 };
 // Retain both the caller and sole scan ownership across queued wallet reads.
 // No later poll can abandon or duplicate this still-owned canonical work.
 const pending=Promise.resolve().then(scan);admission.pending=pending;
 try{return await pending;}finally{if(admission.pending===pending)admission.pending=null;}
}
/** Rolling request identity comes from the authenticated public projection.
 * Human ownership/private tags never enter this port. Current on-chain plugin,
 * moderation and policy reads are pinned to the same required-finality block. */
export async function rollingBoardPort({node,index,scope,boardArtifact,pluginId,development,isTerminalWithoutReply,confirmationTier='checkpointed'}){
 assert(['checkpointed','proposed'].includes(confirmationTier));
 const admission={};let cachedState=null;
 assert.equal(boardArtifact.name,'RollingBoard');const board=AztecAddress.fromStringUnsafe(scope.boardAddress);
 const expectedClass=(await getContractClassFromArtifact(boardArtifact)).id.toString();
 const toField=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');
 const plugin=Fr.fromString(pluginId),pluginSlot=await deriveStorageSlotInMap(boardArtifact.storageLayout.plugins.slot,plugin);
 const checkScope=async()=>{
  const info=await node.getNodeInfo();assert.equal(String(info.l1ChainId),scope.chainId);assert.equal(String(info.rollupVersion),scope.rollupVersion);
  assert.equal(String(info.l1ContractAddresses.rollupAddress).toLowerCase(),scope.rollupAddress);assert.equal(info.realProofs,!development);
 };
 const requestFrom=async post=>{
  if(!post?.invocation)return null;const invocation=post.invocation;
  if(toField(invocation.adapter)!==scope.receiver||toField(invocation.pluginId)!==pluginId)return null;
  // Drain every independent read before releasing index ownership, including
  // failures. All mutable values below remain bound to this one block hash.
  const together=async reads=>{
   const results=await Promise.allSettled(reads),failed=results.find(r=>r.status==='rejected');
   if(failed)throw failed.reason;return results.map(r=>r.value);
  };
  const [,head]=await together([checkScope(),node.getBlock(confirmationTier)]);
  assert(head&&Number.isSafeInteger(head.number));const anchor={number:head.number,hash:String(head.hash)};
  // Only immutable, hash-anchored storage is reused. Predecessor admission and
  // the canonical anchor are still observed for every guard. One entry bounds
  // memory and a changed index revision or post invalidates it immediately.
  const projection=index.status();
  const cacheKey=projection.state==='ready'&&projection.complete===true&&typeof projection.revision==='string'
   ?JSON.stringify([anchor,projection.revision,post]):null;
  let values=cacheKey&&cachedState?.key===cacheKey?cachedState.values:null;
  if(!values){
  const read=slot=>node.getPublicStorageAt(anchor,board,slot);
  const flaggedSlot=await deriveStorageSlotInMap(boardArtifact.storageLayout.post_flagged.slot,new Fr(BigInt(post.id)));
  const local=post.record.subboard==='0'?null:await deriveStorageSlotInMap(boardArtifact.storageLayout.subboards.slot,new Fr(BigInt(post.record.subboard)));
  const [instance,adapter,enabled,flaggedValue,mainValue,...localValues]=await together([
   node.getContract(board,anchor),read(pluginSlot),read(new Fr(pluginSlot.toBigInt()+1n)),
   read(flaggedSlot),read(boardArtifact.storageLayout.main_version.slot),
   ...(local?[read(local),read(new Fr(local.toBigInt()+4n))]:[]),
  ]);
  assert.equal(String(instance?.originalContractClassId),expectedClass);assert.equal(String(instance?.currentContractClassId),expectedClass);
  const flagged=flaggedValue.toBigInt()!==0n;
  const mainVersion=Number(mainValue.toBigInt());assert(Number.isSafeInteger(mainVersion)&&mainVersion>0);
  // Exact pinned SubboardRecord: exists, rules, metadata, creation_version, rejected, reason.
  const localAllowed=!local||(localValues[0].toBigInt()===1n&&localValues[1].toBigInt()===0n);
  values={adapter:String(adapter),enabled:enabled.toBigInt()===1n,flagged,mainVersion,localAllowed};
  }
  const {adapter,enabled,flagged,mainVersion,localAllowed}=values;
  // This contract's effective_policy/publish_plugin_reply define immutable local version 1.
  const identity={postId:toField(post.id),threadId:toField(post.record.root),order:String(post.order),requestId:toField(invocation.requestId),target:toField(invocation.target),pluginId,adapter:scope.receiver};
  const predecessorsClear=await rollingPredecessorsClear({index,request:identity,isTerminal:row=>isTerminalWithoutReply?.(row,anchor)??false,admission});
  assert.equal(String((await node.getBlock(head.number))?.hash),String(head.hash),'Board anchor changed during predecessor admission');
  if(cacheKey){assert.equal(index.status().revision,projection.revision,'Board projection changed during read');cachedState={key:cacheKey,values};}
  return {...identity,predecessorsClear,
   text:post.text,replied:invocation.reply!==null,mainVersion,localVersion:post.record.subboard==='0'?0:1,
   usable:localAllowed&&typeof post.text==='string'&&!post.removal&&!flagged&&adapter===scope.receiver&&enabled&&BigInt(post.position.blockNumber)<=BigInt(head.number)&&predecessorsClear};
 };
 // Catch-up is ordinary retained index work, not an elapsed-time failure.
 // Yield after a bounded batch so service shutdown and other canonical reads
 // can proceed. Never publish a scan until the index authenticates its full tip.
 const syncReady=async()=>{
  assert(!admission.closed,'Canonical predecessor admission closed');
  const current=index.status();
  if(current.state==='ready'&&current.complete===true&&current.checkpoint){
   const head=await node.getBlock(confirmationTier),after=index.status();
   const number=Number(current.checkpoint.number);
   if(Number.isSafeInteger(number)&&number>=0&&head&&head.number===number&&String(head.hash)===current.checkpoint.hash&&after.state==='ready'&&after.complete===true&&after.revision===current.revision)return true;
  }
  for(let steps=0;steps<32;steps++){
  assert(!admission.closed,'Canonical predecessor admission closed');
  await index.sync();if(index.status().state==='ready')return true;
 }return false;};
 return {
  async close(){admission.closed=true;await admission.pending?.catch(()=>{});},
  async pending(cursor){
   if(!await syncReady())return {requests:[],nextCursor:cursor??null};
   let after=null;
   if(cursor){
    assert(cursor&&typeof cursor==='object'&&typeof cursor.after==='string'&&Number.isSafeInteger(cursor.anchor?.number));
    const block=await node.getBlockData(cursor.anchor.number);
    if(String(block?.blockHash)===cursor.anchor.hash)after=cursor.after;
   }
   // The bounded canonical page preserves the scan cursor; requestFrom
   // checks each row's indexed thread/plugin predecessor independently.
   const page=index.scanPosts({after,limit:64,pendingOnly:true});assert(page.complete&&Array.isArray(page.posts)&&page.posts.length<=64);
   const requests=[];
   for(const post of page.posts){
    const request=await requestFrom(post);
    if(request?.usable&&!request.replied)requests.push(request);
   }
   return {requests,nextCursor:page.nextAfter===null?null:{after:page.nextAfter,anchor:page.checkpoint}};
  },
  async readRequest(postId){assert(await syncReady(),'Canonical public index not ready');return requestFrom(index.query('post',{id:BigInt(postId).toString()}).post);},
 };
}
