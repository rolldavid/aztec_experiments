import {isPrivatePXEForNode} from './private-pxe.mjs';
import {ORDINARY_POST_GAS_PROFILE} from './ordinary-post-fees.mjs';

// Qualified native preparation shares only the existing anchor cache. It reads
// existing native immutable facts, without creating or retaining any new facts.
export async function prefetchBoardClaimWitnesses({wallet,node,board,artifact}) {
  const pxe=wallet?.pxe,cachedNode=pxe?.node;
  const guard=()=>{if(wallet?.pxe!==pxe||pxe?.node!==cachedNode||!isPrivatePXEForNode(pxe,node))throw Object.assign(Error('Board claim context changed'),{code:'ROLLING_CONTEXT_CHANGED'});};
  guard();
  if(board?.currentContractClassId?.toString()!==ORDINARY_POST_GAS_PROFILE.boardClassId||artifact?.name!=='RollingBoard'||
    BigInt(artifact.storageLayout?.portal_address?.slot??-1)!==1n||BigInt(artifact.storageLayout?.config?.slot??-1)!==3n||BigInt(artifact.storageLayout?.deposits?.slot??-1)!==14n)
    throw Object.assign(Error('Invalid Board claim layout'),{code:'ROLLING_ABI_MISMATCH'});
  const address=board.address,anchor=await (await pxe.getSyncedBlockHeader()).toBlockParameter();guard();
  await pxe.prefetchBoardClaimWitnesses(address);guard();
  const current=await (await pxe.getSyncedBlockHeader()).toBlockParameter();guard();
  if(current.hash.toString()!==anchor.hash.toString())throw Object.assign(Error('Board claim anchor changed'),{code:'ROLLING_CONTEXT_CHANGED'});
}
