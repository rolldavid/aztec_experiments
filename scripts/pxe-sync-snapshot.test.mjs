// Actual pinned SDK synchronizer, stream, LMDB and note stores. Chain responses
// and NoteDao values are synthetic fixtures, NOT encrypted FPC recovery evidence.
import {parallelPxeAnchorSnapshot} from './pxe-sync-snapshot.mjs';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { openTmpStore } from '@aztec-labs/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec-labs/kv-store/stores';
import { Fr } from '@aztec-labs/foundation/curves/bn254';
import { BlockHash } from '@aztec-labs/stdlib/block';
import { AztecAddress } from '@aztec-labs/stdlib/aztec-address';
import { Note, NoteDao } from '@aztec-labs/stdlib/note';
import { BlockHeader } from '@aztec-labs/stdlib/tx';
import { Barretenberg, BarretenbergSync } from '@aztec-foundation/bb.js';
import { PXE_REORG_ANCHOR_PINS as PINS, inspectPxeReorgAnchor, patchPxeReorgAnchor } from './patch-pxe-reorg-anchor.mjs';

const repo = process.env.ROLLING_NATIVE_TEST_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installed = await realpath(join(repo, 'node_modules/@aztec-labs/pxe'));
const installedBefore = await inspectPxeReorgAnchor(installed);
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'rolling-pxe-anchor-')));
const sha = value => createHash('sha256').update(value).digest('hex');
const { withCache } = await import(pathToFileURL(join(installed,'dest/node/caching_aztec_node.js')));
const { NoteStore } = await import(pathToFileURL(join(installed, 'dest/storage/note_store/note_store.js')));
const { AnchorBlockStore } = await import(pathToFileURL(join(installed, 'dest/storage/anchor_block_store/anchor_block_store.js')));
const { StagedWriteCoordinator } = await import(pathToFileURL(join(installed, 'dest/storage/staged_write_coordinator.js')));
after(async () => {
  await Barretenberg.destroySingleton(); await BarretenbergSync.destroySingleton();
  assert.deepEqual(await inspectPxeReorgAnchor(installed), installedBefore);
  await rm(temporary, { recursive: true, force: true });
});
async function copyPackage(name) {
  const root = join(temporary, name);
  for (const pin of PINS) {
    const source = await readFile(join(repo, 'scripts/testing/fixtures/pxe-reorg-anchor', pin.path.split('/').at(-1)));
    assert.equal(sha(source), pin.before);
    await mkdir(dirname(join(root, pin.path)), { recursive: true });
    await writeFile(join(root, pin.path), source);
  }
  await cp(join(installed,'dest/block_synchronizer/block_stream_source.js'), join(root,'dest/block_synchronizer/block_stream_source.js'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await symlink(await realpath(join(repo,'node_modules')), join(root,'node_modules'));
  return root;
}
const patchedRoot=await copyPackage('patched');
await patchPxeReorgAnchor(patchedRoot);
await writeFile(join(patchedRoot,PINS[1].path),parallelPxeAnchorSnapshot(await readFile(join(patchedRoot,PINS[1].path),'utf8')));
const { BlockSynchronizer: Patched } = await import(pathToFileURL(join(patchedRoot,PINS[1].path)));
const quiet = { trace(){}, debug(){}, verbose(){}, info(){}, warn(){}, error(){}, getBindings(){return {};} };

async function block(n, salt=0) {
  const header=BlockHeader.empty(); header.globalVariables.blockNumber=n; header.totalFees=new Fr(salt);
  return { header, hash:await header.hash(), archive:header.lastArchive, checkpointNumber:n, indexWithinCheckpoint:0 };
}
async function fixture(t,{Constructor=Patched,tier='checkpointed',cached=false}={}) {
  const chain=await Promise.all(Array.from({length:17},(_,n)=>block(n)));
  const db=await openTmpStore('rolling-reorg-regression',true,16384);
  const notes=new NoteStore(db),anchor=new AnchorBlockStore(db),tips=new L2TipsKVStore(db,'fixture',chain[0].hash);
  const writes=new StagedWriteCoordinator({kvStore:db,stagedStores:[notes]});
  const other=db.openMap('other-rollbackable');
  const state={tip:0,selected:undefined,missing:false,prunes:[],wipes:0,nodeWipes:0,failRollback:false,reads:0,tipReads:0,hashReads:0,numberReads:0};
  const id=n=>({number:n,hash:chain[n].hash.toString()});
  const checkpoint=n=>({block:id(n),checkpoint:{number:n,hash:new Fr(n+1000).toString()}});
  const get=async q=> {
    state.reads++;
    if(typeof q==='number'||q&&typeof q==='object'&&'number'in q)state.numberReads++;else state.hashReads++;
    if(state.onRead) { const override=await state.onRead(q); if(override?.handled)return override.value; }
    if(state.missing)return undefined;
    if(q&&typeof q==='object'&&'number'in q)q=q.number;
    else if(q&&typeof q==='object'&&'hash'in q){ assert(q.hash instanceof BlockHash,'Native hash must be typed');q=q.hash; }
    return typeof q==='number' ? q<=state.tip?chain[q]:undefined : chain.slice(0,state.tip+1).find(b=>b.hash.toString()===q.toString());
  };
  const node={getChainTips:async()=> {
    state.tipReads++;
    const n=state.selected??state.tip;
    return {proposed:id(state.tip),checkpointed:checkpoint(state.checkpoint??(tier==='proposed'?state.tip:n)),
      proven:checkpoint(['proven','finalized'].includes(tier)?n:0),finalized:checkpoint(tier==='finalized'?n:0)};
  },getBlock:get,getBlockData:async q=>{const r=await get(q);return r?{...r,blockHash:r.hash}:undefined;},
  wipeCache(){state.nodeWipes++;},getBlocks(){throw Error('Unexpected payload download');}};
  const rollbackables=[{async rollbackToBlock(n){state.prunes.push(n);await notes.rollbackToBlock(n);}},
    {async rollbackToBlock(n){await other.set('value',n);if(state.failRollback)throw Error('PRIVATE_SENTINEL');}}];
  const sync=new Constructor(cached?withCache(node):node,db,anchor,rollbackables,tips,{wipe(){state.wipes++;}},{syncChainTip:tier});
  sync.log=quiet; sync.blockStream.log=quiet;
  t.after(async()=>{state.onRead=undefined;state.missing=false;await sync.stop();await db.close();});
  const owner=AztecAddress.fromFieldUnsafe(new Fr(102)),contract=AztecAddress.fromFieldUnsafe(new Fr(101));
  const add=async(n,value,key)=>NoteDao.random({contractAddress:contract,owner,note:new Note([new Fr(value)]),storageSlot:new Fr(1),siloedNullifier:new Fr(key),l2BlockNumber:n,l2BlockHash:chain[n].hash.toString()});
  const commit=async fn=>{const c=writes.begin();try{await fn(c);await writes.commit(c);}catch(e){writes.abort(c);throw e;}};
  const balance=async()=>{const c=writes.begin();try{return (await notes.getNotes({contractAddress:contract,scopes:[owner]},c)).reduce((sum,n)=>sum+n.note.items[0].toBigInt(),0n);}finally{writes.abort(c);}};
  const advance=async n=>{state.tip=n;await sync.sync();assert.equal((await anchor.getBlockHeader()).getBlockNumber(),state.selected??n);};
  const seed=async(intermediate=false)=>{
    await advance(10);const retained=await add(12,100,1001);await commit(c=>notes.addNotes([retained],owner,c));
    if(intermediate)await advance(12);
    await advance(15);const change=await add(15,80,1002),refund=await add(15,10,1003);
    await commit(async c=>{await notes.applyNullifiers([{data:retained.siloedNullifier,l2BlockNumber:15}],c);await notes.addNotes([change,refund],owner,c);});
    await other.set('value',15);assert.equal(await balance(),90n);
  };
  const snapshot=async()=>({header:(await anchor.getBlockHeader()).toBuffer().toString('hex'),tips:await tips.getL2Tips(),balance:await balance(),other:await other.getAsync('value')});
  return {db,notes,anchor,tips,sync,node,state,chain,id,advance,seed,snapshot,balance,other,commit,add,owner,contract};
}


test('exact native source pin rejects unknown build input',async()=>{
 assert.throws(()=>parallelPxeAnchorSnapshot('wrong'),/source mismatch/);
});
for(const tier of ['proposed','checkpointed','proven'])test(`parallel snapshot ${tier} advances and rolls back native stores`,async t=>{
 const f=await fixture(t,{tier});await f.seed(true);f.state.tip=12;await f.sync.sync();
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);assert.equal(await f.balance(),100n);
 assert.deepEqual(f.state.prunes,[12]);await f.sync.sync();assert.deepEqual(f.state.prunes,[12]);
});
for(const tier of ['proposed','checkpointed','proven'])test(`sparse ${tier} rollback remains conservative and selected anchor advances coherently`,async t=>{
 const f=await fixture(t,{tier});await f.seed();f.state.tip=12;await f.sync.sync();
 assert.deepEqual(f.state.prunes,[10]);assert.equal(await f.balance(),0n,'sparse history must not invent rediscovered notes');
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);assert.equal(await f.other.getAsync('value'),10);
 await f.sync.sync();assert.deepEqual(f.state.prunes,[10]);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
});
test('failed native rollback aborts note, anchor and acknowledgement changes atomically',async t=>{
 const f=await fixture(t);await f.seed();const before=await f.snapshot();f.state.tip=12;f.state.failRollback=true;
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_EVENT_FAILED/);assert.deepEqual(await f.snapshot(),before);
 f.state.failRollback=false;await f.sync.sync();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);assert.equal(await f.balance(),0n);
});
test('stable sync completes the exact captured source plan without a postcommit remote sweep',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tipReads=0;f.state.numberReads=0;
 const before=await f.snapshot();await f.sync.sync();
 assert.equal(f.state.tipReads,1);assert.equal(f.state.numberReads,0);
 assert.deepEqual(await f.snapshot(),before);
});
for(const corruption of ['missing','hash','header','tier'])test(`changed ${corruption} rejects before native acknowledgement`,async t=>{
 const f=await fixture(t,{tier:'proposed'});await f.advance(10);const before=await f.snapshot();f.state.tip=12;let reads=0;
 const get=f.node.getChainTips;
 if(corruption==='tier')f.node.getChainTips=async()=>{const tips=await get();if(++reads===2)tips.proposed=f.id(9);return tips;};
 else f.state.onRead=async q=>q===12?{handled:true,value:corruption==='missing'?undefined:corruption==='hash'?{...f.chain[12],hash:f.chain[9].hash}:{...f.chain[12],header:f.chain[9].header}}:undefined;
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);assert.deepEqual(await f.snapshot(),before);
});
test('parallel selected-tip failure drains still-running header before releasing operation',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;let release,started;const pending=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const get=f.node.getChainTips;let reads=0;
 f.node.getChainTips=async()=>{const tips=await get();if(++reads===2)throw Error('tip failed');return tips;};
 f.state.onRead=async q=>{if(typeof q==='number'){started();await pending;}};
 let settled=false;const run=f.sync.sync().finally(()=>settled=true);run.catch(()=>{});
 await entered;await new Promise(r=>setImmediate(r));assert.equal(settled,false);release();await assert.rejects(run,/PXE_REORG_ANCHOR_EVENT_FAILED/);
});

