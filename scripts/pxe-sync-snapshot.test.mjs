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

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    return {proposed:id(state.tip),checkpointed:checkpoint(tier==='proposed'?state.tip:n),
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
  return {db,notes,anchor,tips,sync,node,state,chain,id,advance,seed,snapshot,balance,other};
}


test('exact native source pin rejects unknown build input',async()=>{
 assert.throws(()=>parallelPxeAnchorSnapshot('wrong'),/source mismatch/);
});
for(const tier of ['proposed','checkpointed','proven'])test(`parallel snapshot ${tier} advances and rolls back native stores`,async t=>{
 const f=await fixture(t,{tier});await f.seed(true);f.state.tip=12;await f.sync.sync();
 assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),12);assert.equal(await f.balance(),100n);
 assert.deepEqual(f.state.prunes,[12]);await f.sync.sync();assert.deepEqual(f.state.prunes,[12]);
});
test('stable sync is one source-tip phase then concurrent numeric header and tier reads',async t=>{
 const f=await fixture(t);await f.advance(10);f.state.tipReads=0;f.state.numberReads=0;
 let release;const blocked=new Promise(resolve=>release=resolve),get=f.node.getChainTips;let observed=false;
 f.node.getChainTips=async()=>{const tips=await get();if(f.state.tipReads===2){await blocked;}return tips;};
 f.state.onRead=async q=>{if(typeof q==='number'){observed=true;release();}};
 await f.sync.sync();assert(observed);assert.equal(f.state.tipReads,2);assert.equal(f.state.numberReads,1);
});
for(const corruption of ['missing','hash','header','tier'])test(`changed ${corruption} rejects before native acknowledgement`,async t=>{
 const f=await fixture(t);await f.advance(10);const before=await f.snapshot();
 const get=f.node.getChainTips;
 if(corruption==='tier')f.node.getChainTips=async()=>{const tips=await get();if(f.state.tipReads>2)tips.checkpointed.block=f.id(9);return tips;};
 else f.state.onRead=async q=>typeof q==='number'?{handled:true,value:corruption==='missing'?undefined:corruption==='hash'?{...f.chain[10],hash:f.chain[9].hash}:{...f.chain[10],header:f.chain[9].header}}:undefined;
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);assert.deepEqual(await f.snapshot(),before);
});
test('parallel selected-tip failure drains still-running header before releasing operation',async t=>{
 const f=await fixture(t);await f.advance(10);let release,started;const pending=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const get=f.node.getChainTips;let reads=0;
 f.node.getChainTips=async()=>{const tips=await get();if(++reads===2)throw Error('tip failed');return tips;};
 f.state.onRead=async q=>{if(typeof q==='number'){started();await pending;}};
 let settled=false;const run=f.sync.sync().finally(()=>settled=true);run.catch(()=>{});
 await entered;await new Promise(r=>setImmediate(r));assert.equal(settled,false);release();await assert.rejects(run,/tip failed/);
});

test('finalized snapshot advances; finalized rollback remains rejected',async t=>{const f=await fixture(t,{tier:'finalized'});await f.advance(10);await f.advance(12);f.state.tip=10;await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);});

for(const fork of [false,true])test(`higher selected tip during parallel reads ${fork?'rejects orphan':'retains canonical captured anchor'}`,async t=>{
 const f=await fixture(t);await f.advance(10);const old=f.chain[10],get=f.node.getChainTips;let reads=0,headers=0;
 f.node.getChainTips=async()=>{if(++reads===2){f.state.tip=12;if(fork)f.chain[10]=await block(10,99);}return get();};
 f.state.onRead=async q=>{if(typeof q==='number'&&q===10&&++headers===1)return {handled:true,value:old};};
 if(fork)await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);
 else {await f.sync.sync();assert.equal((await f.anchor.getBlockHeader()).getBlockNumber(),10);}
 assert.equal(headers,2,'moving tip reauthenticates captured numeric header last');
});
test('higher selected tip must itself have a valid canonical header',async t=>{
 const f=await fixture(t);await f.advance(10);const get=f.node.getChainTips;let reads=0;
 f.node.getChainTips=async()=>{if(++reads===2)f.state.tip=12;return get();};
 f.state.onRead=async q=>q===12?{handled:true,value:undefined}:undefined;
 await assert.rejects(f.sync.sync(),/PXE_REORG_ANCHOR_/);
});

test('source-plan public read overlaps native canonical checks and is returned only after both finish',async t=>{
 const f=await fixture(t);await f.advance(10);
 const readGate=Promise.withResolvers(),canonicalGate=Promise.withResolvers(),started=Promise.withResolvers();let sawRead=false,sawCanonical=false,settled=false;
 f.state.onRead=async q=>{if(typeof q==='number'){sawCanonical=true;if(sawRead)started.resolve();await canonicalGate.promise;}};
 const pending=f.sync.syncWithAnchorRead(async anchor=>{assert.deepEqual(anchor,f.id(10));assert(Object.isFrozen(anchor));sawRead=true;if(sawCanonical)started.resolve();await readGate.promise;return 7;});
 pending.finally(()=>settled=true);await started.promise;canonicalGate.resolve();await new Promise(r=>setImmediate(r));assert.equal(settled,false);
 readGate.resolve();assert.deepEqual(await pending,{anchor:f.id(10),value:7});assert.equal(f.sync.anchorRead,undefined);
});
for(const failure of ['read','native'])test(`source-plan public read drains on ${failure} failure`,async t=>{
 const f=await fixture(t);await f.advance(10);const gate=Promise.withResolvers(),started=Promise.withResolvers();let settled=false;
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
