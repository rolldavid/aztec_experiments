import {createHash} from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {encodeJob,decodeJob} from '../shared/remote-prover-wire.mjs';
import {createProofQueue} from '../prover/queue.mjs';
import {createProverServer} from '../prover/server.mjs';
const board='0x'+'1'.padStart(64,'0'),metadata={board,chainId:'31337',rollupVersion:'1',mode:'disabled',circuits:['a'.repeat(64)]};
test('wire rejects truncation, trailing bytes and mismatched witness lengths',async()=>{const body=await encodeJob(metadata,[new Map([[0,'01'.repeat(32)]])]);assert.deepEqual(decodeJob(body).metadata.counts,[1]);assert.throws(()=>decodeJob(body.slice(0,-1)));assert.throws(()=>decodeJob(new Uint8Array([...body,0])));});
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
 const post=async(meta=metadata,origin='https://board.example')=>fetch(url+'/v1/jobs',{method:'POST',headers:{'content-type':'application/octet-stream',origin},body:await encodeJob(meta,[new Map()])});
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
  for(const [method,route,body] of [['POST','/v1/jobs',await encodeJob(metadata,[new Map()])],['POST','/v1/jobs',Uint8Array.of(0)],['GET','/v1/jobs/'+'a'.repeat(64)],['DELETE','/v1/jobs/anything']]){
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


const operatorKey='17'.repeat(32),operatorDigest=createHash('sha256').update(operatorKey).digest('hex');
async function operatorServer(t,handle){
 const server=createProverServer({serviceMode:'query-only',operatorAuthSha256:operatorDigest,origins:['https://board.example'],privateQuery:{
  health:async()=>{throw Error('Health must not be exposed');},handleCompact:async()=>{throw Error('Compact must not be exposed');},handle}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.closeAndDrain());return server;
}
function rawOperatorRequest(server,{headers=[],path='/v1/node',method='POST',unfinished=false}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:['Host','127.0.0.1:'+server.address().port,'Content-Type','application/json',...headers],timeout:2000},res=>{
   let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>{req.destroy();resolve({status:res.statusCode,body,connection:res.headers.connection});});res.on('error',reject);
  });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Operator response deadline')));
  if(unfinished)req.write('{');else req.end('{}');
 });
}
test('operator raw duplicate, malformed, absent and wrong keys reject held-open bodies before handler',async t=>{
 let entered=0;const server=await operatorServer(t,async()=>{entered++;throw Error('Unauthorized handler');});
 const variants=[[],['X-Aztec-Api-Key','18'.repeat(32)],['X-Aztec-Api-Key',operatorKey,'x-aztec-api-key',operatorKey],['X-Aztec-Api-Key',operatorKey+', '+operatorKey],['X-Aztec-Api-Key','f'.repeat(65)],['X-Aztec-Api-Key','F'.repeat(64)],['X-Aztec-Api-Key',''],['X-Aztec-Api-Key','g'.repeat(64)]];
 for(const headers of variants){const r=await rawOperatorRequest(server,{headers:[...headers,'Content-Length','999999999'],unfinished:true});assert.equal(r.status,401);assert.equal(r.connection,'close');assert.deepEqual(JSON.parse(r.body),{error:'Operator request rejected'});assert(!r.body.includes(operatorKey));}
 assert.equal(entered,0);
});
test('authenticated operator exposes only exact POST node path, with origin policy intact',async t=>{
 let entered=0;const server=await operatorServer(t,async(req,res)=>{entered++;res.end('{}');});
 const headers=['x-aztec-api-key',operatorKey];
 for(const path of ['/healthz','/v1/jobs','/v1/jobs/'+'a'.repeat(64),'/v1/compact-block','/v1/node/','/v1/node?x=1','/v1/%6eode','/admin'])assert.equal((await rawOperatorRequest(server,{path,headers})).status,404);
 for(const method of ['GET','OPTIONS','DELETE'])assert.equal((await rawOperatorRequest(server,{method,headers})).status,404);
 assert.equal((await rawOperatorRequest(server,{headers:[...headers,'Origin','https://evil.example']})).status,403);
 assert.equal((await rawOperatorRequest(server,{headers})).status,200);
 assert.equal((await rawOperatorRequest(server,{headers:[...headers,'Origin','https://board.example']})).status,200);assert.equal(entered,2);
});
test('operator server rejects malformed digest and ordinary-mode auth without coercion',()=>{
 let called=0;const bad={toString(){called++;return operatorDigest;}};
 for(const operatorAuthSha256 of [bad,null,0,'x'.repeat(64),'ab'])assert.throws(()=>createProverServer({serviceMode:'query-only',privateQuery:{},operatorAuthSha256}));
 assert.throws(()=>createProverServer({queue:{},operatorAuthSha256:operatorDigest}));assert.equal(called,0);
});
test('authenticated operator closure still waits for admitted upstream handler',async t=>{
 let enter,release;const started=new Promise(r=>enter=r),held=new Promise(r=>release=r);
 const server=await operatorServer(t,async(req,res)=>{enter();await held;if(!res.destroyed)res.end('{}');});
 const response=rawOperatorRequest(server,{headers:['x-aztec-api-key',operatorKey]}).catch(()=>undefined);
 let closed=false;
 try{await started;const closing=server.closeAndDrain().then(()=>{closed=true;});await new Promise(r=>setImmediate(r));assert.equal(closed,false);release();await closing;await response;assert.equal(closed,true);}
 finally{release();await server.closeAndDrain();await response;}
});


