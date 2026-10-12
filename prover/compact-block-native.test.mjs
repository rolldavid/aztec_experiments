import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {once,EventEmitter} from 'node:events';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {BlockNumber,CheckpointNumber,IndexWithinCheckpoint} from '@aztec-labs/foundation/branded-types';
import {BlockHash,Body,L2Block} from '@aztec-labs/stdlib/block';
import {BlockHeader,GlobalVariables,TxEffect,TxHash} from '@aztec-labs/stdlib/tx';
import {AppendOnlyTreeSnapshot} from '@aztec-labs/stdlib/trees';
import {RevertCode,PublicDataWrite} from '@aztec-labs/stdlib/avm';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {PrivateLog,PublicLog,ContractClassLog,ContractClassLogFields} from '@aztec-labs/stdlib/logs';
import {authenticateCompactBlock} from '../shared/rolling/compact-block.mjs';
import {createCompactBlockNativeAdapter,COMPACT_BLOCK_NATIVE_ROUTE as route,COMPACT_BLOCK_NATIVE_LIMITS as limits} from './compact-block-native.mjs';

after(async()=>{await BarretenbergSync.destroySingleton();});
// Synthetic canonical-node fixtures, actual pinned SDK block/header/effects and
// actual loopback HTTP. These do NOT qualify a deployed node or private recovery.
const rollup='0x'+'12'.repeat(20),scope={chainId:31337,version:1,rollup};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function effect(id=1) {
 return new TxEffect(RevertCode.OK,new TxHash(new Fr(id)),Fr.ZERO,[],[new Fr(id+10)],[],[],
  [PrivateLog.fromBlobFields(2,[new Fr(7),new Fr(8)])],[],[]);
}
async function fixture(effects=[effect()],tier='checkpointed') {
 const body=new Body(effects),header=BlockHeader.empty({globalVariables:GlobalVariables.empty({
  chainId:new Fr(31337),version:new Fr(1),blockNumber:BlockNumber(7),timestamp:100n}),txEffectsTreeRoot:await body.computeTxEffectsTreeRoot()});
 const hash=await header.hash(),block=new L2Block(AppendOnlyTreeSnapshot.empty(),header,body,CheckpointNumber(1),IndexWithinCheckpoint(0));
 const tip={number:7,hash},state={calls:0,reads:0,stale:false,wrongScope:false,wrongProof:false,changed:false,receivers:[]};
 const node={
  async getNodeInfo(){state.receivers.push(this);state.calls++;return {l1ChainId:state.wrongScope?1:31337,rollupVersion:1,realProofs:state.wrongProof,l1ContractAddresses:{rollupAddress:rollup}};},
  async getChainTips(){return {proposed:tip,checkpointed:{block:tip},proven:{block:tip},finalized:{block:tip}};},
  async getWorldStateSyncStatus(){return {latestBlockNumber:7,latestBlockHash:hash,finalizedBlockNumber:7,oldestHistoricBlockNumber:0,treesAreSynched:true};},
  async getSyncedL1Timestamp(){return BigInt(Math.floor(Date.now()/1000)-(state.stale?601:0));},
  async getBlockData(){return {blockHash:state.changed?BlockHash.fromString(new Fr(999).toString()):hash,header};},
  async getBlock(selector,options){state.receivers.push(this);state.reads++;assert(selector.hash instanceof BlockHash);assert.equal(selector.hash.toString(),hash.toString());
   assert.deepEqual(options,{includeTransactions:true,includeL1PublishInfo:false,includeAttestations:false});
   return {hash,number:7,archive:block.archive,header,body,checkpointNumber:block.checkpointNumber,indexWithinCheckpoint:block.indexWithinCheckpoint};},
 };
 return {node,state,body,block,header,hash,config:{node,expectedNetworkScope:scope,proofsEnabled:false,tier},
  request:{schemaVersion:1,number:7,hash:hash.toString(),tier}};
}
async function server(f,fn) {
 const adapter=createCompactBlockNativeAdapter(f.config);
 const pending=new Set();
 const listener=http.createServer((req,res)=>{const run=adapter.handle(req,res);pending.add(run);run.then(handled=>{if(!handled){res.writeHead(404);res.end();}}).catch(()=>{res.destroy();}).finally(()=>pending.delete(run));});
 listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const url='http://127.0.0.1:'+listener.address().port;
 const send=(body=f.request,options={})=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json',...options.headers},body:typeof body==='string'?body:JSON.stringify(body),...options});
 try{return await fn({send,url,adapter,settle:()=>Promise.all([...pending])});}finally{listener.closeAllConnections();await new Promise((resolve,reject)=>listener.close(e=>e?reject(e):resolve()));}
}
async function denied(response,status) {assert.equal(response.status,status);assert.deepEqual(await response.json(),{error:'Compact block unavailable'});}

