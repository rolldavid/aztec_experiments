// Labelled synthetic event fixtures; hash computation is actual pinned SDK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {validateRollingEvent,isRollingEvent} from './public-events.mjs';
import {createRollingProjection} from './public-projection.mjs';
import {nameRegistration,NAME_DOMAIN} from './name-policy.mjs';
const scope={chainId:'31337',rollupVersion:'1',rollupAddress:'0x'+'11'.repeat(20),boardAddress:'0x'+'0'.repeat(62)+'42',classId:'0x'+'0'.repeat(63)+'1'};
const h=async(values,domain)=>(await poseidon2HashWithSeparator(values.map(BigInt),domain)).toBigInt().toString();
function pack(s,size){const bytes=Buffer.alloc(size*31);Buffer.from(s).copy(bytes);return Array.from({length:size},(_,i)=>BigInt('0x'+bytes.subarray(i*31,(i+1)*31).toString('hex')).toString());}
const digest=async(s,size)=>h([String(Buffer.byteLength(s)),...pack(s,size)],0x52435431);
async function event(type,payload,index,tx='1'){return validateRollingEvent({schemaVersion:1,scope,type,position:{blockNumber:'1',blockHash:'0x'+'12'.repeat(32),txHash:'0x'+tx.padStart(64,'0'),txIndexWithinBlock:tx,logIndexWithinTx:String(index)},payload:{schema:'1',...payload}},scope);}
async function fixture(){
 const registration=nameRegistration('John','Doe'),nameId=await h(registration.preimage,NAME_DOMAIN);
 const policy=await event('MainPolicyPublished',{version:'1',digest:await digest('Rules',32),length:'5',rules:pack('Rules',32)},0);
 const name=await event('NameRegistered',{name_id:nameId,first_length:'4',first:pack('John',2),last_length:'3',last:pack('Doe',2)},1);
 const plugin=await event('PluginConfigured',{plugin_id:'7',adapter:'9',enabled:true},2);
 const post=await event('PostPublished',{id:'10',record:{subboard:'0',parent:'0',root:'10',kind:'1',name_id:nameId,reference:'0',content_digest:await digest('Hello',32)},timestamp:'1',main_policy_version:'1',local_policy_version:'0',length:'5',message:pack('Hello',32)},3);
 const invoke=await event('PluginInvoked',{plugin_id:'7',post_id:'10',request_id:'11',target:'12'},4);
 const reply=await event('PostPublished',{id:'20',record:{subboard:'0',parent:'10',root:'10',kind:'4',name_id:'0',reference:'0',content_digest:await digest('Done',32)},timestamp:'1',main_policy_version:'1',local_policy_version:'0',length:'4',message:pack('Done',32)},0,'2');
 const linked=await event('PluginReplyPublished',{plugin_id:'7',request_id:'11',post_id:'20',parent_id:'10',target:'12'},1,'2');
 return {events:[policy,name,plugin,post,invoke,reply,linked],nameId};
}
async function modified(e,changes){return validateRollingEvent({...e,payload:{...e.payload,...changes}},scope);}
test('staged apply/undo/rebuild, names, anonymous authenticated bot and thread',async()=>{
 const {events,nameId}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});const a=p.stage(events);assert.equal(p.postCount,0);a.apply();assert.equal(p.postCount,2);
 assert.equal(p.thread('10').posts[1].bot.pluginId,'7');assert.equal(p.profile(nameId).posts.length,1);assert(!JSON.stringify(p.feed()).includes('owner'));
 assert.deepEqual(p.identity(nameId),{id:nameId,first:'John',last:'Doe',profile:{bio:{version:'0',digest:'0',length:'0',text:''},avatar:{version:'0',digest:'0',width:'0',height:'0',length:'0',encoding:'base64',data:''}}});assert.equal(p.identity('0'),null);
 const named=p.identity(nameId);named.first='Mutated';assert.equal(p.identity(nameId).first,'John');
 const before=p.feed().posts;const rebuilt=createRollingProjection({isValidatedEvent:isRollingEvent});rebuilt.stage(events).apply();assert.deepEqual(rebuilt.feed().posts,before);
 a.undo();assert.equal(p.postCount,0);assert.equal(p.identity(nameId),null);assert.throws(()=>a.undo());assert.throws(()=>a.apply());
});
test('forged bot without linkage and mismatched target are atomic failures',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});assert.throws(()=>p.stage(events.slice(0,-1)));assert.equal(p.postCount,0);
 const bad=[...events.slice(0,-1),await modified(events.at(-1),{target:'13'})];assert.throws(()=>p.stage(bad));assert.equal(p.postCount,0);
});
test('same event data without validation cannot enter the projection',async()=>{const {events}=await fixture();assert.throws(()=>createRollingProjection({isValidatedEvent:isRollingEvent}).stage(JSON.parse(JSON.stringify(events))));});
test('cross-transaction linkage, wrong request and wrong parent rejected',async()=>{
 const {events}=await fixture();
 const cross=await validateRollingEvent({...events.at(-1),position:{...events.at(-1).position,txHash:'0x'+'14'.repeat(32)}},scope);
 for(const last of [cross,await modified(events.at(-1),{request_id:'88'}),await modified(events.at(-1),{parent_id:'88'})])assert.throws(()=>createRollingProjection({isValidatedEvent:isRollingEvent}).stage([...events.slice(0,-1),last]));
});
test('duplicate ordered event, stale stage and nonreverse undo rejected',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent}),a=p.stage(events.slice(0,3)),stale=p.stage(events.slice(0,3));a.apply();assert.throws(()=>stale.apply());
 const b=p.stage(events.slice(3));b.apply();assert.throws(()=>a.undo());assert.throws(()=>p.stage([events.at(-1)]));b.undo();a.undo();assert.equal(p.postCount,0);
});
test('removed post hides body and remains in canonical thread; undo restores',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 const removed=await event('PostRemoved',{id:'10',policy_version:'1',penalized:true,reason_length:'6',reason:pack('Unsafe',7)},0,'3');const change=p.stage([removed]);change.apply();
 assert.equal(p.post('10').text,null);assert.equal(p.thread('10').posts[1].record.root,'10');change.undo();assert.equal(p.post('10').text,'Hello');
});
test('like transitions deduplicate tags without returning membership and reverse with reorg',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 const like=await event('LikeChanged',{post:'10',tag:'77',active:true,count:'1'},0,'3');const a=p.stage([like]);a.apply();assert.equal(p.post('10').likes,'1');assert(!Object.hasOwn(p.post('10'),'tag'));assert(!Object.hasOwn(p.post('10'),'members'));assert(!Object.hasOwn(p.post('10'),'likesByAccount'));
 assert.throws(()=>p.stage([{...like}]));
 const dup=await event('LikeChanged',{post:'10',tag:'77',active:true,count:'2'},0,'4');assert.throws(()=>p.stage([dup]));
 const unlike=await event('LikeChanged',{post:'10',tag:'77',active:false,count:'0'},0,'4');const b=p.stage([unlike]);b.apply();assert.equal(p.post('10').likes,'0');b.undo();assert.equal(p.post('10').likes,'1');
});
test('bounded pages/cursors and wrong root reject',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();const first=p.feed({limit:1});assert.equal(first.posts.length,1);assert.equal(p.feed({limit:1,cursor:first.nextCursor}).posts[0].id,'10');
 for(const limit of [0,101,1.5])assert.throws(()=>p.feed({limit}));assert.throws(()=>p.thread('999'));assert.throws(()=>p.directory({query:'x'.repeat(121)}));
 const like=await event('LikeChanged',{post:'10',tag:'77',active:true,count:'1'},0,'3');p.stage([like]).apply();assert.throws(()=>p.feed({cursor:first.nextCursor}));
});
test('subboard metadata hashes, policy inheritance and rejection tombstone',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();const slug=pack('build',2),id=await h(['5',...slug],0x52435331);
 const create=await event('SubboardCreated',{subboard_id:id,slug_length:'5',slug,name_length:'5',name:pack('Build',3),description_length:'5',description:pack('Tools',16),local_policy_version:'1',rules_length:'0',rules:pack('',32),rules_digest:await digest('',32),main_policy_version:'1',metadata_digest:await h([id,await digest('Build',3),await digest('Tools',16)],0x52434d31)},0,'3');p.stage([create]).apply();
 assert.equal(p.directory({query:'tools'}).boards[0].mainRules,'Rules');
 assert.equal(p.board('0'),null);assert.deepEqual(p.board(id),p.directory().boards[0]);const metadata=p.board(id);metadata.name='Mutated';assert.equal(p.board(id).name,'Build');
 const policy=await event('MainPolicyPublished',{version:'2',digest:await digest('New',32),length:'3',rules:pack('New',32)},0,'4');p.stage([policy]).apply();assert.equal(p.directory().boards[0].mainRules,'New');
 const reject=await event('SubboardRejected',{subboard_id:id,main_policy_version:'2',local_policy_version:'1',reason_length:'3',reason:pack('Bad',7),reason_digest:await digest('Bad',7)},0,'5');p.stage([reject]).apply();assert.equal(p.directory().boards[0].rejected,true);assert.equal(p.directory().boards[0].rejection.reason,'Bad');
 await assert.rejects(()=>modified(create,{metadata_digest:'1'}));await assert.rejects(()=>modified(events[1],{name_id:'1'}));
});

