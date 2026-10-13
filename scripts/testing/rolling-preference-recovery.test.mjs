// Labelled capability doubles test the acceptance consumer, never chain recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseRollingPreferences,compareRecoveredRollingPreferences,compareRecoveredColdRollingPreferences} from './rolling-preference-recovery.mjs';
function fixture(mode='relationships',fault){
 let revision=0,proofJobs=0,transportSends=0,walletSubmissions=0,readCount=0;
 const actions=[],snapshot={scope:{chainId:'31337',version:'1',board:'9'},head:{initialized:true,schema:1,revision:'0',digest:'1'},bookmarks:[],followedNames:[],followedBoards:[],subscriptions:[],replyNotifications:true,readMarkers:[]};
 const activity=()=>({proofJobs,transportSends,walletSubmissions,authWitnesses:readCount});
 const action=async(input,label)=>{
  assert.equal(input.expectedRevision,String(revision));assert.equal(label,'preference-'+(revision+1));actions.push(input);
  revision++;snapshot.head.revision=String(revision);snapshot.head.digest=String(revision+1);proofJobs++;transportSends++;walletSubmissions++;
  if(input.kind===1)snapshot.bookmarks=[input.target];if(input.kind===2)snapshot.followedBoards=[input.target];if(input.kind===3)snapshot.followedNames=[input.target];
  if(input.kind===4)snapshot.subscriptions=[input.target];if(input.kind===5)snapshot.replyNotifications=input.enabled;
  if(input.type==='read-marker'){assert.equal(typeof input.throughBlock,'string');snapshot.readMarkers=[{thread:input.thread,throughBlock:Number(input.throughBlock),blockHash:'13'}];}
  return fault==='public-event'?[{type:'PreferenceChanged'}]:[];
 };
 const readPreferences=async()=>{
  readCount++;if(fault==='read-send')transportSends++;
  const preferences=structuredClone(snapshot);
  if(fault==='wrong-head')preferences.head.revision='99';
  if(fault==='missing-bookmark')preferences.bookmarks=[];
  if(fault==='wrong-marker')preferences.readMarkers=[{thread:'10',throughBlock:2,blockHash:'99'}];
  if(fault==='missing-follow')preferences.followedNames=[];
  if(fault==='wrong-global')preferences.replyNotifications=!preferences.replyNotifications;
  if(fault==='stalled')return {status:'recovering',complete:false,progress:{scannedThrough:1,markersChecked:0}};
  if(fault==='partial-published')return {status:'recovering',complete:false,preferences,progress:{scannedThrough:readCount,markersChecked:0}};
  return {status:'complete',complete:true,anchor:{blockNumber:revision+10},preferences,orphanedReadMarkers:fault==='orphaned'?[{}]:[],progress:{scannedThrough:revision+10,markersChecked:preferences.readMarkers.length}};
 };
 return {options:{mode,root:'10',name:'11',rootBlock:2,rootHash:'0x'+(13).toString(16).padStart(64,'0'),action,readPreferences,activity,deadlineAt:Date.now()+10000},actions,
  reset(){walletSubmissions=0;},mutate(){snapshot.head.digest='999';},send(){transportSends++;}};
}
for(const mode of ['relationships','notifications','browser-relationships'])test(mode+': exact mutations, incremental read and one-use fresh recovery',async()=>{
 const f=fixture(mode),r=await exerciseRollingPreferences(f.options);
 assert.equal(r.observation.preferenceTransactions,mode==='relationships'?3:mode==='notifications'?4:2);assert.throws(()=>JSON.stringify(r.checkpoint));
 assert.deepEqual(f.actions.map(a=>a.kind??6),mode==='relationships'?[1,3,2]:mode==='notifications'?[4,5,6,5]:[1,2]);
 assert.equal(JSON.stringify(r.observation).includes('digest'),false);
 f.reset();const recovered=await compareRecoveredRollingPreferences(r.checkpoint,f.options);assert.equal(recovered.exactPrivateStateRecovered,true);
 await assert.rejects(compareRecoveredRollingPreferences(r.checkpoint,f.options),/acceptance failed/);
});
for(const fault of ['public-event','read-send','wrong-head','missing-bookmark','missing-follow','wrong-global','stalled','partial-published','orphaned'])test('reject '+fault+' without exposing private values',async()=>{
 const f=fixture('relationships',fault);await assert.rejects(exerciseRollingPreferences(f.options),e=>e.message==='Rolling preference recovery acceptance failed.'&&!e.actual&&!e.expected);
});
test('notification marker must match actual canonical root block/hash',async()=>{const f=fixture('notifications','wrong-marker');await assert.rejects(exerciseRollingPreferences(f.options));});
for(const fault of ['retained-wallet','changed-snapshot','cold-send'])test('cold recovery rejects '+fault,async()=>{
 const f=fixture(),r=await exerciseRollingPreferences(f.options);if(fault!=='retained-wallet')f.reset();if(fault==='changed-snapshot')f.mutate();if(fault==='cold-send')f.send();await assert.rejects(compareRecoveredRollingPreferences(r.checkpoint,f.options));
});
test('expired budget performs no mutations',async()=>{const f=fixture();await assert.rejects(exerciseRollingPreferences({...f.options,deadlineAt:Date.now()-1}));assert.equal(f.actions.length,0);});