test('source: protocol limits, no duplicate effects-root hashing and no detached timeout',()=>{
 assert.deepEqual(limits,{requestBytes:1024,responseBytes:2097152,timeoutMs:10000,fields:24575,transactions:6142});
 const source=fs.readFileSync(new URL('./compact-block-native.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/computeTxEffectsTree|authenticateCompactBlock|Promise\.race|fetch\(/);
 assert.match(source,/inspectTrustedNode/);
});
for(const tier of ['proposed','checkpointed','proven','finalized'])test('actual SDK/HTTP: compact body authenticates at configured '+tier,async()=>{
 const f=await fixture(undefined,tier);
 await server(f,async({send})=>{
  const response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const value=await response.json();assert.deepEqual(value.fields,f.block.toBlobFields().map(x=>x.toString()));
  const verified=await authenticateCompactBlock({...value,expectedBlockHash:f.hash.toString(),assertCanonical:()=>true});
  assert.equal(verified.txCount,1);assert.equal(verified.ciphertexts.length,1);assert.equal(f.state.reads,1);
  assert(f.state.receivers.every(x=>x===f.node));
 });
});
test('actual SDK/HTTP: empty block stays complete',async()=>{
 const f=await fixture([]);await server(f,async({send})=>{const r=await send();assert.equal(r.status,200);const v=await r.json();assert.equal(v.fields.length,7);
  assert.equal((await authenticateCompactBlock({...v,expectedBlockHash:f.hash.toString(),assertCanonical:()=>true})).txCount,0);});
});
for(const [name,change] of Object.entries({extra:r=>({...r,owner:'PRIVATE_SENTINEL'}),tier:r=>({...r,tier:'proposed'}),zero:r=>({...r,number:0}),fraction:r=>({...r,number:1.5}),hash:r=>({...r,hash:'0x1'}),version:r=>({...r,schemaVersion:2})}))
 test('HTTP: rejects closed selector '+name+' before native queries',async()=>{
  const f=await fixture();await server(f,async({send})=>{await denied(await send(change(f.request)),400);assert.equal(f.state.calls,0);});
 });
test('HTTP: rejects malformed, oversized, browser-origin and non-JSON requests',async()=>{
 const f=await fixture();await server(f,async({send})=>{
  await denied(await send('{PRIVATE_SENTINEL'),400);await denied(await send('x'.repeat(1025)),413);
  await denied(await send(f.request,{headers:{origin:'http://localhost','content-type':'application/json'}}),415);
  await denied(await send(f.request,{headers:{'content-type':'text/plain'}}),415);assert.equal(f.state.calls,0);
 });
});
test('HTTP: route is exact, nonPOST denied and middleware leaves unrelated requests alone',async()=>{
 const f=await fixture();await server(f,async({url,adapter})=>{
  assert.equal((await fetch(url+route+'?owner=PRIVATE_SENTINEL')).status,404);
  await denied(await fetch(url+route),405);let next=0;const ctx={req:{url:'/else'}};await adapter.middleware(ctx,()=>{next++;});assert.equal(next,1);assert.equal(ctx.respond,undefined);
 });
});
for(const flag of ['stale','wrongScope','wrongProof'])test('readiness: '+flag+' blocks native body reads',async()=>{
 const f=await fixture();f.state[flag]=true;await server(f,async({send})=>{await denied(await send(),503);assert.equal(f.state.reads,0);});
});
test('canonical: reorg during body await produces no successful result',async()=>{
 const f=await fixture(),read=f.node.getBlock;f.node.getBlock=async function(...args){const result=await read.apply(this,args);f.state.changed=true;return result;};
 await server(f,async({send})=>{await denied(await send(),503);assert.equal(f.state.reads,1);});
});
test('canonical: wrong native response hash and header network are rejected',async()=>{
 for(const mutation of [r=>({...r,hash:BlockHash.fromString(new Fr(999).toString())}),r=>({...r,header:BlockHeader.empty()})]){
  const f=await fixture(),read=f.node.getBlock;f.node.getBlock=async function(...args){return mutation(await read.apply(this,args));};
  await server(f,async({send})=>{await denied(await send(),503);});
 }
});
test('tier: a block above configured tier is unavailable even with synchronized proposed tip',async()=>{
 const f=await fixture();const original=f.node.getChainTips;f.node.getChainTips=async()=>{const tips=await original();tips.finalized.block={number:6,hash:f.hash};return tips;};
 const originalWorldState=f.node.getWorldStateSyncStatus;f.node.getWorldStateSyncStatus=async()=>({...await originalWorldState(),finalizedBlockNumber:6});
 f.config.tier='finalized';f.request.tier='finalized';await server(f,async({send})=>{await denied(await send(),503);assert.equal(f.state.reads,0);});
});
test('bounds: oversized transaction array rejects before reading an element or flattening',async()=>{
 const f=await fixture(),items=new Array(6143);let touched=0;Object.defineProperty(items,0,{get(){touched++;throw Error('PRIVATE_SENTINEL');}});f.body.txEffects=items;
 f.body.toTxBlobData=()=>{throw Error('Flattening must not run');};await server(f,async({send})=>{await denied(await send(),503);assert.equal(touched,0);});
});
for(const [name,mutate] of Object.entries({notes:e=>{e.noteHashes=new Array(65);},nullifiers:e=>{e.nullifiers=[];},private:e=>{e.privateLogs=new Array(65);},public:e=>{e.publicLogs=new Array(2049);},class:e=>{e.contractClassLogs=new Array(2);},padding:e=>{e.privateLogs[0].fields[15]=new Fr(1);}}))
 test('bounds: '+name+' rejects before flattening',async()=>{
  const f=await fixture();mutate(f.body.txEffects[0]);let flattened=0;f.body.toTxBlobData=()=>{flattened++;throw Error('PRIVATE_SENTINEL');};
  await server(f,async({send})=>{await denied(await send(),503);assert.equal(flattened,0);});
 });
test('bounds: aggregate protocol field limit rejects before flattening',async()=>{
 const f=await fixture();const e=f.body.txEffects[0];e.noteHashes=Array(64).fill(new Fr(1));e.nullifiers=Array(64).fill(new Fr(2));
 f.body.txEffects=Array(200).fill(e);let flattened=0;f.body.toTxBlobData=()=>{flattened++;throw Error('PRIVATE_SENTINEL');};
 await server(f,async({send})=>{await denied(await send(),503);assert.equal(flattened,0);});
});
test('native errors are sanitized and subsequent explicit requests can run',async()=>{
 const f=await fixture(),read=f.node.getBlock;let broken=true;f.node.getBlock=function(...args){if(broken)throw Error('PRIVATE_SENTINEL');return read.apply(this,args);};
 await server(f,async({send})=>{await denied(await send(),503);broken=false;assert.equal((await send()).status,200);});
});
test('singleflight: abort does not release ownership before original native await settles',async()=>{
 const f=await fixture(),entered=deferred(),release=deferred(),read=f.node.getBlock;
 f.node.getBlock=async function(...args){entered.resolve();await release.promise;return read.apply(this,args);};
 await server(f,async({send,settle})=>{
  const controller=new AbortController(),first=send(f.request,{signal:controller.signal}).catch(e=>e);
  await entered.promise;await denied(await send(),429);controller.abort();await first;
  await denied(await send(),429);release.resolve();
  // Wait on the actual original HTTP handler, not a detached timeout or retry.
  await settle();
  assert.equal((await send()).status,200);assert.equal(f.state.reads,2);
 });
});
test('configuration: malformed/accessor capabilities fail without getter side effects',()=>{
 let reads=0;const options={};Object.defineProperty(options,'expectedNetworkScope',{get(){reads++;return scope;}});
 assert.throws(()=>createCompactBlockNativeAdapter(options),/Invalid compact block native configuration/);assert.equal(reads,0);
 for(const input of [{expectedNetworkScope:scope,proofsEnabled:false,tier:'bogus'},{expectedNetworkScope:{...scope,chainId:1},proofsEnabled:false,tier:'proposed'}])
  assert.throws(()=>createCompactBlockNativeAdapter(input),/Invalid compact block native configuration/);
});

test('HTTP: chunked byte overflow is bounded and returns a fixed failure',async()=>{
 const f=await fixture();await server(f,async({url})=>{
  const result=await new Promise((resolve,reject)=>{
   const req=http.request(url+route,{method:'POST',headers:{'content-type':'application/json','transfer-encoding':'chunked'}},res=>{
    let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,text}));
   });req.on('error',reject);req.write('x'.repeat(700));req.end('x'.repeat(325));
  });assert.equal(result.status,413);assert.equal(result.text,JSON.stringify({error:'Compact block unavailable'}));assert.equal(f.state.calls,0);
 });
});
test('captured native receiver/method and immutable configuration survive caller changes',async()=>{
 const f=await fixture();await server(f,async({send})=>{
  f.node.getBlock=()=>{throw Error('PRIVATE_SENTINEL');};f.config.tier='finalized';f.config.expectedNetworkScope={chainId:1,version:1,rollup};
  assert.equal((await send()).status,200);assert.equal(f.state.reads,1);
 });
});

