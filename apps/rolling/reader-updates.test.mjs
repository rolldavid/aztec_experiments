import test from 'node:test';
import assert from 'node:assert/strict';
import {createReaderUpdates} from './reader-updates.mjs';
import {beginRollingMeasure,rollingStageObserver} from './performance.mjs';
const checkpoint={number:'12',hash:'0x'+'a'.repeat(64)};
function fixture(refresh){let stream,allowed=true;
 class Events{constructor(url){assert.equal(url,'/api/events');stream=this;}addEventListener(name,fn){assert.equal(name,'revision');this.receive=fn;}close(){this.closed=true;}emit(revision){this.receive({data:JSON.stringify({schemaVersion:1,revision,checkpoint})});}}
 const updates=createReaderUpdates({refresh,EventSource:Events,canRefresh:()=>allowed});updates.start();return {updates,get stream(){return stream;},set allowed(value){allowed=value;}};
}
test('revisions refresh once, coalesce in flight, ignore rendered revision and reconnect after page restore',async()=>{
 const first=Promise.withResolvers();let calls=0;const f=fixture(async()=>{calls++;if(calls===1)await first.promise;f.updates.rendered(calls===1?'2':'4');});
 f.updates.rendered('1');f.stream.emit('1');await f.updates.flush();assert.equal(calls,0);
 f.stream.emit('2');await Promise.resolve();assert.equal(calls,1);f.stream.emit('3');f.stream.emit('4');assert.equal(calls,1);
 first.resolve();await f.updates.flush();await f.updates.flush();assert.equal(calls,2);
 f.stream.emit('4');await f.updates.flush();assert.equal(calls,2);const old=f.stream;f.updates.stop();assert(old.closed);f.updates.start();assert.notEqual(f.stream,old);f.updates.stop();
});
test('hidden or navigating page defers notifications without reads; malformed event ignored',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;f.updates.rendered('3');});f.allowed=false;f.stream.emit('2');f.stream.emit('3');await f.updates.flush();assert.equal(calls,0);
 f.stream.receive({data:'{invalid'});f.allowed=true;await f.updates.flush();assert.equal(calls,1);f.updates.stop();
});
test('failure is not a polling/retry loop, new revision may trigger a new refresh',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('unavailable');});f.stream.emit('2');await f.updates.flush();await f.updates.flush();assert.equal(calls,1);f.stream.emit('3');await f.updates.flush();assert.equal(calls,2);f.updates.stop();
});
test('measurements use monotonic start/end, finish only once, and never throw',()=>{
 let now=10;const measures=[],timing={now:()=>now,clearMeasures(){},measure:(name,value)=>measures.push([name,value])};const finish=beginRollingMeasure('reader.update',timing);now=22;finish();finish();assert.deepEqual(measures,[['rolling.reader.update',{start:10,end:22}]]);
 assert.doesNotThrow(beginRollingMeasure('broken',{now:()=>1,clearMeasures(){throw Error('disabled');}}));
 const progress=rollingStageObserver();progress.progress('proving');progress.progress('private-secret');progress.complete();
});
