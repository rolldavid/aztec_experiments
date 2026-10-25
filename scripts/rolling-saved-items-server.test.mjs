import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startRollingPublicServer} from './rolling-public-server.mjs';
import {startRollingReader} from '../apps/rolling/start.mjs';
import {createSavedItemsStore,savedItemsId,SAVED_ITEMS_MAX_BYTES} from '../shared/rolling/saved-items-store.mjs';
const cap='12'.repeat(32),id=savedItemsId(cap),blob=Buffer.alloc(32,1).toString('base64url');
async function fixture(t,{reader=false}={}){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'saved-http-'))),savedItems=createSavedItemsStore(dir);
 const gate=Promise.withResolvers();let syncs=0;
 const index={sync:async()=>{syncs++;await gate.promise;},status:()=>({state:'unavailable'}),query:()=>assert.fail('saved documents must not query the chain index')};
 if(reader)savedItems.close();
 const server=await(reader?startRollingReader:startRollingPublicServer)({index,...(reader?{savedItemsDirectory:dir}:{savedItems}),pollMs:30000});
 t.after(async()=>{gate.resolve();await server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const url=server.url+'/api/saved-items/'+id;
 const put=(body,headers={})=>fetch(url,{method:'PUT',headers:{authorization:'Bearer '+cap,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 return {server,savedItems,url,put,get:()=>fetch(url),syncs:()=>syncs};
}
for(const reader of [false,true])test(`saved documents work while public chain index is unavailable (reader=${reader})`,async t=>{
 const f=await fixture(t,{reader}),missing=await f.get();assert.equal(missing.status,200);assert.deepEqual(await missing.json(),{schemaVersion:1,revision:0,blob:null});
 const created=await f.put({expectedRevision:0,blob});assert.equal(created.status,200);assert.deepEqual(await created.json(),{schemaVersion:1,revision:1,blob});
 const got=await f.get();assert.equal(got.headers.get('cache-control'),'no-store');assert.equal(got.headers.get('access-control-allow-origin'),null);assert.equal((await got.json()).blob,blob);
 assert.equal((await f.put({expectedRevision:0,blob})).status,409);assert.equal((await f.put({expectedRevision:1,blob})).status,200);assert.equal(f.syncs(),1);
});
test('HTTP CAS concurrent writes have one winner and never silently overwrite',async t=>{
 const f=await fixture(t),responses=await Promise.all([f.put({expectedRevision:0,blob}),f.put({expectedRevision:0,blob:Buffer.alloc(32,2).toString('base64url')})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await(await f.get()).json()).revision,1);
});
test('same-origin, authority, shape and byte bounds reject before persistence',async t=>{
 const f=await fixture(t);
 for(const headers of [{authorization:''},{authorization:'Bearer '+'34'.repeat(32)}])assert.equal((await f.put({expectedRevision:0,blob},headers)).status,403);
 for(const headers of [{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{'content-encoding':'gzip'}])assert.equal((await f.put({expectedRevision:0,blob},headers)).status,400);
 for(const body of [{expectedRevision:0,blob,bookmarks:['123']},{expectedRevision:'0',blob},{expectedRevision:0,blob:{encrypted:true}},{expectedRevision:0,blob:Buffer.alloc(SAVED_ITEMS_MAX_BYTES+1).toString('base64url')}])assert.equal((await f.put(body)).status,400);
 assert.equal((await fetch(f.url+'?wallet=secret')).status,400);assert.equal((await fetch(f.url,{method:'DELETE'})).status,405);
 assert.deepEqual(await(await f.get()).json(),{schemaVersion:1,revision:0,blob:null});
});
test('document failures are sanitized and shutdown closes the store',async t=>{
 let closes=0;const secret='PRIVATE_SENTINEL',savedItems={read(){throw Error(secret);},close(){closes++;}};
 const server=await startRollingPublicServer({index:{sync:async()=>{}},savedItems,pollMs:30000});
 const response=await fetch(server.url+'/api/saved-items/'+id);assert.equal(response.status,503);assert(!((await response.text()).includes(secret)));await server.close();assert.equal(closes,1);
 await assert.rejects(startRollingPublicServer({index:{},savedItems,host:'0.0.0.0'}));assert.equal(closes,2);
});
