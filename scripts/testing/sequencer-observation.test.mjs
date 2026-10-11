import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {observeSequencer} from './sequencer-observation.mjs';
function fixture(){const sequencer=new EventEmitter(),calls=[];sequencer.log=Object.fromEntries(['trace','debug','verbose','info','warn','error'].map(level=>[level,function(...args){calls.push({level,args,self:this});}]));const node={getSequencer:()=>({getSequencer:()=>sequencer}),getPendingTxCount:async()=>1,getSyncedL2SlotNumber:async()=>2n,getSyncedL1Timestamp:async()=>3n,getWorldStateSyncStatus:async()=>({latestBlockNumber:4,finalizedBlockNumber:3,treesAreSynched:true,latestBlockHash:'PRIVATE'}),getChainTips:async()=>({proposed:{number:4,hash:'PRIVATE'},checkpointed:{block:{number:3,hash:'PRIVATE'}}})};return{node,sequencer,calls};}
test('diagnostics retain bounded numbers/categories, never raw payloads, and detach exactly',async()=>{
 const {node,sequencer,calls}=fixture(),original=sequencer.log,probe=observeSequencer(node);
 for(let i=0;i<100;i++){
  sequencer.emit('checkpoint-error',{error:Error('PRIVATE'),reason:'PRIVATE',slot:2n});
  sequencer.log.debug('Past start deadline for slot 2, abandoning block building',{targetSlot:2n,startDeadline:5,nowForStartGate:6,secret:'PRIVATE'});
  sequencer.emit('state-changed',{oldState:'IDLE',newState:'PRIVATE',secondsIntoBuildFrame:Infinity,targetSlot:'PRIVATE'});
  await probe.sample();
 }
 sequencer.log.error('PRIVATE',Error('PRIVATE'));
 assert.equal(probe.observation.events['checkpoint-error'],100);assert.equal(probe.observation.skips['past-start-deadline'],100);
 assert.equal(probe.observation.recent.length,32);assert.equal(probe.observation.samples.length,32);assert(!JSON.stringify(probe.observation).includes('PRIVATE'));
 assert.equal(calls.length,101);assert(calls.every(call=>call.self===original));
 probe.stop();probe.stop();assert.equal(sequencer.log,original);assert.equal(sequencer.listenerCount('checkpoint-error'),0);
});
test('read failure is visible and instrumentation does not consume or replace events',async()=>{
 const {node,sequencer}=fixture();let seen;sequencer.on('checkpoint-error',x=>seen=x);const probe=observeSequencer(node),value={error:Error('PRIVATE')};sequencer.emit('checkpoint-error',value);assert.equal(seen,value);
 node.getPendingTxCount=async()=>{throw Error('READ_FAILED');};try{await assert.rejects(probe.sample(),/READ_FAILED/);}finally{probe.stop();}assert.equal(sequencer.listenerCount('checkpoint-error'),1);
});
