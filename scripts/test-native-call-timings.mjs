import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentNativeCalls} from '../prover/native-call-timings.mjs';
const names=['chonkStart','chonkLoad','chonkAccumulate','chonkProve','chonkVerify','chonkCompressProof'];
function fake(call){return Object.fromEntries(names.map(name=>[name,function(...args){return call.call(this,name,...args);} ]));}
test('sequential native BB elapsed children remain inside enclosing proof duration',async()=>{
 let clock=0;const timings={},api=fake(function(name,input){assert.equal(this,api);assert.equal(input,'private input');clock+=2;return Promise.resolve(name);});
 instrumentNativeCalls(api,timings,()=>clock);const start=clock;
 for(const name of names)assert.equal(await api[name]('private input'),name);
 assert.deepEqual(timings,{'bb-start':2,'bb-load':2,'bb-accumulate':2,'bb-prove':2,'bb-verify':2,'bb-compress':2});
 assert.equal(Object.values(timings).reduce((a,b)=>a+b,0),clock-start);
 await api.chonkLoad('private input');assert.equal(timings['bb-load'],4);
 assert(!JSON.stringify(timings).includes('private input'));
});
test('concurrent call aggregates retain individual elapsed durations, not invented exclusive spans',async()=>{
 let clock=0;const timings={},ends=[];const api=fake(()=>new Promise(resolve=>ends.push(resolve)));
 instrumentNativeCalls(api,timings,()=>clock);
 const first=api.chonkLoad();clock=1;const second=api.chonkAccumulate();clock=4;ends[0]();await first;clock=6;ends[1]();await second;
 assert.deepEqual(timings,{'bb-load':4,'bb-accumulate':5});
 assert(Object.values(timings).reduce((a,b)=>a+b,0)>clock); // Explicitly overlapping, never summed as total proof time.
});
test('native promise and result identity survive, with original synchronous and asynchronous errors',async()=>{
 let clock=0;const error=Error('native failure'),result={},promise=Promise.resolve(result),timings={};
 const api=fake(name=>{clock++;if(name==='chonkLoad')throw error;if(name==='chonkProve')return Promise.reject(error);return promise;});
 instrumentNativeCalls(api,timings,()=>clock);
 assert.equal(api.chonkStart(),promise);assert.equal(await promise,result);
 assert.throws(()=>api.chonkLoad(),value=>value===error);
 await assert.rejects(api.chonkProve(),value=>value===error);
 assert.equal(timings['bb-load'],1);assert.equal(timings['bb-prove'],1);
});
test('diagnostic write failure and invalid elapsed durations cannot affect native results',async()=>{
 const result={},api=fake(()=>Promise.resolve(result));let clock=0;
 instrumentNativeCalls(api,Object.freeze({}),()=>clock++);
 assert.equal(await api.chonkProve(),result);
 const timings={},second=fake(()=>Promise.resolve(result));let reads=0;
 instrumentNativeCalls(second,timings,()=>reads++?NaN:0);
 assert.equal(await second.chonkProve(),result);assert.deepEqual(timings,{});
});

test('diagnostic clock failure cannot replace a native synchronous error or promise',async()=>{
 const error=Error('native original'),result={},api=fake(name=>{if(name==='chonkLoad')throw error;return Promise.resolve(result);});
 instrumentNativeCalls(api,{},()=>{throw Error('clock failed');});
 assert.throws(()=>api.chonkLoad(),value=>value===error);assert.equal(await api.chonkProve(),result);
});

test('queue terminal snapshot preserves only fixed numeric BB children without altering proof',async()=>{
 const {createProofQueue}=await import('../prover/queue.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bb-call-timing-'));
 const result={mode:'real',compressedProof:'unchanged'};
 const values={bbStartMs:1,bbLoadMs:2,bbAccumulateMs:3,bbProveMs:4,bbVerifyMs:5,bbCompressMs:6,nativeProveMs:21,secret:123};
 const queue=await createProofQueue({directory,worker:{async prove(_file,{onTimings}){onTimings(values);return result;},async close(){}}});
 try {
  const id=await queue.submit(Buffer.from('fixture'),'fixture');const snapshot=await queue.waitForResult(id);
  assert.equal(snapshot.result,result);assert.equal(snapshot.timings.nativeProveMs,21);
  for(const key of Object.keys(values).filter(key=>key!=='secret'))assert.equal(snapshot.timings[key],values[key]);
  assert(!Object.hasOwn(snapshot.timings,'secret'));
 } finally {await queue.close();await fs.rm(directory,{recursive:true,force:true});}
});