test('actual SDK: all effect categories are preserved without padding inflation',async()=>{
 const e=effect();e.noteHashes=[new Fr(22)];e.l2ToL1Msgs=[new Fr(23)];e.publicDataWrites=[new PublicDataWrite(new Fr(24),new Fr(25))];
 e.publicLogs=[new PublicLog(AztecAddress.fromFieldUnsafe(new Fr(26)),[new Fr(27),new Fr(28)])];
 e.contractClassLogs=[new ContractClassLog(AztecAddress.fromFieldUnsafe(new Fr(29)),ContractClassLogFields.fromEmittedFields([new Fr(30),new Fr(31)]),2)];
 const f=await fixture([e]);await server(f,async({send})=>{
  const r=await send();assert.equal(r.status,200);const v=await r.json();assert.deepEqual(v.fields,f.block.toBlobFields().map(x=>x.toString()));
  assert(v.fields.length<40);await authenticateCompactBlock({...v,expectedBlockHash:f.hash.toString(),assertCanonical:()=>true});
 });
});
test('readiness: missing canonical metadata is not treated as an empty block',async()=>{
 const f=await fixture();f.node.getBlockData=async()=>undefined;await server(f,async({send})=>{await denied(await send(),503);assert.equal(f.state.reads,0);});
});

// Deterministic request/socket controls exercise the actual handler, without
// opening listeners. A held close models the interval after rejection flushing.
function compactSocketControl({declared=false,finish=true}={}){
 const socket=new EventEmitter();socket.closed=false;socket.destroyCalls=0;
 socket.destroy=()=>{socket.destroyCalls++;};
 socket.completeClose=()=>{if(!socket.closed){socket.closed=true;socket.emit('close');}};
 const req=new EventEmitter();Object.assign(req,{url:route,method:'POST',headers:{'content-type':'application/json',...(declared?{'content-length':'1025'}:{})},socket,aborted:false,iterations:0,destroyCalls:0});
 req.iterator=async function*(){this.iterations++;yield Buffer.alloc(1025,32);};
 req.destroy=()=>{req.destroyCalls++;req.aborted=true;req.emit('aborted');socket.completeClose();};
 let ended;const end=new Promise(r=>{ended=r;});const res=new EventEmitter();
 Object.assign(res,{destroyed:false,writableEnded:false,writableFinished:false,writeHead(status,headers){this.status=status;this.headers=headers;},end(){this.writableEnded=true;ended();if(finish){this.writableFinished=true;this.emit('finish');}}});
 return {req,res,socket,end};
}
function controlledCompactQuery(inspect){
 const node=Object.fromEntries(['getNodeInfo','getChainTips','getWorldStateSyncStatus','getSyncedL1Timestamp','getBlockData','getBlock'].map(name=>[name,inspect]));
 return createCompactBlockNativeAdapter({node,expectedNetworkScope:scope,proofsEnabled:false,tier:'checkpointed'});
}
for(const declared of [false,true])test(`compact ${declared?'declared':'chunked'} rejection retains actual handler slot until socket closes`,async()=>{
 let inspections=0;const query=controlledCompactQuery(async()=>{inspections++;});
 const held=compactSocketControl({declared});const pending=query.handle(held.req,held.res);await held.end;
 assert.equal(held.res.status,413);assert.equal(held.res.headers.Connection,'close');assert.equal(held.req.iterations,declared?0:1);
 const second=compactSocketControl({declared});await query.handle(second.req,second.res);assert.equal(second.res.status,429);assert.equal(inspections,0);
 held.socket.completeClose();await pending;assert.equal(held.req.listenerCount('aborted'),0);assert.equal(held.socket.listenerCount('close'),0);
 const third=compactSocketControl({declared});const next=query.handle(third.req,third.res);await third.end;assert.equal(third.res.status,413);third.socket.completeClose();await next;
});
for(const declared of [false,true])test(`compact ${declared?'declared':'chunked'} unfinished rejection uses existing deadline and cleanup`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const query=controlledCompactQuery(async()=>{throw Error('Must not inspect invalid body');});
 const held=compactSocketControl({declared,finish:false});const pending=query.handle(held.req,held.res);await held.end;
 assert.equal(held.res.status,413);assert.equal(held.socket.closed,false);assert.equal(held.req.destroyCalls,0);
 t.mock.timers.tick(limits.timeoutMs);await pending;
 assert.equal(held.req.destroyCalls,1);assert.equal(held.socket.closed,true);assert.equal(held.req.listenerCount('aborted'),0);assert.equal(held.socket.listenerCount('close'),0);assert.equal(held.res.listenerCount('finish'),0);
});