for(const fault of [null,'partial-published','anchor-change','backward','changed-snapshot','extra-send','unfinished','orphaned'])test('bounded physical cursor '+(fault??'accepts repeated block progress'),async()=>{
 const f=fixture(),r=await exerciseRollingPreferences(f.options);f.reset();let calls=0;
 const readPreferences=async()=>{
  const ordinary=await f.options.readPreferences();calls++;
  const progress={nextBlock:calls<3?1:14,anchorBlock:13,processedRevision:'3',markersChecked:0,markersTotal:calls<3?null:0};
  let value=calls<3?{status:'recovering',complete:false,progress}:{...ordinary,anchor:{blockNumber:13,blockHash:'0x'+'1'.padStart(64,'0')},progress};
  if(fault==='partial-published'&&calls===1)value.preferences=ordinary.preferences;
  if(fault==='anchor-change'&&calls===2)progress.anchorBlock=14;
  if(fault==='backward'){if(calls===1)progress.nextBlock=2;}
  if(fault==='changed-snapshot'&&calls===3)value.preferences.head.digest='99';
  if(fault==='extra-send'&&calls===2)f.send();
  if(fault==='unfinished'&&calls===3)progress.nextBlock=13;
  if(fault==='orphaned'&&calls===3)value.orphanedReadMarkers=[{}];
  return value;
 };
 if(fault)await assert.rejects(compareRecoveredColdRollingPreferences(r.checkpoint,{readPreferences,activity:f.options.activity}),/acceptance failed/);
 else{const result=await compareRecoveredColdRollingPreferences(r.checkpoint,{readPreferences,activity:f.options.activity});assert.equal(result.steps,3);assert.equal(result.exactPrivateStateRecovered,true);assert.equal(result.newProofJobs,0);}
});

