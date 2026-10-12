// Synthetic transport/budget fixtures only; real browser/proof acceptance is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {composerBudget,startComposerL1Reader} from './rolling-composer-fixture.mjs';
test('browser time is bounded and leaves explicit cleanup reserve',()=>{
 assert.equal(composerBudget(200000,1000),120000);assert.equal(composerBudget(46000,1000),30000);
 for(const deadline of [45999,1000,NaN,Infinity])assert.throws(()=>composerBudget(deadline,1000));
});
test('real loopback proxy forwards read batch and refuses mutation, mixed batch and foreign origin before upstream',async()=>{
 let forwarded=0;
 const upstream=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const value=JSON.parse(body);forwarded++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(value)?value.map(r=>({jsonrpc:'2.0',id:r.id,result:'0x1'})):{jsonrpc:'2.0',id:value.id,result:'0x1'}));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:31111';let proxy;
 try{
  proxy=await startComposerL1Reader({upstream:'http://127.0.0.1:'+upstream.address().port,origin});
  const rpc=method=>({jsonrpc:'2.0',id:1,method,params:[]});
  const send=(body,from=origin)=>fetch(proxy.url,{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await send([rpc('eth_chainId'),rpc('eth_getBlockByNumber')]);assert.equal(response.status,200);assert.equal((await response.json()).length,2);assert.equal(forwarded,1);
  for(const body of [rpc('eth_sendRawTransaction'),rpc('evm_mine'),[rpc('eth_call'),rpc('eth_sendTransaction')],{...rpc('eth_call'),unexpected:1}]){response=await send(body);assert.equal(response.status,403);}
  assert.equal((await send(rpc('eth_call'),'http://127.0.0.1:31112')).status,403);assert.equal(forwarded,1);
  assert.deepEqual(proxy.stats(),{requests:6,forwarded:2,rejected:5,errors:0,pending:0});
 }finally{await proxy?.close();await new Promise(resolve=>upstream.close(resolve));}
});
test('malformed and oversized request produce failed evidence with no upstream send',async()=>{
 let calls=0;const upstream=http.createServer((req,res)=>{calls++;res.end('{}');});await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 let proxy;const origin='http://127.0.0.1:31111';
 try{proxy=await startComposerL1Reader({upstream:'http://127.0.0.1:'+upstream.address().port,origin});
  for(const body of ['{','x'.repeat(262145)]){const result=await fetch(proxy.url,{method:'POST',headers:{origin},body});assert.equal(result.status,502);}
  assert.equal(calls,0);assert.equal(proxy.stats().errors,2);
 }finally{await proxy?.close();await new Promise(resolve=>upstream.close(resolve));}
});