test('finalized snapshot advances; finalized rollback remains rejected',async t=>{const f=await fixture(t,{tier:'finalized'});await f.advance(10);await f.advance(12);f.state.tip=10;await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);});

for(const fork of [false,true])test(`higher selected tip during parallel reads ${fork?'rejects orphan':'retains canonical captured anchor'}`,async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;const old=f.chain[12],get=f.node.getChainTips;let reads=0,headers=0;
 f.node.getChainTips=async()=>{if(++reads===2){f.state.tip=13;if(fork)f.chain[12]=await block(12,99);}return get();};
 f.state.onRead=async q=>{if(typeof q==='number'&&q===12&&++headers===1)return {handled:true,value:old};};
 if(fork)await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);
 else {await f.sync.sync();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);}
 assert.equal(headers,2,'moving tip reauthenticates captured numeric header last');
});
test('higher selected tip must itself have a valid canonical header',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;const get=f.node.getChainTips;let reads=0;
 f.node.getChainTips=async()=>{if(++reads===2)f.state.tip=13;return get();};
 f.state.onRead=async q=>q===13?{handled:true,value:undefined}:undefined;
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);
});

test('source-plan public read overlaps native canonical checks and is returned only after both finish',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;
 const readGate=Promise.withResolvers(),canonicalGate=Promise.withResolvers(),started=Promise.withResolvers();let sawRead=false,sawCanonical=false,settled=false;
 f.state.onRead=async q=>{if(typeof q==='number'){sawCanonical=true;if(sawRead)started.resolve();await canonicalGate.promise;}};
 const pending=f.sync.syncWithAnchorRead(async anchor=>{assert.deepEqual(anchor,f.id(12));assert(Object.isFrozen(anchor));sawRead=true;if(sawCanonical)started.resolve();await readGate.promise;return 7;});
 pending.finally(()=>settled=true);await started.promise;canonicalGate.resolve();await new Promise(r=>setImmediate(r));assert.equal(settled,false);
 readGate.resolve();assert.deepEqual(await pending,{anchor:f.id(12),value:7});assert.equal(f.sync.anchorRead,undefined);
});
for(const failure of ['read','native'])test(`source-plan public read drains on ${failure} failure`,async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;const gate=Promise.withResolvers(),started=Promise.withResolvers();let settled=false;
 f.state.onRead=async q=>{if(typeof q==='number'){started.resolve();if(failure==='native')return {handled:true,value:undefined};await gate.promise;}};
 const pending=f.sync.syncWithAnchorRead(async()=>{if(failure==='read')throw Error('read failed');await gate.promise;return 9;});
 const rejected=assert.rejects(pending,failure==='read'?/read failed/:/PXE_REORG_ANCHOR_/).finally(()=>settled=true);
 await started.promise;await new Promise(r=>setImmediate(r));assert.equal(settled,false);gate.resolve();await rejected;assert.equal(f.sync.anchorRead,undefined);
});
test('source-plan public read is rebound to the native rollback destination',async t=>{
 const f=await fixture(t);await f.seed(true);f.state.tip=12;const seen=[];
 const result=await f.sync.syncWithAnchorRead(async anchor=>{seen.push(anchor);return anchor.number;});
 assert.deepEqual(result,{anchor:f.id(12),value:12});assert(seen.every(x=>x.hash===f.id(12).hash));assert.deepEqual(f.state.prunes,[12]);assert.equal(await f.balance(),100n);
});

