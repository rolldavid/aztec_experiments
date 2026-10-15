// Real HTTP composition with explicitly synthetic public-index data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startRollingReader} from './start.mjs';
test('reader serves only browser assets and bounded public API from one origin',async t=>{
 let ready=true;
 const index={sync:async()=>{},status:()=>({schemaVersion:1,state:ready?'ready':'unavailable'}),
  query:()=>({schemaVersion:1,complete:true,posts:[],names:{},boards:{}})};
 const server=await startRollingReader({index});t.after(()=>server.close());
 const get=route=>fetch(server.url+route);
 const page=await get('/');assert.equal(page.status,200);assert.match(await page.text(),/reader\.mjs/);
 assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('access-control-allow-origin'),null);
 for(const asset of ['reader.mjs','reader-client.mjs','profile-view.mjs','avatar-upload.mjs','model.mjs','navigation.mjs','style.css']){
  const response=await get('/'+asset);assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-type'),asset.endsWith('.css')?/text\/css/:/text\/javascript/);
 }
 for(const route of ['/config.json','/.env','/start.mjs','/fixtures.mjs','/app.mjs','/index.html','/reader.mjs?secret=x','/shared/sdk-entry.mjs','/%2e%2e%2f.env'])assert.equal((await get(route)).status,404,route);
 const head=await fetch(server.url+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(server.url+'/',{method:'POST',body:'private'})).status,405);
 assert.equal((await get('/api/feed')).status,200);assert.equal((await get('/api/wallet')).status,404);
 ready=false;assert.equal((await get('/api/feed')).status,503);assert.equal((await get('/')).status,200);
});

