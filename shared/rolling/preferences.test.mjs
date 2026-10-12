import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {FIELD_MODULUS} from './invocation.mjs';
import {replayPreferenceEvents,PREFERENCE_DOMAIN,PREFERENCE_KINDS} from './preferences.mjs';

after(async()=>{await BarretenbergSync.destroySingleton();});
// Synthetic history with actual pinned Poseidon. This is a pure replay check,
// not encrypted-log retrieval, canonical authentication or privacy acceptance.
const scope={chainId:'31337',version:'1',board:'99'};
const hash=async(fields,domain)=>(await poseidon2HashWithSeparator(fields,domain)).toBigInt();
const empty=()=>({scope:{...scope},head:{initialized:false,schema:1,revision:'0',digest:'0'},events:[],hash});
const change=(kind,target,value=true,read_block=0,read_hash='0')=>({kind,target,value,read_block,read_hash});
async function history(changes,network=scope){
 let previous=0n;const events=[];
 for(let i=0;i<changes.length;i++){
  const c=changes[i],event={schema:1,revision:String(i+1),...c,previous_digest:String(previous)};
  // Independent transcription of preferences.nr and PreferenceChanged fields.
  previous=(await poseidon2HashWithSeparator([BigInt(network.chainId),BigInt(network.version),BigInt(network.board),
   1n,BigInt(i+1),BigInt(c.kind),BigInt(c.target),c.value?1n:0n,BigInt(c.read_block),BigInt(c.read_hash),previous],0x52435031)).toBigInt();
  events.push(event);
 }
 return {scope:{...network},head:{initialized:events.length>0,schema:1,revision:String(events.length),digest:String(previous)},events,hash};
}
const rejected=promise=>assert.rejects(promise,e=>e.code==='ROLLING_PREFERENCES_INVALID'&&e.message==='Private preference history is invalid or unavailable.'&&!e.cause);

