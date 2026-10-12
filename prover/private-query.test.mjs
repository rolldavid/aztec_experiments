// Development fakes/local HTTP only: these do not qualify node privacy or sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPrivateQuery, createPrivateQueryWithInspector, validateQueryNode, QUERY_LIMITS} from './private-query.mjs';
import {createProverServer} from './server.mjs';
const rollupAddress = '0x' + '12'.repeat(20);
const listen = async server => {await new Promise(r => server.listen(0, '127.0.0.1', r)); return 'http://127.0.0.1:' + server.address().port;};
const close = server => {server.closeAllConnections(); return new Promise(r => server.close(r));};
const call = (method = 'aztec_getBlockNumber', params = []) => ({jsonrpc:'2.0',id:1,method,params});
async function fixture(t, {inspect = async () => ({ready:true}), upstreamReply} = {}) {
  const received = [];
  const upstream = http.createServer(async (req,res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    received.push({headers:req.headers,body:JSON.parse(text)});
    if (upstreamReply) {upstreamReply(req,res,received.at(-1).body);return;}
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(received.at(-1).body.map(c => ({jsonrpc:'2.0',id:c.id,result:7}))));
  });
  const upstreamUrl = await listen(upstream);
  const privateQuery = createPrivateQueryWithInspector({queryNode:{url:upstreamUrl,rollupAddress},chainId:'31337',rollupVersion:'1',proofsEnabled:false}, inspect);
  const server = createProverServer({privateQuery,queue:{stats:()=>({submitted:0})},origins:['https://app.example']});
  const url = await listen(server);
  t.after(async()=>{await close(server);await close(upstream);});
  const post = (body,headers={}) => fetch(url+'/v1/node',{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  return {url,post,received,privateQuery};
}
test('query disabled by default; fixed loopback configuration only',async()=>{
  assert.equal(await createPrivateQuery({}),undefined);
  for (const url of ['https://127.0.0.1','http://localhost','http://example.org','http://127.0.0.1/path','http://u:p@127.0.0.1','http://127.0.0.1?x=1','http://127.0.0.1#x']) assert.throws(()=>validateQueryNode({url,rollupAddress}));
  for (const patch of [{maxLagSeconds:0},{maxLagSeconds:601},{rollupAddress:'0x'+'00'.repeat(20)},{admin:true}]) assert.throws(()=>validateQueryNode({url:'http://127.0.0.1',rollupAddress,...patch}));
  assert.equal(validateQueryNode({url:'http://[::1]:9999',rollupAddress}).maxLagSeconds,120);
});
test('official SDK schema forwarding, fixed upstream, exact inspector scope and no client credentials',async t=>{
  let gates=0;
  const f=await fixture(t,{inspect:async(node,options)=>{gates++; assert.equal(typeof node.getContract,'function'); assert.deepEqual(options,{expectedNetworkScope:{chainId:'31337',version:'1',rollup:rollupAddress},proofsEnabled:false,maxLagSeconds:120}); return {ready:true};}});
  const response=await f.post([call(),{...call('node_getBlockNumber'),id:2}],{origin:'https://app.example',cookie:'private',authorization:'secret'});
  assert.equal(response.status,200); assert.equal(response.headers.get('access-control-allow-origin'),'https://app.example');
  assert.deepEqual(await response.json(),[{jsonrpc:'2.0',id:1,result:7},{jsonrpc:'2.0',id:2,result:7}]);
  assert.equal(gates,1);assert.equal(f.received.length,1);assert.equal(f.received[0].headers.cookie,undefined);assert.equal(f.received[0].headers.authorization,undefined);assert.equal(f.received[0].headers.origin,undefined);
});
test('origin, admin, malformed params/body, batch and body bounds reject before personalized upstream',async t=>{
  let gates=0; const f=await fixture(t,{inspect:async()=>{gates++;return {ready:true};}});
  assert.equal((await f.post(call(),{origin:'https://evil.example'})).status,403);
  for (const input of [call('nodeAdmin_setConfig'),call('aztec_getBlockNumber',['private-address']),call('aztec_getBlockNumber_suffix'),call('constructor'),[],Array(9).fill(call()),'{invalid',{...call(),upstream:'http://evil.example'},[call(),call('aztec_admin')]]) assert.equal((await f.post(input)).status,400);
  assert.equal((await f.post(' '.repeat(QUERY_LIMITS.bodyBytes+1))).status,413);
  assert.equal(gates,0);assert.equal(f.received.length,0);
});
test('proof health remains separate, gate closes on stale/identity/unavailable states without raw errors',async t=>{
  let failed=false; const f=await fixture(t,{inspect:async()=>{if(failed)throw Object.assign(Error('private-address-witness'),{code:'BB_TRUSTED_NODE_STALE'});return {ready:true};}});
  let health=await(await fetch(f.url+'/healthz')).json();assert.deepEqual(health.query,{enabled:true,ready:true});
  failed=true;health=await(await fetch(f.url+'/healthz')).json();assert.equal(health.ready,true);assert.deepEqual(health.query,{enabled:true,ready:false,reason:'unavailable'});
  const rejected=await f.post(call());assert.equal(rejected.status,503);assert(!JSON.stringify(await rejected.json()).includes('private-address'));assert.equal(f.received.length,0);
});
test('upstream error is sanitized and sent once, never represented as absence',async t=>{
  const f=await fixture(t,{upstreamReply:(req,res,body)=>res.end(JSON.stringify(body.map(c=>({jsonrpc:'2.0',id:c.id,error:{code:-1,message:'secret witness',data:'private'}}))))});
  const response=await f.post(call());const value=await response.json();assert(value.error);assert(!Object.hasOwn(value,'result'));assert(!JSON.stringify(value).includes('secret'));assert(!JSON.stringify(value).includes('private'));assert.equal(f.received.length,1);
});
test('redirect is rejected without contacting target or retrying',async t=>{
  let targets=0;const target=http.createServer((req,res)=>{targets++;res.end('[]');});const targetUrl=await listen(target);t.after(()=>close(target));
  const f=await fixture(t,{upstreamReply:(req,res)=>{res.writeHead(307,{location:targetUrl});res.end();}});
  const value=await(await f.post(call())).json();assert(value.error);assert.equal(targets,0);assert.equal(f.received.length,1);
});
test('schema-invalid upstream result is an error, not a fabricated successful value',async t=>{
  const f=await fixture(t,{upstreamReply:(req,res,body)=>res.end(JSON.stringify(body.map(c=>({jsonrpc:'2.0',id:c.id,result:'private-invalid-number'}))))});
  const value=await(await f.post(call())).json();assert(value.error);assert.equal(f.received.length,1);
});
test('concurrency includes inspector and health; excess calls never enter upstream',async t=>{
  let entered=0,release;const pending=new Promise(r=>{release=r;});
  const f=await fixture(t,{inspect:async()=>{entered++;await pending;return {ready:true};}});
  const requests=Array.from({length:QUERY_LIMITS.concurrent},()=>f.post(call()));
  while(entered<QUERY_LIMITS.concurrent)await new Promise(r=>setImmediate(r));
  assert.equal((await f.post(call())).status,429);assert.deepEqual(await f.privateQuery.health(),{enabled:true,ready:false,reason:'busy'});release();
  assert((await Promise.all(requests)).every(r=>r.status===200));
});

test('required result null is rejected while optional genuine absence survives',async t=>{
  const f=await fixture(t,{upstreamReply:(req,res,body)=>res.end(JSON.stringify(body.map(c=>({jsonrpc:'2.0',id:c.id,result:null}))))});
  assert((await(await f.post(call())).json()).error);
  assert.deepEqual(await(await f.post(call('aztec_getEncodedEnr'))).json(),{jsonrpc:'2.0',id:1,result:null});
});
test('changed network response headers fail without leaking mismatch details',async t=>{
  const f=await fixture(t,{upstreamReply:(req,res,body)=>{res.setHeader('x-aztec-rollupVersion','2');res.end(JSON.stringify(body.map(c=>({jsonrpc:'2.0',id:c.id,result:7}))));}});
  const value=await(await f.post(call())).json();assert(value.error);assert.equal(f.received.length,1);assert(!JSON.stringify(value).includes('version'));
});

// Compact transport uses labelled HTTP upstreams only. This wrapper deliberately
// composes the new handler; production server routes remain disabled/unmodified.
const compactHash='0x'+'01'.repeat(32);
const compactSelector={schemaVersion:1,number:7,hash:compactHash,tier:'checkpointed'};
const compactBody=()=>({schemaVersion:1,number:7,hash:compactHash,headerFields:Array(23).fill('0x'+'00'.repeat(32)),fields:Array(7).fill('0x'+'00'.repeat(32))});
async function compactFixture(t,{inspect=async()=>({ready:true}),reply,compactBlocks={tier:'checkpointed',origins:['https://app.example']}}={}){
 const received=[];const upstream=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;received.push({url:req.url,headers:req.headers,body:JSON.parse(body)});
  if(reply)return reply(req,res);res.setHeader('content-type','application/json');res.end(JSON.stringify(compactBody()));
 });const url=await listen(upstream);
 const query=createPrivateQueryWithInspector({queryNode:{url,rollupAddress},chainId:'31337',rollupVersion:'1',proofsEnabled:false,compactBlocks},inspect);
 const gateway=http.createServer((req,res)=>query.handleCompact(req,res));const origin=await listen(gateway);
 t.after(async()=>{await close(gateway);await close(upstream);});
 const post=(body=compactSelector,headers={})=>fetch(origin+'/v1/compact-block',{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {received,query,post,origin};
}
test('compact disabled by default, exact explicit tier/origin configuration only',async t=>{
 const f=await fixture(t);assert.equal(f.privateQuery.handleCompact,undefined);
 const base={queryNode:{url:'http://127.0.0.1',rollupAddress},chainId:'31337',rollupVersion:'1',proofsEnabled:false};
 for(const compactBlocks of [{tier:'latest',origins:[]},{tier:'proven',origins:['*']},{tier:'proven',origins:['null']},{tier:'proven',origins:['https://a.example/path']},{tier:'proven',origins:[],url:'https://evil.example'},{tier:'proven',get origins(){throw Error('PRIVATE');}}])assert.throws(()=>createPrivateQueryWithInspector({...base,compactBlocks},async()=>{}));
});
test('compact checks readiness before/after and forwards exact selector, no caller headers',async t=>{
 let checks=0;const f=await compactFixture(t,{inspect:async(_node,options)=>{checks++;assert.equal(options.expectedNetworkScope.rollup,rollupAddress);assert.equal(options.proofsEnabled,false);}});
 const r=await f.post(compactSelector,{origin:'https://app.example',cookie:'PRIVATE',authorization:'PRIVATE','x-account':'PRIVATE'});assert.equal(r.status,200);assert.deepEqual(await r.json(),compactBody());assert.equal(checks,2);
 assert.equal(f.received.length,1);const sent=f.received[0];assert.equal(sent.url,'/rolling/compact-block-v1');assert.deepEqual(sent.body,compactSelector);
 for(const h of ['origin','cookie','authorization','x-account'])assert.equal(sent.headers[h],undefined);
});
test('compact origin/selector/request bounds reject before readiness or upstream',async t=>{
 let checks=0;const f=await compactFixture(t,{inspect:async()=>{checks++;}});
 for(const origin of ['null','https://evil.example','https://app.example, https://evil.example'])assert.equal((await f.post(compactSelector,{origin})).status,403);
 for(const value of [{...compactSelector,account:compactHash},{...compactSelector,tier:'proven'},{...compactSelector,number:0},[],[compactSelector],'{invalid'])assert.equal((await f.post(value)).status,400);
 assert.equal((await f.post(' '.repeat(1025))).status,413);assert.equal(checks,0);assert.equal(f.received.length,0);
 assert.equal((await fetch(f.origin+'/v1/compact-block')).status,405);
});
test('compact stale post-forward state withholds result and sanitizes failure',async t=>{
 let checks=0;const f=await compactFixture(t,{inspect:async()=>{if(++checks===2)throw Error('PRIVATE witness');}});
 const r=await f.post();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Compact block unavailable'});assert.equal(f.received.length,1);
});
test('compact decoded oversize or schema-invalid upstream is rejected',async t=>{
 for(const payload of [' '.repeat(2*1024*1024+1),JSON.stringify({...compactBody(),number:8}),JSON.stringify({...compactBody(),private:'PRIVATE'})]){
  const f=await compactFixture(t,{reply:(_req,res)=>{res.setHeader('content-type','application/json');res.end(payload);}});const r=await f.post();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Compact block unavailable'});
 }
});
test('compact never follows redirect or retries',async t=>{
 let hits=0;const target=http.createServer((_req,res)=>{hits++;res.end('{}');});const url=await listen(target);t.after(()=>close(target));
 const f=await compactFixture(t,{reply:(_req,res)=>{res.writeHead(307,{location:url});res.end();}});assert.equal((await f.post()).status,503);assert.equal(hits,0);assert.equal(f.received.length,1);
});
test('compact single flight owns pending readiness even after client abort',async t=>{
 let checks=0,release,entered;const enteredPromise=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});
 const f=await compactFixture(t,{inspect:async()=>{if(++checks===1){entered();await held;}}});
 const controller=new AbortController();const first=fetch(f.origin+'/v1/compact-block',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(compactSelector),signal:controller.signal});
 await enteredPromise;controller.abort();await assert.rejects(first);await new Promise(r=>setImmediate(r));
 assert.equal((await f.post()).status,429);release();
 // The next observed inspector call is proof the previous request really settled;
 // allow only bounded explicit test polling, never production retries.
 let result;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,5));result=await f.post();if(result.status!==429)break;}
 assert.equal(result.status,200);assert.equal(f.received.length,1);
});
