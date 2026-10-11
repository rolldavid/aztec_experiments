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