test('replaced source-plan read failure is still reported after all reads drain',async t=>{
 const f=await fixture(t);await f.seed(true);f.state.tip=12;
 const second=Promise.withResolvers(),entered=Promise.withResolvers();let settled=false;const anchors=[];
 const pending=f.sync.syncWithAnchorRead(async anchor=>{
  anchors.push(anchor.number);
  if(anchor.number===12){f.state.tip=13;throw Error('discarded plan read failed');}
  entered.resolve();await second.promise;return anchor.number;
 });
 const rejected=assert.rejects(pending,/discarded plan read failed/).finally(()=>settled=true);
 await entered.promise;await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.deepEqual(anchors,[12,13]);second.resolve();await rejected;assert.equal(f.sync.anchorRead,undefined);
});


for (const failure of ['none','current','selected','both']) test(`advancing anchor checks overlap and drain before writes: ${failure}`, {timeout: 10000}, async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;
 const currentGate=Promise.withResolvers(),selectedGate=Promise.withResolvers(),bothStarted=Promise.withResolvers();
 const header=f.sync.checkedHeader.bind(f.sync),selected=f.sync.checkedSelectedAnchor.bind(f.sync);
 let currentStarted=false,selectedStarted=false,selectedCalls=0,settled=false,writes=0;
 const maybeStarted=()=>{if(currentStarted&&selectedStarted)bothStarted.resolve();};
 f.sync.checkedHeader=async id=>{
  if(id.number===10){currentStarted=true;maybeStarted();await currentGate.promise;if(failure==='current'||failure==='both')throw Error('current header failed');}
  return header(id);
 };
 f.sync.checkedSelectedAnchor=async()=>{
  if(++selectedCalls===1){selectedStarted=true;maybeStarted();await selectedGate.promise;if(failure==='selected'||failure==='both')throw Error('selected anchor failed');}
  return selected();
 };
 const event=f.sync.doHandleBlockStreamEvent.bind(f.sync);let eventError;
 f.sync.doHandleBlockStreamEvent=async e=>{try{return await event(e);}catch(error){eventError=error;throw error;}};
 const update=f.sync.updateAnchorBlockHeader.bind(f.sync);
 f.sync.updateAnchorBlockHeader=async h=>{writes++;return update(h);};
 const before=await f.snapshot(),beforeWipes=f.state.wipes,beforeNodeWipes=f.state.nodeWipes;
 const run=f.sync.sync();run.then(()=>settled=true,()=>settled=true);
 await bothStarted.promise;
 assert.equal(writes,0);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),10);
 // Release the failing side first. A rejection must not leave the sibling read
 // running after this operation gives up ownership of the native stores.
 if(failure==='selected'){selectedGate.resolve();}else{currentGate.resolve();}
 await new Promise(r=>setImmediate(r));
 assert.equal(settled,false);assert.equal(writes,0);assert.equal(f.state.wipes,beforeWipes);assert.equal(f.state.nodeWipes,beforeNodeWipes);
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),10);
 currentGate.resolve();selectedGate.resolve();
 if(failure==='none'){
  await run;assert.equal(writes,1);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
 }else{
  await assert.rejects(run,/PXE_REORG_ANCHOR_EVENT_FAILED/);
  assert.match(eventError.message,failure==='selected'?/selected anchor failed/:/current header failed/);
  assert.equal(writes,0);assert.equal((await f.anchor.getBlockHeader()).toBuffer().toString('hex'),before.header);
  assert.equal(await f.balance(),before.balance);assert.equal(await f.other.getAsync('value'),before.other);
  assert.deepEqual((await f.tips.getL2Tips()).checkpointed,before.tips.checkpointed);
 }
});

