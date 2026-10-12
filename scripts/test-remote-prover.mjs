import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {encodeJob,decodeJob} from '../shared/remote-prover-wire.mjs';
import {createProofQueue} from '../prover/queue.mjs';
import {createProverServer} from '../prover/server.mjs';
const board='0x'+'1'.padStart(64,'0'),metadata={board,chainId:'31337',rollupVersion:'1',mode:'disabled',circuits:['a'.repeat(64)]};
test('wire rejects truncation, trailing bytes and mismatched witness lengths',()=>{const body=encodeJob(metadata,[Uint8Array.of(1,2,3)]);assert.deepEqual([...decodeJob(body).witnesses[0]],[1,2,3]);assert.throws(()=>decodeJob(body.slice(0,-1)));assert.throws(()=>decodeJob(new Uint8Array([...body,0])));});
test('disk FIFO executes serially, enforces per-client and byte limits and cleans payloads',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prover-test-'));const seen=[];let release;
 const worker={prove:async file=>{seen.push((await fs.readFile(file)).toString());await new Promise(r=>{release=r;});return {mode:'disabled'};},close:async()=>release?.()};
 const queue=await createProofQueue({directory,worker,maxJobs:3,maxBytes:5,maxPerClient:1});
 try{const a=await queue.submit(Buffer.from('abc'),'a');while(!release)await new Promise(r=>setTimeout(r,1));await assert.rejects(queue.submit(Buffer.from('x'),'a'));await assert.rejects(queue.submit(Buffer.from('xxx'),'b'));const b=await queue.submit(Buffer.from('xy'),'b');assert.equal(queue.get(b).state,'queued');release();while(seen.length<2)await new Promise(r=>setTimeout(r,1));assert.equal(queue.get(a).state,'complete');release();while(queue.get(b).state!=='complete')await new Promise(r=>setTimeout(r,1));assert.deepEqual(seen,['abc','xy']);assert.equal(queue.stats().bytes,0);assert.deepEqual(await fs.readdir(directory),[]);}finally{await queue.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('HTTP board/mode/origin checks and rate limits run before queue admission',async()=>{
 let count=0;const queue={submit:async()=>{count++;return 'b'.repeat(64);},get:()=>({state:'complete',result:{mode:'disabled'}})};
 const server=createProverServer({queue,board,chainId:31337,rollupVersion:1,proofsEnabled:false,origins:['https://board.example'],requestsPerMinute:3});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const post=(meta=metadata,origin='https://board.example')=>fetch(url+'/v1/jobs',{method:'POST',headers:{'content-type':'application/octet-stream',origin},body:encodeJob(meta,[Uint8Array.of(1)])});
 try{assert.equal((await post(metadata,'https://other.example')).status,403);assert.equal((await post({...metadata,board:'other'})).status,403);assert.equal((await post({...metadata,mode:'real'})).status,403);assert.equal((await post()).status,202);assert.equal((await post()).status,429);assert.equal(count,1);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

// DEVELOPMENT ONLY: HTTP adapter doubles below are not actual node acceptance.
test('query-only HTTP has no proof routes, dummy queue or positive proof readiness',async()=>{
 let calls=0;const privateQuery={health:async()=>{calls++;return {enabled:true,ready:false,reason:'unavailable'};},handle:async()=>{throw Error('Must not route proof body');}};
 assert.throws(()=>createProverServer({serviceMode:'query-only',privateQuery,queue:{}}));
 assert.throws(()=>createProverServer({serviceMode:'query-only',privateQuery,board}));
 assert.throws(()=>createProverServer({serviceMode:'query-only',privateQuery,proofsEnabled:false}));
 const server=createProverServer({serviceMode:'query-only',privateQuery,origins:['https://board.example']});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  const health=await(await fetch(url+'/healthz')).json();assert.deepEqual(health,{ready:true,serviceMode:'query-only',proofs:'not-offered',nodeProofs:'real',queue:null,query:{enabled:true,ready:false,reason:'unavailable'}});
  for(const [method,route,body] of [['POST','/v1/jobs',encodeJob(metadata,[Uint8Array.of(1)])],['POST','/v1/jobs',Uint8Array.of(0)],['GET','/v1/jobs/'+'a'.repeat(64)],['DELETE','/v1/jobs/anything']]){
   const response=await fetch(url+route,{method,headers:{'content-type':'application/octet-stream'},...(body?{body}:{})});assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'Proof service not offered'});
  }
  assert.equal((await fetch(url+'/v1/jobs',{method:'POST',headers:{origin:'https://other.example'}})).status,403);assert.equal(calls,1);
 }finally{await server.closeAndDrain();}
});
test('query-only rejects a held-open proof body without waiting for its remaining bytes',async()=>{
 const {request}=await import('node:http');
 const server=createProverServer({serviceMode:'query-only',privateQuery:{health:async()=>({enabled:true,ready:true})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let requestHandle;
 try{
  const result=await new Promise((resolve,reject)=>{
   requestHandle=request({hostname:'127.0.0.1',port:server.address().port,path:'/v1/jobs',method:'POST',headers:{'content-type':'application/octet-stream','content-length':'999999999'},timeout:2000},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body}));});
   requestHandle.on('error',reject);requestHandle.on('timeout',()=>requestHandle.destroy(Error('Held body was not rejected')));requestHandle.write(Buffer.of(1));
  });
  assert.equal(result.status,404);assert.deepEqual(JSON.parse(result.body),{error:'Proof service not offered'});
 }finally{requestHandle?.destroy();await server.closeAndDrain();}
});
test('HTTP closure waits for admitted upstream work even after downstream disconnect',async()=>{
 let enter,release;const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r);
 const server=createProverServer({serviceMode:'query-only',privateQuery:{health:async()=>{enter();await held;return {enabled:true,ready:true};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const response=fetch('http://127.0.0.1:'+server.address().port+'/healthz').catch(()=>undefined);
 let closed=false;
 try{
  await entered;const closing=server.closeAndDrain().then(()=>{closed=true;});
  await new Promise(r=>setImmediate(r));assert.equal(closed,false);
  release();await closing;await response;assert.equal(closed,true);await server.closeAndDrain();
 }finally{release();await server.closeAndDrain();await response;}
});
