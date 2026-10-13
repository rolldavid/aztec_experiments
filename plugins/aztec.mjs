import {Contract} from '@aztec-labs/aztec.js/contracts';
import {NO_FROM} from '@aztec-labs/aztec.js/account';
import assert from 'node:assert/strict';
import {deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {unpackText} from './protocol.mjs';

/** Reference implementation of the board port; workers import only its interface. */
export async function aztecBoardPort({node,wallet,scope,boardArtifact,adapterArtifact,operator,finality='finalized'}) {
  if(!['finalized','checkpointed'].includes(finality))throw Error('Invalid confirmation policy');
  if(finality==='checkpointed'&&scope.chainId!=='31337')throw Error('Checkpointed execution is devnet-only');
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
        finalized:headNumber!==undefined&&BigInt(publishedBlock)>0n&&BigInt(publishedBlock)<=BigInt(headNumber)};
    },
  };
}


/** Rolling request identity comes from the authenticated public projection.
 * Human ownership/private tags never enter this port. Current on-chain plugin,
 * moderation and policy reads are pinned to the same required-finality block. */
export async function rollingBoardPort({node,index,scope,boardArtifact,pluginId,development}){
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
  await checkScope();const head=await node.getBlock(development?'checkpointed':'finalized');
  assert(head&&Number.isSafeInteger(head.number));const anchor={number:head.number,hash:head.hash};
  const instance=await node.getContract(board,anchor);assert.equal(String(instance?.originalContractClassId),expectedClass);assert.equal(String(instance?.currentContractClassId),expectedClass);
  const read=slot=>node.getPublicStorageAt(anchor,board,slot);
  const adapter=await read(pluginSlot),enabled=await read(new Fr(pluginSlot.toBigInt()+1n));
  const flaggedSlot=await deriveStorageSlotInMap(boardArtifact.storageLayout.post_flagged.slot,new Fr(BigInt(post.id)));
  const flagged=(await read(flaggedSlot)).toBigInt()!==0n;
  const mainVersion=Number((await read(boardArtifact.storageLayout.main_version.slot)).toBigInt());assert(Number.isSafeInteger(mainVersion)&&mainVersion>0);
  let localAllowed=true;
  if(post.record.subboard!=='0'){
   const local=await deriveStorageSlotInMap(boardArtifact.storageLayout.subboards.slot,new Fr(BigInt(post.record.subboard)));
   // Exact pinned SubboardRecord: exists, rules, metadata, creation_version, rejected, reason.
   localAllowed=(await read(local)).toBigInt()===1n&&(await read(new Fr(local.toBigInt()+4n))).toBigInt()===0n;
  }
  // This contract's effective_policy/publish_plugin_reply define immutable local version 1.
  assert.equal(String((await node.getBlock(head.number))?.hash),String(head.hash),'Board anchor changed');
  return {postId:toField(post.id),threadId:toField(post.record.root),order:String(post.order),requestId:toField(invocation.requestId),target:toField(invocation.target),pluginId,
   text:post.text,replied:invocation.reply!==null,mainVersion,localVersion:post.record.subboard==='0'?0:1,
   usable:localAllowed&&typeof post.text==='string'&&!post.removal&&!flagged&&String(adapter)===scope.receiver&&enabled.toBigInt()===1n&&BigInt(post.position.blockNumber)<=BigInt(head.number)};
 };
 const syncReady=async()=>{const deadline=Date.now()+20000;for(let steps=0;steps<512&&Date.now()<deadline;steps++){await index.sync();if(index.status().state==='ready')return;};throw Error('Canonical public index catching up');};
 return {
  async pending(){
   await syncReady();let cursor=null,revision=null;const heads=new Map(),seen=new Set();
   // Read one immutable projection before any await. Retain the oldest
   // pending request per thread, so one busy thread cannot fill every slot.
   do{
    const page=index.query('feed',{limit:100,cursor});
    if(revision===null)revision=page.revision;assert.equal(page.revision,revision);
    for(const post of page.posts)if(post.invocation&&toField(post.invocation.adapter)===scope.receiver&&toField(post.invocation.pluginId)===pluginId&&post.invocation.reply===null&&!post.removal&&typeof post.text==='string'){
     const root=toField(post.record.root);heads.set(root,post);
     if(heads.size>64){const newest=[...heads.entries()].reduce((a,b)=>BigInt(a[1].order)>BigInt(b[1].order)?a:b);heads.delete(newest[0]);}
    }
    cursor=page.nextCursor;if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
   }while(cursor);
   const posts=[...heads.values()];posts.sort((a,b)=>BigInt(a.order)<BigInt(b.order)?-1:BigInt(a.order)>BigInt(b.order)?1:0);
   const requests=[];for(const post of posts){const request=await requestFrom(post);if(request?.usable&&!request.replied)requests.push(request);}
   return {requests,nextCursor:null};
  },
  async readRequest(postId){await syncReady();return requestFrom(index.query('post',{id:BigInt(postId).toString()}).post);},
 };
}