test('advancing source snapshot validates before commit then checks exact local completion',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tip=12;
 const checked=f.sync.checkedSelectedAnchor.bind(f.sync),update=f.sync.updateAnchorBlockHeader.bind(f.sync);
 let selectedReads=0,commits=0;
 f.sync.checkedSelectedAnchor=async()=>{selectedReads++;return checked();};
 f.sync.updateAnchorBlockHeader=async header=>{assert.equal(selectedReads,1);commits++;return update(header);};
 await f.sync.sync();assert.equal(commits,1);assert.equal(selectedReads,1);
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
});

test('fork after commit preserves a coherent completed plan; next native sync retracts orphan notes and spends',async t=>{
 const f=await fixture(t,{tier:'proposed',cached:true});await f.seed(true);f.state.tip=16;
 const old16=f.id(16),orphanNote=await f.add(16,7,1004);
 const update=f.sync.updateAnchorBlockHeader.bind(f.sync);let forked=false;
 f.sync.updateAnchorBlockHeader=async header=>{await update(header);if(!forked){forked=true;f.chain[16]=await block(16,999);}};
 await f.sync.sync();
 assert.equal((await (await f.anchor.getBlockHeader()).hash()).toString(),old16.hash);
 assert.deepEqual((await f.tips.getL2Tips()).proposed,old16,'local anchor and acknowledgement still name the completed source plan');
 await f.commit(async c=>{
  const available=await f.notes.getNotes({contractAddress:f.contract,scopes:[f.owner]},c);
  const previous=available.find(note=>note.note.items[0].toBigInt()===80n);assert(previous);
  await f.notes.applyNullifiers([{data:previous.siloedNullifier,l2BlockNumber:16}],c);
  await f.notes.addNotes([orphanNote],f.owner,c);
 });
 assert.equal(await f.balance(),17n);
 await f.sync.sync();
 assert.deepEqual(f.state.prunes,[15]);assert.equal(await f.balance(),90n,'rollback restores the spend and removes the orphan note');
 assert.equal((await (await f.anchor.getBlockHeader()).hash()).toString(),f.id(16).hash);
 assert.deepEqual((await f.tips.getL2Tips()).proposed,f.id(16));
});

