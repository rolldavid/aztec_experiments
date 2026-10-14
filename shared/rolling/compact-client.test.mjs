// Labelled transport doubles: no node, chain, private authentication or browser qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRollingCompactClient,validateCompactSelector,validateCompactResponse,readCompactResponse,COMPACT_TRANSPORT_LIMITS} from './compact-client.mjs';
const hash='0x'+'01'.repeat(32),selector={schemaVersion:1,number:7,hash,tier:'checkpointed'};
const body=()=>({schemaVersion:1,number:7,hash,headerFields:Array(23).fill('0x'+'00'.repeat(32)),fields:Array(7).fill('0x'+'00'.repeat(32))});
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function fixture(t,fetcher,guard=async()=>{}){
 const original=globalThis.fetch;globalThis.fetch=fetcher;t.after(()=>{globalThis.fetch=original;});
 return createRollingCompactClient({url:'https://trusted.example',tier:'checkpointed',contextGuard:guard});
}
const args=()=>({number:7,hash});
const gate=()=>{let release;const promise=new Promise(r=>{release=r;});return {promise,release};};
test('labelled client fixes endpoint/tier and forwards public selector only, with two context checks',async t=>{
 let guards=0,calls=0;const client=fixture(t,async(url,options)=>{calls++;assert.equal(url,'https://trusted.example/v1/compact-block');assert.deepEqual(JSON.parse(options.body),selector);
  assert.deepEqual(options.headers,{'content-type':'application/json'});assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return response(body());},async()=>{guards++;});
 const value=await client.read(args());assert.deepEqual(value,body());assert(Object.isFrozen(value.fields));assert.equal(calls,1);assert.equal(guards,2);
});
test('configuration rejects arbitrary paths, credentials, unsupported schemes and implicit dev',()=>{
 const options={url:'https://trusted.example',tier:'checkpointed',contextGuard:async()=>{}};
 for(const url of ['http://localhost','http://127.0.0.1','https://u:p@trusted.example','https://trusted.example/path','https://trusted.example?secret=x','https://trusted.example#x','file:///x'])assert.throws(()=>createRollingCompactClient({...options,url}));
 assert.doesNotThrow(()=>createRollingCompactClient({...options,url:'http://127.0.0.1:1234',allowLocalDev:true}));
 for(const patch of [{tier:'latest'},{allowLocalDev:'yes'},{contextGuard:undefined},{extra:'secret'}])assert.throws(()=>createRollingCompactClient({...options,...patch}));
});
test('exact public selector rejects account/filter/tier changes/accessors before requests',async t=>{
 let calls=0;const client=fixture(t,async()=>{calls++;return response(body());});
 for(const input of [{...args(),account:hash},{...args(),tier:'proven'},{number:0,hash},{number:2**32,hash},{number:7,hash:'0x1'},{number:7,get hash(){throw Error('PRIVATE');}}])await assert.rejects(client.read(input),/Compact block unavailable/);
 assert.equal(calls,0);
});
test('own input and context capability captured before asynchronous guard',async t=>{
 const held=gate();let count=0;const input=args();const client=fixture(t,async(url,options)=>{assert.equal(JSON.parse(options.body).hash,hash);return response(body());},async()=>{if(++count===1)await held.promise;});
 const pending=client.read(input);input.hash='0x'+'02'.repeat(32);held.release();await pending;
});
test('all response fields, counts, scalar range and identity checked',()=>{
 for(const patch of [{schemaVersion:2},{number:8},{hash:'0x'+'02'.repeat(32)},{headerFields:Array(22).fill(hash)},{fields:Array(24576).fill(hash)},{fields:Array(6).fill(hash)},{fields:Array(7).fill('0x'+'ff'.repeat(32))},{extra:'PRIVATE'}])assert.throws(()=>validateCompactResponse({...body(),...patch},selector));
 const sparse=Array(7);assert.throws(()=>validateCompactResponse({...body(),fields:sparse},selector));
 const getter=body();Object.defineProperty(getter.fields,'0',{get(){throw Error('PRIVATE');}});assert.throws(()=>validateCompactResponse(getter,selector));
 assert.throws(()=>validateCompactSelector({...selector,tier:'proven'},'checkpointed'));
});
test('oversize declared array rejected before enumeration',()=>{
 let accessed=false;const values=Array(24576);Object.defineProperty(values,'0',{get(){accessed=true;throw Error('PRIVATE');}});
 assert.throws(()=>validateCompactResponse({...body(),fields:values},selector));assert.equal(accessed,false);
});
test('decoded stream cap cancels before JSON parsing and waits for cancellation',async()=>{
 const held=gate();let cancelled=false,settled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(COMPACT_TRANSPORT_LIMITS.responseBytes+1));},async cancel(){cancelled=true;await held.promise;}});
 const pending=readCompactResponse(new Response(stream,{headers:{'content-type':'application/json'}}),selector).finally(()=>{settled=true;});
 await new Promise(r=>setImmediate(r));assert(cancelled);assert.equal(settled,false);held.release();await assert.rejects(pending,/Compact block unavailable/);
});
test('malformed UTF8/JSON/media/status rejected with fixed error and no retry',async t=>{
 let calls=0;const client=fixture(t,async()=>{calls++;return new Response('PRIVATE invalid',{headers:{'content-type':'application/json'}});});
 await assert.rejects(client.read(args()),e=>e.message==='Compact block unavailable'&&!e.cause);assert.equal(calls,1);
 for(const r of [new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('{}',{status:302,headers:{location:'https://evil.example'}}),new Response('{}',{headers:{'content-type':'text/plain'}})])await assert.rejects(readCompactResponse(r,selector),/Compact block unavailable/);
});
test('pre/post account context failures yield no result; first prevents request',async t=>{
 let calls=0,count=0;const client=fixture(t,async()=>{calls++;return response(body());},async()=>{if(++count===2)throw Error('PRIVATE account');});
 await assert.rejects(client.read(args()),e=>e.code==='BB_COMPACT_BLOCK_UNAVAILABLE');assert.equal(calls,1);
 const blocked=createRollingCompactClient({url:'https://trusted.example',tier:'checkpointed',contextGuard:async()=>{throw Error('PRIVATE');}});await assert.rejects(blocked.read(args()));assert.equal(calls,1);
});
test('abort keeps single-flight ownership until actual ignoring transport settles',async t=>{
 const held=gate();let calls=0;const client=fixture(t,async()=>{calls++;await held.promise;return response(body());});
 const controller=new AbortController();const pending=client.read(args(),{signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();
 await assert.rejects(client.read(args()));assert.equal(calls,1);held.release();await assert.rejects(pending);await client.read(args());assert.equal(calls,2);
});
test('an already aborted signal never enters guard or transport',async t=>{
 let entered=0;const client=fixture(t,async()=>{entered++;},async()=>{entered++;});const controller=new AbortController();controller.abort();await assert.rejects(client.read(args(),{signal:controller.signal}));assert.equal(entered,0);
});
test('guard remains owned while pending; no detached Promise race',async t=>{
 const held=gate();const client=fixture(t,async()=>response(body()),async()=>held.promise);
 const controller=new AbortController();const pending=client.read(args(),{signal:controller.signal});controller.abort();await assert.rejects(client.read(args()));held.release();await assert.rejects(pending);
});
test('bounded public history batch respects single-flight gateway admission and preserves order',async t=>{
 let active=0,peak=0,calls=0;const held=gate();
 const client=fixture(t,async(url,options)=>{const p=JSON.parse(options.body);calls++;if(active)return new Response('{}',{status:429});active++;peak=Math.max(peak,active);if(calls===1)await held.promise;active--;return response({...body(),number:p.number});});
 const pending=client.readMany(Array.from({length:32},(_,i)=>({number:i+1,hash})));
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);await assert.rejects(client.read(args()));held.release();
 const result=await pending;assert.equal(peak,1);assert.deepEqual(result.map(x=>x.number),Array.from({length:32},(_,i)=>i+1));assert.equal(calls,32);
 await assert.rejects(client.readMany(Array.from({length:33},(_,i)=>({number:i+1,hash}))));await assert.rejects(client.readMany([{number:1,hash},{number:3,hash}]));assert.equal(calls,32);
});
test('failed public history read settles before batch release and never starts the next selector',async t=>{
 const held=gate();let calls=0,finished=false;const client=fixture(t,async()=>{calls++;await held.promise;return new Response('{}',{status:503});});
 const pending=client.readMany(Array.from({length:8},(_,i)=>({number:i+1,hash}))).finally(()=>{finished=true;});const observed=assert.rejects(pending);
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(finished,false);await assert.rejects(client.read(args()));held.release();await observed;assert.equal(calls,1);
});
for(const boundary of [1,3,32])test('empty-prefix selection stops at nonempty body '+boundary+' before unavailable future body',async t=>{
 const calls=[];const client=fixture(t,async(url,options)=>{const p=JSON.parse(options.body);calls.push(p.number);if(p.number>boundary)return new Response('{}',{status:503});return response({...body(),number:p.number,fields:Array(p.number===boundary?19:7).fill(hash)});});
 const result=await client.readMany(Array.from({length:32},(_,i)=>({number:i+1,hash})),{emptyPrefix:true});assert.deepEqual(calls,Array.from({length:boundary},(_,i)=>i+1));assert.equal(result.length,boundary);assert.equal(result.at(-1).fields.length,19);
});
test('empty-prefix option is captured own boolean and never forwarded as a selector',async t=>{
 let calls=0;const client=fixture(t,async(url,options)=>{calls++;assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['hash','number','schemaVersion','tier']);return response({...body(),number:1});});
 for(const options of [{emptyPrefix:'true'},{get emptyPrefix(){throw Error('PRIVATE');}},{emptyPrefix:true,account:hash}])await assert.rejects(client.readMany([{number:1,hash}],options));assert.equal(calls,0);
 await client.readMany([{number:1,hash}],{emptyPrefix:true});assert.equal(calls,1);
});
