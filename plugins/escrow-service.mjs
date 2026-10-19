import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {privateBokMetering} from './private-bok-metering.mjs';
import {packText} from './protocol.mjs';
import {validateVeniceBilling} from './venice-metered.mjs';

/** Trusted local operator capability; not an HTTP action. The service must be
 * stopped and its original exclusive lease held throughout this one-shot call. */
export async function reconcileHostedBilling({receipt,escrow,store,lease,limits}){
 await lease.assertHeld();
 const original=store.read(),saved=original.hostedPrivateBok,journal=original.privateBok;
 assert(saved&&['running','accounting-recovery','accounted-without-reply'].includes(saved.phase),'No unresolved hosted billing');
 assert.deepEqual(receipt.binding,saved.binding,'Original hosted binding changed');
 const identity={network:saved.binding.network,escrow:saved.binding.escrow,requestId:saved.binding.requestId,target:saved.binding.target};
 assert.deepEqual(journal?.identity,identity,'Original metering identity changed');
 assert.equal(receipt.schemaVersion,1);assert(Number.isSafeInteger(receipt.callId)&&receipt.callId>=0&&receipt.callId<64);
 assert(typeof receipt.inputDigest==='string'&&/^[0-9a-f]{64}$/.test(receipt.inputDigest));assert(typeof receipt.evidenceSha256==='string'&&/^[0-9a-f]{64}$/.test(receipt.evidenceSha256));
 const call=journal.calls?.[receipt.callId];assert(call&&call.inputDigest===receipt.inputDigest,'Original provider input changed');
 assert(['possibly-sent','fenced','received','settled'].includes(call.phase),'No unknown provider call');
 const q=call.quote;assert(q,'Original quote missing');
 const billing=validateVeniceBilling(receipt.billing,{...q,inputPrice:BigInt(q.inputPrice),outputPrice:BigInt(q.outputPrice),cachePrice:q.cachePrice===null?null:BigInt(q.cachePrice),maximum:BigInt(q.maximum)});
 if(call.billing)assert.deepEqual(call.billing,billing,'Original provider billing changed');
 assert(!Object.values(journal.calls).some(other=>other.id!==receipt.callId&&other.billing?.providerId===billing.providerId),'Provider response already accounted');
 const recovery={callId:receipt.callId,inputDigest:receipt.inputDigest,evidenceSha256:receipt.evidenceSha256,billing};
 if(saved.billingRecovery)assert.deepEqual(saved.billingRecovery,recovery,'Original billing recovery changed');
 const checkedStore={read:()=>store.read(),write:async value=>{await lease.assertHeld();await store.write(value);}};
 const deny=async()=>{throw Error('Provider calls forbidden during billing recovery');};
 const metering=privateBokMetering({provider:{quote:deny,execute:deny},escrow,store:checkedStore,identity,limits});
 await metering.validateReconciliation(receipt.callId,billing);
 // Retain the original evidence before any chain action. The metering journal
 // independently persists exact reconciliation intents before their sole sends.
 if(!saved.billingRecovery)await checkedStore.write({...original,hostedPrivateBok:{...saved,phase:'accounting-recovery',billingRecovery:recovery}});
 const result=await metering.reconcile(receipt.callId,billing);assert.equal(result.replyAvailable,false);
 await lease.assertHeld();await metering.finish();await lease.assertHeld();
 await checkedStore.write({...store.read(),hostedPrivateBok:{...store.read().hostedPrivateBok,phase:'accounted-without-reply'}});
 return {status:'accounted-without-reply',replyAvailable:false,billingReceipt:billing.receipt,charge:billing.charge};
}
/** A terminal failure may release its thread only after authenticating the
 * original billing journal against a fresh canonical request. This capability
 * cannot call the provider, write a journal or submit a chain operation. */
