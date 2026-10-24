import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {computePublicDataTreeLeafSlot,deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {isPrivatePXEForNode} from './private-pxe.mjs';
import {ORDINARY_POST_GAS_PROFILE} from './ordinary-post-fees.mjs';

// Screening already identifies the exact history notes the private circuit will
// authenticate. Fetch their independent public witnesses together, through the
// PXE's own hash-pinned cache. The circuit still checks every witness normally.
// No witness or state is reused across anchors and no private execution is run.
export async function prefetchOrdinaryPostWitnesses({wallet,node,board,artifact,hints}) {
  const pxe=wallet?.pxe;
  if(!isPrivatePXEForNode(pxe,node)||board?.currentContractClassId?.toString()!==ORDINARY_POST_GAS_PROFILE.boardClassId||!Array.isArray(hints)||hints.length!==2)
    throw Object.assign(Error('Invalid ordinary post witness context'),{code:'BB_POST_FEE_PROFILE_MISMATCH'});
  const cachedNode=pxe.node;
  const guard=()=>{if(wallet.pxe!==pxe||pxe.node!==cachedNode||!isPrivatePXEForNode(pxe,node))throw Object.assign(Error('Ordinary post witness context changed'),{code:'ROLLING_CONTEXT_CHANGED'});};
  const posts=hints.map((hint,index)=>hint&&!hint.note.is_dummy?{post:new Fr(BigInt(hint.note.post_id)),index}:null).filter(Boolean);
  if(!posts.length)return;
  const header=await pxe.getSyncedBlockHeader(),anchor=await header.toBlockParameter();
  guard();
  const entries=await Promise.all(posts.flatMap(({post,index})=>['post_exists','post_time','post_flag_deadline'].map(async name=>{
    const slot=artifact.storageLayout?.[name]?.slot;
    if(slot===undefined)throw Error('Missing ordinary post storage layout');
    const storageSlot=await deriveStorageSlotInMap(new Fr(BigInt(slot)),post);
    return {name,post,index,leaf:await computePublicDataTreeLeafSlot(board.address,storageSlot)};
  })));
  guard();
  const reads=await Promise.allSettled(entries.map(async entry=>({...entry,witness:await cachedNode.getPublicDataWitness(anchor,entry.leaf)})));
  const failed=reads.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  guard();
  // Flags are read only after the censorship window closes. Use the fetched
  // authenticated deadline to avoid a speculative extra read for immature posts.
  const mature=reads.map(result=>result.value).filter(entry=>entry.name==='post_flag_deadline'&&entry.witness?.leafPreimage.leaf.slot.equals(entry.leaf)&&entry.witness.leafPreimage.leaf.value.toBigInt()<=BigInt(header.globalVariables.timestamp));
  const childMature=hints[0]?.note.is_dummy||mature.some(entry=>entry.index===0);
  const flags=await Promise.allSettled(mature.filter(entry=>entry.index===0||childMature).map(async entry=>{
    const slot=artifact.storageLayout?.post_flagged?.slot;if(slot===undefined)throw Error('Missing ordinary post storage layout');
    const storageSlot=await deriveStorageSlotInMap(new Fr(BigInt(slot)),entry.post);
    const leaf=await computePublicDataTreeLeafSlot(board.address,storageSlot);guard();
    return cachedNode.getPublicDataWitness(anchor,leaf);
  }));
  const failure=flags.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  guard();
}