for(const corrupt of ['anchor','proposed','checkpointed','proven','finalized'])test(`completion still rejects missing local ${corrupt} acknowledgement`,async t=>{
 const f=await fixture(t);await f.advance(10);
 if(corrupt==='anchor')f.anchor.getBlockHeader=async()=>f.chain[9].header;
 else {const get=f.tips.getL2Tips.bind(f.tips);let calls=0;f.tips.getL2Tips=async()=>{const tips=await get();if(++calls>1){if(corrupt==='proposed')tips.proposed=f.id(9);else tips[corrupt].block=f.id(9);}return tips;};}
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_INCOMPLETE/);
});
for(const source of ['tips','block'])test(`swallowed native ${source} source failure remains a failed sync without postcommit polling`,async t=>{
 const f=await fixture(t);await f.advance(10);const before=await f.snapshot();
 if(source==='tips')f.node.getChainTips=async()=>{throw Error('source failed');};
 else {f.state.tip=12;f.state.onRead=async()=>{throw Error('source failed');};}
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_EVENT_FAILED/);
 assert.deepEqual(await f.snapshot(),before);
});

test('proposed private state remains usable across note spends while checkpoint lags, then native rollback retracts descendants',async t=>{
 const f=await fixture(t,{tier:'proposed',cached:true});f.state.checkpoint=10;await f.seed(true);
 assert.equal((await f.tips.getL2Tips()).checkpointed.block.number,10);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),15);assert.equal(await f.balance(),90n);
 await f.advance(16);await f.commit(async c=>{
  const available=await f.notes.getNotes({contractAddress:f.contract,scopes:[f.owner]},c);
  const previous=available.find(note=>note.note.items[0].toBigInt()===80n);assert(previous,'native store exposes included change without checkpoint');
  await f.notes.applyNullifiers([{data:previous.siloedNullifier,l2BlockNumber:16}],c);
  await f.notes.addNotes([await f.add(16,70,1004)],f.owner,c);
 });
 assert.equal(await f.balance(),80n);assert.equal((await f.tips.getL2Tips()).checkpointed.block.number,10);
 f.state.tip=12;await f.sync.sync();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);assert.equal(await f.balance(),100n,'native rollback removes both descendant change and spends');
 assert.deepEqual(f.state.prunes,[12]);assert.equal((await f.tips.getL2Tips()).checkpointed.block.number,10);
});