export async function isHostedTerminalWithoutReply({request,escrow,store,anchor}){
 const original=store.read(),saved=original.hostedPrivateBok,journal=original.privateBok;
 if(saved?.phase!=='accounted-without-reply')return false;
 const identity={...escrow.identity,requestId:request.requestId,target:request.target};
 assert.deepEqual(saved.binding,{...identity,postId:request.postId,pluginId:request.pluginId},'Terminal hosted binding changed');
 assert.deepEqual(journal?.identity,identity,'Terminal metering identity changed');
 assert.equal(journal.finished,true,'Terminal accounting not finished');
 const calls=Object.values(journal.calls);assert(calls.length>0&&calls.every(c=>c.phase==='settled'),'Terminal billing incomplete');
 const deny=async()=>{throw Error('Terminal admission is read only');};let observation;
 const readOnlyEscrow={identity:escrow.identity,request:async id=>{assert.equal(observation,undefined);observation=await escrow.request(id);return observation;}};
 for(const method of ['assertUsable','inspectOperation','reserve','settle','close_uncertain','reconcile','finish'])readOnlyEscrow[method]=deny;
 const metering=privateBokMetering({provider:{quote:deny,execute:deny},escrow:readOnlyEscrow,store:{read:()=>original,write:deny},identity,limits:journal.limits});
 const last=calls.at(-1);await metering.validateReconciliation(last.id,last.billing);
 assert.equal(observation.anchor?.number,anchor?.number,'Terminal checkpoint changed');assert.equal(observation.anchor?.hash,anchor?.hash,'Terminal checkpoint changed');
 assert(anchor&&Number.isSafeInteger(anchor.number)&&typeof anchor.hash==='string','Terminal checkpoint required');
 assert.equal(observation.request.state,4,'Terminal request not canonical finished');
 assert.equal(BigInt(observation.request.available),0n);assert.equal(BigInt(observation.request.reserved),0n);
 assert.deepEqual(store.read(),original,'Terminal journal changed during admission');return true;
}
/** On-chain state owns work. The bounded in-memory queue never resumes paid calls. */
export async function startEscrowService({descriptor,escrow,board,run,host='127.0.0.1',port=8787,onError=console.error,pollMs=2000,concurrency=2,profile='legacy',recoverPending=async()=>[],canDispatch=async()=>true}){
 if(!['legacy','rolling'].includes(profile))throw Error('Invalid service profile');
 if(typeof canDispatch!=='function')throw Error('Invalid dispatch capability');
 if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>16)throw Error('Invalid service concurrency');
 let rollingCursor=null,rollingQueue=[];
 let stopped=false,polling=false,cursor=0,inFlight=Promise.resolve(),pollFailure=null,jobFailure=null,lastSuccess=null;
 const jobs=new Map(),deferred=new Set();
 const failed=(error,source='job')=>{const failure={at:new Date().toISOString(),kind:error.name||'Error'};if(source==='poll')pollFailure=failure;else jobFailure=failure;onError(error);};
 const server=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');
 if(req.method==='GET'&&req.url==='/v1/descriptor')return res.end(JSON.stringify(descriptor));
 if(req.method==='GET'&&req.url==='/health'){const lastFailure=pollFailure??jobFailure;return res.end(JSON.stringify({status:lastFailure?'degraded':jobs.size?'working':'ready',active:jobs.size,lastFailure,lastSuccess}));}res.writeHead(404);res.end();});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 async function visit(index){
  const post=await escrow.at(index),inv=await escrow.invocation(post);
  if(inv.state!==1||jobs.has(post)){deferred.delete(index);return;}
  const account=String(inv.account),sameAccount=[...jobs.values()].filter(job=>job.account===account);
  // Wait for existing collateral to be released. New deposits can fund another job;
  // there is no one-invocation-per-account rule in the service or the contract.
  if(sameAccount.length){
   if(await escrow.available(post)===0n){deferred.add(index);return;}
   for(const job of sameAccount)if((await escrow.invocation(job.post)).reserved===0n){deferred.add(index);return;}
  }
  const request=await board.readRequest(post);
  if(!request||!request.finalized){deferred.add(index);return;}
  if(request.flagged||!request.enabled||request.receiver!==descriptor.scope.receiver){deferred.delete(index);return;}
  deferred.delete(index);
  const job={post,account,promise:null};jobs.set(post,job);
  job.promise=(async()=>{try{await escrow.start(post);await run(post,request.text);jobFailure=null;lastSuccess=new Date().toISOString();}catch(error){deferred.add(index);failed(error);}finally{jobs.delete(post);}})();
 }
 async function poll(){if(stopped||polling)return;polling=true;try{
  if(profile==='rolling'){
   if(jobs.size>=concurrency)return;
   const busyThread=request=>[...jobs.values()].some(job=>job.threadId===request.threadId);
   if(!rollingQueue.length||rollingQueue.every(request=>jobs.has(request.requestId)||busyThread(request))){
    // A blocked thread must not hide new independent work. Keep its earliest
    // waiting request; later rows remain discoverable in the cyclic canonical
    // pending scan. This bounds retained rows by active threads plus one page.
    const deferred=new Map();
    for(const request of rollingQueue)if(!jobs.has(request.requestId)&&!deferred.has(request.threadId))deferred.set(request.threadId,request);
    const page=await board.pending(rollingCursor);assert(Array.isArray(page.requests)&&page.requests.length<=64);
    const recovery=await recoverPending();assert(Array.isArray(recovery)&&recovery.length<=16);
    rollingCursor=page.nextCursor;
    rollingQueue=[...new Map([...deferred.values(),...recovery,...page.requests].map(request=>[request.requestId,request])).values()];
    for(const request of rollingQueue)assert(typeof request.order==='string'&&/^(0|[1-9][0-9]*)$/.test(request.order),'Canonical invocation order required');
    rollingQueue.sort((a,b)=>BigInt(a.order)<BigInt(b.order)?-1:BigInt(a.order)>BigInt(b.order)?1:0);
   }
   for(const request of [...rollingQueue]){
    if(stopped||jobs.size>=concurrency)break;
    assert(typeof request.threadId==='string','Canonical thread identity required');
    if(jobs.has(request.requestId)){rollingQueue=rollingQueue.filter(row=>row.requestId!==request.requestId);continue;}
    if(busyThread(request))continue;
    rollingQueue=rollingQueue.filter(row=>row.requestId!==request.requestId);
    // The trusted durable-state hint skips fenced work before expensive setup.
    // A skip is neither a successful job nor a reason to clear its failure.
    const eligible=await canDispatch(request);assert.equal(typeof eligible,'boolean');if(!eligible)continue;
    // Recheck the indexed canonical predecessor before dispatch, including
    // replied recovery hints and rows retained across a changing publication.
    if((await board.readRequest(request.postId))?.predecessorsClear!==true)continue;
    if(stopped)break;
    const job={post:request.postId,threadId:request.threadId,promise:null};jobs.set(request.requestId,job);
    job.promise=Promise.resolve().then(()=>run(request)).then(()=>{jobFailure=null;lastSuccess=new Date().toISOString();},error=>failed(error)).finally(()=>{
     // Drain this bounded batch and advance the cyclic cursor even when a
     // fenced/no-op request remains pending. Canonical predecessor checks, not
     // a global rewind or an unbounded failed-ID set, preserve thread FIFO.
     jobs.delete(request.requestId);
    });
   }
   pollFailure=null;return;
  }
  // Rotate deferred entries, then scan new entries so one empty account cannot
  // block unrelated users. Bound reads per tick without retaining a billing DB.
  for(const index of [...deferred].slice(0,64)){
   if(stopped||jobs.size>=concurrency)break;
   deferred.delete(index);deferred.add(index);await visit(index);
  }
  const count=await escrow.count();let scanned=0;
  while(cursor<count&&!stopped&&jobs.size<concurrency&&scanned++<64){const index=cursor;deferred.add(index);await visit(index);cursor++;}
  pollFailure=null;
 }catch(error){failed(error,'poll');}finally{polling=false;}}
 const timer=setInterval(()=>{if(!polling)inFlight=poll();},pollMs);inFlight=poll();
 return {address:server.address(),async close(){stopped=true;clearInterval(timer);await inFlight;await Promise.all([...jobs.values()].map(job=>job.promise));await board.close?.();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}};
}


