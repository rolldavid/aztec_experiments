// Labelled HTTP-boundary doubles; ephemeral loopback HTTP only, no chain/wallet.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startRollingPublicServer} from './rolling-public-server.mjs';
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
 for(const route of ['/api/feed?limit=2','/api/directory?query=build','/api/thread?root=10','/api/profile?nameId=20','/api/post?id=30'])assert.equal((await f.get(route)).status,200);
 for(const route of ['/api/feed?owner=secret','/api/feed?limit=0','/api/feed?limit=101','/api/feed?limit=1&limit=2','/api/thread','/api/profile?nameId=0x42','/api/post?id=-1','/api/feed?cursor='+('a'.repeat(121))])assert.equal((await f.get(route)).status,400,route);
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