test('actual CLI auth helper with real HTTP still denies its credential-free bypass',async t=>{
 let entered=0;const server=await operatorServer(t,async(req,res)=>{entered++;res.end('{}');});
 const source=await fs.readFile(new URL('../apps/src/billboard/deploy/cli.mjs',import.meta.url),'utf8');
 const anchor='function createCliRpcFetch(';assert.equal(source.split(anchor).length,2);
 const start=source.indexOf(anchor),end=source.indexOf('\nif(AZTEC_API_KEY)',start);assert(end>start);
 const context=vm.createContext({URL,Headers,Request});vm.runInContext(source.slice(start,end),context);
 const url='http://127.0.0.1:'+server.address().port+'/v1/node';
 const rpcFetch=context.createCliRpcFetch(fetch,url,operatorKey);
 const init={method:'POST',headers:{'content-type':'application/json'},body:'{}'};
 assert.equal((await rpcFetch(url,init)).status,200);
 assert.equal((await rpcFetch(url,{...init,credentials:'omit',referrerPolicy:'no-referrer'})).status,401);
 assert.equal((await rpcFetch(new Request(url,{...init,credentials:'omit',referrerPolicy:'no-referrer'}))).status,401);
 assert.equal((await rpcFetch(url+'/',init)).status,404);assert.equal(entered,1);
});

test('routed prover is real-proof only and preserves the SDK local route',async()=>{
 const {routedKernelProverClass}=await import('../shared/routed-kernel-prover.mjs');
 let localCalls=0,remoteCalls=0;class Local{async createChonkProof(steps){localCalls++;return steps;}}
 const Prover=routedKernelProverClass(Local),steps=[];
 assert.throws(()=>new Prover({}, {},{proofsEnabled:false,transport:{prove(){remoteCalls++;}}}),/native PXE configuration/);
 const prover=new Prover({}, {},{transport:null});assert.equal(await prover.createChonkProof(steps),steps);assert.equal(localCalls,1);
 prover.setTransport({async prove(){remoteCalls++;return {mode:'disabled'};}});
 await assert.rejects(prover.createChonkProof(steps),/Invalid remote proof/);assert.equal(localCalls,1);assert.equal(remoteCalls,1);
});

