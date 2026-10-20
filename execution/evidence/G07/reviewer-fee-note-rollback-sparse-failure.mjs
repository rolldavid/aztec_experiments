// Review-only diagnostic: actual installed SDK stores/synchronizer, synthetic chain and note values.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openTmpStore} from '@aztec-labs/kv-store/lmdb-v2';
import {L2TipsKVStore} from '@aztec-labs/kv-store/stores';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Note,NoteDao} from '@aztec-labs/stdlib/note';
import {BlockHeader} from '@aztec-labs/stdlib/tx';
import {Barretenberg,BarretenbergSync} from '@aztec-foundation/bb.js';
import {NoteStore} from '../../../node_modules/@aztec-labs/pxe/dest/storage/note_store/note_store.js';
import {AnchorBlockStore} from '../../../node_modules/@aztec-labs/pxe/dest/storage/anchor_block_store/anchor_block_store.js';
import {StagedWriteCoordinator} from '../../../node_modules/@aztec-labs/pxe/dest/storage/staged_write_coordinator.js';
import {BlockSynchronizer} from '../../../node_modules/@aztec-labs/pxe/dest/block_synchronizer/block_synchronizer.js';
const out={schema:1,label:'actual-installed-SDK-LMDB; synthetic chain/node/note data; no encrypted discovery or FPC execution',cases:[],cleanup:false};
const started=Date.now();
async function makeBlock(n,salt=0){const header=BlockHeader.empty();header.globalVariables.blockNumber=n;header.totalFees=new Fr(salt);const hash=await header.hash();return {header,hash,archive:header.lastArchive,checkpointNumber:n,indexWithinCheckpoint:0};}
const chain=[];try{
for(let n=0;n<=16;n++)chain.push(await makeBlock(n));
const contract=AztecAddress.fromFieldUnsafe(new Fr(101)),owner=AztecAddress.fromFieldUnsafe(new Fr(102));
for(const mode of ['intermediate','sparse','sparse-witnessed']){
 const db=await openTmpStore('reviewer-note-rollback',true,16384);let sync;
 try{
  const notes=new NoteStore(db),anchor=new AnchorBlockStore(db),tips=new L2TipsKVStore(db,'probe',chain[0].hash),writes=new StagedWriteCoordinator({kvStore:db,stagedStores:[notes]});
  let tip=0,missing=false;const prunes=[];let wipes=0;
  const id=n=>({number:n,hash:chain[n].hash.toString()});const tier=n=>({block:id(n),checkpoint:{number:n,hash:new Fr(n+1000).toString()}});
  const get=async q=>{if(missing)return undefined;if(q&&typeof q==='object'&&'number'in q)q=q.number;else if(q&&typeof q==='object'&&'hash'in q)q=q.hash;if(typeof q==='number')return q<=tip?chain[q]:undefined;return chain.slice(0,tip+1).find(b=>b.hash.toString()===q.toString());};
  const node={getChainTips:async()=>({proposed:id(tip),checkpointed:tier(tip),proven:tier(0),finalized:tier(0)}),getBlock:get,getBlockData:get,wipeCache(){},getBlocks(){throw Error('unexpected payload download');}};
  const rollbackable={async rollbackToBlock(n){prunes.push(n);await notes.rollbackToBlock(n);}};
  sync=new BlockSynchronizer(node,db,anchor,[rollbackable],tips,{wipe(){wipes++;}},{syncChainTip:'checkpointed'});
  const advance=async n=>{tip=n;await sync.sync();assert.equal((await anchor.getBlockHeader()).getBlockNumber(),n);};
  const add=async(n,value,key)=>NoteDao.random({contractAddress:contract,owner,note:new Note([new Fr(value)]),storageSlot:new Fr(1),siloedNullifier:new Fr(key),l2BlockNumber:n,l2BlockHash:chain[n].hash.toString()});
  const commit=async fn=>{const c=writes.begin();try{await fn(c);await writes.commit(c);}catch(e){writes.abort(c);throw e;}};
  const balance=async()=>{const c=writes.begin();try{return (await notes.getNotes({contractAddress:contract,scopes:[owner]},c)).reduce((s,n)=>s+n.note.items[0].toBigInt(),0n);}finally{writes.abort(c);}};
  await advance(10);const retained=await add(12,100,1001);await commit(c=>notes.addNotes([retained],owner,c));
  if(mode==='intermediate')await advance(12);
  if(mode==='sparse-witnessed')await tips.recordBlockHashes([id(12)]);
  await advance(15);const change=await add(15,80,1002),refund=await add(15,10,1003);
  await commit(async c=>{await notes.applyNullifiers([{data:retained.siloedNullifier,l2BlockNumber:15}],c);await notes.addNotes([change,refund],owner,c);});
  const before=await balance();assert.equal(before,90n);
  await advance(12);const after=await balance();assert.equal(after,mode==='sparse'?0n:100n);
  const beforeMissing=(await anchor.getBlockHeader()).getBlockNumber();tip=16;missing=true;await sync.sync();const afterMissing=(await anchor.getBlockHeader()).getBlockNumber();assert.equal(afterMissing,beforeMissing);
  missing=false;tip=12;
  out.cases.push({mode,before:Number(before),after:Number(after),prunes,wipes,anchorAfterRollback:12,missingHeaderSyncResolved:true,missingHeaderAnchorUnchanged:afterMissing===beforeMissing});
 }finally{await sync?.stop();await db.close();}
}
out.passed=true;
}catch(e){out.passed=false;out.failureType=e?.constructor?.name??'unknown';out.frames=String(e.stack).split('\n').slice(1,5);process.exitCode=1;}
finally{await Barretenberg.destroySingleton();await BarretenbergSync.destroySingleton();out.cleanup=true;out.elapsedMs=Date.now()-started;out.probeSha256=createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');await fs.writeFile(new URL('./reviewer-fee-note-rollback-result.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));}
