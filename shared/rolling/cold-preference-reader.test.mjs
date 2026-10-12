import test from 'node:test';
import assert from 'node:assert/strict';
import {createRollingColdPreferenceReader} from './cold-preference-reader.mjs';
import {PREFERENCE_DOMAIN} from './preferences.mjs';
// Explicit presentation/transport fixtures. AEAD/CAS and production fold/decoder
// run for real; SDK provenance, chain, field and hash here are labelled doubles.
// These tests do not qualify actual encrypted-log discovery or the SDK cursor.
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
class Field{constructor(n){this.n=BigInt(n);}toString(){return hex(this.n);}toBigInt(){return this.n;}static fromString(s){return new Field(s);}}
const types=[{kind:'integer',sign:'unsigned',width:32},{kind:'integer',sign:'unsigned',width:64},{kind:'integer',sign:'unsigned',width:8},{kind:'field'},{kind:'boolean'},{kind:'integer',sign:'unsigned',width:32},{kind:'field'},{kind:'field'}];
const names=['schema','revision','kind','target','value','read_block','read_hash','previous_digest'];
const artifact={name:'RollingBoard',outputs:{structs:{events:[{path:'RollingBoard::PreferenceChanged',kind:'struct',fields:names.map((name,i)=>({name,type:types[i]}))}]}}};
const selector='0x00001234';
const hash=fields=>fields.reduce((a,b,i)=>a+b*BigInt(i+1),BigInt(PREFERENCE_DOMAIN));
function fixture({marker=false}={}){
 const state={valid:true,canonical:true,syncs:0,steps:0,status:0,restarts:0,hashes:0,failReply:false,failCAS:false,afterCAS:null,pending:null,requests:[],transport:[],mutate:null};
 const db=new Map();const originalRead=async key=>db.get(key)??null;
 const privateStore={read:originalRead,compareAndSwap:async(key,old,next)=>{if(state.failCAS){state.failCAS=false;throw Error('private sentinel');}assert.equal(db.get(key)??null,old);db.set(key,next);state.afterCAS?.();}};
 const node={getBlockData:async number=>({header:{globalVariables:{blockNumber:number},hash:async()=>new Field(state.canonical?10+number:999)},blockHash:new Field(state.canonical?10+number:999)})};
 const owner={toString:()=>hex(3)};
 const deployment={board:{address:hex(2),instance:{currentContractClassId:new Field(4),originalContractClassId:new Field(4)},artifact},network:{chainId:'31337',version:'1',rollup:'0x'+'1'.repeat(40)},proofsEnabled:false};
 let digest=0n;const events=[];
 for(const [kind,target,value,readBlock,readHash]of [[1,77,true,0,0],marker?[6,77,true,1,11]:[2,0,true,0,0]]){
  const values=[1n,BigInt(events.length+1),BigInt(kind),BigInt(target),value?1n:0n,BigInt(readBlock),BigInt(readHash),digest];
  digest=hash([31337n,1n,2n,...values]);events.push({packedEvent:values.map(hex),eventSelector:selector,l2BlockNumber:1,l2BlockHash:hex(11),txHash:hex(100+events.length)});
 }
 const empty={schemaVersion:1,database:'a'.repeat(64),epoch:'b'.repeat(64),sequence:0,anchor:{blockNumber:1,blockHash:hex(11)},nextBlock:1,nextLog:0,records:[],head:null,complete:false};
 let current=structuredClone(empty);
 const pxe={sync:async()=>{state.syncs++;},processRollingPreferenceRecovery:async(p)=>{
  state.requests.push(structuredClone(p));if(state.pending)await state.pending;
  if(p.restart){state.restarts++;current={...structuredClone(empty),epoch:(current.epoch==='b'.repeat(64)?'c':'b').repeat(64),database:current.database};}
  if(p.expected){state.steps++;assert.equal(p.expected.epoch,current.epoch);assert.equal(p.expected.sequence,current.sequence);current={...current,sequence:current.sequence+1};
   if(current.sequence<=2){current.records=[structuredClone(events[current.sequence-1])];current.nextLog=current.sequence;current.nextBlock=current.sequence===2?2:1;}
   else{current.nextLog=0;current.nextBlock=2;current.records=[];current.head={initialized:true,schema:1,revision:'2',digest:String(digest)};current.complete=true;}
   state.mutate?.(current);
   if(state.failReply){state.failReply=false;throw Error('private dropped response');}
  }else state.status++;
  return structuredClone(current);
 }};
 const sdk={Fr:Field,EventSelector:{fromSignature:async()=>({toString:()=>selector})},decodeFunctionSignature:()=> 'labelled ABI signature',
  isTrustedPrivateNode:x=>x===node&&state.valid,isPrivatePXEForNode:(p,n)=>p===pxe&&n===node&&state.valid,
  inspectTrustedNode:async()=>{assert(state.valid);},poseidon2HashWithSeparator:async fields=>{state.hashes++;return new Field(hash(fields));}};
 const compact={read:async p=>{state.transport.push({...p});return {schemaVersion:1,number:p.number,hash:p.hash,fields:Array(7).fill(hex(0)),headerFields:Array(23).fill(hex(0))};}};
 const config={sdk,pxe,node,owner,deployment,expectedArtifactHash:hex(5),tier:'checkpointed',compact,contextGuard:async()=>{assert(state.valid);},privateStore,walletSecret:hex(6),walletSalt:'7'};
 return {state,db,config,privateStore,events,current:()=>current,alter:f=>f(current),reader:()=>createRollingColdPreferenceReader(config)};
}
async function readAll(reader){let result;for(let i=0;i<8;i++){result=await reader.read();if(result.complete)return result;assert.equal(result.status,'recovering');assert.equal(result.preferences,undefined);}assert.fail('fixture did not finish');}
test('labelled SDK delivery: real AEAD/fold complete only after dense events and key-gated terminal head',async()=>{
 const f=fixture(),reader=f.reader();const first=await reader.read();assert.equal(first.complete,false);assert.equal(f.state.steps,0);
 const result=await readAll(reader);assert.deepEqual(result.preferences.bookmarks,['77']);assert.deepEqual(result.preferences.followedBoards,['0']);assert.equal(result.preferences.head.revision,'2');assert.equal(f.state.syncs,1);assert.equal(f.state.steps,3);
 assert(f.db.size===1);for(const encrypted of f.db.values())assert(!encrypted.includes('bookmarks')&&!encrypted.includes('packedEvent'));
 assert(f.state.transport.every(x=>Object.keys(x).sort().join(',')==='hash,number'));
});
for(const mode of ['reply','CAS'])test('labelled '+mode+' loss replays durable delivery without a second SDK page',async()=>{
 const f=fixture(),r=f.reader();await r.read();if(mode==='reply')f.state.failReply=true;else f.state.failCAS=true;
 await assert.rejects(r.read(),{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});assert.equal(f.state.steps,1);
 const repaired=await r.read();assert.equal(repaired.complete,false);assert.equal(f.state.steps,1);
 assert.equal((await readAll(r)).preferences.head.revision,'2');assert.equal(f.state.steps,3);
});
test('labelled same-store reader reconstruction consumes authenticated encrypted prefix',async()=>{
 const f=fixture(),r=f.reader();await r.read();await r.read();const restarts=f.state.restarts;
 const result=await readAll(f.reader());assert.equal(f.state.restarts,restarts);assert.deepEqual(result.preferences.bookmarks,['77']);
});
test('lost encrypted cache restarts scope instead of treating last delivery as complete history',async()=>{
 const f=fixture(),r=f.reader();await r.read();await r.read();f.db.clear();const restart=await f.reader().read();assert.equal(restart.progress.processedRevision,'0');assert.equal(restart.complete,false);assert.equal(f.state.restarts,2);
});
test('new SDK database cannot authenticate an old prefix',async()=>{
 const f=fixture(),r=f.reader();await r.read();await r.read();f.alter(x=>{x.database='d'.repeat(64);});const v=await r.read();assert.equal(v.progress.processedRevision,'0');assert.equal(v.complete,false);
});
for(const [name,mutate] of [
 ['missing revision',x=>{x.records[0].packedEvent[1]=hex(2);}],
 ['wrong previous digest',x=>{x.records[0].packedEvent[7]=hex(99);}],
 ['foreign selector',x=>{x.records[0].eventSelector='0x12345678';}],
 ['wrong canonical metadata',x=>{x.records[0].l2BlockHash=hex(999);}],
 ['duplicate event',x=>{x.records.push(structuredClone(x.records[0]));}],
])test('labelled authenticated-record mutation rejects '+name+' without partial publication',async()=>{
 const f=fixture(),r=f.reader();await r.read();f.state.mutate=mutate;await assert.rejects(r.read(),{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});assert.equal(f.state.steps,1);
});
test('terminal full-head mismatch never publishes a digest-valid prefix as complete',async()=>{
 const f=fixture(),r=f.reader();await r.read();await r.read();await r.read();f.state.mutate=x=>{x.head.digest='99';};await assert.rejects(r.read(),{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});
});
test('post-CAS canonical change suppresses result; existing encrypted record is retained',async()=>{
 const f=fixture(),r=f.reader();f.state.afterCAS=()=>{f.state.canonical=false;};await assert.rejects(r.read(),{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});assert.equal(f.db.size,1);
});
test('pending SDK operation keeps busy after abort until actual await settles',async()=>{
 const f=fixture(),r=f.reader();let release,entered;const reached=new Promise(resolve=>{entered=resolve;});f.state.pending=new Promise(resolve=>{release=resolve;});
 const original=f.config.pxe.processRollingPreferenceRecovery;f.config.pxe.processRollingPreferenceRecovery=async(...args)=>{entered();return original(...args);};const reader=f.reader();const abort=new AbortController(),pending=reader.read({signal:abort.signal});await reached;abort.abort();
 await assert.rejects(reader.read(),{code:'ROLLING_COLD_PREFERENCES_BUSY'});release();await assert.rejects(pending,{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});assert.equal(f.db.size,0);
});
test('account invalidation suppresses publication and performs no page after validation fails',async()=>{
 const f=fixture(),r=f.reader();await r.read();f.state.valid=false;await assert.rejects(r.read(),{code:'ROLLING_COLD_PREFERENCES_UNAVAILABLE'});assert.equal(f.state.steps,0);
});
test('canonical read markers alone suppress notifications',async()=>{
 const f=fixture({marker:true});const result=await readAll(f.reader());assert.equal(result.preferences.readMarkers.length,1);assert.equal(result.orphanedReadMarkers.length,0);
});
test('foreign/extra mailbox fields do not become authority',async()=>{
 const f=fixture(),r=f.reader();await r.read();f.alter(x=>{x.owner='private sentinel';});await assert.rejects(r.read(),e=>e.code==='ROLLING_COLD_PREFERENCES_UNAVAILABLE'&&!e.message.includes('sentinel'));
});