test('event retention cap fails before mutation and unvalidated predicate is required',async()=>{
 const {events}=await fixture();assert.throws(()=>createRollingProjection());
 const p=createRollingProjection({isValidatedEvent:isRollingEvent,maxEvents:6});assert.throws(()=>p.stage(events));assert.equal(p.postCount,0);
});
test('ordinary canonical replies, quotes and reposts project without bot identity',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 for(const [id,kind,parent,reference,body,tx] of [['30','1','10','0','Reply','3'],['40','2','0','10','Quote','4'],['50','3','0','10','','5']]){
  const e=await event('PostPublished',{id,record:{subboard:'0',parent,root:parent==='0'?id:'10',kind,name_id:'0',reference,content_digest:await digest(body,32)},timestamp:'1',main_policy_version:'1',local_policy_version:'0',length:String(body.length),message:pack(body,32)},0,tx);
  p.stage([e]).apply();assert.equal(p.post(id).bot,null);
 }
 assert.equal(p.thread('10').posts.length,3);assert.equal(p.post('50').text,'');
});
test('unknown parent and unregistered named identity never mutate the projection',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 const published=events[3];
 for(const record of [{...published.payload.record,parent:'999',root:'999'},{...published.payload.record,name_id:'999',root:'30'}]){
  const e=await event('PostPublished',{...published.payload,id:'30',record},0,'3');assert.throws(()=>p.stage([e]));assert.equal(p.postCount,2);
 }
});
test('touched-entry undo restores first value after multiple writes in a range',async()=>{
 const {events}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();const before=p.feed().posts;
 const like=await event('LikeChanged',{post:'10',tag:'77',active:true,count:'1'},0,'3');
 const unlike=await event('LikeChanged',{post:'10',tag:'77',active:false,count:'0'},0,'4');
 const change=p.stage([like,unlike]);assert.deepEqual(p.feed().posts,before);change.apply();assert.equal(p.post('10').likes,'0');change.undo();assert.deepEqual(p.feed().posts,before);
 // A branch prepared before a later apply/undo cannot become valid again.
 const stale=p.stage([like]),other=p.stage([like]);other.apply();other.undo();assert.throws(()=>stale.apply());
 const fresh=p.stage([like]);fresh.apply();assert.equal(p.post('10').likes,'1');
});
test('labelled performance fixture: retained two-thousand-range undo fits finite heap budget',async()=>{
 const {spawnSync}=await import('node:child_process');
 const moduleUrl=new URL('./public-projection.mjs',import.meta.url).href;
 const script=`import {createRollingProjection} from ${JSON.stringify(moduleUrl)};
 const p=createRollingProjection({isValidatedEvent:()=>true}),history=[],scope={fixture:true},word=(65n<<240n).toString();
 const position=i=>({blockNumber:String(i+1),blockHash:'fixture'+i,txHash:'fixture'+i,txIndexWithinBlock:'0',logIndexWithinTx:'0'});
 global.gc();const start=process.memoryUsage().heapUsed;
 const initial=p.stage([{type:'MainPolicyPublished',scope,position:position(0),payload:{version:'1',rules:[word],length:'1'}}]);initial.apply();history.push(initial);
 for(let i=1;i<=2000;i++){const change=p.stage([{type:'PostPublished',scope,position:position(i),payload:{id:String(i),record:{subboard:'0',parent:'0',root:String(i),kind:'1',name_id:'0',reference:'0',content_digest:'1'},timestamp:'1',main_policy_version:'1',local_policy_version:'0',message:[word],length:'1'}}]);change.apply();history.push(change);}
 global.gc();const retainedBytes=process.memoryUsage().heapUsed-start;
 for(let i=history.length-1;i>=0;i--)history[i].undo();
 console.log(JSON.stringify({retainedBytes,empty:p.postCount===0}));`;
 const result=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=128','--input-type=module','-e',script],{encoding:'utf8',timeout:15000,maxBuffer:4096});
 assert.equal(result.status,0,result.stderr);const observed=JSON.parse(result.stdout);
 assert.equal(observed.empty,true);assert(observed.retainedBytes<40*1024*1024,'Retained undo exceeds predeclared 40MiB fixture budget');
});

