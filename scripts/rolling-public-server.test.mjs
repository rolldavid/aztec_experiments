// Labelled HTTP-boundary doubles; ephemeral loopback HTTP only, no chain/wallet.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startRollingPublicServer,createRollingPublicIndexFromConfig} from './rolling-public-server.mjs';
async function fixture(t){const state={ready:true,calls:[],syncs:0,active:0,peak:0};
 const index={status:()=>({schemaVersion:1,state:state.ready?'ready':'authenticating',complete:state.ready}),
  sync:async()=>{state.syncs++;state.active++;state.peak=Math.max(state.peak,state.active);await new Promise(r=>setTimeout(r,3));state.active--;},
  query:(view,params)=>{state.calls.push({view,params});if(params.cursor==='bad')throw Object.assign(Error('PRIVATE_SENTINEL'),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
   return {schemaVersion:1,posts:[{text:'<script>alert(1)</script>'}],view,params,names:{},boards:{}};}};
 const server=await startRollingPublicServer({index,pollMs:100,staticHandler:async(req,res)=>{if(req.url==='/index.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<p>Public assets</p>');}else{res.writeHead(404);res.end();}}});
 t.after(()=>server.close());return {state,index,server,get:route=>fetch(server.url+route)};
}
test('strict public routes, bounded query parameters and no private/RPC surfaces',async t=>{
 const f=await fixture(t);
 for(const route of ['/api/home?limit=2','/api/feed?limit=2','/api/directory?query=build','/api/thread?root=10','/api/profile?nameId=20','/api/post?id=30'])assert.equal((await f.get(route)).status,200);
 for(const route of ['/api/home?homeSubboards=1','/api/home?subboard=1','/api/feed?owner=secret','/api/feed?limit=0','/api/feed?limit=101','/api/feed?limit=1&limit=2','/api/thread','/api/profile?nameId=0x42','/api/post?id=-1','/api/feed?cursor='+('a'.repeat(121))])assert.equal((await f.get(route)).status,400,route);
 for(const route of ['/api/owned_names','/api/simulate','/api/wallet','/api/constructor','/api/status/x'])assert.equal((await f.get(route)).status,404);
 assert.equal((await fetch(f.server.url+'/api/feed',{method:'POST',body:'{}'})).status,405);
 assert.equal((await fetch(f.server.url+'/api/feed',{method:'HEAD'})).status,405);
 assert.equal((await f.get('/api/feed?cursor=bad')).status,409);
 assert.ok(!JSON.stringify(f.state.calls).includes('secret'));
});
test('cold cache exposes status but data503; same-origin composition does not proxy',async t=>{
 const f=await fixture(t);f.state.ready=false;
 assert.equal((await f.get('/api/status')).status,200);assert.equal((await f.get('/api/feed')).status,503);assert.equal(f.state.calls.length,0);
 assert.equal((await f.get('/index.html')).status,200);assert.equal((await f.get('/config.json')).status,404);
});
test('JSON content cannot execute, missing CORS and fixed error bodies omit upstream data',async t=>{
 const f=await fixture(t),response=await f.get('/api/feed');
 assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(response.headers.get('access-control-allow-origin'),null);
 assert.equal((await response.json()).posts[0].text,'<script>alert(1)</script>');
 const rejected=await f.get('/api/feed?cursor=bad');assert.ok(!(await rejected.text()).includes('PRIVATE_SENTINEL'));
 f.index.query=()=>({value:'x'.repeat(1048577)});assert.equal((await f.get('/api/feed')).status,503);
});
test('sync has one owner, close joins current update, no externally bound host',async t=>{
 const f=await fixture(t);await new Promise(r=>setTimeout(r,220));assert.ok(f.state.syncs>=2);assert.equal(f.state.peak,1);
 await assert.rejects(startRollingPublicServer({index:f.index,host:'0.0.0.0'}));
});

