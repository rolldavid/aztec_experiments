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
// The bounded cursor can consume a full physical page without an event for
// this owner. nextBlock may therefore repeat; a deadline still bounds the run.
async function completeCold(read,deadlineAt){
 const started=Date.now();let steps=0,last,anchorBlock;
 for(;;){
  check(Date.now()<deadlineAt);const value=await read({deadlineAt});steps++;
  check(value&&typeof value.complete==='boolean'&&value.progress);
  const p=value.progress;
  check(Number.isSafeInteger(p.anchorBlock)&&p.anchorBlock>=1&&Number.isSafeInteger(p.nextBlock)&&p.nextBlock>=1&&p.nextBlock<=p.anchorBlock+1);
  check(Number.isSafeInteger(p.markersChecked)&&p.markersChecked>=0&&typeof p.processedRevision==='string'&&/^(0|[1-9][0-9]*)$/.test(p.processedRevision));
  if(anchorBlock===undefined)anchorBlock=p.anchorBlock;check(p.anchorBlock===anchorBlock);
  if(last)check(p.nextBlock>=last.nextBlock&&p.markersChecked>=last.markersChecked&&BigInt(p.processedRevision)>=BigInt(last.processedRevision));
  if(value.complete){
   check(value.status==='complete'&&value.preferences&&value.orphanedReadMarkers?.length===0&&value.anchor?.blockNumber===anchorBlock&&p.nextBlock===anchorBlock+1);
   check(/^0x[0-9a-f]{64}$/.test(value.anchor?.blockHash)&&p.markersTotal===p.markersChecked);
   return {value,measurement:{steps,elapsedMs:Date.now()-started,nextBlock:p.nextBlock,anchorBlock,markersChecked:p.markersChecked}};
  }
  check(value.status==='recovering'&&!Object.hasOwn(value,'preferences'));last={...p};
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
// Browser-specific ordering: Main following needs fees but no posting deposit.
// The parent callback still authenticates deposit eligibility, the real root and
// its canonical fee/effect before returning. No new financial lifecycle here.
export async function exerciseRollingBrowserPreferences({publishRoot,action,readPreferences,activity,deadlineAt}) {
 try {
  check([publishRoot,action,readPreferences,activity].every(fn=>typeof fn==='function'));
  check(Number.isSafeInteger(deadlineAt)&&deadlineAt>Date.now());
  async function mutate(kind,target,revision) {
   check(Date.now()<deadlineAt);const before=counters(activity);
   const events=await action({type:'preference',kind,target,enabled:true,expectedRevision:String(revision)},'preference-'+(revision+1));
   check(Array.isArray(events)&&events.length===0);
   const after=counters(activity);for(const key of Object.keys(before))check(after[key]===before[key]+1);
  }
  await mutate(2,'0',0);
  const beforeRead=counters(activity),initial=await complete(readPreferences,deadlineAt);
  const p=initial.value.preferences;
  check(p.head.initialized&&p.head.schema===1&&p.head.revision==='1');
  check(equal(p.bookmarks,[])&&equal(p.followedNames,[])&&equal(p.followedBoards,['0'])&&equal(p.subscriptions,[])&&p.replyNotifications===true&&equal(p.readMarkers,[]));
  check(equal(counters(activity),beforeRead));
  check(Number.isSafeInteger(initial.value.anchor?.blockNumber)&&initial.value.anchor.blockNumber>0);
  check(Date.now()<deadlineAt);const beforeRoot=counters(activity),rootEvent=await publishRoot();
  const afterRoot=counters(activity);for(const key of Object.keys(beforeRoot))check(afterRoot[key]===beforeRoot[key]+1);
  check(rootEvent?.type==='PostPublished'&&field(rootEvent.payload?.id));
  const root=rootEvent.payload.id,record=rootEvent.payload.record,position=rootEvent.position;
  check(record&&record.root===root&&record.parent==='0'&&record.reference==='0'&&record.name_id==='0'&&record.subboard==='0'&&record.kind==='1');
  const rootBlock=Number(position?.blockNumber),rootHash=position?.blockHash;
  check(Number.isSafeInteger(rootBlock)&&rootBlock>initial.value.anchor.blockNumber&&/^0x[0-9a-f]{64}$/.test(rootHash));
  await mutate(1,root,1);
  const afterMutation=counters(activity),incremental=await complete(readPreferences,deadlineAt);
  verify(incremental.value.preferences,{mode:'browser-relationships',root,rootBlock,rootHash,revision:2,final:true});
  check(equal(counters(activity),afterMutation));
  check(incremental.value.anchor.blockNumber>rootBlock);
  check(equal(initial.value.preferences.scope,incremental.value.preferences.scope));
  check(Date.now()<deadlineAt);
  const checkpoint=Object.freeze(Object.defineProperty({},'toJSON',{value:()=>{throw fail();}}));
  states.set(checkpoint,{snapshot:JSON.stringify(incremental.value.preferences),activity:afterMutation,deadlineAt});
  return {checkpoint,observation:{passed:true,sequence:'follow-root-bookmark',preferenceTransactions:2,publicPreferenceEvents:0,
   initial:initial.measurement,incremental:incremental.measurement,authenticatedHeadMatched:true,noReadProofOrSend:true}};
 }catch{throw fail();}
}
async function compareRecovered(checkpoint,{readPreferences,activity},completeRead){
 const state=states.get(checkpoint);states.delete(checkpoint);
 try{
  check(state);const before=counters(activity);
  check(before.proofJobs===state.activity.proofJobs&&before.transportSends===state.activity.transportSends&&before.walletSubmissions===0);
  const recovered=await completeRead(readPreferences,state.deadlineAt);
  check(JSON.stringify(recovered.value.preferences)===state.snapshot);
  const after=counters(activity);check(equal(before,after));
  return {passed:true,...recovered.measurement,exactPrivateStateRecovered:true,newProofJobs:0,newTransportSends:0,newWalletSubmissions:0};
 }catch{throw fail();}
}

export const compareRecoveredRollingPreferences=(checkpoint,capabilities)=>compareRecovered(checkpoint,capabilities,complete);
export const compareRecoveredColdRollingPreferences=(checkpoint,capabilities)=>compareRecovered(checkpoint,capabilities,completeCold);

// Genuine parent acceptance seam, not a replacement reader. All authority is
// still the production cold reader's canonical SDK mailbox/root/AEAD checks.
// Private heads/choices stay in this closure and the caller's RAM assertions.
// The parent supplies an independent count from actual canonical block effects.
export const COLD_REORG_BUDGET = Object.freeze({fullReadMs:45000,suffixReadMs:15000,forkReserveMs:150000});
export function createRollingColdReorgSnapshots({readPreferences,activity,transport,physicalPages,persist,observation,bootstrap=false}) {
 check(typeof bootstrap==='boolean');
 const phases=[...(bootstrap?['bootstrap']:[]),'retained','orphaned','restored','replacement-height','replacement'];
 let next=0,previous,busy=false,failed=false;
 const integer=x=>Number.isSafeInteger(x)&&x>=0;
 function traffic(){
  const x=transport(),keys=['requests','accepted','failures','pending','privateTags','publicTags'];
  check(x&&keys.every(k=>integer(x[k])));return Object.fromEntries(keys.map(k=>[k,x[k]]));
 }
 function active(){const x=activity(),keys=['proofJobs','transportSends','walletSubmissions','authWitnesses'];check(x&&keys.every(k=>integer(x[k])));return Object.fromEntries(keys.map(k=>[k,x[k]]));}
 function delta(after,before){const out={};for(const key of Object.keys(before)){check(after[key]>=before[key]);out[key]=after[key]-before[key];}return out;}
 check([readPreferences,activity,transport,physicalPages,persist].every(x=>typeof x==='function'));
 check(observation&&Object.keys(observation).length===0);observation.phases=[];
 return Object.freeze({async read(phase,deadlineAt,{signal}={}){
  if(busy)throw fail();
  let row,started;
  try{
   check(!failed&&phase===phases[next]&&Number.isSafeInteger(deadlineAt)&&deadlineAt>Date.now());
   busy=true;next++; // A failed measurement is not silently replayable.
   const mode=phase==='bootstrap'||phase==='retained'&&!bootstrap?'initial':phase==='restored'?'rebuild':'append';
   check(mode==='initial'||previous);
   started=Date.now();const beforeActivity=active(),beforeTraffic=traffic();
   check(beforeTraffic.pending===0);
   row={phase,mode,passed:false,steps:0,elapsedMs:0,first:null,last:null,compact:null};observation.phases.push(row);await persist();
   let prior,anchorBlock,lastTraffic=beforeTraffic,value;
   for(;;){
    check(Date.now()<deadlineAt&&!signal?.aborted);
    value=await readPreferences({deadlineAt,...(signal?{signal}:{})});check(!signal?.aborted);row.steps++;
    check(equal(active(),beforeActivity));const now=traffic(),change=delta(now,lastTraffic);lastTraffic=now;
    check(now.pending===0&&change.failures===0&&change.privateTags===0&&change.publicTags===0);
    check(change.requests===change.accepted&&change.accepted<=1);
    check(value&&typeof value.complete==='boolean');const p=value.progress;
    check(p&&integer(p.anchorBlock)&&p.anchorBlock>0&&integer(p.nextBlock)&&p.nextBlock>0&&p.nextBlock<=p.anchorBlock+1);
    check(integer(p.markersChecked)&&typeof p.processedRevision==='string'&&/^(0|[1-9][0-9]*)$/.test(p.processedRevision));
    if(anchorBlock===undefined)anchorBlock=p.anchorBlock;check(anchorBlock===p.anchorBlock);
    const position={nextBlock:p.nextBlock,anchorBlock,markersChecked:p.markersChecked};row.first??={...position};row.last=position;
    if(row.steps===1){
     check(!value.complete&&!Object.hasOwn(value,'preferences'));
     if(mode==='append'){
      check(anchorBlock>previous.anchor.blockNumber&&p.nextBlock===previous.anchor.blockNumber+1);
      check(p.processedRevision===previous.head.revision&&change.accepted===(previous.head.initialized?1:0));
     }else{check(p.nextBlock===1&&p.processedRevision==='0'&&change.accepted===0);if(mode==='rebuild')check(anchorBlock<previous.anchor.blockNumber);}
    }else{
     check(p.nextBlock>=prior.nextBlock&&p.markersChecked>=prior.markersChecked&&BigInt(p.processedRevision)>=BigInt(prior.processedRevision));
     // Dense unrelated ciphertexts can leave public nextBlock unchanged. They
     // must still consume one real accepted compact page, never a busy loop.
     if(!value.complete)check(p.nextBlock>prior.nextBlock||p.markersChecked>prior.markersChecked||change.accepted===1);
    }
    row.elapsedMs=Date.now()-started;row.compact=delta(now,beforeTraffic);await persist();
    if(value.complete)break;
    check(value.status==='recovering'&&!Object.hasOwn(value,'preferences'));prior={...p};
   }
   check(value.status==='complete'&&value.preferences&&value.orphanedReadMarkers?.length===0);
   check(value.anchor?.blockNumber===anchorBlock&&/^0x[0-9a-f]{64}$/.test(value.anchor.blockHash));
   check(value.progress.nextBlock===anchorBlock+1&&integer(value.progress.markersTotal)&&value.progress.markersTotal===value.progress.markersChecked);
   check(value.preferences.head?.revision===value.progress.processedRevision);
   const fromBlock=mode==='append'?previous.anchor.blockNumber+1:1;
   const pages=await physicalPages({fromBlock,anchor:{...value.anchor},deadlineAt});check(integer(pages)&&pages>=anchorBlock-fromBlock+1);
   const expected=pages+(mode==='append'&&previous.head.initialized?1:0),after=traffic();
   row.compact=delta(after,beforeTraffic);
   check(after.pending===0&&row.compact.requests===expected&&row.compact.accepted===expected&&row.compact.failures===0&&row.compact.privateTags===0&&row.compact.publicTags===0);
   check(equal(active(),beforeActivity));check(Date.now()<deadlineAt&&!signal?.aborted);
   row.elapsedMs=Date.now()-started;row.physicalSuffixPages=pages;row.formerHeadPages=expected-pages;row.noReadProofOrSend=true;row.noTagDiscovery=true;
   row.authenticatedPrefixRetained=mode==='append';row.fullEnumeration=mode!=='append';row.passed=true;
   previous={anchor:structuredClone(value.anchor),head:structuredClone(value.preferences.head)};
   await persist();return structuredClone(value.preferences);
  }catch{failed=true;if(row){row.passed=false;row.elapsedMs=Date.now()-started;try{row.lastTransport=traffic();await persist();}catch{}}throw fail();}
  finally{busy=false;}
 }});
}

// One root proof may overlap a separate actor's bootstrap scan. Waiting occurs
// only at the engine's existing pre-HTTP hook. The HTTP admission fence never
// waits. Parent owns actors, proof service, deadlines, and real fee collection.
export function createRollingRootProofOverlap({stats,contextGuard,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 check([stats,contextGuard,now,sleep].every(fn=>typeof fn==='function'));
 let state='idle',operation,signed,selected=false,hookEntered=false,forwarded=0,rejected=0,poisoned=false;
 let readyResolve,readyReject,ready,controller,expires=0,baseline,scanPending=false,writePending=false;
 let failureSet=false,failure,startedAt=0,admittedAt=0,scanStartedAt=0,scanElapsedMs=0;
 const snapshot=()=>({state,hookEntered,forwarded,rejected,poisoned,scanPending,writePending,
  proofAdmitted:admittedAt>0,admissionElapsedMs:admittedAt?admittedAt-startedAt:0,scanElapsedMs});
 const poison=(...errors)=>{if(!failureSet){failureSet=true;failure=errors.length?errors[0]:fail();}poisoned=true;controller?.abort();readyReject?.(failure);};
 const live=()=>{check(!poisoned&&now()<expires);contextGuard();};
 const hook=Object.freeze({
  journalPrepared(value){
   live();check(selected&&!signed&&value.operation===operation&&/^0x[0-9a-f]{64}$/.test(value.txHash)&&value.bytes instanceof Uint8Array&&value.bytes.length>0);
   signed={txHash:value.txHash,bytes:Buffer.from(value.bytes)};
  },
  async beforeSubmit(value){
   live();check(!hookEntered&&signed&&value.operation===operation&&value.txHash===signed.txHash);hookEntered=true;
   await ready;live();check(state==='scanned');state='permitted';
  },
 });
 const capability=Object.freeze({select(value){
  try{
   if(state==='done'){check(value!==operation);return undefined;}
   live();check(state==='running'&&!selected&&value===operation);selected=true;return hook;
  }catch(error){poison(error);throw error;}
 }});
 return Object.freeze({capability,snapshot,
  arm(value){try{live();check(state==='running'&&!operation&&typeof value==='string'&&/^ROLLING_WORKFLOW_V1:/.test(value));operation=value;}catch(error){poison(error);throw error;}},
  // Called synchronously with the real request-local liveness capability, before
  // onSend/counters and node.sendTx. A disconnect AFTER that invocation remains
  // an unknown financial outcome; the parent must reconcile actual receipts.
  beforeForward(tx,requestLive){
   try{
    check(typeof requestLive==='function'&&requestLive()===true);contextGuard();
    if(state==='done'){check(!poisoned&&String(tx.getTxHash())!==signed.txHash);return;}
    live();check(state==='permitted'&&forwarded===0);
    check(String(tx.getTxHash())===signed.txHash&&Buffer.from(tx.toBuffer()).equals(signed.bytes));
    state='forwarded';forwarded++;
   }catch(error){rejected++;poison(error);throw error;}
  },
  async run({submit,bootstrap,admissionDeadlineAt,scanDeadline}){
   check(state==='idle'&&typeof submit==='function'&&typeof bootstrap==='function'&&typeof scanDeadline==='function');
   check(Number.isSafeInteger(admissionDeadlineAt)&&admissionDeadlineAt>now());
   state='running';startedAt=now();expires=admissionDeadlineAt;baseline={...stats()};check(baseline.failed===0&&!baseline.running);
   controller=new AbortController();ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
   let write,scan,result,timer;
   try{
    writePending=true;
    write=Promise.resolve().then(submit).then(value=>{writePending=false;return {value};},error=>{writePending=false;poison(error);return {error,failed:true};});
    for(;;){
     live();const current=stats();check(current.failed===baseline.failed&&current.submitted>=baseline.submitted&&current.submitted<=baseline.submitted+1);
     if(current.submitted===baseline.submitted+1){admittedAt=now();break;}
     check(writePending);await sleep(Math.min(25,Math.max(1,expires-now())));
    }
    expires=scanDeadline();check(Number.isSafeInteger(expires)&&expires>now());
    timer=setTimeout(()=>poison(),Math.max(1,expires-now()));
    scanPending=true;scanStartedAt=now();
    scan=Promise.resolve().then(()=>bootstrap({signal:controller.signal,deadlineAt:expires})).then(value=>{scanPending=false;scanElapsedMs=now()-scanStartedAt;return {value};},error=>{scanPending=false;scanElapsedMs=now()-scanStartedAt;poison(error);return {error,failed:true};});
    const recovered=await scan;if(recovered.failed)throw recovered.error;
    live();check(stats().submitted===baseline.submitted+1&&stats().failed===baseline.failed&&forwarded===0);
    clearTimeout(timer);timer=undefined;
    state='scanned';readyResolve();
    result=await write;if(result.failed)throw result.error;
    check(!poisoned&&forwarded===1&&state==='forwarded'&&stats().submitted===baseline.submitted+1&&stats().completed===baseline.completed+1&&stats().failed===baseline.failed);
    state='done';
   }catch(error){poison(error);}
   finally{
    clearTimeout(timer);
    // Never close actors here. Their leases remain held until both original
    // operations actually settle, including non-cancellable SDK/prover work.
    await Promise.allSettled([...(scan?[scan]:[]),...(write?[write]:[])]);
    if(failureSet)state='failed';
   }
   if(failureSet)throw failure;return result.value;
  },
 });
}