test('schema/domain and event order match actual checked-in Noir source',()=>{
 const pure=fs.readFileSync(new URL('../../billboard/rolling_contract/src/preferences.nr',import.meta.url),'utf8');
 const contract=fs.readFileSync(new URL('../../billboard/rolling_contract/src/main.nr',import.meta.url),'utf8');
 assert.match(pure,/PREFERENCE_DOMAIN: u32 = 0x52435031/);assert.equal(PREFERENCE_DOMAIN,0x52435031);
 assert.deepEqual(Object.values(PREFERENCE_KINDS),[1,2,3,4,5,6]);
 assert.match(pure,/chain, version, board.to_field\(\), event\[0\], event\[1\], event\[2\], event\[3\],\s*event\[4\], event\[5\], event\[6\], event\[7\]/);
 const fields=contract.match(/pub struct PreferenceChanged \{([^}]+)\}/)[1].match(/pub [a-z_]+:/g).map(s=>s.slice(4,-1));
 assert.deepEqual(fields,['schema','revision','kind','target','value','read_block','read_hash','previous_digest']);
});
test('absent head returns detached frozen empty preferences and explicit default',async()=>{
 const input=empty(),out=await replayPreferenceEvents(input);input.scope.board='100';input.head.digest='1';
 assert.deepEqual(out,{scope,head:{initialized:false,schema:1,revision:'0',digest:'0'},bookmarks:[],followedBoards:[],followedNames:[],subscriptions:[],replyNotifications:true,readMarkers:[]});
 assert(Object.isFrozen(out));assert(Object.isFrozen(out.scope));assert(Object.isFrozen(out.bookmarks));
});
test('actual hash replay derives all six kinds with toggle removals and stable numeric ordering',async()=>{
 const input=await history([change(1,'10'),change(1,'2'),change(1,'10',false),change(1,'3'),
  change(2,'0'),change(2,'13'),change(3,'21'),change(4,'22'),change(4,'22',false),
  change(5,'0',false),change(6,'42',true,100,'123'),change(6,'42',true,40,'124'),change(6,'2',true,0,'125')]);
 const out=await replayPreferenceEvents(input);
 assert.deepEqual(out.bookmarks,['2','3']);assert.deepEqual(out.followedBoards,['0','13']);
 assert.deepEqual(out.followedNames,['21']);assert.deepEqual(out.subscriptions,[]);assert.equal(out.replyNotifications,false);
 assert.deepEqual(out.readMarkers,[{thread:'2',throughBlock:0,blockHash:'125'},{thread:'42',throughBlock:40,blockHash:'124'}]);
 assert(Object.isFrozen(out.readMarkers[0]));assert.deepEqual(out.head,input.head);
});
test('complete replacement history on reorg removes orphaned preferences without mutating earlier result',async()=>{
 const before=await replayPreferenceEvents(await history([change(1,'2'),change(3,'8'),change(6,'42',true,4,'9')]));
 const after=await replayPreferenceEvents(await history([change(1,'2'),change(2,'0'),change(5,'0',false)]));
 assert.deepEqual(before.followedNames,['8']);assert.deepEqual(after.followedNames,[]);assert.deepEqual(after.readMarkers,[]);
 assert.notEqual(after.head.digest,before.head.digest);assert.deepEqual(after.followedBoards,['0']);
});
test('snapshot survives input mutation while first asynchronous hash awaits',async()=>{
 const input=await history([change(1,'2'),change(3,'8')]);let release,entered;
 const gate=new Promise(r=>{release=r;});const active=new Promise(r=>{entered=r;});let calls=0;
 input.hash=async(fields,domain)=>{calls++;if(calls===1){entered();await gate;}assert(Object.isFrozen(fields));return hash(fields,domain);};
 const pending=replayPreferenceEvents(input);await active;
 input.scope.board='100';input.events[1].target='77';input.events.pop();input.head.digest='123';input.hash=()=>{throw Error('mutated');};release();
 const out=await pending;assert.equal(calls,2);assert.deepEqual(out.followedNames,['8']);assert.equal(out.scope.board,'99');
});
for(const key of ['chainId','version','board'])test(`actual hash rejects wrong ${key} scope`,async()=>{
 const input=await history([change(1,'2')]);input.scope[key]=String(BigInt(input.scope[key])+1n);await rejected(replayPreferenceEvents(input));
});
for(const [name,mutate] of [
 ['missing',x=>{x.events.pop();}],['reordered',x=>{x.events.reverse();}],['duplicate',x=>{x.events[1]={...x.events[0]};}],
 ['skipped revision',x=>{x.events[1].revision='3';}],['forged predecessor',x=>{x.events[1].previous_digest='1';}],
 ['forged value',x=>{x.events[1].value=false;}],['forged target',x=>{x.events[1].target='4';}],
 ['forged kind',x=>{x.events[1].kind=3;}],['wrong terminal digest',x=>{x.head.digest='1';}],
 ['shorter head',x=>{x.head.revision='1';}],['longer head',x=>{x.head.revision='3';}],
 ['absent head with events',x=>{x.head={initialized:false,schema:1,revision:'0',digest:'0'};}],
 ['unknown event field',x=>{x.events[0].owner='PRIVATE_SENTINEL';}],['unknown head field',x=>{x.head.secret='PRIVATE_SENTINEL';}],
 ['unknown scope field',x=>{x.scope.owner='PRIVATE_SENTINEL';}],['unknown options field',x=>{x.extra='PRIVATE_SENTINEL';}],
])test(`rejects ${name}`,async()=>{const input=await history([change(1,'2'),change(2,'0')]);mutate(input);await rejected(replayPreferenceEvents(input));});
for(const [name,patch] of [
 ['schema',{schema:2}],['zero revision',{revision:'0'}],['overflow revision',{revision:String(1n<<64n)}],
 ['negative revision',{revision:'-1'}],['noncanonical revision',{revision:'01'}],['numeric revision',{revision:1}],
 ['zero kind',{kind:0}],['unknown kind',{kind:7}],['fractional kind',{kind:1.1}],['string kind',{kind:'1'}],
 ['numeric bool',{value:1}],['null bool',{value:null}],['noncanonical target',{target:'02'}],['hex target',{target:'0x2'}],
 ['field overflow',{target:String(FIELD_MODULUS)}],['negative target',{target:'-1'}],['zero bookmark',{target:'0'}],
 ['zero name',{kind:3,target:'0'}],['zero subscription',{kind:4,target:'0'}],['global target',{kind:5,target:'2'}],
 ['toggle marker block',{read_block:1}],['toggle marker hash',{read_hash:'1'}],['negative zero block',{read_block:-0}],
 ['marker disabled',{kind:6,value:false,read_hash:'3'}],['marker zero hash',{kind:6}],['marker zero thread',{kind:6,target:'0',read_hash:'3'}],
 ['marker block overflow',{kind:6,read_block:0x100000000,read_hash:'3'}],['marker negative block',{kind:6,read_block:-1,read_hash:'3'}],
 ['marker fraction',{kind:6,read_block:.1,read_hash:'3'}],['marker string block',{kind:6,read_block:'1',read_hash:'3'}],
 ['previous digest overflow',{previous_digest:String(FIELD_MODULUS)}],
])test(`strict event shape rejects ${name} before hash`,async()=>{
 const input=await history([change(1,'2')]);Object.assign(input.events[0],patch);let calls=0;input.hash=()=>{calls++;throw Error('must not hash');};
 await rejected(replayPreferenceEvents(input));assert.equal(calls,0);
});
for(const patch of [{schema:0},{initialized:0},{initialized:true},{revision:'1'},{digest:'1'},{revision:'00'},{digest:'0x0'}])test(`strict absent head ${JSON.stringify(patch)}`,async()=>{
 const input=empty();Object.assign(input.head,patch);await rejected(replayPreferenceEvents(input));
});
test('unknown or sparse array entries and symbol fields fail without invoking accessors',async()=>{
 const cases=[x=>{delete x.events[0];},x=>{x.events.extra=1;},x=>{x.events[Symbol('hidden')]=1;},x=>{x.events[0][Symbol('owner')]='PRIVATE_SENTINEL';}];
 for(const mutate of cases){const input=await history([change(1,'2')]);mutate(input);await rejected(replayPreferenceEvents(input));}
 let read=0;const input=await history([change(1,'2')]);
 Object.defineProperty(input.events[0],'target',{enumerable:true,get(){read++;throw Error('PRIVATE_SENTINEL');}});
 await rejected(replayPreferenceEvents(input));assert.equal(read,0);
});
test('hash accessor, changing getters and proxy exceptions cannot leak causes or perform partial replay',async()=>{
 let reads=0;const input=empty();Object.defineProperty(input,'hash',{enumerable:true,get(){reads++;return ()=>{throw Error('PRIVATE_SENTINEL');};}});
 await rejected(replayPreferenceEvents(input));assert.equal(reads,0);
 await rejected(replayPreferenceEvents(new Proxy({}, {getPrototypeOf(){throw Error('PRIVATE_SENTINEL');}})));
});
for(const value of [0n,-1n,FIELD_MODULUS,'1',{},null])test(`invalid hash return ${typeof value}:${String(value)}`,async()=>{
 const input=await history([change(1,'2')]);input.hash=async()=>value;await rejected(replayPreferenceEvents(input));
});
test('hash failure is sanitized and never retried',async()=>{
 const input=await history([change(1,'2')]);let calls=0;input.hash=async()=>{calls++;throw Object.assign(Error('PRIVATE_SENTINEL'),{secret:'PRIVATE_SENTINEL'});};
 await rejected(replayPreferenceEvents(input));assert.equal(calls,1);
});
test('repeated same-value events remain ordered records, and removal of an absent target is valid',async()=>{
 const input=await history([change(1,'2'),change(1,'2'),change(1,'3',false),change(5,'0',false),change(5,'0',true)]);
 const out=await replayPreferenceEvents(input);assert.deepEqual(out.bookmarks,['2']);assert.equal(out.head.revision,'5');assert.equal(out.replyNotifications,true);
});
for(const [key,value] of [['chainId','0'],['version','0'],['board','0'],['chainId','031337'],['version',1],['board','0x63'],['chainId',String(FIELD_MODULUS)]])test(`strict scope rejects ${key}:${String(value)}`,async()=>{
 const input=empty();input.scope[key]=value;await rejected(replayPreferenceEvents(input));
});
test('invalid later record is detected before any hash dependency receives private data',async()=>{
 const input=await history([change(1,'2'),change(2,'0')]);input.events[1].read_hash='9';let calls=0;
 input.hash=()=>{calls++;throw Error('unexpected');};await rejected(replayPreferenceEvents(input));assert.equal(calls,0);
});
test('all four relationship kinds support explicit removal independently',async()=>{
 const input=await history([change(1,'8'),change(2,'8'),change(3,'8'),change(4,'8'),
  change(1,'8',false),change(2,'8',false),change(3,'8',false),change(4,'8',false)]);
 const out=await replayPreferenceEvents(input);
 for(const key of ['bookmarks','followedBoards','followedNames','subscriptions'])assert.deepEqual(out[key],[]);
});