for(const destination of ['advance','rollback'])test(`owned public prefetch survives ${destination} cache maintenance without moving private writes`,async t=>{
 const f=await fixture(t,{tier:'proposed',cached:true});await f.seed(true);
 f.state.tip=destination==='advance'?16:12;
 let calls=0;f.node.findLeavesIndexes=async(anchor,tree,values)=>{calls++;assert(anchor.hash instanceof BlockHash);return values.map(()=>undefined);};
 const leaf=new Fr(717),before=f.state.wipes;
 const read=async selected=>{assert.equal(f.state.wipes,before,'prefetch starts before private anchor/cache mutation');const anchor={number:selected.number,hash:BlockHash.fromString(selected.hash)};return f.sync.node.findLeavesIndexes(anchor,0,[leaf]);};
 const result=await f.sync.syncWithAnchorRead(read,{warmNodeCache:true});
 const header=await f.anchor.getBlockHeader();assert.equal(header.getBlockNumber(),f.state.tip);assert(f.state.wipes>before,'normal contract sync invalidation retained');
 await f.sync.node.findLeavesIndexes(await header.toBlockParameter(),0,[leaf]);assert.equal(calls,1,'same typed native cache key survives anchor update');
 assert.equal(await f.balance(),destination==='rollback'?100n:90n);assert.deepEqual(result.anchor,f.id(f.state.tip));
 await f.sync.syncWithAnchorRead(async selected=>f.sync.node.findLeavesIndexes({number:selected.number,hash:BlockHash.fromString(selected.hash)},0,[leaf]),{warmNodeCache:true});assert.equal(calls,2,'next owned sync still bounds cache memory');
});
test('warm public sync keeps canonical fork rejection and drains the held sibling',async t=>{
 const f=await fixture(t,{tier:'proposed',cached:true});await f.advance(10);f.state.tip=12;
 const gate=Promise.withResolvers(),started=Promise.withResolvers();let settled=false;
 const pending=f.sync.syncWithAnchorRead(async()=>{started.resolve();await gate.promise;},{warmNodeCache:true});
 const rejected=assert.rejects(pending,/PXE_REORG_ANCHOR_/).finally(()=>settled=true);
 await started.promise;f.state.onRead=async q=>typeof q==='number'&&q===12?{handled:true,value:undefined}:undefined;
 await new Promise(r=>setImmediate(r));assert.equal(settled,false);gate.resolve();await rejected;assert.equal(f.sync.anchorRead,undefined);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),10);
});

test('native sync diagnostics are opt-in and retain prewrite and moving-tier checks without postwrite polling',async t=>{
 const key=Symbol.for('rolling.proof.profile'),prior=globalThis[key];t.after(()=>{if(prior===undefined)delete globalThis[key];else globalThis[key]=prior;});
 const clear=()=>{for(const x of performance.getEntriesByType('measure'))if(x.name.startsWith('rolling.proof.native.phase.sync-'))performance.clearMeasures(x.name);};
 const names=()=>performance.getEntriesByType('measure').filter(x=>x.name.startsWith('rolling.proof.native.phase.sync-'));
 const f=await fixture(t,{tier:'proposed'});clear();globalThis[key]=false;await f.advance(10);assert.equal(names().length,0);
 globalThis[key]=true;f.state.tip=12;await f.sync.sync();
 for(const name of ['source-snapshot','stream','prewrite-advance','prewrite-snapshot'])assert(names().some(x=>x.name==='rolling.proof.native.phase.sync-'+name),name);
 assert(names().every(x=>Number.isFinite(x.duration)&&x.duration>=0&&x.detail===null));
 assert(!names().some(x=>x.name.includes('postwrite')));
 clear();f.state.tip=13;const get=f.node.getChainTips;let reads=0;f.node.getChainTips=async()=>{if(++reads===2)f.state.tip=14;return get();};
 await f.sync.sync();
 for(const name of ['prewrite-moving-head','prewrite-recheck'])assert(names().some(x=>x.name==='rolling.proof.native.phase.sync-'+name),name);
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),13,'diagnostics do not change the source-plan anchor');
});