// Profile fixtures are synthetic events; the real SDK computes hashes. They do
// not qualify actual-chain receipt/emitter validation or image decoding.
async function bio(nameId,version,body,tx='3') {
 const length=String(Buffer.byteLength(body)),content=pack(body,32);
 return event('BioPublished',{name_id:nameId,version,length,content,digest:await h(['1',nameId,version,length,...content],0x52434231),trailer:'1'},0,tx);
}
async function avatar(nameId,version,bytes,tx='4') {
 const length=String(bytes.length),data=pack(bytes,265),width=bytes.length?'100':'0',height=width;
 return event('AvatarPublished',{name_id:nameId,version,width,height,length,data,digest:await h(['1',nameId,version,width,height,length,...data],0x52434131),trailer:'1'},0,tx);
}
test('profile exact binary bytes and independent current versions appear on existing posts at read time',async()=>{
 const {events,nameId}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 const previous=p.identity(nameId);assert.equal(previous.profile.avatar.version,'0');assert.equal(Object.hasOwn(p.post('20'),'identity'),false);
 const bytes=Buffer.from([0xff,0xc0,0x80,0,0x89,0]); // deliberately invalid UTF-8 and trailing zeros
 const b=await bio(nameId,'1','A short bio'),a=await avatar(nameId,'1',bytes);
 p.stage([b,a]).apply();
 assert.equal(p.identity(nameId).profile.bio.text,'A short bio');
 const image=p.identity(p.post('10').record.name_id).profile.avatar;assert.equal(image.data,bytes.toString('base64'));assert.equal(image.length,'6');assert.equal(image.digest,a.payload.digest);
 assert.equal(p.profile(nameId).identity.profile.avatar.data,image.data);assert.equal(p.identity(p.thread('10').posts[0].record.name_id).profile.avatar.data,image.data);assert.equal(Object.hasOwn(p.post('10'),'identity'),false);
 assert.equal(previous.profile.avatar.version,'0');
 const publicCopy=p.identity(nameId);publicCopy.profile.avatar.data='mutated';assert.equal(p.identity(nameId).profile.avatar.data,image.data);
 assert(!JSON.stringify(p.feed()).includes('owner'));
});
test('profile clears, independent updates, reverse undo and redecoding rebuild preserve exact versions',async()=>{
 const {events,nameId}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 const b=await bio(nameId,'1','Bio'),a=await avatar(nameId,'1',Buffer.from([1,2,0]));const first=p.stage([b,a]);first.apply();const original=p.identity(nameId);
 const clearBio=await bio(nameId,'2','','5'),clearAvatar=await avatar(nameId,'2',Buffer.alloc(0),'6');
 const second=p.stage([clearBio,clearAvatar]);second.apply();assert.equal(p.identity(nameId).profile.bio.text,'');assert.equal(p.identity(nameId).profile.avatar.data,'');assert.equal(p.identity(nameId).profile.avatar.width,'0');assert.equal(p.identity(nameId).profile.avatar.version,'2');
 assert.notEqual(p.identity(nameId).profile.avatar.digest,'0');
 second.undo();assert.deepEqual(p.identity(nameId),original);assert.deepEqual(p.identity(p.post('10').record.name_id),original);
 const replacement=await avatar(nameId,'2',Buffer.from([9,0,8,0]),'5'),third=p.stage([replacement]);third.apply();
 assert.equal(p.identity(nameId).profile.bio.version,'1');assert.equal(p.identity(nameId).profile.avatar.data,'CQAIAA==');
 const rebuilt=createRollingProjection({isValidatedEvent:isRollingEvent});const validated=[];
 for(const e of [...events,b,a,replacement])validated.push(await validateRollingEvent(JSON.parse(JSON.stringify(e)),scope));
 rebuilt.stage(validated).apply();assert.deepEqual(rebuilt.identity(nameId),p.identity(nameId));assert.deepEqual(rebuilt.feed().posts,p.feed().posts);
 third.undo();first.undo();assert.equal(p.identity(nameId).profile.avatar.version,'0');
});
test('unregistered identity, skipped/stale profile versions and atomic partial range rejected',async()=>{
 const {events,nameId}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 for(const bad of [await bio('99','1','Fake'),await bio(nameId,'2','Skipped'),await avatar(nameId,'2',Buffer.from([1]))])assert.throws(()=>p.stage([bad]));
 const original=p.identity(nameId),valid=await bio(nameId,'1','First'),invalid=await avatar(nameId,'2',Buffer.from([1]));
 assert.throws(()=>p.stage([valid,invalid]));assert.deepEqual(p.identity(nameId),original);
 p.stage([valid]).apply();const stale=await bio(nameId,'1','Replay','4');assert.throws(()=>p.stage([stale]));assert.equal(p.identity(nameId).profile.bio.text,'First');
});