import {createRollingColdReorgSnapshots,COLD_REORG_BUDGET} from './rolling-preference-recovery.mjs';
const canonicalHash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
// Labelled parent/transport capabilities only. These verify assertion behavior;
// the future genuine parent supplies production reader, node and proof counters.
function coldReorgFixture(fault,initial=false){
 const observation={},counts={requests:0,accepted:0,failures:0,pending:0,privateTags:0,publicTags:0};
 const activity={proofJobs:2,walletSubmissions:2,transportSends:2,authWitnesses:5};
 const phases=['retained','orphaned','restored','replacement-height','replacement'];
 const ends=[4,6,3,6,7],revisions=initial?['0','1','0','0','1']:['1','2','1','1','2'];let phase=0,queue=[],calls=0;
 const state={hold:null,entered:null,oracleCalls:0};
 function prepare(){
  const first=phase===0||phase===2?1:ends[phase-1]+1,startRevision=phase===0||phase===2?'0':revisions[phase-1],end=ends[phase];
  const progress=(nextBlock,revision)=>({anchorBlock:end,nextBlock,processedRevision:revision,markersChecked:0,markersTotal:null});
  queue=[{value:{status:'recovering',complete:false,progress:progress(first,startRevision)},requests:phase!==0&&phase!==2&&revisions[phase-1]!=='0'?1:0}];
  if(fault==='dense'&&phase===0)queue.push({value:{status:'recovering',complete:false,progress:progress(first,startRevision)},requests:1});
  for(let block=first;block<=end;block++)queue.push({value:{status:'recovering',complete:false,progress:progress(block+1,block===end?revisions[phase]:startRevision)},requests:1});
  const preferences={head:{initialized:revisions[phase]!=='0',schema:1,revision:revisions[phase],digest:revisions[phase]==='0'?'0':String(101+phase)},bookmarks:['PRIVATE_SENTINEL'],readMarkers:[]};
  queue.push({value:{status:'complete',complete:true,anchor:{blockNumber:end,blockHash:canonicalHash(end)},progress:{...progress(end+1,revisions[phase]),markersTotal:0},preferences,orphanedReadMarkers:[]},requests:0});
 }
 prepare();
 const readPreferences=async()=>{
  calls++;if(state.hold){state.entered?.();await state.hold;}
  const entry=queue.shift();assert(entry,'No fabricated endless fixture');counts.requests+=entry.requests;counts.accepted+=entry.requests;
  const value=structuredClone(entry.value);
  if(fault==='public-tag')counts.publicTags++;if(fault==='private-tag')counts.privateTags++;
  if(fault==='extra-auth')activity.authWitnesses++;if(fault==='extra-proof')activity.proofJobs++;
  if(fault==='extra-send')activity.transportSends++;if(fault==='wallet-submit')activity.walletSubmissions++;
  if(fault==='unaccepted-page'&&entry.requests)counts.accepted--;
  if(fault==='pending')counts.pending=1;
  if(fault==='partial-publication'&&!value.complete)value.preferences={secret:'PRIVATE_SENTINEL'};
  if(fault==='stalled'&&calls===2){value.progress.nextBlock=1;counts.requests--;counts.accepted--;}
  if(fault==='wrong-append-first'&&phase===1&&queue.length===3)value.progress.nextBlock=1;
  if(fault==='old-anchor'&&phase===1)value.progress.anchorBlock=4;
  if(fault==='orphan-marker'&&value.complete)value.orphanedReadMarkers=[{secret:'PRIVATE_SENTINEL'}];
  if(fault==='wrong-head'&&value.complete)value.preferences.head.revision='99';
  if(fault==='callback-error')throw Error('PRIVATE_SENTINEL');return value;
 };
 const consumer=createRollingColdReorgSnapshots({readPreferences,activity:()=>({...activity}),transport:()=>({...counts}),observation,persist:async()=>{},physicalPages:async({fromBlock,anchor})=>{state.oracleCalls++;assert.equal(anchor.blockNumber,ends[phase]);return anchor.blockNumber-fromBlock+1+(fault==='wrong-physical-count'||fault==='dense'&&phase===0?1:0);}});
 return {observation,counts,state,consumer,async run(){const result=await consumer.read(phases[phase],Date.now()+10000);phase++;if(phase<5)prepare();return result;}};
}
test('labelled real-parent contract requires initial, monotonic, divergent rebuild and replacement without additional transactions',async()=>{
 const f=coldReorgFixture();for(let i=0;i<5;i++)assert.equal((await f.run()).bookmarks[0],'PRIVATE_SENTINEL');
 assert.equal(f.state.oracleCalls,5);assert.deepEqual(f.observation.phases.map(x=>x.mode),['initial','append','rebuild','append','append']);
 assert.deepEqual(f.observation.phases.map(x=>x.formerHeadPages),[0,1,0,1,1]);
 assert.deepEqual(f.observation.phases.map(x=>x.first.nextBlock),[1,5,1,4,7]);
 assert(f.observation.phases.every(x=>x.passed&&x.noReadProofOrSend&&x.noTagDiscovery));
 assert(!JSON.stringify(f.observation).includes('PRIVATE_SENTINEL'));assert(!JSON.stringify(f.observation).includes('digest'));
 assert.deepEqual(COLD_REORG_BUDGET,{fullReadMs:45000,suffixReadMs:15000,forkReserveMs:150000});
});
for(const fault of ['public-tag','private-tag','extra-auth','extra-proof','extra-send','wallet-submit','unaccepted-page','pending','partial-publication','stalled','orphan-marker','wrong-head','wrong-physical-count','callback-error'])test('labelled cold reorg rejects '+fault+' and retains safe failure progress',async()=>{
 const f=coldReorgFixture(fault);await assert.rejects(f.run(),e=>e.message==='Rolling preference recovery acceptance failed.'&&!e.actual&&!e.expected);
 assert.equal(f.observation.phases[0].passed,false);assert(!JSON.stringify(f.observation).includes('PRIVATE_SENTINEL'));
 await assert.rejects(f.run(),/acceptance failed/); // No hidden retry of failed phase.
});
for(const fault of ['wrong-append-first','old-anchor'])test('labelled cold reorg does not count full prefix replay as an authenticated extension: '+fault,async()=>{
 const f=coldReorgFixture(fault);await f.run();await assert.rejects(f.run(),/acceptance failed/);assert.equal(f.observation.phases[1].passed,false);
});
test('labelled cold reorg busy rejection cannot release an in-flight read',async()=>{
 const f=coldReorgFixture();let release,entered;const started=new Promise(r=>entered=r);f.state.hold=new Promise(r=>release=r);f.state.entered=entered;
 const first=f.run();await started;await assert.rejects(f.consumer.read('orphaned',Date.now()+10000));await assert.rejects(f.consumer.read('retained',Date.now()+10000));
 f.state.hold=null;release();await first;assert.equal(f.observation.phases.length,1);assert(f.observation.phases[0].passed);
});
test('labelled cold reorg expired admission performs no reader operation',async()=>{const f=coldReorgFixture();await assert.rejects(f.consumer.read('retained',Date.now()-1));assert.equal(f.observation.phases.length,0);});

test('labelled initial-head case promotes an absent head without inventing a former envelope',async()=>{
 const f=coldReorgFixture(undefined,true);for(let i=0;i<5;i++)await f.run();assert.deepEqual(f.observation.phases.map(x=>x.formerHeadPages),[0,0,0,0,0]);
});

test('labelled dense unrelated ciphertext page is real progress even when public nextBlock repeats',async()=>{const f=coldReorgFixture('dense');await f.run();assert.equal(f.observation.phases[0].compact.accepted,5);assert.equal(f.observation.phases[0].physicalSuffixPages,5);});