test('HTTP: oversized unfinished chunked request closes the actual connection',async()=>{
 const f=await fixture();await server(f,async({url,send})=>{
  let request,socket,responseStatus,connection;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{request?.destroy();reject(Error('Test socket cleanup deadline'));},2000);
   const fail=error=>{clearTimeout(timer);reject(error);};
   request=http.request(url+route,{method:'POST',headers:{'content-type':'application/json','transfer-encoding':'chunked','connection':'keep-alive'}},res=>{
    responseStatus=res.statusCode;connection=res.headers.connection;res.resume();res.on('error',fail);
   });
   request.on('error',error=>{if(!responseStatus)fail(error);});
   request.on('socket',value=>{socket=value;socket.once('close',()=>{clearTimeout(timer);resolve();});});
   request.write(Buffer.alloc(1025,32));
  });
  assert.equal(responseStatus,413);assert.equal(connection,'close');assert.equal(socket.destroyed,true);assert.equal(request.writableEnded,false);
  assert.equal(f.state.calls,0);assert.equal((await send()).status,200);
 });
});
test('deadline retains the native call until actual settlement',async t=>{
 const f=await fixture(),entered=deferred(),release=deferred();
 f.node.getNodeInfo=async()=>{entered.resolve();await release.promise;throw Error('PRIVATE');};
 const adapter=createCompactBlockNativeAdapter(f.config);
 const held=compactSocketControl();held.req.iterator=async function*(){yield Buffer.from(JSON.stringify(f.request));};
 t.mock.timers.enable({apis:['setTimeout']});
 // Model complete IncomingMessage.destroy(): it no longer destroys its socket.
 held.req.destroy=()=>{held.req.destroyCalls++;};
 const pending=adapter.handle(held.req,held.res);await entered.promise;
 t.mock.timers.tick(limits.timeoutMs);assert.equal(held.req.destroyCalls,1);assert.equal(held.socket.destroyCalls,1);
 const second=compactSocketControl();await adapter.handle(second.req,second.res);assert.equal(second.res.status,429);
 release.resolve();await pending;assert.equal(held.res.status,undefined);
 const third=compactSocketControl({declared:true});const next=adapter.handle(third.req,third.res);await third.end;
 assert.equal(third.res.status,413);third.socket.completeClose();await next;
 assert.equal(held.req.listenerCount('aborted'),0);assert.equal(held.res.listenerCount('close'),0);
});