/** Existing request billing owns every paid-call fence. Hosted restart never
 * reruns an agent whose run intent exists; only its exact reply/finish may be
 * reconciled, or an exact already-accepted source revision recovered after all
 * billing settles. Ports are dependency seams, not client-supplied authority. */
/** Only the original first quote with a durable pre-broadcast reserve may be
 * resumed. No provider-entered, signed, or already attempted recovery qualifies. */
export function hostedUnsubmittedFirstCall(original){
 const h=original.hostedPrivateBok,j=original.privateBok,e=original.privateBokEscrow;
 if(h?.phase!=='running'||Object.hasOwn(h,'preProviderRecoveryAttempted')||!j||j.finished||!e)return false;
 const calls=Object.values(j.calls??{}),ops=Object.entries(j.operations??{});
 if(calls.length!==1||calls[0].id!==0||calls[0].phase!=='quoted'||calls[0].billing||ops.length!==1||Object.keys(e.operations??{}).length!==1)return false;
 const [id,op]=ops[0],record=e.operations[id],call=calls[0],b=h.binding;
 if(!b||!record||op.method!=='reserve'||record.method!=='reserve'||record.phase!=='preparing'||['recoveryAttempted','txHash','transactionSha256','submissionError'].some(key=>Object.hasOwn(record,key)))return false;
 const identity={network:b.network,escrow:b.escrow,requestId:b.requestId,target:b.target};
 if(!j.identity||Object.keys(j.identity).length!==4||Object.entries(identity).some(([k,v])=>j.identity[k]!==v))return false;
 if(Object.entries(identity).some(([k,v])=>e.binding?.[k]!==v))return false;
 const args=[b.requestId,0,String(call.quote?.maximum)],hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 if(!/^[0-9a-f]{64}$/.test(call.inputDigest??'')||!/^\d+$/.test(args[2])||BigInt(args[2])<=0n)return false;
 return record.argsDigest===hash(args)&&op.argsDigest===record.argsDigest&&JSON.stringify(record.args)===JSON.stringify(args)&&id===hash({identity,method:'reserve',key:0,argsDigest:record.argsDigest});
}