test('profile validation rejects bad digest, padding, lengths, dimensions, trailers and bot identity',async()=>{
 const {nameId}=await fixture(),goodBio=await bio(nameId,'1','A'),goodAvatar=await avatar(nameId,'1',Buffer.from([0xff,0]));
 const modify=(e,patch)=>validateRollingEvent({...e,payload:{...e.payload,...patch}},scope);
 for(const patch of [{digest:'1'},{name_id:'0'},{version:'0'},{version:'4294967296'},{length:'993'},{trailer:'0'},{content:pack('AB',32)},{content:pack(Buffer.from([0xc0]),32)}])await assert.rejects(()=>modify(goodBio,patch));
 for(const patch of [{digest:'1'},{name_id:'0'},{version:'0'},{length:'8193'},{length:'1'},{width:'99'},{height:'0'},{trailer:'0'},{data:pack(Buffer.from([255,0,1]),265)},{data:[(1n<<248n).toString(),...Array(264).fill('0')]},{data:Array(264).fill('0')}])await assert.rejects(()=>modify(goodAvatar,patch));
 const cleared=await avatar(nameId,'1',Buffer.alloc(0));await assert.rejects(()=>modify(cleared,{width:'100'}));await assert.rejects(()=>modify(cleared,{data:pack(Buffer.from([1]),265)}));
});
test('8192 byte profile content round trips, standard base64 padding is exact for all remainders',async()=>{
 const {events,nameId}=await fixture(),p=createRollingProjection({isValidatedEvent:isRollingEvent});p.stage(events).apply();
 for(const [i,length] of [8192,1,2,3].entries()){
  const bytes=Buffer.alloc(length,0xff);bytes[length-1]=0;const a=await avatar(nameId,String(i+1),bytes,String(i+3));p.stage([a]).apply();
  const result=p.identity(nameId).profile.avatar;assert.equal(result.data,bytes.toString('base64'));assert.deepEqual(Buffer.from(result.data,'base64'),bytes);assert.equal(result.length,String(length));
 }
 const body='z'.repeat(992),b=await bio(nameId,'1',body,'7');p.stage([b]).apply();assert.equal(p.identity(nameId).profile.bio.text,body);
});
