import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {z} from 'zod';
import {zeroWindowRpcMicrotasks} from './rpc-zero-window.mjs';
const moduleUrl=new URL('../node_modules/@aztec-labs/foundation/dest/json-rpc/client/safe_json_rpc_client.js',import.meta.url);
const source=await fs.readFile(moduleUrl,'utf8');
const scratchRoot=new URL('../.build/',import.meta.url);await fs.mkdir(scratchRoot,{recursive:true});
const scratch=await fs.mkdtemp(fileURLToPath(new URL('rpc-scheduling-',scratchRoot)));
let createSafeJsonRpcClient,batch;
try{
 const result=await build({stdin:{contents:zeroWindowRpcMicrotasks(source),resolveDir:path.dirname(fileURLToPath(moduleUrl)),sourcefile:'rpc-scheduling.js'},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
 const target=path.join(scratch,'rpc.mjs');await fs.writeFile(target,result.outputFiles[0].contents);
 ({createSafeJsonRpcClient,batch}=await import(pathToFileURL(target).href));
}finally{await fs.rm(scratch,{recursive:true,force:true});}
const schema={echo:z.function({input:[z.number()],output:z.number()})};
const silent=Object.assign(()=>{},Object.fromEntries(['debug','warn','info','error'].map(name=>[name,()=>{}])),{isLevelEnabled:()=>false});
async function controlled(run){
 const saved={queueMicrotask:globalThis.queueMicrotask,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const tasks=[],timers=[],cancelled=[];
 globalThis.queueMicrotask=fn=>tasks.push(fn);
 globalThis.setTimeout=(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;};
 globalThis.clearTimeout=timer=>{assert(timers.includes(timer));cancelled.push(timer);};
 try{return await run({tasks,timers,cancelled,flush:()=>{while(tasks.length)tasks.shift()();}});}
 finally{Object.assign(globalThis,saved);}
}
function client(options={}){
 const calls=[];
 const node=createSafeJsonRpcClient('https://fixture.invalid',schema,{maxBatchSize:8,log:silent,fetch:async(_host,body)=>{
  calls.push(body);return {response:body.map(request=>({jsonrpc:'2.0',id:request.id,result:request.params[0]})),headers:new Headers()};
 },...options});
 return {node,calls};
}
for(const count of [8,9])test('zero window sends '+count+' same-stack calls with native batch bounds and no timers',()=>controlled(async({flush,timers})=>{
 const {node,calls}=client(),work=Array.from({length:count},(_,i)=>node.echo(i));
 assert.equal(calls.length,0);flush();assert.equal(timers.length,0);
 assert.deepEqual(calls.map(value=>value.length),count===8?[8]:[8,1]);
 assert.deepEqual(await Promise.all(work),Array.from({length:count},(_,i)=>i));
 assert.equal(new Set(calls.flat().map(value=>value.id)).size,count);
}));
test('explicit native flush invalidates old microtask without consuming a newer batch',()=>controlled(async({tasks,flush,timers})=>{
 const {node,calls}=client(),first=node.echo(1),firstFlush=batch([first]);
 assert.equal(calls.length,1);const second=node.echo(2);assert.equal(tasks.length,2);
 tasks.shift()();assert.equal(calls.length,1);flush();assert.equal(calls.length,2);
 assert.deepEqual(await firstFlush,[1]);assert.equal(await second,2);assert.equal(timers.length,0);
}));
test('positive batching windows retain native timers and explicit-flush cancellation',()=>controlled(async({tasks,timers,cancelled})=>{
 const {node,calls}=client({batchWindowMS:17}),first=node.echo(1),second=node.echo(2);
 assert.equal(tasks.length,0);assert.equal(timers.length,1);assert.equal(timers[0].delay,17);
 timers[0].fn();assert.deepEqual(await Promise.all([first,second]),[1,2]);assert.equal(calls.length,1);
 const third=node.echo(3),thirdFlush=batch([third]);assert.equal(timers.length,2);assert(cancelled.includes(timers[1]));
 timers[1].fn();assert.equal(calls.length,2);assert.deepEqual(await thirdFlush,[3]);
}));
test('native byte limit splits batches independently of the count limit',()=>controlled(async({flush})=>{
 const {node,calls}=client({maxRequestBodySize:100}),work=[node.echo(1),node.echo(2),node.echo(3)];
 flush();assert.deepEqual(calls.map(value=>value.length),[1,1,1]);assert.deepEqual(await Promise.all(work),[1,2,3]);
}));
test('overflow batches dispatch before a held first network response',()=>controlled(async({flush})=>{
 const gate=Promise.withResolvers(),calls=[];
 const {node}=client({fetch:async(_host,body)=>{calls.push(body);if(calls.length===1)await gate.promise;return {response:body.map(r=>({id:r.id,result:r.params[0]})),headers:new Headers()};}});
 const work=Array.from({length:9},(_,i)=>node.echo(i));flush();assert.equal(calls.length,2);
 assert.equal(await work[8],8);gate.resolve();assert.deepEqual(await Promise.all(work),Array.from({length:9},(_,i)=>i));
}));
for(const failure of ['network','schema','version'])test('native '+failure+' errors reject every deferred without replay',()=>controlled(async({flush})=>{
 let calls=0;const version=Object.assign(Error('version mismatch'),{name:'ComponentsVersionsError'});
 const {node}=client({fetch:async(_host,body)=>{calls++;if(failure==='network')throw Error('offline');return {response:body.map(r=>({id:r.id,result:failure==='schema'?'invalid':r.params[0]})),headers:new Headers()};},
  ...(failure==='version'?{onResponse:()=>{throw version;}}:{})});
 const work=Array.from({length:9},(_,i)=>node.echo(i)),settled=Promise.allSettled(work);flush();
 const results=await settled;assert.equal(calls,2);assert(results.every(result=>result.status==='rejected'));
 if(failure==='version')assert(results.every(result=>result.reason===version));
}));
test('scheduling transform rejects an unpinned SDK source',()=>assert.throws(()=>zeroWindowRpcMicrotasks(source+'\n'),/source mismatch/));
