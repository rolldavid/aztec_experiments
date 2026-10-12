// Actual installed CLI/server/IncomingMessage; the node below is explicitly a
// labelled method double. No deployed native-node acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {z} from 'zod';
import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {createNamespacedSafeJsonRpcServer,startHttpRpcServer} from '@aztec-labs/foundation/json-rpc/server';
import {getVersioningMiddleware} from '@aztec-labs/stdlib/versioning';
import {transformCompactNodeStartup,createCompactNodeMiddlewares} from './compact-node-registration.mjs';
const source=()=>fs.readFileSync('node_modules/@aztec-labs/aztec/dest/cli/aztec_start_action.js','utf8');
const config=()=>({l1ChainId:31337,rollupVersion:1,realProofs:false,rollupAddress:EthAddress.fromString('0x'+'12'.repeat(20))});
const route='/rolling/compact-block-v1',selector={schemaVersion:1,number:1,hash:'0x'+'01'.repeat(32),tier:'checkpointed'};
const versions={l1ChainId:'31337',rollupVersion:'1'},opts={packageVersion:'6.0.0-rc.3'};
function fixture(){
 const calls=[];const node=Object.fromEntries(['getNodeInfo','getChainTips','getWorldStateSyncStatus','getSyncedL1Timestamp','getBlockData','getBlock'].map(name=>[name,async function(){calls.push({name,receiver:this});throw Error('PRIVATE sentinel');}]));
 node.ping=async()=> 'pong';
 return {node,calls,services:{aztec:[node,{ping:z.function({input:z.tuple([]),output:z.string()})}]}};
}
async function server(f,middlewares,fn,maxBodySizeBytes=4096){
 const rpc=createNamespacedSafeJsonRpcServer(f.services,{middlewares,maxBodySizeBytes,corsAllowedOrigins:['https://app.example']});
 const http=await startHttpRpcServer(rpc,{host:'127.0.0.1',port:0,headersTimeoutMs:1000,keepAliveTimeoutMs:1000});
 try{return await fn('http://127.0.0.1:'+http.port);}finally{http.closeAllConnections();await new Promise((resolve,reject)=>http.close(e=>e?reject(e):resolve()));}
}
test('pinned CLI transform changes only the main middleware and rejects all drift',()=>{
 const original=source(),changed=transformCompactNodeStartup(original);
 assert(changed.includes('...__rollingCompactMiddlewares(services, config, process.env.ROLLING_COMPACT_TIER, versions, versioningOpts)'));
 assert.equal(changed.slice(changed.indexOf('    // If there are any admin services')),original.slice(original.indexOf('    // If there are any admin services')));
 const restored=changed.replace(/^import[^\n]*__rollingCompactMiddlewares[^\n]*\n/,'').replace('getVersioningMiddleware(versions, versioningOpts),\n                ...__rollingCompactMiddlewares(services, config, process.env.ROLLING_COMPACT_TIER, versions, versioningOpts)','getVersioningMiddleware(versions, versioningOpts)');
 assert.equal(restored,original);
 for(const s of [original+' ',original.replace('middlewares: [','middlewares: [] //'),changed,''])assert.throws(()=>transformCompactNodeStartup(s),/Invalid compact node registration/);
});
test('default off and explicit resolved configuration; no getters or inferred identity',()=>{
 assert.deepEqual(createCompactNodeMiddlewares(undefined,undefined,undefined),[]);
 const f=fixture();
 for(const tier of ['',null,'latest',{}])assert.throws(()=>createCompactNodeMiddlewares(f.services,config(),tier,versions,opts));
 for(const c of [undefined,{...config(),rollupVersion:'canonical'},{...config(),realProofs:undefined},{...config(),l1ChainId:1},{...config(),rollupAddress:'0x'+'12'.repeat(20)}])assert.throws(()=>createCompactNodeMiddlewares(f.services,c,'checkpointed',versions,opts));
 assert.throws(()=>createCompactNodeMiddlewares({},config(),'checkpointed',versions,opts));
 let reads=0;const services={};Object.defineProperty(services,'aztec',{get(){reads++;return f.services.aztec;}});
 assert.throws(()=>createCompactNodeMiddlewares(services,config(),'checkpointed',versions,opts));assert.equal(reads,0);assert.deepEqual(f.calls,[]);
});
test('actual official server routes raw compact body before its one-byte parser; captures native receiver',async()=>{
 const f=fixture(),c=config(),middleware=createCompactNodeMiddlewares(f.services,c,'checkpointed',versions,opts);
 c.l1ChainId=1;f.services.aztec[0]={};
 // The ordinary RPC proxy receives a separate copy; the adapter retains the
 // originally registered receiver and captured methods/configuration.
 f.services={aztec:[f.node,{ping:z.function({input:z.tuple([]),output:z.string()})}]};
 await server(f,[getVersioningMiddleware(versions,opts),...middleware],async url=>{
  const r=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(selector)});
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Compact block unavailable'});
  assert.equal(r.headers.get('x-aztec-packageVersion'),opts.packageVersion);assert.equal(r.headers.get('x-aztec-l1ChainId'),'31337');
  assert(f.calls.length>0);assert(f.calls.every(call=>call.receiver===f.node));
  const malformed=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:'{PRIVATE'});
  assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:'Compact block unavailable'});
 },1);
});
test('ordinary RPC, health, CORS and version headers remain on official server',async()=>{
 const f=fixture();await server(f,[getVersioningMiddleware(versions,opts),...createCompactNodeMiddlewares(f.services,config(),'checkpointed',versions,opts)],async url=>{
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'aztec_ping',params:[]})});
  assert.equal(r.status,200);assert.equal((await r.json()).result,'pong');assert.equal(r.headers.get('access-control-allow-origin'),'https://app.example');assert.equal(r.headers.get('x-aztec-packageVersion'),opts.packageVersion);
  assert.equal((await fetch(url+'/status')).status,200);
  const origin=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example'},body:JSON.stringify(selector)});
  assert.equal(origin.status,415);assert.deepEqual(await origin.json(),{error:'Compact block unavailable'});assert.deepEqual(f.calls,[]);
 });
});
test('disabled route and separate unmodified admin middleware do not expose compact endpoint',async()=>{
 const f=fixture();await server(f,createCompactNodeMiddlewares(f.services,config(),undefined),async url=>{
  const r=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(selector)});
  assert.notEqual(r.status,200);assert.deepEqual(f.calls,[]);
 });
});