export async function runPrivateBokRequest({request,board,escrow,store,provider,runAgent,recoverAccepted,limits,conversation,admitThread}){
 const identity={...escrow.identity,requestId:request.requestId,target:request.target};
 const binding={...identity,postId:request.postId,pluginId:request.pluginId};
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const save=async value=>store.write({...store.read(),hostedPrivateBok:value});
 let saved=store.read().hostedPrivateBok;
 if(saved)assert.deepEqual(saved.binding,binding,'Hosted request identity changed');
 const current=await board.readRequest(request.postId);
 assert(current&&current.postId===request.postId&&current.requestId===request.requestId&&current.target===request.target&&current.pluginId===request.pluginId&&current.predecessorsClear===true,'Canonical invocation changed');
 let historyGuard,admittedHistory;
 const requestConversation=conversation?Object.freeze({async load(input){
  assert(!historyGuard,'Conversation already captured');assert.equal(input.postId,request.postId);
  const history=admittedHistory??await conversation.load(input);assert.equal(typeof history?.assertCurrent,'function');
  historyGuard=history.assertCurrent;return history;
 }}):undefined;
 const guardedProvider={quote:(...args)=>provider.quote(...args),execute:async(...args)=>{
  const final=await board.readRequest(request.postId);
  assert(final?.usable&&!final.replied&&final.requestId===request.requestId&&final.target===request.target&&final.pluginId===request.pluginId,'Invocation changed before provider execution');
  if(conversation){assert(historyGuard,'Conversation must be captured before billing');await historyGuard();}
  return provider.execute(...args);
 }};
 const metering=privateBokMetering({provider:guardedProvider,escrow,store,identity,limits});
 if(saved?.phase==='finished')return {status:'finished',replayed:false};
 if(saved?.phase==='accounted-without-reply')return {status:'accounted-without-reply',replayed:false};
 let result;const resumeUnsubmitted=hostedUnsubmittedFirstCall(store.read());
 if(saved?.phase==='running'&&!resumeUnsubmitted&&typeof recoverAccepted==='function'){
  assert(current.usable&&!current.replied,'Invocation no longer usable');
  const journal=structuredClone(store.read().privateBok),calls=Object.values(journal?.calls??{});
  assert(journal&&!journal.finished&&calls.length>0&&calls.every(call=>call.phase==='settled'),'Hosted request unresolved; provider billing must be settled');
  const last=calls.at(-1);await metering.validateReconciliation(last.id,last.billing);
  const row=await escrow.request(request.requestId);assert(row.canonical&&row.request.state===2&&row.request.reserved===0n,'Active settled request required');
  // A saved phase alone is not canonical settlement evidence. Existing intents
  // may be inspected here, but recovery never invokes any billing mutator.
  assert(Object.keys(journal.operations).length>0,'Canonical billing operations required');
  for(const call of calls){
   const argsDigest=digest([request.requestId,call.id,String(call.billing.charge),call.billing.receipt]);
   assert(Object.values(journal.operations).some(operation=>operation.method==='settle'&&operation.argsDigest===argsDigest),'Original settlement intent missing');
  }
  for(const [operationId,operation] of Object.entries(journal.operations)){
   assert(['reserve','settle'].includes(operation.method),'Unresolved billing recovery');
   const observed=await escrow.inspectOperation(operationId);
   assert(observed.status==='succeeded'&&observed.canonical&&observed.method===operation.method&&observed.argsDigest===operation.argsDigest,'Canonical billing operation unresolved');
  }
  result=await recoverAccepted(current);
  assert.deepEqual(store.read().privateBok,journal,'Billing changed during accepted recovery');
  assert.deepEqual(store.read().hostedPrivateBok,saved,'Hosted recovery changed');
 }else if(saved&&!resumeUnsubmitted&&!['reply-intent','reply-confirmed'].includes(saved.phase))throw Error('Hosted request unresolved; reconcile original journal without another paid call');
 if(!saved||resumeUnsubmitted){
  assert(!current.replied&&current.usable,'Invocation no longer usable');
  const row=await escrow.request(request.requestId);assert(row.canonical&&row.request.state===2&&row.request.reserved===0n,'Active canonical request required');
  if(!resumeUnsubmitted&&admitThread!==undefined){
   assert(typeof admitThread==='function'&&typeof conversation?.load==='function','Trusted thread admission unavailable');
   const history=await conversation.load({postId:request.postId});
   assert(history?.canonical===true&&history.complete===true&&/^0x[0-9a-f]{64}$/.test(history.threadId)&&typeof history.assertCurrent==='function','Canonical thread admission unavailable');
   await history.assertCurrent();
   // A finite pool can be replenished before entering an agent. Do not record
   // running until this trusted preflight succeeds; saved runs never replay it.
   await admitThread({threadId:history.threadId,invocationId:request.requestId});
   await history.assertCurrent();const fresh=await board.readRequest(request.postId);
   assert(fresh?.postId===request.postId&&fresh.usable&&!fresh.replied&&fresh.predecessorsClear===true&&fresh.requestId===request.requestId&&fresh.target===request.target&&fresh.pluginId===request.pluginId,'Invocation changed during thread admission');
   admittedHistory=history;
  }
  saved=resumeUnsubmitted?{...saved,preProviderRecoveryAttempted:true}:{binding,phase:'running'};await save(saved);
  let call=0;
  result=await runAgent({conversation:requestConversation,text:current.text,id:request.requestId,postId:request.postId,model:{complete:async input=>{
   const fresh=await board.readRequest(request.postId);assert(fresh?.usable&&!fresh.replied&&fresh.target===request.target,'Invocation changed before paid call');
   const response=await metering.complete(call++,input);assert(response.replyAvailable,'Recovered billing has no recoverable reply');return response;
  }}});
 }
 if(result){
  const fresh=await board.readRequest(request.postId);assert(fresh?.usable&&!fresh.replied&&fresh.target===request.target&&fresh.requestId===request.requestId&&fresh.pluginId===request.pluginId&&fresh.threadId===current.threadId&&fresh.predecessorsClear===true,'Invocation changed before reply');
  const packed=packText(result.replyText),args=[request.requestId,request.pluginId,packed.fields,packed.length,fresh.mainVersion,fresh.localVersion];
  const argsDigest=digest(args),operationId=digest({binding,method:'publish_reply',argsDigest});
  saved={binding,phase:'reply-intent',args,operation:{operationId,argsDigest},...(result.recoveredRevision?{recoveredRevision:result.recoveredRevision}:{})};await save(saved);
  // Intent is durable before invoking the chain port; absence on restart is NOT
  // permission to invoke it again (a crash may have crossed the call boundary).
  try{await escrow.publish_reply(...args,saved.operation);}catch{/* Reconcile exact original operation below. */}
 }
 if(['reply-intent','reply-confirmed'].includes(saved.phase)){
  const observed=await escrow.inspectOperation(saved.operation.operationId);
  assert(observed.status==='succeeded'&&observed.canonical&&observed.method==='publish_reply'&&observed.argsDigest===saved.operation.argsDigest,'Reply transaction unresolved');
  const published=await board.readRequest(request.postId);assert(published?.replied&&published.target===request.target,'Authenticated Rolling reply unavailable');
  saved={...saved,phase:'reply-confirmed'};await save(saved);
 }
 await metering.finish();await save({...saved,phase:'finished'});
 return {status:'finished',replayed:false};
}
