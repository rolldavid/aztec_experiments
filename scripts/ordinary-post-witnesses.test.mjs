import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BlockHash} from '@aztec-labs/stdlib/block';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {computePublicDataTreeLeafSlot,deriveStorageSlotInMap} from '@aztec-labs/stdlib/hash';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {withCache} from '../node_modules/@aztec-labs/pxe/dest/node/caching_aztec_node.js';
import {ORDINARY_POST_GAS_PROFILE} from '../shared/ordinary-post-fees.mjs';
after(()=>BarretenbergSync.destroySingleton());
const source=fs.readFileSync(new URL('../shared/ordinary-post-witnesses.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
async function fixture({mature=true}={}){
 const board={address:AztecAddress.fromFieldUnsafe(new Fr(2)),currentContractClassId:Fr.fromString(ORDINARY_POST_GAS_PROFILE.boardClassId)};
 const artifact={storageLayout:Object.fromEntries(['post_exists','post_time','post_flag_deadline','post_flagged'].map((name,i)=>[name,{slot:i+1}]))};
 const calls=[],pending=[];let rejectFirst=false,hold=false,anchor={number:1,hash:BlockHash.fromString('0x'+'1'.padStart(64,'0'))};
 const deadline=await computePublicDataTreeLeafSlot(board.address,await deriveStorageSlotInMap(new Fr(3),new Fr(9)));
 const node={getPublicDataWitness:async(at,leaf)=>{calls.push({at,leaf});if(rejectFirst&&calls.length===1)throw Error("witness unavailable");if(hold)await new Promise(resolve=>pending.push(resolve));return {leafPreimage:{leaf:{slot:leaf,value:leaf.equals(deadline)?new Fr(mature?50:150):Fr.ONE}}};}};
 const pxe={node:withCache(node),getSyncedBlockHeader:async()=>({globalVariables:{timestamp:100n},toBlockParameter:async()=>anchor})},wallet={pxe};
 const context=vm.createContext({Fr,computePublicDataTreeLeafSlot,deriveStorageSlotInMap,ORDINARY_POST_GAS_PROFILE,isPrivatePXEForNode:(value,route)=>value===pxe&&route===node});vm.runInContext(source,context);
 const args={wallet,node,board,artifact,hints:[{note:{post_id:'9',is_dummy:false}},null]};
 return {run:()=>context.prefetchOrdinaryPostWitnesses(args),args,calls,pending,hold:()=>{hold=true;},rejectFirst:()=>{rejectFirst=true;},advance:()=>{anchor={number:2,hash:BlockHash.fromString('0x'+'2'.padStart(64,'0'))};}};
}
test('independent history witnesses start together; native anchored cache serves later reads',async()=>{
 const f=await fixture();f.hold();const work=f.run();
 for(let i=0;i<10&&f.pending.length<3;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.pending.length,3);f.pending.splice(0).forEach(resolve=>resolve());
 for(let i=0;i<10&&f.pending.length<1;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.pending.length,1);f.pending.splice(0).forEach(resolve=>resolve());await work;
 assert.equal(f.calls.length,4);await f.run();assert.equal(f.calls.length,4);
});
test('new anchor is fetched afresh; immature history does not fetch flags',async()=>{
 const f=await fixture({mature:false});await f.run();assert.equal(f.calls.length,3);await f.run();assert.equal(f.calls.length,3);
 f.advance();await f.run();assert.equal(f.calls.length,6);assert.notDeepEqual(f.calls[0].at,f.calls[3].at);
});
test('dummy and absent hints do no network work; foreign PXE route is rejected',async()=>{
 const f=await fixture();f.args.hints=[{note:{is_dummy:true}},null];await f.run();assert.equal(f.calls.length,0);
 f.args.node={};await assert.rejects(f.run(),{code:'BB_POST_FEE_PROFILE_MISMATCH'});
});

test('a failed witness drains other in-flight reads before rejecting',async()=>{
 const f=await fixture();f.hold();f.rejectFirst();let settled=false;
 const work=f.run().finally(()=>{settled=true;});const rejection=assert.rejects(work,/witness unavailable/);
 for(let i=0;i<20&&f.pending.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.pending.length,2);assert.equal(settled,false);
 f.pending.splice(0).forEach(resolve=>resolve());await rejection;assert.equal(f.calls.length,3);
});
test('changing the node while the anchor is pending starts no foreign reads',async()=>{
 const f=await fixture();let release;
 const header=f.args.wallet.pxe.getSyncedBlockHeader;
 f.args.wallet.pxe.getSyncedBlockHeader=()=>new Promise(resolve=>{release=async()=>resolve(await header());});
 const work=f.run();const rejection=assert.rejects(work,{code:'ROLLING_CONTEXT_CHANGED'});
 f.args.wallet.pxe.node={getPublicDataWitness:()=>{throw Error('foreign read');}};
 await release();await rejection;assert.equal(f.calls.length,0);
});
test('an immature child prevents speculative grandchild flag reads',async()=>{
 const f=await fixture({mature:false});f.args.hints[1]={note:{post_id:'10',is_dummy:false}};
 await f.run();assert.equal(f.calls.length,6);
});
