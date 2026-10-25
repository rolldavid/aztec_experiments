import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {expose,wrap} from 'comlink';
import {installWorkerTimings,measureWorkerVerification} from './bb-worker-timings.mjs';
import {BB_WORKER_TIMING_PINS,instrumentBrowserWorker} from '../scripts/bb-worker-timings.mjs';
import {BarretenbergWasmMain} from '../node_modules/@aztec-foundation/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_main/index.js';
const flag=Symbol.for('rolling.proof.profile');
async function clock(work){
 const prior=Object.getOwnPropertyDescriptor(globalThis,'performance'),oldFlag=globalThis[flag],entries=[];let time=10;
 const timing={timeOrigin:100000,now:()=>time,clearMeasures(){},measure:(name,value)=>entries.push({name,...value})};
 Object.defineProperty(globalThis,'performance',{configurable:true,value:timing});
 try{return await work({timing,entries,advance:n=>time+=n});}finally{Object.defineProperty(globalThis,'performance',prior);if(oldFlag===undefined)delete globalThis[flag];else globalThis[flag]=oldFlag;}
}
function nativeFixture(advance){
 // Actual pinned native cbind and call methods, harmless WASM export stand-in.
 // Exercises original scratch copy/output metadata paths without a proof/build.
 const native=new BarretenbergWasmMain(),memory=new Uint8Array(512);native.MSGPACK_SCRATCH_SIZE=128;native.msgpackInputScratch=0;native.msgpackOutputScratch=128;
 native.getMemory=()=>memory;native.writeMemory=(ptr,bytes)=>memory.set(bytes,ptr);native.getMemorySlice=(a,b)=>memory.slice(a,b);
 native.instance={exports:{bbapi:(ptr,length,outPtr,outLen)=>{advance(5);const view=new DataView(memory.buffer),dest=view.getUint32(outPtr,true);memory.set(memory.slice(ptr,ptr+length),dest);view.setUint32(outLen,length,true);}}};
 return native;
}
test('actual native scratch bytes/results and receiver remain identical with numeric worker timings',()=>clock(async({advance})=>{
 const native=nativeFixture(advance),input=Uint8Array.of(12,34,56),expected=native.cbindCall('bbapi',input);
 installWorkerTimings(native);assert.equal(native.rollingOpenTiming(),1);
 assert.deepEqual(native.cbindCall('bbapi',input),expected);const recorded=native.rollingCloseTiming(1);
 assert.deepEqual(Object.keys(recorded),['origin','calls','start','end','wasmCalls','wasmStart','wasmEnd']);assert(Object.values(recorded).every(Number.isFinite));
 assert.equal(recorded.end-recorded.start,5);assert.equal(recorded.wasmEnd-recorded.wasmStart,5);assert.equal(recorded.calls,1);
 assert.deepEqual(input,Uint8Array.of(12,34,56));assert.equal(native.rollingCloseTiming(1),null);
}));
test('worker preserves exact sync result/error, ignores other commands and bounds concurrent windows',()=>clock(async({advance})=>{
 const result={},error=Error('PRIVATE');let fail=false,count=0;const native={call(name,value){assert.equal(this,native);advance(3);if(fail)throw error;return value;},cbindCall(name,input){assert.equal(this,native);assert.equal(input,result);count++;return this.call(name,input);}};
 installWorkerTimings(native);assert.equal(native.cbindCall('bbapi',result),result);const token=native.rollingOpenTiming();assert.equal(native.rollingOpenTiming(),0);assert.equal(native.rollingCloseTiming(token+1),null);
 assert.equal(native.cbindCall('other',result),result);fail=true;assert.throws(()=>native.cbindCall('bbapi',result),e=>e===error);fail=false;
 for(let i=0;i<100;i++)native.cbindCall('bbapi',result);
 const value=native.rollingCloseTiming(token);assert.equal(value.calls,2);assert.equal(value.wasmCalls,2);assert(!JSON.stringify(value).includes('PRIVATE'));assert.equal(count,103);assert(native.rollingOpenTiming()>token);
}));
test('clock failure cannot change native success/failure and does not export invalid times',()=>clock(async({timing})=>{
 const result={},error=Error('original');let fail=false;const native={call(){if(fail)throw error;return result;},cbindCall(){return this.call('bbapi');}};installWorkerTimings(native);const token=native.rollingOpenTiming();timing.now=()=>{throw Error('clock');};
 assert.equal(native.cbindCall('bbapi'),result);fail=true;assert.throws(()=>native.cbindCall('bbapi'),e=>e===error);assert.equal(native.rollingCloseTiming(token),null);
}));
test('disabled profiling makes no diagnostic transport calls and preserves result/error',()=>clock(async({advance,entries})=>{
 globalThis[flag]=false;const bb={get backend(){assert.fail('disabled backend inspected');}},result={},error=Error('original');let calls=0;
 assert.equal(await measureWorkerVerification(bb,()=>{calls++;advance(7);return result;}),result);
 await assert.rejects(measureWorkerVerification(bb,()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,2);assert.equal(entries.length,2);assert(entries.every(x=>x.name==='rolling.proof.local.verify'));
}));
test('real Comlink orders open before unchanged native call and records nested elapsed spans',()=>clock(async({advance,entries})=>{
 globalThis[flag]=true;const native=installWorkerTimings(nativeFixture(advance)),{port1,port2}=new MessageChannel();expose(native,port1);const remote=wrap(port2),bb={backend:{worker:port2,wasm:remote}};
 try{
  const input=Uint8Array.of(9,8,7);const output=await measureWorkerVerification(bb,()=>remote.cbindCall('bbapi',input));assert.deepEqual(output,input);
  for(let i=0;i<20&&!entries.some(x=>x.name.endsWith('worker-verify-wasm'));i++)await new Promise(setImmediate);
  const names=entries.map(e=>e.name);assert(names.includes('rolling.proof.local.verify'));assert(names.includes('rolling.proof.native.phase.worker-verify-wasm'));
  const outer=entries.find(e=>e.name.endsWith('local.verify')),inner=entries.find(e=>e.name.endsWith('worker-verify-wasm'));
  assert(outer.start<=inner.start&&inner.end<=outer.end);assert.equal(inner.end-inner.start,5);
 }finally{port1.close();port2.close();}
}));
test('diagnostic open/readback is never awaited by verification and failures cannot replace outcome',()=>clock(async({advance})=>{
 globalThis[flag]=true;let resolveOpen,closed=0,called=0;const result={},error=Error('exact');const bb={backend:{worker:{},wasm:{rollingOpenTiming(){return new Promise(r=>resolveOpen=r);},rollingCloseTiming(){closed++;return new Promise(()=>{});}}}};
 assert.equal(await measureWorkerVerification(bb,()=>{called++;advance(1);return result;}),result);assert.equal(closed,0);resolveOpen(1);await new Promise(setImmediate);assert.equal(closed,1);
 bb.backend.wasm.rollingOpenTiming=()=>Promise.reject(Error('diagnostic only'));
 await assert.rejects(measureWorkerVerification(bb,()=>{called++;throw error;}),e=>e===error);await new Promise(setImmediate);assert.equal(called,2);
 bb.backend.wasm.rollingOpenTiming=()=>{throw Error('old worker missing method');};assert.equal(await measureWorkerVerification(bb,()=>result),result);
}));
for(const kind of ['multiple','wrong-clock','invalid-order'])test('ambiguous worker timing '+kind+' never fabricates verification chronology',()=>clock(async({advance,entries})=>{
 globalThis[flag]=true;const record={origin:100000,calls:1,start:11,end:14,wasmCalls:1,wasmStart:12,wasmEnd:13};
 if(kind==='multiple')record.calls=2;if(kind==='wrong-clock')record.origin+=100;if(kind==='invalid-order')record.wasmEnd=15;
 const bb={backend:{worker:{},wasm:{rollingOpenTiming:async()=>1,rollingCloseTiming:async()=>record}}};await measureWorkerVerification(bb,()=>advance(5));await new Promise(setImmediate);
 assert.deepEqual(entries.map(e=>e.name),['rolling.proof.local.verify']);
}));
test('exact pinned native worker entry installs timing without changing expose/Ready lifecycle',async()=>{
 const [path]=Object.keys(BB_WORKER_TIMING_PINS),source=await readFile(new URL('../'+path,import.meta.url),'utf8');let exposed,ready;
 const patched=instrumentBrowserWorker(source,path).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(patched,{expose:value=>exposed=value,postMessage:value=>ready=value,Ready:'ready',BarretenbergWasmMain:class{call(){}cbindCall(){}}});
 assert.equal(typeof exposed.rollingOpenTiming,'function');assert.equal(ready,'ready');assert.throws(()=>instrumentBrowserWorker(source+' ',path),/source mismatch/);assert.throws(()=>instrumentBrowserWorker(source,'other'),/source mismatch/);
});
test('diagnostic dispatch overhead stays inside original local verification span',()=>clock(async({advance,entries})=>{
 globalThis[flag]=true;const bb={backend:{worker:{},wasm:{rollingOpenTiming(){advance(2);return 1;},rollingCloseTiming(){return {origin:100000,calls:1,start:13,end:21,wasmCalls:1,wasmStart:14,wasmEnd:20};}}}};
 await measureWorkerVerification(bb,()=>advance(10));await new Promise(setImmediate);
 const outer=entries.find(e=>e.name==='rolling.proof.local.verify');assert.equal(outer.end-outer.start,12);
 for(const entry of entries)assert(outer.start<=entry.start&&entry.end<=outer.end);
 assert.equal(entries.length,5);
}));
