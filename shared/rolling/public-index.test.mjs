// Labelled SDK-data doubles; real processed ABI, decoder, projection and SQLite.
// No service, live chain, proof, wallet or paid infrastructure is used here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {startRollingPublicServer} from '../../scripts/rolling-public-server.mjs';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {loadContractArtifact,EventSelector,decodeFunctionSignature,encodeArguments} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {computeLogTag} from '@aztec-labs/stdlib/hash';
import {PublicLog} from '@aztec-labs/stdlib/logs';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {TxHash} from '@aztec-labs/stdlib/tx';
import {DomainSeparator} from '@aztec-labs/constants';
import {nameRegistration,NAME_DOMAIN} from './name-policy.mjs';
import {publicFeedFileStorage} from '../public-feed-file-storage.mjs';
import {createRollingPublicIndex} from './public-index.mjs';
const artifact=loadContractArtifact(JSON.parse(fs.readFileSync(process.env.ROLLING_TEST_ARTIFACT??new URL('../../billboard/target/rolling_contract-RollingBoard.json',import.meta.url))));
const classId=(await getContractClassFromArtifact(artifact)).id.toString(),address=AztecAddress.fromBigIntUnsafe(42n);
const scope={chainId:'31337',rollupVersion:'1',rollupAddress:'0x'+'11'.repeat(20),boardAddress:address.toString(),classId};
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const wrap=s=>({toString:()=>s,equals:v=>v.toString()===s});
function pack(text,size){const b=Buffer.alloc(size*31);Buffer.from(text).copy(b);return Array.from({length:size},(_,i)=>BigInt('0x'+b.subarray(i*31,i*31+31).toString('hex')));}
const digest=async(text,size)=>poseidon2HashWithSeparator([BigInt(Buffer.byteLength(text)),...pack(text,size)],0x52435431);
async function log(type,payload){const abi=artifact.outputs.structs.events.find(e=>e.path==='RollingBoard::'+type),selector=await EventSelector.fromSignature(decodeFunctionSignature(type,abi.fields));
  return new PublicLog(address,[await computeLogTag(selector.toField(),DomainSeparator.EVENT_LOG_TAG),...encodeArguments({parameters:abi.fields},abi.fields.map(f=>payload[f.name]))]);}
