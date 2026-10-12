import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceRollingL1Suffix,validatePreferenceReorgBoundary} from './rolling-preference-reorg.mjs';
// Labelled control fixtures only. These are not actual Anvil/PXE rollback evidence.
const h=n=>'0x'+n.toString(16).padStart(64,'0');
function fixture(){
 const retained={l1:{number:10,hash:h(10)},l2:{number:20,hash:h(20)},checkpoint:5};
 const state={l1Tip:{number:15,hash:h(15)},l1Retained:retained.l1,l2Retained:retained.l2,pendingCheckpoint:7,finalizedNumber:19};
 const activity=[],observation={};let automine=true,interval=1;
 const eth={isAutoMining:async()=>automine,getIntervalMining:async()=>interval,
  execWithPausedAnvil:async fn=>{automine=false;interval=0;try{return await fn();}finally{automine=true;interval=1;}},
  reorgWithReplacement:async(depth,blocks)=>{activity.push('reorg');assert.equal(depth,5);assert.deepEqual(blocks,[]);state.l1Tip={number:15,hash:h(30)};state.pendingCheckpoint=5;}};
 const options={eth,retained,readBoundary:async()=>structuredClone(state),quiescence:{autominingRestored:true,minerPassed:true,minerStopped:true,sequencerPaused:true},deadlineAt:Date.now()+120000,observation,persist:async()=>{activity.push('persist');}};
 return {retained,state,eth,activity,observation,options};
}
test('control fixture persists intent before one same-height replacement and verifies restoration',async()=>{const f=fixture();await replaceRollingL1Suffix(f.options);assert.deepEqual(f.activity,['persist','reorg','persist','persist']);assert(f.observation.miningControlsRestored);await assert.rejects(replaceRollingL1Suffix(f.options));assert.equal(f.activity.filter(x=>x==='reorg').length,1);});
for(const defect of ['changed-l1','changed-l2','finalized','empty-suffix','unpublished'])test('control fixture refuses invalid boundary: '+defect,()=>{
 const f=fixture();if(defect==='changed-l1')f.state.l1Retained={number:10,hash:h(99)};if(defect==='changed-l2')f.state.l2Retained={number:20,hash:h(99)};if(defect==='finalized')f.state.finalizedNumber=21;if(defect==='empty-suffix')f.state.l1Tip=f.retained.l1;if(defect==='unpublished')f.state.pendingCheckpoint=5;assert.throws(()=>validatePreferenceReorgBoundary(f.retained,f.state));
});
test('control fixture refuses active miner or exhausted admission before touching Anvil',async()=>{for(const kind of ['miner','deadline']){const f=fixture();if(kind==='miner')f.options.quiescence.minerStopped=false;else f.options.deadlineAt=Date.now()+89999;await assert.rejects(replaceRollingL1Suffix(f.options));assert.deepEqual(f.activity,[]);}});
test('failed durable intent prevents mutation; uncertain RPC is never replayed',async()=>{
 const f=fixture();f.options.persist=async()=>{throw Error('labelled disk failure');};await assert.rejects(replaceRollingL1Suffix(f.options));assert(!f.activity.includes('reorg'));
 const g=fixture();g.eth.reorgWithReplacement=async()=>{g.activity.push('reorg');throw Error('labelled uncertain RPC');};await assert.rejects(replaceRollingL1Suffix(g.options));await assert.rejects(replaceRollingL1Suffix(g.options));assert.equal(g.activity.filter(x=>x==='reorg').length,1);assert(g.observation.miningControlsRestored);
});
test('SDK swallowed restore failure is independently rejected',async()=>{const f=fixture();const run=f.eth.execWithPausedAnvil;f.eth.execWithPausedAnvil=async fn=>{await run(fn);f.eth.isAutoMining=async()=>false;};await assert.rejects(replaceRollingL1Suffix(f.options),{message:'Reorg control restoration failed'});assert.equal(f.observation.miningControlsRestored,false);});
for(const defect of ['height','hash','rollup'])test('control fixture requires actual replacement effect: '+defect,async()=>{const f=fixture();const reorg=f.eth.reorgWithReplacement;f.eth.reorgWithReplacement=async(...args)=>{await reorg(...args);if(defect==='height')f.state.l1Tip.number=16;if(defect==='hash')f.state.l1Tip.hash=h(15);if(defect==='rollup')f.state.pendingCheckpoint=7;};await assert.rejects(replaceRollingL1Suffix(f.options));assert.equal(f.activity.filter(x=>x==='reorg').length,1);assert(f.observation.miningControlsRestored);});

test('original failure and final write failure retain successful restoration without another write',async()=>{
 const f=fixture(),original=Error('labelled reorg failure'),write=Error('labelled final disk failure');let writes=0;
 f.eth.reorgWithReplacement=async()=>{f.activity.push('reorg');throw original;};
 f.options.persist=async()=>{writes++;if(writes===2)throw write;};
 await assert.rejects(replaceRollingL1Suffix(f.options),error=>{assert(error instanceof AggregateError);assert.deepEqual(error.errors,[original,write]);return true;});
 assert.equal(f.observation.miningControlsRestored,true);assert.equal(writes,2);assert.equal(f.activity.filter(x=>x==='reorg').length,1);
});
test('original, readback and final write failures are preserved together with no mutation retry',async()=>{
 const f=fixture(),original=Error('labelled uncertain reorg'),readback=Error('labelled readback failure'),write=Error('labelled final disk failure');let writes=0;
 f.eth.reorgWithReplacement=async()=>{f.activity.push('reorg');throw original;};
 const paused=f.eth.execWithPausedAnvil;f.eth.execWithPausedAnvil=async fn=>{try{return await paused(fn);}finally{f.eth.isAutoMining=async()=>{throw readback;};}};
 f.options.persist=async()=>{writes++;if(writes===2)throw write;};
 await assert.rejects(replaceRollingL1Suffix(f.options),error=>{assert(error instanceof AggregateError);assert.deepEqual(error.errors,[original,readback,write]);return true;});
 assert.equal(f.observation.miningControlsRestored,false);assert.equal(writes,2);assert.equal(f.activity.filter(x=>x==='reorg').length,1);
});