// Synthetic chain data with native archive helpers; no live latency claim.
const {ARCHIVE_HEIGHT,DomainSeparator,GENESIS_BLOCK_HEADER_HASH,GENESIS_ARCHIVE_ROOT}=await import('@aztec-labs/constants');
const {MembershipWitness,computeRootFromSiblingPath,makePoseidonMerkleHash,MerkleTreeCalculator}=await import('@aztec-labs/foundation/trees');
const archiveHash=makePoseidonMerkleHash(DomainSeparator.MERKLE_HASH);
async function snapshotAdvanceFixture(t){
 const f=await fixture(t,{tier:'proposed'});await f.advance(10);f.state.tip=12;
 const path=Array.from({length:ARCHIVE_HEIGHT},(_,i)=>new Fr(i+999));
 const witness=new MembershipWitness(ARCHIVE_HEIGHT,10n,path);
 const root=await computeRootFromSiblingPath(f.chain[10].hash.toBuffer(),path.map(x=>x.toBuffer()),10,archiveHash);
 f.chain[12].header.lastArchive.root=Fr.fromBuffer(root);f.chain[12].header.lastArchive.nextAvailableLeafIndex=12;
 f.chain[12].hash=await f.chain[12].header.recomputeHash();f.state.witnessReads=0;
 f.node.getBlockHashMembershipWitness=async(reference,hash)=>{f.state.witnessReads++;assert.equal(reference.number,12);assert.equal(reference.hash.toString(),f.id(12).hash);assert.equal(hash.toString(),f.id(10).hash);return witness;};
 f.state.tipReads=0;f.state.numberReads=0;f.state.hashReads=0;
 return {...f,witness,run:()=>f.sync.syncWithAnchorRead(async selected=>selected,{snapshotAncestry:true})};
}
test('native archive hasher matches canonical genesis root',async()=>{
 const tree=await MerkleTreeCalculator.create(ARCHIVE_HEIGHT,Buffer.alloc(32),archiveHash);
 assert((await tree.computeTreeRoot([new Fr(GENESIS_BLOCK_HEADER_HASH).toBuffer()])).equals(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer()));
});
test('readonly snapshot advance verifies exact-target ancestry without later freshness wave',async t=>{
 const f=await snapshotAdvanceFixture(t);await f.run();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
 assert.equal(f.state.tipReads,1);assert.equal(f.state.numberReads,1,'native ancestry walk only');assert.equal(f.state.hashReads,1,'native selected header only');assert.equal(f.state.witnessReads,1);
 await f.run();assert.equal(f.state.witnessReads,1,'same anchor requires no ancestry request');
});
for(const defect of ['absent','index','path','current','root'])test('readonly ancestry rejects '+defect+' before anchor write',async t=>{
 const f=await snapshotAdvanceFixture(t),before=await f.snapshot();
 if(defect==='absent')f.node.getBlockHashMembershipWitness=async()=>undefined;
 if(defect==='index')f.witness.leafIndex=9n;
 if(defect==='path')f.witness.siblingPath[0]=new Fr(2);
 if(defect==='current')f.node.getBlockHashMembershipWitness=async()=>{await f.anchor.setHeader(f.chain[9].header);return f.witness;};
 if(defect==='root'){f.chain[12].header.lastArchive.root=new Fr(17);f.chain[12].hash=await f.chain[12].header.recomputeHash();}
 await assert.rejects(f.run(),/PXE_REORG_/);
 if(defect!=='current')assert.deepEqual(await f.snapshot(),before);else assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),9);
});
test('readonly ancestry read is drained on public prefetch failure',async t=>{
 const f=await snapshotAdvanceFixture(t),gate=Promise.withResolvers(),entered=Promise.withResolvers();let finished=false;
 const native=f.node.getBlockHashMembershipWitness;f.node.getBlockHashMembershipWitness=async(...args)=>{entered.resolve();await gate.promise;return native(...args);};
 const run=f.sync.syncWithAnchorRead(async()=>{throw Error('prefetch failed');},{snapshotAncestry:true});
 const rejected=assert.rejects(run,/prefetch failed/).finally(()=>finished=true);await entered.promise;await new Promise(r=>setImmediate(r));assert.equal(finished,false);gate.resolve();await rejected;assert.equal(f.sync.anchorRead,undefined);
});
test('readonly snapshot retains native rollback for a real lower-tip fork',async t=>{
 const f=await fixture(t,{tier:'proposed'});await f.seed(true);f.state.tip=12;
 f.node.getBlockHashMembershipWitness=async()=>assert.fail('lower tip needs rollback, not advance proof');
 await f.sync.syncWithAnchorRead(async()=>7,{snapshotAncestry:true});assert.deepEqual(f.state.prunes,[12]);assert.equal(await f.balance(),100n);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
});
test('readonly snapshot retains native rollback for a same-height fork',async t=>{
 const f=await fixture(t,{tier:'proposed'});await f.seed(true);f.chain[15]=await block(15,999);
 f.node.getBlockHashMembershipWitness=async()=>assert.fail('same-height fork needs rollback, not advance proof');
 await f.sync.syncWithAnchorRead(async()=>7,{snapshotAncestry:true});assert.deepEqual(f.state.prunes,[12]);assert.equal(await f.balance(),100n);assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),15);
});
for(const tier of ['checkpointed','proven','finalized'])test('readonly snapshot advance cannot override '+tier+' tier policy',async t=>{
 const f=await fixture(t,{tier});await assert.rejects(f.sync.syncWithAnchorRead(async()=>7,{snapshotAncestry:true}),/PXE_ANCHOR_READ_BUSY/);
});

