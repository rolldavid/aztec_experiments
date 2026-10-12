// Test-only assertions over production actor capabilities. The parent owns real
// proofs, chain, keys, receipt accounting, fresh stores and actor replacement.
// Private snapshots stay in this WeakMap, never in reports or assertion errors.
const states=new WeakMap();
const fail=()=>Error('Rolling preference recovery acceptance failed.');
const check=value=>{if(!value)throw fail();};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const field=x=>typeof x==='string'&&/^[1-9][0-9]{0,76}$/.test(x);
function counters(read){const c=read();for(const k of ['proofJobs','transportSends','walletSubmissions'])check(Number.isSafeInteger(c[k])&&c[k]>=0);return Object.fromEntries(['proofJobs','transportSends','walletSubmissions'].map(k=>[k,c[k]]));}
async function complete(read,deadlineAt){
 const started=Date.now();let steps=0,last;
 for(;;){
  check(Date.now()<deadlineAt);const value=await read({deadlineAt});steps++;
  check(value&&typeof value.complete==='boolean'&&value.progress);
  const p=value.progress;check(Number.isSafeInteger(p.scannedThrough)&&p.scannedThrough>=0&&Number.isSafeInteger(p.markersChecked)&&p.markersChecked>=0);
  if(value.complete){check(value.status==='complete'&&value.preferences&&value.orphanedReadMarkers?.length===0);return {value,measurement:{steps,elapsedMs:Date.now()-started,scannedThrough:p.scannedThrough,markersChecked:p.markersChecked}};}
  check(value.status==='recovering'&&!Object.hasOwn(value,'preferences'));
  if(last)check(p.scannedThrough>last.scannedThrough||p.markersChecked>last.markersChecked);
  last={scannedThrough:p.scannedThrough,markersChecked:p.markersChecked};
 }
}
function verify(p,{mode,root,name,rootBlock,rootHash,revision,final}){
 const relationships=mode==='relationships'||mode==='browser-relationships';
 check(p.head.initialized&&p.head.schema===1&&p.head.revision===String(revision));
 check(equal(p.bookmarks,relationships?[root]:[]));
 check(equal(p.followedNames,mode==='relationships'?[name]:[]));
 check(equal(p.followedBoards,relationships&&final?['0']:[]));
 check(equal(p.subscriptions,mode==='notifications'?[root]:[]));
 check(p.replyNotifications===(relationships||final));
 check(equal(p.readMarkers,mode==='notifications'?[{thread:root,throughBlock:rootBlock,blockHash:String(BigInt(rootHash))}]:[]));
}
export async function exerciseRollingPreferences({mode,root,name,rootBlock,rootHash,action,readPreferences,activity,deadlineAt}){
 try{
  check(['relationships','browser-relationships','notifications'].includes(mode)&&field(root)&&Number.isSafeInteger(deadlineAt)&&deadlineAt>Date.now());
  check(mode!=='relationships'||field(name));check(Number.isSafeInteger(rootBlock)&&rootBlock>0&&/^0x[0-9a-f]{64}$/.test(rootHash));
  for(const fn of [action,readPreferences,activity])check(typeof fn==='function');
  let revision=0;
  async function mutate(input){
   const before=counters(activity),events=await action({...input,expectedRevision:String(revision)},'preference-'+(revision+1));
   // Encrypted PreferenceChanged delivery must not become a public board event.
   check(Array.isArray(events)&&events.length===0);const after=counters(activity);
   for(const k of ['proofJobs','transportSends','walletSubmissions'])check(after[k]===before[k]+1);
   revision++;
  }
  if(mode==='relationships'||mode==='browser-relationships'){
   await mutate({type:'preference',kind:1,target:root,enabled:true});
   if(mode==='relationships')await mutate({type:'preference',kind:3,target:name,enabled:true});
  }else{
   await mutate({type:'preference',kind:4,target:root,enabled:true});
   await mutate({type:'preference',kind:5,target:'0',enabled:false});
   await mutate({type:'read-marker',thread:root,throughBlock:String(rootBlock)});
  }
  const expected={mode,root,name,rootBlock,rootHash},beforeRead=counters(activity);
  const initial=await complete(readPreferences,deadlineAt);verify(initial.value.preferences,{...expected,revision,final:false});
  check(equal(counters(activity),beforeRead));
  await mutate(mode!=='notifications'?{type:'preference',kind:2,target:'0',enabled:true}:{type:'preference',kind:5,target:'0',enabled:true});
  const afterMutation=counters(activity),incremental=await complete(readPreferences,deadlineAt);
  verify(incremental.value.preferences,{...expected,revision,final:true});check(equal(counters(activity),afterMutation));
  check(incremental.value.anchor.blockNumber>initial.value.anchor.blockNumber);
  const checkpoint=Object.freeze(Object.defineProperty({},'toJSON',{value:()=>{throw fail();}}));
  states.set(checkpoint,{snapshot:JSON.stringify(incremental.value.preferences),activity:afterMutation,deadlineAt});
  return {checkpoint,observation:{passed:true,preferenceTransactions:revision,publicPreferenceEvents:0,initial:initial.measurement,incremental:incremental.measurement,authenticatedHeadMatched:true,noReadProofOrSend:true}};
 }catch{throw fail();}
}
export async function compareRecoveredRollingPreferences(checkpoint,{readPreferences,activity}){
 const state=states.get(checkpoint);states.delete(checkpoint);
 try{
  check(state);const before=counters(activity);
  check(before.proofJobs===state.activity.proofJobs&&before.transportSends===state.activity.transportSends&&before.walletSubmissions===0);
  const recovered=await complete(readPreferences,state.deadlineAt);
  check(JSON.stringify(recovered.value.preferences)===state.snapshot);
  const after=counters(activity);check(equal(before,after));
  return {passed:true,...recovered.measurement,exactPrivateStateRecovered:true,newProofJobs:0,newTransportSends:0,newWalletSubmissions:0};
 }catch{throw fail();}
}