for(const succeeds of [true,false])test(`data HTTP joins one delayed ${succeeds?'successful':'failed'} canonical sync; status stays immediate`,async t=>{
 let release,started,queries=0,syncs=0,state='syncing';
 const begun=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const index={status:()=>({schemaVersion:1,state}),sync:async()=>{syncs++;started();await gate;
   state=succeeds?'ready':'unavailable';if(!succeeds)throw Error('PRIVATE_SENTINEL');},
   query:()=>{queries++;return {schemaVersion:1,posts:[]};}};
 const server=await startRollingPublicServer({index,pollMs:30000});t.after(()=>server.close());await begun;
 let completed=false;const request=fetch(server.url+'/api/feed').then(response=>{completed=true;return response;});
 const status=await fetch(server.url+'/api/status');assert.equal(status.status,200);assert.equal((await status.json()).state,'syncing');
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(completed,false);assert.equal(queries,0);assert.equal(syncs,1);
 release();const response=await request;assert.equal(response.status,succeeds?200:503);
 assert.equal(queries,succeeds?1:0);assert.equal(syncs,1);assert.ok(!(await response.text()).includes('PRIVATE_SENTINEL'));
});
test('shared config factory rejects invalid port/extras/private URL before artifact or storage I/O',async()=>{
 const config={nodeUrl:'http://127.0.0.1:1',get artifactPath(){throw Error('UNEXPECTED_ARTIFACT_ACCESS');},scope:{},deployment:{},
  get cacheDirectory(){throw Error('UNEXPECTED_STORAGE_ACCESS');},port:0};
 for(const port of [-1,65536,1.5,'0',null]){
  const candidate=Object.defineProperties({},Object.getOwnPropertyDescriptors(config));candidate.port=port;
  await assert.rejects(createRollingPublicIndexFromConfig(candidate),{message:'Invalid public index configuration'});
 }
 for(const nodeUrl of ['https://user:secret@example.com','https://example.com/?secret=x','https://example.com/#key','http://example.com']){
  const candidate=Object.defineProperties({},Object.getOwnPropertyDescriptors(config));candidate.nodeUrl=nodeUrl;
  await assert.rejects(createRollingPublicIndexFromConfig(candidate),{message:'Invalid public index configuration'});
 }
 for(const homeSubboards of [null,['0'],['1','1'],['0x1'],[1],Array(257).fill('1')]){
  const candidate=Object.defineProperties({},Object.getOwnPropertyDescriptors(config));candidate.homeSubboards=homeSubboards;
  await assert.rejects(createRollingPublicIndexFromConfig(candidate),{message:'Invalid public index configuration'});
 }
 const extra=Object.defineProperties({},Object.getOwnPropertyDescriptors(config));extra.wallet={};
 await assert.rejects(createRollingPublicIndexFromConfig(extra),{message:'Invalid public index configuration'});
});
test('shared factory constructs real decoder and bounded storage without starting public RPC or listener',async t=>{
 const [{readFile,mkdtemp,rm},{tmpdir},{join},{loadContractArtifact},{getContractClassFromArtifact}]=await Promise.all([
  import('node:fs/promises'),import('node:os'),import('node:path'),import('@aztec-labs/stdlib/abi'),import('@aztec-labs/stdlib/contract')]);
 const artifactPath=process.env.ROLLING_TEST_ARTIFACT??new URL('../billboard/target/rolling_contract-RollingBoard.json',import.meta.url);
 const artifact=loadContractArtifact(JSON.parse(await readFile(artifactPath,'utf8'))),classId=(await getContractClassFromArtifact(artifact)).id.toString();
 const cacheDirectory=await mkdtemp(join(tmpdir(),'rolling-server-config-'));t.after(()=>rm(cacheDirectory,{recursive:true,force:true}));
 const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
 const {index,port}=await createRollingPublicIndexFromConfig({nodeUrl:'http://127.0.0.1:1',artifactPath,cacheDirectory,port:0,homeSubboards:['17'],
  scope:{chainId:'31337',rollupVersion:'1',rollupAddress:'0x'+'11'.repeat(20),boardAddress:hex(42),classId},
  deployment:{blockNumber:1,blockHash:hex(1),txHash:hex(2)}});
 assert.equal(port,0);assert.equal(index.status().state,'authenticating');assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
});


test('board route requires one canonical public id and bounded scoped cursor',async t=>{
 const f=await fixture(t);assert.equal((await f.get('/api/board?id=0&limit=1')).status,200);assert.deepEqual(f.state.calls.at(-1),{view:'board',params:{id:'0',limit:1}});
 for(const route of ['/api/board','/api/board?id=01','/api/board?id=-1','/api/board?id=1&id=2','/api/board?id=1&owner=private','/api/board?id=1&cursor='+('a'.repeat(201))])assert.equal((await f.get(route)).status,400);
 f.index.query=()=>{throw Object.assign(Error('PRIVATE_SENTINEL'),{code:'ROLLING_PUBLIC_NOT_FOUND'});};const response=await f.get('/api/board?id=999');assert.equal(response.status,404);assert.deepEqual(await response.json(),{schemaVersion:1,error:'not-found'});
});