test('development application prover selection leaves native proof configuration in control',async()=>{
 const {applicationProver}=await import('./testing/proof-policy.mjs');const prior=process.env.BOARD_TEST_PROOFS;
 const options={threads:1},remote={get url(){throw Error('Disabled mode must not construct a transport');}};
 try{
  delete process.env.BOARD_TEST_PROOFS;assert.equal(applicationProver(options,remote),options);
  process.env.BOARD_TEST_PROOFS='disabled';assert.equal(applicationProver(options,remote),options);
  process.env.BOARD_TEST_PROOFS='real';assert.equal(applicationProver(options),options);
  const prover=applicationProver(options,{url:'https://prover.example',board:'1',chainId:11155111,rollupVersion:1});assert.equal(typeof prover.transport.prove,'function');
  process.env.BOARD_TEST_PROOFS='invalid';assert.throws(()=>applicationProver(options),/Invalid BOARD_TEST_PROOFS/);
 }finally{if(prior===undefined)delete process.env.BOARD_TEST_PROOFS;else process.env.BOARD_TEST_PROOFS=prior;}
});

test('proof queue retains owned work and results until terminal acknowledgement',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval']});
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'proof-retention-'));const gates=[];
 const worker={prove:()=>new Promise(resolve=>gates.push(resolve)),async close(){}};
 const queue=await createProofQueue({directory,worker,maxJobs:2,maxPerClient:2});
 try{
  const first=await queue.submit(Buffer.from('a'),'client');const second=await queue.submit(Buffer.from('b'),'client');
  t.mock.timers.tick(31*60*1000);
  assert.equal(queue.get(first).state,'running');assert.equal(queue.get(second).state,'queued');
  assert.equal(await queue.acknowledge(first),false);assert.equal(await queue.acknowledge(second),false);
  gates[0]({mode:'disabled'});while(queue.get(first).state!=='complete'||gates.length<2)await new Promise(setImmediate);
  t.mock.timers.tick(61000);assert.equal(queue.get(first).state,'complete');
  const third=await queue.submit(Buffer.from('c'),'client');assert.equal(queue.get(first),null);assert.equal(queue.get(second).state,'running');assert.equal(queue.get(third).state,'queued');
  await assert.rejects(queue.submit(Buffer.from('d'),'client'),{status:429});
  assert.equal(await queue.acknowledge(first),true);assert.equal(await queue.acknowledge(third),false);
  gates[1]({mode:'disabled'});while(queue.get(second).state!=='complete'||gates.length<3)await new Promise(setImmediate);
  assert.equal(await queue.acknowledge(second),true);
  gates[2]({mode:'disabled'});while(queue.get(third).state!=='complete')await new Promise(setImmediate);
  assert.equal(await queue.acknowledge(third),true);assert.equal(queue.stats().jobs,0);
 }finally{await queue.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('proof acknowledgement cannot cancel active work or bypass origin policy',async()=>{
 let acknowledgements=0;const id='a'.repeat(64);
 const queue={acknowledge:async()=>{acknowledgements++;return false;},get:()=>({state:'running'})};
 const server=createProverServer({queue,origins:['https://board.example']});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/v1/jobs/'+id;
 try{
  assert.equal((await fetch(url,{method:'DELETE',headers:{origin:'https://other.example'}})).status,403);assert.equal(acknowledgements,0);
  assert.equal((await fetch(url,{method:'DELETE',headers:{origin:'https://board.example'}})).status,409);assert.equal(acknowledgements,1);
  assert.equal((await(await fetch(url)).json()).state,'running');
 }finally{await server.closeAndDrain();}
});

test('proof admission reports numeric body, validation and persistence phases only after queue acceptance',async()=>{
 let enter,release;const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r);
 const queue={submit:async body=>{assert.equal(decodeJob(body).metadata.version,2);enter();await held;return 'b'.repeat(64);}};
 const server=createProverServer({queue,board,chainId:31337,rollupVersion:1,proofsEnabled:false});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let done=false;
 try{
  const request=fetch('http://127.0.0.1:'+server.address().port+'/v1/jobs',{method:'POST',headers:{'content-type':'application/octet-stream'},body:await encodeJob(metadata,[new Map()])}).then(response=>{done=true;return response;});
  await entered;await new Promise(r=>setImmediate(r));assert.equal(done,false);release();const response=await request;
  assert.equal(response.status,202);assert.match(response.headers.get('server-timing'),/^body;dur=\d+\.\d{3},validate;dur=\d+\.\d{3},queue;dur=\d+\.\d{3}$/);
 }finally{release();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