import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const readyIndex=()=>({sync:async()=>{},status:()=>({state:'ready'}),query:()=>({posts:[]})});
const wire=(url,{encoding,method='GET'}={})=>new Promise((resolve,reject)=>{
 const request=http.request(url,{method,headers:encoding===undefined?{}:{'Accept-Encoding':encoding}},response=>{
  const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.on('error',reject);
 });request.on('error',reject);request.end();
});
test('wallet gzip preserves exact decoded bytes, SRI digest and isolation headers on GET and HEAD',async t=>{
 const body=Buffer.from('public SDK bytes\0'.repeat(8192));let reads=0;
 const server=await startRollingReader({index:readyIndex(),wallet:{connectOrigins:['http://127.0.0.1:19081'],read:async p=>{reads++;return p==='/wallet/aztec_bundle.js'?{body,type:'text/javascript'}:null;}}});t.after(()=>server.close());
 const get=await wire(server.url+'/wallet/aztec_bundle.js',{encoding:'gzip, deflate, br'});
 assert.equal(get.status,200);assert.equal(get.headers['content-encoding'],'gzip');assert.equal(get.headers.vary,'Accept-Encoding');assert.equal(Number(get.headers['content-length']),get.body.length);assert(get.body.length<body.length);
 assert.deepEqual(gunzipSync(get.body),body);assert.equal(createHash('sha256').update(gunzipSync(get.body)).digest('base64'),createHash('sha256').update(body).digest('base64'));
 for(const [name,value]of Object.entries({'cache-control':'no-store','cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp','cross-origin-resource-policy':'same-origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}))assert.equal(get.headers[name],value);
 assert.match(get.headers['content-security-policy'],/script-src 'self' 'wasm-unsafe-eval'/);assert.match(get.headers['content-security-policy'],/http:\/\/127.0.0.1:19081/);
 const head=await wire(server.url+'/wallet/aztec_bundle.js',{encoding:'gzip',method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(head.headers['content-encoding'],'gzip');assert.equal(head.headers['content-length'],get.headers['content-length']);assert.equal(reads,2,'cache never bypasses current decoded asset validation');
 const identity=await wire(server.url+'/wallet/aztec_bundle.js');assert.equal(identity.headers['content-encoding'],undefined);assert.deepEqual(identity.body,body);assert.equal(Number(identity.headers['content-length']),body.length);
});
test('wallet encoding negotiation honors quality, exclusions, wildcard and unsupported encodings',async t=>{
 let reads=0;const body=Buffer.from('public artifact');
 const server=await startRollingReader({index:readyIndex(),wallet:{connectOrigins:[],read:async()=>{reads++;return {body,type:'application/json'};}}});t.after(()=>server.close());
 for(const [encoding,selected]of [['gzip;q=0','identity'],['gzip;q=0.5, identity;q=0.2','gzip'],['gzip;q=0.1','identity'],['br','identity'],['*;q=1','gzip'],['*;q=0, gzip;q=1','gzip'],['GZip;Q=1','gzip'],['gzip;q=0,gzip;q=1','identity']]){
  const response=await wire(server.url+'/wallet/board.json',{encoding});assert.equal(response.status,200,encoding);assert.equal(response.headers['content-encoding'],selected==='gzip'?'gzip':undefined,encoding);assert.deepEqual(selected==='gzip'?gunzipSync(response.body):response.body,body);
 }
 const before=reads;
 for(const encoding of ['identity;q=0','*;q=0','gzip;q=0,identity;q=0','br;q=1,identity;q=0','gzip;q=2','gzip;q=0.0001']){const response=await wire(server.url+'/wallet/board.json',{encoding});assert.equal(response.status,406,encoding);assert.equal(response.body.length,0);assert.equal(response.headers['cache-control'],'no-store');}
 assert.equal(reads,before,'unacceptable encodings do not read or compress assets');
});
test('wallet compressed representations revalidate changing source bytes and do not mask missing/error assets',async t=>{
 let body=Buffer.from('first version'.repeat(100));let failure=false;
 const server=await startRollingReader({index:readyIndex(),wallet:{connectOrigins:[],read:async p=>{if(failure)throw Error('private filesystem detail');return p==='/wallet/runtime.mjs'?{body,type:'text/javascript'}:null;}}});t.after(()=>server.close());
 const url=server.url+'/wallet/runtime.mjs';const first=await wire(url,{encoding:'gzip'});assert.deepEqual(gunzipSync(first.body),body);
 body=Buffer.from('second version'.repeat(100));const second=await wire(url,{encoding:'gzip'});assert.deepEqual(gunzipSync(second.body),body);assert.notDeepEqual(first.body,second.body);
 assert.equal((await wire(server.url+'/wallet/missing.js',{encoding:'gzip'})).status,404);
 assert.equal((await wire(url+'?query=1',{encoding:'gzip'})).status,404);
 assert.equal((await wire(url,{encoding:'gzip',method:'POST'})).status,405);
 failure=true;const failed=await wire(url,{encoding:'gzip'});assert.equal(failed.status,503);assert.doesNotMatch(failed.body.toString(),/private filesystem detail/);assert.equal(failed.headers['content-encoding'],undefined);
 failure=false;assert.deepEqual(gunzipSync((await wire(url,{encoding:'gzip'})).body),body,'failed work releases admission');
});
test('wallet admission bounds concurrent reads and queued compression work, rejecting overload without reading',async t=>{
 let release;const barrier=new Promise(resolve=>release=resolve);let reads=0,active=0,peak=0;
 const server=await startRollingReader({index:readyIndex(),wallet:{connectOrigins:[],read:async()=>{reads++;active++;peak=Math.max(peak,active);await barrier;active--;return {body:Buffer.alloc(1024*1024,65),type:'application/wasm'};}}});t.after(()=>server.close());
 const requests=Array.from({length:10},()=>wire(server.url+'/wallet/bb.wasm',{encoding:'gzip'}));
 const first=await Promise.race(requests);assert.equal(first.status,503);assert.equal(first.headers['retry-after'],'1');assert.equal(reads,1);assert.equal(peak,1);release();
 const results=await Promise.all(requests);assert.equal(results.filter(r=>r.status===503).length,1);assert.equal(results.filter(r=>r.status===200).length,9);assert.equal(reads,9);assert.equal(peak,1);
 for(const r of results.filter(r=>r.status===200))assert.equal(gunzipSync(r.body).length,1024*1024);
});
