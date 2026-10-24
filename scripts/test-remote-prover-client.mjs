import test from 'node:test';import assert from 'node:assert/strict';import {createRemoteProverClient} from '../shared/remote-prover-client.mjs';
const eventResponse=(...jobs)=>new Response(jobs.map(job=>'data: '+JSON.stringify(job)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
const options={url:'https://prover.test',board:'0x'+'1'.repeat(64),chainId:11155111,rollupVersion:1};
for(const [status,code]of [[429,'BB_REMOTE_PROVER_BUSY'],[403,'BB_REMOTE_PROVER_REJECTED'],[503,'BB_REMOTE_PROVER_OFFLINE']])test('safe prover HTTP classification '+status,async()=>{const client=createRemoteProverClient({...options,fetchImpl:async()=>new Response('private response',{status})});await assert.rejects(client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}]),error=>error.code===code&&!error.message.includes('private'));});
test('network failure is redacted and distinguished from proof failure',async()=>{const client=createRemoteProverClient({...options,fetchImpl:async()=>{throw Error('private witness detail');}});await assert.rejects(client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}]),{code:'BB_REMOTE_PROVER_OFFLINE'});});
test('queueing receives one streamed completion without timer polling or resubmission',async()=>{let posts=0,reads=0,release;const statuses=[];const held=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"state":"queued"}\n\n'));release=()=>{controller.enqueue(new TextEncoder().encode('data: {"state":"complete","result":{"mode":"real","proof":"result"}}\n\n'));controller.close();};}});const client=createRemoteProverClient({...options,onStatus:s=>statuses.push(s),fetchImpl:async(url,request)=>{if(request.method==='POST'){posts++;return Response.json({id:'a'.repeat(64)});}if(request.method==='DELETE')return Response.json({acknowledged:true});reads++;assert(url.endsWith('/result'));return new Response(held,{headers:{'content-type':'text/event-stream'}});}});let finished=false;const result=client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}]).then(x=>{finished=true;return x;});while(!statuses.length)await new Promise(setImmediate);assert.equal(finished,false);assert.equal(reads,1);release();assert.equal((await result).proof,'result');assert.equal(posts,1);assert.equal(reads,1);});
test('failed job cannot leak server details',async()=>{let requests=0;const client=createRemoteProverClient({...options,fetchImpl:async()=>++requests===1?Response.json({id:'a'.repeat(64)}):eventResponse({state:'failed',code:'private witness',message:'secret'})});await assert.rejects(client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}]),error=>error.code==='BB_REMOTE_PROVER_FAILED'&&!error.message.includes('secret'));});

test('terminal proof is consumed once even if acknowledgement fails',async()=>{
 const methods=[];const client=createRemoteProverClient({...options,fetchImpl:async(_url,request)=>{
  methods.push(request.method??'GET');if(request.method!=='DELETE')assert.equal(request.signal,undefined);
  if(request.method==='POST')return Response.json({id:'b'.repeat(64)});
  if(request.method==='DELETE')throw Error('connection lost during acknowledgement');
  return eventResponse({state:'complete',result:{mode:'real',compressedProof:'retained'}});
 }});assert.equal((await client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}])).compressedProof,'retained');assert.deepEqual(methods,['POST','GET','DELETE']);
});

test('a stalled terminal acknowledgement never blocks the received proof',async()=>{
 let ackSignal;const client=createRemoteProverClient({...options,fetchImpl:async(_url,request)=>{
  if(request.method==='POST')return Response.json({id:'c'.repeat(64)});
  if(request.method==='DELETE'){ackSignal=request.signal;return new Promise(()=>{});}
  return eventResponse({state:'complete',result:{mode:'real',compressedProof:'received'}});
 }});assert.equal((await client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}])).compressedProof,'received');assert(ackSignal instanceof AbortSignal);
});

const proofSteps=()=>[{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}];
for(const [name,response,code] of [
 ['truncated',()=>new Response('data: {"state":"running"}\n\n',{headers:{'content-type':'text/event-stream'}}),'BB_REMOTE_PROVER_OFFLINE'],
 ['oversized',()=>new Response('x'.repeat(512001),{headers:{'content-type':'text/event-stream'}}),'BB_REMOTE_PROVER_RESPONSE'],
 ['wrong type',()=>Response.json({state:'complete',result:{mode:'real'}}),'BB_REMOTE_PROVER_RESPONSE'],
 ['wrong mode',()=>eventResponse({state:'complete',result:{mode:'disabled'}}),'BB_REMOTE_PROVER_RESPONSE'],
 ['unknown state',()=>eventResponse({state:'secret'}),'BB_REMOTE_PROVER_RESPONSE'],
])test('bounded completion stream rejects '+name+' without resubmitting',async()=>{
 let posts=0;const client=createRemoteProverClient({...options,fetchImpl:async(_url,o)=>{if(o.method==='POST'){posts++;return Response.json({id:'a'.repeat(64)});}return response();}});
 await assert.rejects(client.prove(proofSteps()),{code});assert.equal(posts,1);
});
test('fragmented frames and transport keepalive do not delay exact terminal result',async()=>{
 const content=': keepalive\n\ndata: {"state":"running"}\n\ndata: {"state":"complete","result":{"mode":"real","compressedProof":"done"}}\n\n';
 const stream=new ReadableStream({start(c){for(const char of content)c.enqueue(new TextEncoder().encode(char));c.close();}});
 const client=createRemoteProverClient({...options,fetchImpl:async(_url,o)=>o.method==='POST'?Response.json({id:'a'.repeat(64)}):o.method==='DELETE'?Response.json({acknowledged:true}):new Response(stream,{headers:{'content-type':'text/event-stream'}})});
 assert.equal((await client.prove(proofSteps())).compressedProof,'done');
});