test('captured readonly snapshot survives later fork and next ordinary sync rolls it back',async t=>{
 const f=await snapshotAdvanceFixture(t),gate=Promise.withResolvers(),entered=Promise.withResolvers(),oldTarget=f.id(12);
 const witness=f.node.getBlockHashMembershipWitness;f.node.getBlockHashMembershipWitness=async(...args)=>{const value=await witness(...args);await gate.promise;return value;};
 const selected=f.sync.readonlySnapshotTarget.bind(f.sync);f.sync.readonlySnapshotTarget=async(...args)=>{entered.resolve();return selected(...args);};
 const work=f.run();await entered.promise;f.chain[12]=await block(12,999);gate.resolve();await work;
 assert.equal((await(await f.anchor.getBlockHeader()).hash()).toString(),oldTarget.hash,'result retains exact captured fork');
 assert.equal(f.sync.anchorRead,undefined);await f.sync.sync();
 assert.deepEqual(f.state.prunes,[10]);assert.equal((await(await f.anchor.getBlockHeader()).hash()).toString(),f.id(12).hash,'next ordinary sync has no snapshot permission');
});
test('readonly ancestry detaches witness before a later provider mutation',async t=>{
 const f=await snapshotAdvanceFixture(t),gate=Promise.withResolvers(),entered=Promise.withResolvers();
 const selected=f.sync.readonlySnapshotTarget.bind(f.sync);f.sync.readonlySnapshotTarget=async(...args)=>{entered.resolve();await gate.promise;return selected(...args);};
 const work=f.run();await entered.promise;f.witness.leafIndex=9n;f.witness.siblingPath[0]=new Fr(33);gate.resolve();await work;
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
});
test('ancestry RPC rejection drains the independent public source read',async t=>{
 const f=await snapshotAdvanceFixture(t),gate=Promise.withResolvers(),entered=Promise.withResolvers();let finished=false;
 f.node.getBlockHashMembershipWitness=async()=>{throw Error('witness failed');};
 const work=f.sync.syncWithAnchorRead(async()=>{entered.resolve();await gate.promise;return 1;},{snapshotAncestry:true});
 const rejected=assert.rejects(work,/PXE_REORG_/).finally(()=>finished=true);await entered.promise;await new Promise(r=>setImmediate(r));assert.equal(finished,false);gate.resolve();await rejected;assert.equal(f.sync.anchorRead,undefined);
});

// Actual native NoteStore, staged commits, nullifier rollback and tips stream.
// The chain/header data is synthetic; this is not a real-network acceptance claim.
for(const failRollback of [false,true])test('captured action snapshot rolls back committed orphan notes and nullifiers; rollback failure='+failRollback,async t=>{
 const f=await snapshotAdvanceFixture(t);
 const retained=await f.add(10,100,7001);
 await f.commit(c=>f.notes.addNotes([retained],f.owner,c));
 assert.equal(await f.balance(),100n);
 await f.run();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);
 // Model successful native discovery after this snapshot: an old note is spent
 // at the captured height and private change is recorded on that same branch.
 const change=await f.add(12,80,7002);
 await f.commit(async c=>{
  await f.notes.applyNullifiers([{data:retained.siloedNullifier,l2BlockNumber:12}],c);
  await f.notes.addNotes([change],f.owner,c);
 });
 assert.equal(await f.balance(),80n);
 const before=await f.snapshot(),wipes=f.state.wipes,nodeWipes=f.state.nodeWipes;
 f.chain[12]=await block(12,999);f.state.failRollback=failRollback;
 // Same-height fork must use native prune, not an advance witness shortcut.
 f.node.getBlockHashMembershipWitness=async()=>assert.fail('fork requires native rollback');
 const run=()=>f.sync.syncWithAnchorRead(()=>undefined,{snapshotAncestry:true});
 if(failRollback){
  await assert.rejects(run(),/PXE_REORG_/);
  assert.deepEqual(await f.snapshot(),before,'failed rollback changes neither notes, emissions, anchor nor tips');
  f.state.failRollback=false;
 }
 await run();
 assert.equal(await f.balance(),100n,'orphan nullifier emission is removed and the retained note becomes active again');
 let live,orphan;
 await f.commit(async c=>{
  const filter={contractAddress:f.contract,scopes:[f.owner]};
  live=await f.notes.getNotes(filter,c);
  orphan=await f.notes.getNotes({...filter,siloedNullifier:change.siloedNullifier},c);
 });
 assert.deepEqual(live.map(note=>note.siloedNullifier.toString()),[retained.siloedNullifier.toString()]);
 assert.deepEqual(orphan,[],'orphan change is deleted, not merely hidden by a balance total');
 assert.equal(f.state.prunes.at(-1),10);assert(f.state.wipes>wipes);assert(f.state.nodeWipes>nodeWipes);
 assert.equal((await(await f.anchor.getBlockHeader()).hash()).toString(),f.id(12).hash);
 assert.deepEqual((await f.tips.getL2Tips()).proposed,f.id(12));
 assert.equal(f.sync.anchorRead,undefined);
 const prunes=f.state.prunes.length;await run();assert.equal(f.state.prunes.length,prunes);assert.equal(await f.balance(),100n);
});
