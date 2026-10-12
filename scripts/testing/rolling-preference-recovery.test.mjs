// Labelled capability doubles test the acceptance consumer, never chain recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseRollingPreferences,compareRecoveredRollingPreferences} from './rolling-preference-recovery.mjs';
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
for(const mode of ['relationships','notifications'])test(mode+': exact mutations, incremental read and one-use fresh recovery',async()=>{
 const f=fixture(mode),r=await exerciseRollingPreferences(f.options);
 assert.equal(r.observation.preferenceTransactions,mode==='relationships'?3:4);assert.throws(()=>JSON.stringify(r.checkpoint));
 assert.deepEqual(f.actions.map(a=>a.kind??6),mode==='relationships'?[1,3,2]:[4,5,6,5]);
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