async function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rolling-public-index-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const nameId=(await poseidon2HashWithSeparator(nameRegistration('John','Doe').preimage,NAME_DOMAIN)).toBigInt();
 const boardId=(await poseidon2HashWithSeparator([5n,...pack('build',2)],0x52435331)).toBigInt();
 const block1=[await log('MainPolicyPublished',{schema:1,version:1,digest:await digest('Rules',32),length:5,rules:pack('Rules',32)}),
   await log('NameRegistered',{schema:1,name_id:nameId,first_length:4,first:pack('John',2),last_length:3,last:pack('Doe',2)})];
 const block2=[await log('SubboardCreated',{schema:1,subboard_id:boardId,slug_length:5,slug:pack('build',2),name_length:5,name:pack('Build',3),description_length:4,description:pack('Desc',16),local_policy_version:1,
   rules_length:0,rules:pack('',32),rules_digest:await digest('',32),main_policy_version:1,metadata_digest:await poseidon2HashWithSeparator([boardId,await digest('Build',3),await digest('Desc',16)],0x52434d31)})];
 const post=async(id,number,content='Hello',main=false)=>log('PostPublished',{schema:1,id,record:{subboard:main?0:boardId,parent:0,root:id,kind:1,name_id:nameId,reference:0,content_digest:await digest(content,32)},timestamp:number,main_policy_version:1,local_policy_version:main?0:1,length:Buffer.byteLength(content),message:pack(content,32)});
 const blocks=new Map(),calls=[];let head=3;
 function put(n,logs,salt=0){const txHash=TxHash.fromString(hex(100+n+salt)),hash=wrap(hex(1000+n+salt)),effect={txHash,publicLogs:logs,toBuffer:()=>Buffer.concat(logs.map(l=>l.toBuffer()))};
   blocks.set(n,{hash,header:{globalVariables:{blockNumber:n,timestamp:BigInt(n)}},body:{txEffects:[effect]}});}
 put(1,block1);put(2,block2);put(3,[await post(10,3)]);
 const locate=hash=>[...blocks.entries()].find(([,b])=>b.body.txEffects.some(tx=>tx.txHash.toString()===hash.toString()));
 const node={getNodeInfo:async()=>({l1ChainId:31337,rollupVersion:1,l1ContractAddresses:{rollupAddress:wrap(scope.rollupAddress)}}),
  getContract:async()=>({currentContractClassId:wrap(classId),originalContractClassId:wrap(classId)}),
  getBlockData:async n=>{const num=n==='checkpointed'?head:n,b=blocks.get(num);return b?{blockHash:b.hash,header:b.header}:null;},
  getBlock:async(n,opts)=>{calls.push(['block',n,opts]);return blocks.get(n);},
  getTxReceipt:async hash=>{const [n,b]=locate(hash);return {txHash:hash,status:'checkpointed',executionResult:'success',blockNumber:n,blockHash:b.hash};},
  getTxEffect:async hash=>{const [n,b]=locate(hash);return {data:b.body.txEffects[0],l2BlockNumber:n,l2BlockHash:b.hash};}};
 const storage=publicFeedFileStorage(directory,{maxRecordBytes:1048576,maxSnapshotBytes:67108864});
 const options={node,artifact,scope,deployment:{blockNumber:1,blockHash:hex(1001),txHash:hex(101)},storage,rangeSize:1,pagesPerSync:20};
 const create=overrides=>createRollingPublicIndex({...options,...overrides});
 return {directory,node,storage,options,create,calls,blocks,nameId:String(nameId),boardId:String(boardId),put,post,setHead:n=>{head=n;}};
}
test('cold canonical whole-block ingestion and metadata use real decoder/SQLite, no views before ready',async t=>{
 const f=await fixture(t),index=await f.create({pagesPerSync:1});assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
 assert.equal((await index.sync()).complete,false);assert.throws(()=>index.query('directory'),{code:'ROLLING_PUBLIC_NOT_READY'});
 await index.sync();assert.equal((await index.sync()).state,'ready');
 const page=index.query('feed');assert.equal(page.posts[0].text,'Hello');assert.equal(page.names[f.nameId].first,'John');assert.equal(page.boards[f.boardId].slug,'build');
 assert.equal(index.query('directory',{query:'build'}).boards.length,1);assert.equal(index.query('profile',{nameId:f.nameId}).identity.last,'Doe');
 assert.equal(index.query('thread',{root:'10'}).posts.length,1);assert.equal(index.query('post',{id:'999'}).post,null);
 assert.ok(f.calls.every(([, ,opts])=>opts.includeTransactions===true));
 const status=index.status();status.checkpoint.hash=hex(0);assert.notEqual(index.status().checkpoint.hash,hex(0));
});
test('restart re-fetches every retained block before exposing any cached view',async t=>{
 const f=await fixture(t),index=await f.create();await index.sync();f.calls.length=0;
 const restored=await f.create({pagesPerSync:1});await restored.sync();assert.throws(()=>restored.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
 await restored.sync();await restored.sync();assert.equal(restored.query('feed').posts[0].text,'Hello');
 for(const number of [1,2,3])assert.ok(f.calls.some(([,n])=>n===number));
});
test('cached omission with unchanged canonical hashes/count-adjusted JSON is rejected',async t=>{
 const f=await fixture(t),index=await f.create();await index.sync();const before=fs.readFileSync(path.join(f.directory,'public-feed-v2.sqlite'));
 const db=new DatabaseSync(path.join(f.directory,'public-feed-v2.sqlite'));
 try{const row=db.prepare('SELECT value FROM records WHERE key=?').get(index.key),head=JSON.parse(row.value),key=`${index.key}:range:${head.latest}`;
   const range=JSON.parse(db.prepare('SELECT value FROM records WHERE key=?').get(key).value);head.eventCount-=range.events.length;range.events=[];
   db.prepare('UPDATE records SET value=? WHERE key=?').run(JSON.stringify(range),key);db.prepare('UPDATE records SET value=? WHERE key=?').run(JSON.stringify(head),index.key);
 }finally{db.close();}
 const restored=await f.create();await assert.rejects(restored.sync(),{code:'ROLLING_PUBLIC_CACHE_MISMATCH'});assert.equal(restored.status().state,'unavailable');
 assert.throws(()=>restored.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});assert.ok(before.length>0);
});
test('injected cached post text is rejected despite preserved position and checkpoint',async t=>{
 const f=await fixture(t),index=await f.create();await index.sync();
 const db=new DatabaseSync(path.join(f.directory,'public-feed-v2.sqlite'));try{
   const head=JSON.parse(db.prepare('SELECT value FROM records WHERE key=?').get(index.key).value),key=`${index.key}:range:${head.latest}`;
   const range=JSON.parse(db.prepare('SELECT value FROM records WHERE key=?').get(key).value);range.events[0].payload.message[0]='1';
   db.prepare('UPDATE records SET value=? WHERE key=?').run(JSON.stringify(range),key);
 }finally{db.close();}
 await assert.rejects((await f.create()).sync(),{code:'ROLLING_PUBLIC_CACHE_MISMATCH'});
});
test('append, hot reorg rollback and cold reorg reconstruct canonical replacement',async t=>{
 const f=await fixture(t),index=await f.create();await index.sync();
 f.put(4,[await f.post(20,4,'Next')]);f.setHead(4);await index.sync();const page=index.query('feed',{limit:1});assert.equal(page.posts[0].id,'20');assert.ok(page.nextCursor);
 f.put(4,[await f.post(30,4,'Replacement')],50);await index.sync();assert.equal(index.query('feed').posts[0].id,'30');assert.throws(()=>index.query('feed',{cursor:page.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
 f.put(4,[await f.post(40,4,'Cold replacement')],60);const restored=await f.create();await restored.sync();assert.equal(restored.query('feed').posts[0].id,'40');
});
test('CAS commit failure never publishes staged projection; another writer must reopen',async t=>{
 const f=await fixture(t),index=await f.create();await index.sync();f.put(4,[await f.post(20,4)]);f.setHead(4);
 const competing=await f.create();await competing.sync();
 await assert.rejects(index.sync(),{code:'PUBLIC_FEED_CONFLICT'});assert.equal(index.status().state,'unavailable');assert.throws(()=>index.query('post',{id:'20'}));
 assert.equal((await f.create()).status().state,'authenticating');
});
test('network/class/deployment changes fail closed even with retained data',async t=>{
 for(const defect of ['network','class','origin']){const f=await fixture(t),index=await f.create();await index.sync();
   if(defect==='network')f.node.getNodeInfo=async()=>({l1ChainId:1});
   if(defect==='class')f.node.getContract=async()=>null;
   if(defect==='origin')f.put(1,[],77);
   await assert.rejects(index.sync());assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
 }
});
test('bounded capacity, read timeout and concurrent sync cannot produce partial ready state',async t=>{
 const f=await fixture(t),index=await f.create({maxEvents:1});await assert.rejects(index.sync());assert.equal(index.status().complete,false);
 const g=await fixture(t);let release;g.node.getNodeInfo=()=>new Promise(resolve=>{release=resolve;});const slow=await g.create({timeoutMs:15});
 const pending=slow.sync();await new Promise(r=>setImmediate(r));await assert.rejects(slow.sync(),{code:'ROLLING_PUBLIC_BUSY'});await assert.rejects(pending,{code:'ROLLING_PUBLIC_TIMEOUT'});assert.ok(release);assert.equal(slow.status().complete,false);
});

// Controlled canonical SDK-data fixture through the actual HTTP server and
// browser transport. This is bounded local unit evidence, not a live chain.
async function fullAvatarPageFixture(t,distinct){
 const f=await fixture(t),expected=[];
 for(let i=0;i<100;i++){
  const n=i+3,id=BigInt(500+i),last='Person'+String.fromCharCode(65+Math.floor(i/26),65+i%26);
  const nameId=distinct?(await poseidon2HashWithSeparator(nameRegistration('Reader',last).preimage,NAME_DOMAIN)).toBigInt():BigInt(f.nameId),logs=[];
  if(distinct)logs.push(await log('NameRegistered',{schema:1,name_id:nameId,first_length:6,first:pack('Reader',2),last_length:last.length,last:pack(last,2)}));
  if(distinct||i===0){
   const image=Buffer.alloc(8192,i%255+1);image[8191]=0;const data=pack(image,265),content=pack('b'.repeat(992),32);
   logs.push(await log('BioPublished',{schema:1,name_id:nameId,version:1,length:992,content,digest:await poseidon2HashWithSeparator([1n,nameId,1n,992n,...content],0x52434231),trailer:1}));
   logs.push(await log('AvatarPublished',{schema:1,name_id:nameId,version:1,width:100,height:100,length:8192,data,digest:await poseidon2HashWithSeparator([1n,nameId,1n,100n,100n,8192n,...data],0x52434131),trailer:1}));
  }
  const body='x'.repeat(992);
  logs.push(await log('PostPublished',{schema:1,id,record:{subboard:BigInt(f.boardId),parent:0,root:id,kind:1,name_id:nameId,reference:0,content_digest:await digest(body,32)},timestamp:n,main_policy_version:1,local_policy_version:1,length:992,message:pack(body,32)}));
  f.put(n,logs);expected.unshift(String(id));
 }
 f.setHead(102);const index=await f.create({homeSubboards:[f.boardId]});for(let page=0;page<6&&!index.status().complete;page++)await index.sync();assert.equal(index.status().state,'ready');
 return {...f,index,expected};
}
for(const route of ['feed','home'])for(const distinct of [false,true])test(`labelled actual HTTP/reader ${route}: 100 maximum avatars, ${distinct?'distinct authors paginate by bytes':'same author deduplicates'}`,{timeout:30000},async t=>{
 const {startRollingPublicServer}=await import('../../scripts/rolling-public-server.mjs');
 const {createPublicReader}=await import('../../apps/rolling/reader-client.mjs');
 const f=await fullAvatarPageFixture(t,distinct),server=await startRollingPublicServer({index:f.index,pollMs:30000});t.after(()=>server.close());
 const sizes=[];const read=createPublicReader({fetch:async(url,options)=>{const response=await fetch(server.url+url,options);assert.equal(response.status,200);const size=(await response.clone().arrayBuffer()).byteLength;sizes.push(size);assert(size<=1048576);return response;}});
 const first=await read(route,{limit:100});assert(first.posts.every(p=>!Object.hasOwn(p,'identity')));
 assert.equal(Object.keys(first.names).length,distinct?first.posts.length:1);
 for(const name of Object.values(first.names)){assert.equal(Buffer.from(name.profile.avatar.data,'base64').length,8192);assert.equal(name.profile.avatar.version,'1');}
 if(distinct){assert(first.posts.length<100);assert(first.nextCursor);}
 else{assert.equal(first.posts.length,100);assert.equal(first.nextCursor,null);assert(sizes[0]<250000);}
 const seen=first.posts.map(p=>p.id);let cursor=first.nextCursor,requests=1;
 while(cursor){assert(requests++<5);const page=await read(route,{limit:100,cursor});seen.push(...page.posts.map(p=>p.id));cursor=page.nextCursor;}
 assert.deepEqual(seen,f.expected);assert.equal(new Set(seen).size,100);
 // Querying the projection again generated the cursor; epochs/revisions remain
 // authoritative, and an unrelated append invalidates the bounded page cursor.
 if(distinct){f.put(103,[await f.post(900,103,'New')]);f.setHead(103);await f.index.sync();assert.throws(()=>f.index.query(route,{cursor:first.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});}
 const nameId=first.posts[0].record.name_id,profile=await read('profile',{nameId,limit:100});
 assert.equal(profile.identity.profile.avatar.version,'1');assert.equal(profile.identity.profile.avatar.length,'8192');assert(sizes.every(size=>size<=1048576));
});

test('labelled actual HTTP/reader: every public profile route redacts removed avatar, reopen and replacement preserve history',{timeout:30000},async t=>{
 const {startRollingPublicServer}=await import('../../scripts/rolling-public-server.mjs');const {createPublicReader}=await import('../../apps/rolling/reader-client.mjs');
 const f=await fixture(t),nameId=BigInt(f.nameId),bytes=Buffer.alloc(8192,0xf7);bytes[8191]=0;
 const image=async(version,dataBytes)=>{const data=pack(dataBytes,265);return {schema:1,name_id:nameId,version,width:100,height:100,length:dataBytes.length,data,digest:await poseidon2HashWithSeparator([1n,nameId,BigInt(version),100n,100n,BigInt(dataBytes.length),...data],0x52434131),trailer:1};};
 const original=await image(1,bytes);f.put(4,[await log('AvatarPublished',original)]);
 f.put(5,[await log('AvatarRemoved',{schema:1,name_id:nameId,avatar_version:1,avatar_digest:original.digest,main_policy_version:1,reason_digest:await digest('Unsafe',7),length:6,reason:pack('Unsafe',7)})]);f.setHead(5);
 const index=await f.create();await index.sync();
 async function inspect(current,removed){
  const server=await startRollingPublicServer({index:current,pollMs:30000});
  try{const read=createPublicReader({fetch:(url,options)=>fetch(server.url+url,options)});
   for(const [route,params]of [['feed',{}],['thread',{root:'10'}],['profile',{nameId:f.nameId}],['post',{id:'10'}]]){
    const page=await read(route,params),identities=[...Object.values(page.names),...(page.identity?[page.identity]:[])];assert(identities.length>0);
    for(const identity of identities){if(removed){assert.equal(identity.profile.avatar.data,null);assert.equal(identity.profile.avatar.removal.reason,'Unsafe');assert.equal(identity.profile.avatar.version,'1');}else{assert.equal(identity.profile.avatar.removal,null);assert.equal(identity.profile.avatar.version,'2');assert.equal(identity.profile.avatar.data,'CQAH');}}
    assert.equal(JSON.stringify(page).includes(bytes.toString('base64')),false);assert((page.posts??[page.post]).every(post=>!Object.hasOwn(post,'identity')));
   }
   assert.equal(JSON.stringify(await read('directory')).includes(bytes.toString('base64')),false);
  }finally{await server.close();}
 }
 await inspect(index,true);
 // Canonical snapshot still retains the original authenticated packed bytes.
 const snapshot=await f.storage.load(index.key,20000);assert(snapshot.ranges.some(range=>JSON.parse(range.value).events.some(event=>event.type==='AvatarPublished'&&event.payload.length==='8192')));
 const reopened=await f.create();await reopened.sync();await inspect(reopened,true);
 const replacement=await image(2,Buffer.from([9,0,7]));f.put(5,[await log('AvatarPublished',replacement)],100);await reopened.sync();await inspect(reopened,false);
});

test('labelled actual HTTP: owned-name content and index metadata use separate revision contracts',async t=>{
 const {startRollingPublicServer}=await import('../../scripts/rolling-public-server.mjs');
 const {createPublicReader}=await import('../../apps/rolling/reader-client.mjs');
 const {ownedNameHTTPExpectation,assertSocialHTTPView,assertRollingHTTPMetadata}=await import('../../scripts/testing/rolling-public-acceptance.mjs');
 const f=await fixture(t);f.setHead(1);const index=await f.create();await index.sync();
 const server=await startRollingPublicServer({index,pollMs:30000});t.after(()=>server.close());
 const read=createPublicReader({fetch:(url,options)=>fetch(server.url+url,options)});
 const actual=await read('profile',{nameId:f.nameId,limit:100}),status=index.status();
 const raw={revision:5,posts:[],nextCursor:null,identity:{id:f.nameId,first:'John',last:'Doe',profile:{
  bio:{version:'0',digest:'0',length:'0',text:''},avatar:{version:'0',digest:'0',width:'0',height:'0',length:'0',encoding:'base64',data:'',removal:null}}}};
 // Reproduce the old failure against the real server's epoch-prefixed envelope.
 assert.throws(()=>assertSocialHTTPView(actual,{...raw,names:{},boards:{}}));
 const expected=ownedNameHTTPExpectation(raw);assert.equal(raw.revision,5);assert(!Object.hasOwn(expected,'revision'));
 assertSocialHTTPView(actual,expected);assertRollingHTTPMetadata(actual,status);
 for(const mutate of [v=>v.identity.first='Wrong',v=>v.identity.profile.bio.text='changed',v=>v.posts.push({id:'unexpected'}),v=>v.nextCursor='unexpected',v=>v.names.extra={},v=>v.boards.extra={}]){
  const changed=structuredClone(actual);mutate(changed);assert.throws(()=>assertSocialHTTPView(changed,expected));
 }
 for(const mutate of [v=>v.revision=5,v=>v.revision='bad',v=>v.revision=v.revision.replace(/:[0-9]+$/,':999'),v=>v.checkpoint.number++,v=>v.checkpoint.hash=hex(9),v=>v.checkpoint=null,v=>v.complete=false,v=>v.schemaVersion=2,v=>v.scope.chainId='1']){
  const changed=structuredClone(actual);mutate(changed);assert.throws(()=>assertRollingHTTPMetadata(changed,status));
 }
 assert.throws(()=>assertRollingHTTPMetadata(actual,{...status,state:'syncing'}));
 assert.throws(()=>ownedNameHTTPExpectation({...raw,revision:'5'}));
});

test('acceptance catchup completes three ABI-decoded synthetic ranges before HTTP on fresh and cold SQLite',async t=>{
 const {synchronizeRollingPublicReader,assertRollingHTTPMetadata,assertSocialHTTPView}=await import('../../scripts/testing/rolling-public-acceptance.mjs');
 const {startRollingPublicServer}=await import('../../scripts/rolling-public-server.mjs');
 const f=await fixture(t);
 for(let n=4;n<=24;n++)f.put(n,n===24?[await log('LikeChanged',{schema:1,post:10,tag:9,active:true,count:1})]:[]);f.setHead(24);
 let first;
 for(const phase of ['fresh','cold-reopen']){
  const index=await f.create({rangeSize:10,pagesPerSync:2});assert.throws(()=>index.query('feed'),{code:'ROLLING_PUBLIC_NOT_READY'});
  const observed=await synchronizeRollingPublicReader(index,Date.now()+30000);assert.equal(observed.passes,2);assert.equal(observed.pages,3);
  assert.equal(index.status().authenticatedRanges,3);assert.equal(index.status().checkpoint.number,24);
  const server=await startRollingPublicServer({index,pollMs:30000});
  try{
   // The production HTTP handler joins its own first sync; no second owner runs.
   const response=await fetch(server.url+'/api/feed');assert.equal(response.status,200);const view=await response.json(),status=index.status();
   assertRollingHTTPMetadata(view,status);assert.equal(view.posts[0].likes,'1');assert.equal(view.posts[0].text,'Hello');
   assert.equal(view.names[f.nameId].first,'John');assert.equal(view.boards[f.boardId].slug,'build');assert.equal(view.nextCursor,null);
   const {revision,checkpoint,...content}=view;if(first)assertSocialHTTPView(content,first);else first=content;
  }finally{await server.close();}
 }
});


test('two acceptance phases reuse the explicit reader endpoint across four owned server lifetimes',async t=>{
 const {verifyRollingPublicReader}=await import('../../scripts/testing/rolling-public-acceptance.mjs');
 const f=await fixture(t),index=await f.create();await index.sync();
 const {revision,checkpoint,...expected}=index.query('feed');
 const common={node:f.node,artifact,scope,deployment:f.options.deployment,ids:{},scenario:'social-wire',expectedHTTP:[{route:'feed',parameters:{},expected}]};
 const before={};await verifyRollingPublicReader({...common,cacheDirectory:path.join(f.directory,'before'),deadlineAt:Date.now()+30000,observation:before});
 assert(before.passed&&before.sessions.length===2&&before.sessions.every(s=>s.closed));assert(before.readerPort>0);
 const after={};await verifyRollingPublicReader({...common,readerPort:before.readerPort,cacheDirectory:path.join(f.directory,'after'),deadlineAt:Date.now()+30000,observation:after});
 assert(after.passed&&after.sessions.length===2&&after.sessions.every(s=>s.closed));assert.equal(after.readerPort,before.readerPort);
 for(const readerPort of [-1,65536,1.5,'1234'])await assert.rejects(()=>verifyRollingPublicReader({...common,readerPort,cacheDirectory:f.directory,deadlineAt:Date.now()+30000,observation:{}}));
});

test('Home real decoder/SQLite/HTTP excludes newly posted boards until explicit operator curation',async t=>{
 const f=await fixture(t),main=await f.create();await main.sync();
 assert.equal(main.query('home').posts.length,0);assert.equal(main.query('feed').posts.length,1);assert.equal(main.query('directory').boards.length,1);
 f.put(4,[await f.post(20,4,'Main board',true)]);f.setHead(4);await main.sync();
 const ids=[f.boardId],curated=await f.create({homeSubboards:ids});ids.length=0;await curated.sync();
 const server=await startRollingPublicServer({index:curated,pollMs:30000});t.after(()=>server.close());
 const get=async route=>{const response=await fetch(server.url+route);return {status:response.status,body:await response.json()};};
 const first=await get('/api/home?limit=1');assert.equal(first.status,200);assert.equal(first.body.posts[0].id,'20');assert(first.body.nextCursor);
 const second=await get('/api/home?limit=1&cursor='+encodeURIComponent(first.body.nextCursor));assert.equal(second.body.posts[0].id,'10');assert.equal(second.body.nextCursor,null);assert.equal(second.body.boards[f.boardId].slug,'build');
 assert.equal((await get('/api/home?homeSubboards=1')).status,400);assert.equal((await get('/api/feed')).body.posts.length,2);
 assert.deepEqual(main.query('home').posts.map(p=>p.id),['20']);
 // A new instance with different immutable curation gets a different epoch;
 // cold authentication still verifies retained chain data independently.
 const changed=await f.create();await changed.sync();assert.throws(()=>changed.query('home',{cursor:first.body.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
 f.put(5,[await log('SubboardRejected',{schema:1,subboard_id:BigInt(f.boardId),main_policy_version:1,local_policy_version:1,reason_length:3,reason:pack('Bad',7),reason_digest:await digest('Bad',7)})]);f.setHead(5);await curated.sync();
 assert.deepEqual((await get('/api/home')).body.posts.map(p=>p.id),['20']);
 assert.equal((await get('/api/feed')).body.posts.find(p=>p.id==='10').text,null);
 assert.equal((await get('/api/directory')).body.boards[0].rejected,true);
 assert.equal((await get('/api/home?cursor='+encodeURIComponent(first.body.nextCursor))).status,409);
});
test('Home applies full ranked selection before pages, reorg replacement and stale cursors',async t=>{
 const f=await fixture(t),index=await f.create({homeSubboards:[f.boardId]});await index.sync();
 f.put(4,[await f.post(20,4),await f.post(30,4)]);f.setHead(4);await index.sync();
 const first=index.query('home',{limit:1});assert.equal(first.posts[0].id,'20');assert.equal(index.query('home',{limit:1,cursor:first.nextCursor}).posts[0].id,'30');
 f.put(5,[await log('LikeChanged',{schema:1,post:10,tag:77,active:true,count:1})]);f.setHead(5);await index.sync();
 assert.equal(index.query('home').posts[0].id,'10');assert.throws(()=>index.query('home',{cursor:first.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
 const liked=index.query('home',{limit:1});f.put(5,[await f.post(40,5)],20);await index.sync();
 assert.deepEqual(index.query('home').posts.map(p=>p.id),['40','20','30','10']);assert.throws(()=>index.query('home',{cursor:liked.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
});


test('board public index authenticates complete scoped pagination, policy history, rejection and cold reopen',async t=>{
 const f=await fixture(t);f.put(4,[await f.post(20,4)]);f.setHead(4);const index=await f.create();await index.sync();
 const first=index.query('board',{id:f.boardId,limit:1});assert.equal(first.posts[0].id,'20');assert.equal(first.board.slug,'build');assert(first.nextCursor);
 const second=index.query('board',{id:f.boardId,limit:1,cursor:first.nextCursor});assert.equal(second.posts[0].id,'10');assert.equal(second.nextCursor,null);
 assert.deepEqual(index.query('board',{id:'0'}).posts,[]);assert.throws(()=>index.query('board',{id:'0',cursor:first.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
 assert.throws(()=>index.query('board',{id:'999'}),{code:'ROLLING_PUBLIC_NOT_FOUND'});
 f.put(5,[await log('MainPolicyPublished',{schema:1,version:2,digest:await digest('Changed',32),length:7,rules:pack('Changed',32)})]);
 f.put(6,[await log('SubboardRejected',{schema:1,subboard_id:BigInt(f.boardId),main_policy_version:2,local_policy_version:1,reason_length:3,reason:pack('Bad',7),reason_digest:await digest('Bad',7)})]);f.setHead(6);await index.sync();
 const after=index.query('board',{id:f.boardId});assert(after.board.rejected);assert(after.posts.every(post=>post.text===null));assert.deepEqual(after.policies.map(p=>p.version),['1','2']);assert.equal(after.mainPolicy.text,'Changed');
 assert.throws(()=>index.query('board',{id:f.boardId,cursor:first.nextCursor}),{code:'ROLLING_PUBLIC_CURSOR_STALE'});
 const cold=await f.create();await cold.sync();const reopened=cold.query('board',{id:f.boardId});assert.deepEqual(reopened.posts,after.posts);assert.deepEqual(reopened.board,after.board);assert.deepEqual(reopened.policies,after.policies);
 const {startRollingPublicServer}=await import('../../scripts/rolling-public-server.mjs'),server=await startRollingPublicServer({index:cold,pollMs:30000});
 try{const response=await fetch(server.url+'/api/board?id='+f.boardId);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.posts,after.posts);assert.equal(body.board.rejection.reason,'Bad');assert.equal((await fetch(server.url+'/api/board?id=999')).status,404);}finally{await server.close();}
});
