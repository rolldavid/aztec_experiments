import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedItems} from './saved-items.mjs';
const secret='0x'+'1'.padStart(64,'0');
function storage(){let rows=new Map();return {rows,read:async key=>rows.get(key)??null,compareAndSwap:async(key,old,next)=>{assert.equal(rows.get(key)??null,old);rows.set(key,next);}};}
function server(){const rows=new Map(),calls=[];let fail=false,hold=null;return {rows,calls,set fail(v){fail=v;},set hold(v){hold=v;},async fetch(url,options){calls.push({url,...options});if(fail)throw Error('offline');const id=url.split('/').at(-1);if(options.method==='GET')return Response.json(rows.get(id)??{schemaVersion:1,revision:0,blob:null});if(hold)await hold.promise;const cap=options.headers.authorization.slice(7),raw=Uint8Array.from(cap.match(/../g),x=>parseInt(x,16)),prefix=new TextEncoder().encode('rolling.saved-items.id.v1\0'),material=new Uint8Array(prefix.length+32);material.set(prefix);material.set(raw,prefix.length);assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',material)).toString('hex'),id);const body=JSON.parse(options.body),current=rows.get(id);if((current?.revision??0)!==body.expectedRevision)return Response.json({error:'revision-conflict'},{status:409});const result={schemaVersion:1,revision:body.expectedRevision+1,blob:body.blob};rows.set(id,result);return Response.json(result);}};}
async function fixture({remote=server(),local=storage(),...rest}={}){const client=await createSavedItems({walletSecret:secret,walletSalt:'2',scopeText:'board1',storage:local,fetch:remote.fetch.bind(remote),...rest});return {client,local,remote};}
test('immediate encrypted local update does not wait for remote acknowledgment; same wallet restores elsewhere',async()=>{
 const {client,local,remote}=await fixture();await client.ready;const gate=Promise.withResolvers();remote.hold=gate;
 await client.set({kind:1,target:'1234567890123456789',enabled:true});assert.deepEqual(client.snapshot().bookmarks,['1234567890123456789']);assert.equal(client.status(),'syncing');
 assert(![...local.rows.values()].join().includes('1234567890123456789'));gate.resolve();remote.hold=null;await client.flush();
 assert(!JSON.stringify([...remote.rows.values()]).includes('1234567890123456789'));const second=await fixture({remote});await second.client.ready;assert.deepEqual(second.client.snapshot(),client.snapshot());client.close();second.client.close();
});
test('offline edits survive encrypted local reload and sync only explicit changes',async()=>{
 const {client,local,remote}=await fixture();await client.ready;remote.fail=true;await client.set({kind:2,target:'0',label:'Main board'});await assert.rejects(client.flush());assert.equal(client.status(),'unsynced');client.close();
 const restored=await fixture({local,remote});await restored.client.ready;assert.deepEqual(restored.client.snapshot().followedBoards,['0']);assert.equal(restored.client.snapshot().labels.boards['0'],'Main board');await assert.rejects(restored.client.flush());remote.fail=false;await restored.client.flush();restored.client.close();
});
test('concurrent browsers merge independent target edits via revision conflict without overwriting',async()=>{
 const remote=server(),a=await fixture({remote}),b=await fixture({remote});await Promise.all([a.client.ready,b.client.ready]);
 await Promise.all([a.client.set({kind:1,target:'1',enabled:true}),b.client.set({kind:3,target:'7',enabled:true,label:'River Lane'})]);await Promise.all([a.client.flush(),b.client.flush()]);await a.client.refresh();assert.deepEqual(a.client.snapshot().bookmarks,['1']);assert.deepEqual(a.client.snapshot().followedNames,['7']);assert.equal(a.client.snapshot().labels.names['7'],'River Lane');a.client.close();b.client.close();
});
test('exact pending inverse wins over its own held upload, never drops the later edit',async()=>{
 const {client,remote}=await fixture();await client.ready;const gate=Promise.withResolvers();remote.hold=gate;await client.set({kind:1,target:'42',enabled:true});
 await new Promise(setImmediate);await client.set({kind:1,target:'42',enabled:false});assert.deepEqual(client.snapshot().bookmarks,[]);remote.hold=null;gate.resolve();await client.flush();await client.refresh();assert.deepEqual(client.snapshot().bookmarks,[]);client.close();
});
test('changed account stops publication and late remote response cannot expose saved state',async()=>{
 let valid=true;const {client,remote}=await fixture({contextGuard:()=>{if(!valid)throw Error('changed');}});await client.ready;const before=remote.calls.length;valid=false;await assert.rejects(client.set({kind:1,target:'1',enabled:true}));assert.equal(remote.calls.length,before);client.close();assert.equal(client.snapshot(),null);
});
test('tampered local ciphertext is rejected rather than reset or sent',async()=>{
 const {client,remote,local}=await fixture();await client.ready;await client.set({kind:1,target:'42',enabled:true});await client.flush();client.close();const [id,blob]=[...local.rows][0];local.rows.set(id,(blob[0]==='A'?'B':'A')+blob.slice(1));const calls=remote.calls.length;await assert.rejects(fixture({remote,local}));assert.equal(remote.calls.length,calls);
});
test('unknown first state waits for authenticated restore and does not guess inverse',async()=>{
 const remote=server(),first=await fixture({remote});await first.client.ready;await first.client.set({kind:1,target:'42',enabled:true});await first.client.flush();first.client.close();
 const entered=Promise.withResolvers(),gate=Promise.withResolvers();const second=await fixture({fetch:async(...args)=>{entered.resolve();await gate.promise;return remote.fetch(...args);}});await entered.promise;let finished=false;const action=second.client.set({kind:1,target:'42'}).then(()=>finished=true);await new Promise(setImmediate);assert.equal(finished,false);gate.resolve();await action;assert.deepEqual(second.client.snapshot().bookmarks,[]);await second.client.flush();second.client.close();
});
test('scope and account secrets derive independent opaque identifiers and encryption',async()=>{
 const remote=server(),a=await fixture({remote}),b=await fixture({remote,scopeText:'board2'}),c=await fixture({remote,walletSecret:'0x'+'3'.padStart(64,'0')});await Promise.all([a.client.ready,b.client.ready,c.client.ready]);assert.equal(new Set(remote.calls.map(x=>x.url)).size,3);a.client.close();b.client.close();c.client.close();
});
for(const change of [{kind:4,target:'1'},{kind:5,target:'0'},{kind:1,target:'0'},{kind:3,target:'0'},{kind:1,target:'01'},{kind:1,target:'2',enabled:1},{kind:2,target:'0',label:'x'.repeat(129)}])test('unsupported or malformed saved edit sends nothing '+JSON.stringify(change),async()=>{const {client,remote}=await fixture();await client.ready;const before=remote.calls.length;await assert.rejects(client.set(change));assert.equal(remote.calls.length,before);client.close();});
test('remote rollback and unauthenticated ciphertext fail without losing local saved projection',async()=>{
 const {client,remote}=await fixture();await client.ready;await client.set({kind:1,target:'42',enabled:true});await client.flush();const [id,row]=[...remote.rows][0];remote.rows.set(id,{schemaVersion:1,revision:0,blob:null});await assert.rejects(client.refresh());assert.deepEqual(client.snapshot().bookmarks,['42']);remote.rows.set(id,{...row,blob:'A'.repeat(40)});await assert.rejects(client.refresh());assert.deepEqual(client.snapshot().bookmarks,['42']);client.close();
});
test('write capability cannot decrypt encrypted document',async()=>{
 const {client,remote}=await fixture();await client.ready;await client.set({kind:1,target:'42',enabled:true});await client.flush();const put=remote.calls.find(c=>c.method==='PUT'),key=await crypto.subtle.importKey('raw',Buffer.from(put.headers.authorization.slice(7),'hex'),'AES-GCM',false,['decrypt']),blob=Buffer.from(JSON.parse(put.body).blob,'base64url');
 await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',iv:blob.subarray(0,12),additionalData:new TextEncoder().encode('rolling.saved-items.document.v1\0board1')},key,blob.subarray(12)));client.close();
});
test('async identity guards are refused before storage or remote access',async()=>{
 let reads=0;await assert.rejects(fixture({contextGuard:async()=>{throw Error('changed');},storage:{read(){reads++;}}}));await new Promise(setImmediate);assert.equal(reads,0);
});
test('local write failure is visibly unsaved, never returned as durable success, and explicit retry persists it',async()=>{
 const local=storage(),write=local.compareAndSwap;let fail=false;local.compareAndSwap=async(...args)=>{if(fail)throw Error('quota');return write(...args);};const {client}=await fixture({local});await client.ready;fail=true;await assert.rejects(client.set({kind:1,target:'42',enabled:true}));assert.equal(client.status(),'unsaved');assert.deepEqual(client.snapshot().bookmarks,['42']);fail=false;await client.refresh();assert.equal(client.status(),'ready');client.close();
});
test('two local tabs preserve each explicit target across an encrypted storage CAS conflict',async()=>{
 const local=storage(),remote=server(),a=await fixture({local,remote});await a.client.ready;const b=await fixture({local,remote});await b.client.refresh();
 await Promise.all([a.client.set({kind:1,target:'21',enabled:true}),b.client.set({kind:1,target:'22',enabled:true})]);await Promise.all([a.client.flush(),b.client.flush()]);await a.client.refresh();assert.deepEqual(a.client.snapshot().bookmarks,['21','22']);a.client.close();b.client.close();
});
test('capacity failure leaves the previous local saved document intact',async()=>{
 const {client,remote}=await fixture();await client.ready;remote.fail=true;
 for(let n=1;n<=100;n++)await client.set({kind:1,target:String(n),enabled:true});await assert.rejects(client.flush());const previous=client.snapshot();await assert.rejects(client.set({kind:1,target:'101',enabled:true}),{code:'ROLLING_SAVED_ITEMS_LIMIT',kind:1});assert.deepEqual(client.snapshot(),previous);client.close();
});
