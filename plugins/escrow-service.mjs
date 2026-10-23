import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {privateBokMetering,retainedBokResponse} from './private-bok-metering.mjs';
import {hostedBillingContinuation} from './operations.mjs';
import {packText} from './protocol.mjs';
import {validateVeniceBilling} from './venice-metered.mjs';

/** Trusted local operator capability; not an HTTP action. The service must be
 * stopped and its original exclusive lease held throughout this one-shot call. */
export async function reconcileHostedBilling({receipt,escrow,store,lease,limits,claimReceipt}){
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
 const continuation=receipt.continuation===undefined?undefined:hostedBillingContinuation(receipt.continuation);
 if(continuation){
  assert(saved.phase!=='accounted-without-reply','Closed accounting cannot resume a reply');
  assert(!journal.accountingMode,'This continuation binds the original per-call settlement');
  assert(['received','settled'].includes(call.phase)&&call.billing,'Original received provider result required');
  const row=await escrow.request(identity.requestId);assert(row.canonical&&row.request.state===2,'Active original request required for reply continuation');
 }
 const recovery={callId:receipt.callId,inputDigest:receipt.inputDigest,evidenceSha256:receipt.evidenceSha256,billing,...(continuation?{continuation}:{})};
 if(saved.billingRecovery)assert.deepEqual(saved.billingRecovery,recovery,'Original billing recovery changed');
 const checkedStore={read:()=>store.read(),write:async value=>{await lease.assertHeld();await store.write(value);}};
 const deny=async()=>{throw Error('Provider calls forbidden during billing recovery');};
 const metering=privateBokMetering({provider:{quote:deny,execute:deny},escrow,store:checkedStore,identity,limits,claimReceipt});
 await metering.validateReconciliation(receipt.callId,billing);
 // Retain the original evidence before any chain action. The metering journal
 // independently persists exact reconciliation intents before their sole sends.
 if(continuation?.replacement){
  const r=continuation.replacement,args=[identity.requestId,receipt.callId,String(billing.charge),billing.receipt],digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(r.argsDigest,digest(args),'Replacement settlement arguments changed');
  assert.equal(r.operationId,digest({identity,method:'settle',key:receipt.callId,argsDigest:r.argsDigest}),'Original settlement operation changed');
  const operation=store.read().privateBok.operations[r.operationId],original=store.read().privateBokEscrow;
  assert(operation?.method==='settle'&&operation.argsDigest===r.argsDigest,'Original metering settlement required');
  for(const [name,value]of Object.entries(identity))assert.equal(original?.binding?.[name],value,'Original escrow binding changed');
  const signed=original?.operations?.[r.operationId];
  assert(signed?.method==='settle'&&signed.argsDigest===r.argsDigest&&signed.txHash===r.originalTxHash&&/^[0-9a-f]{64}$/.test(signed.transactionSha256??''),'Original signed settlement changed');
  assert.deepEqual(signed.args,args,'Original settlement payload changed');
  assert.equal(typeof escrow.replaceDroppedOperation,'function','Trusted settlement replacement unavailable');
 }
 // Persist only fully validated local authority. Bad replacement input cannot
 // overwrite the original recovery record or poison a later exact correction.
 if(!saved.billingRecovery)await checkedStore.write({...original,hostedPrivateBok:{...saved,phase:'accounting-recovery',billingRecovery:recovery}});
 if(continuation?.replacement){await lease.assertHeld();await escrow.replaceDroppedOperation(continuation.replacement);}
 const result=await metering.reconcile(receipt.callId,billing);assert.equal(result.replyAvailable,false);
 if(continuation){
  const row=await escrow.request(identity.requestId);assert(row.canonical&&row.request.state===2&&BigInt(row.request.reserved)===0n,'Active settled request required for original reply');
  const current=store.read();assert(Object.values(current.privateBok.calls).every(c=>c.phase==='settled')&&!current.privateBok.finished,'Original billing must be settled and open');
  await lease.assertHeld();await checkedStore.write({...current,hostedPrivateBok:{...current.hostedPrivateBok,phase:'running'}});
  return {status:'settled-for-original-reply',replyAvailable:false,billingReceipt:billing.receipt,charge:billing.charge};
 }
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
 const metering=privateBokMetering({provider:{quote:deny,execute:deny},escrow:readOnlyEscrow,store:{read:()=>original,write:deny},identity,limits:journal.limits,claimReceipt:deny});
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
  if(!request||!request.confirmed){deferred.add(index);return;}
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
/** First-call recovery retains the exact quote/input/operation identity. An
 * unsent reserve can be prepared once; a submitted reserve is observed only.
 * Neither path admits provider-entered calls or a repeated agent continuation. */
function hostedFirstCall(original,submitted){
 const h=original.hostedPrivateBok,j=original.privateBok,e=original.privateBokEscrow;
 if(j?.accountingMode==='invocation-v1')return false;
 if(h?.phase!=='running'||Object.hasOwn(h,'submittedReservationContinuationAttempted')||(!submitted&&Object.hasOwn(h,'preProviderRecoveryAttempted'))||!j||j.finished||!e)return false;
 const calls=Object.values(j.calls??{}),ops=Object.entries(j.operations??{});
 if(calls.length!==1||calls[0].id!==0||calls[0].phase!=='quoted'||calls[0].billing||ops.length!==1||Object.keys(e.operations??{}).length!==1)return false;
 const [id,op]=ops[0],record=e.operations[id],call=calls[0],b=h.binding;
 if(!b||!record||op.method!=='reserve'||record.method!=='reserve')return false;
 if(submitted){if(record.phase!=='submission-unknown'||!/^0x[0-9a-f]{64}$/.test(record.txHash??'')||!/^[0-9a-f]{64}$/.test(record.transactionSha256??''))return false;}
 else if(record.phase!=='preparing'||['recoveryAttempted','txHash','transactionSha256','submissionError'].some(key=>Object.hasOwn(record,key)))return false;
 const identity={network:b.network,escrow:b.escrow,requestId:b.requestId,target:b.target};
 if(!j.identity||Object.keys(j.identity).length!==4||Object.entries(identity).some(([k,v])=>j.identity[k]!==v))return false;
 if(Object.entries(identity).some(([k,v])=>e.binding?.[k]!==v))return false;
 const args=[b.requestId,0,String(call.quote?.maximum)],hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 if(!/^[0-9a-f]{64}$/.test(call.inputDigest??'')||!/^\d+$/.test(args[2])||BigInt(args[2])<=0n)return false;
 return record.argsDigest===hash(args)&&op.argsDigest===record.argsDigest&&JSON.stringify(record.args)===JSON.stringify(args)&&id===hash({identity,method:'reserve',key:0,argsDigest:record.argsDigest});
}

export const hostedUnsubmittedFirstCall=original=>hostedFirstCall(original,false);
export const hostedSubmittedFirstCall=original=>hostedFirstCall(original,true);

/** Only the first undelivered response can restart the agent: no preceding
 * tools exist to replay. Later responses need their existing accepted-work path. */
export function hostedReceivedFirstCall(original){
 try{
  const h=original.hostedPrivateBok,j=original.privateBok,c=j?.calls?.[0];
  if(j?.accountingMode==='invocation-v1')return false;
  if(h?.phase!=='running'||!j||j.finished||Object.keys(j.calls).length!==1||c.id!==0||!['received','settled'].includes(c.phase)||c.responseDelivered||!c.response||!c.billing)return false;
  const b=h.binding,identity={network:b.network,escrow:b.escrow,requestId:b.requestId,target:b.target};
  assert.deepEqual(j.identity,identity);
  const response=retainedBokResponse(c.response),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(c.responseDigest,hash({inputDigest:c.inputDigest,billingReceipt:c.billing.receipt,message:response,finishReason:c.finishReason??null}));
  const operations=Object.values(j.operations??{});assert(operations.length>0&&operations.every(op=>['reserve','settle'].includes(op.method)));
  return true;
 }catch{return false;}
}

export async function runPrivateBokRequest({request,board,escrow,store,provider,runAgent,recoverAccepted,limits,conversation,admitThread,accountingMode,claimReceipt}){
 const identity={...escrow.identity,requestId:request.requestId,target:request.target};
 const binding={...identity,postId:request.postId,pluginId:request.pluginId};
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const save=async value=>store.write({...store.read(),hostedPrivateBok:value});
 let saved=store.read().hostedPrivateBok;
 const resumeReply=['reply-intent','reply-confirmed'].includes(saved?.phase);
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
 const metering=privateBokMetering({provider:guardedProvider,escrow,store,identity,limits,accountingMode,claimReceipt});
 if(saved?.phase==='finished')return {status:'finished',replayed:false};
 if(saved?.phase==='accounted-without-reply')return {status:'accounted-without-reply',replayed:false};
 const invocation=(store.read().privateBok?.accountingMode??(store.read().privateBok?'per-call':accountingMode))==='invocation-v1';
 let result=saved?.phase==='result-ready'?saved.result:undefined;
 if(saved?.phase==='result-ready')assert(invocation&&result&&typeof result.replyText==='string'&&saved.resultDigest===digest(result),'Saved result binding unavailable');
 const resumeUnsubmitted=hostedUnsubmittedFirstCall(store.read()),resumeSubmitted=hostedSubmittedFirstCall(store.read());
 if(resumeSubmitted){
  const [operationId,operation]=Object.entries(store.read().privateBokEscrow.operations)[0];
  assert.equal(typeof escrow.waitForOperation,'function','Native original-operation observer required');
  const observed=await escrow.waitForOperation(operationId);
  assert(observed.status==='succeeded'&&observed.canonical===true&&observed.txHash===operation.txHash&&observed.method==='reserve'&&observed.argsDigest===operation.argsDigest,'Original reserve awaits canonical finality');
 }
 const resumeReceived=hostedReceivedFirstCall(store.read()),resumeFirstCall=resumeUnsubmitted||resumeSubmitted||resumeReceived;
 if(resumeReceived)await metering.validateReconciliation(0,store.read().privateBok.calls[0].billing);
 if(saved?.phase==='running'&&!resumeFirstCall&&invocation&&typeof recoverAccepted==='function'){
  const calls=Object.values(store.read().privateBok.calls);assert(calls.length&&calls.every(c=>['received','settled'].includes(c.phase)),'Hosted request unresolved; original billing required');
  await metering.settle();result=await recoverAccepted(current);
 }else if(saved?.phase==='running'&&!resumeFirstCall&&typeof recoverAccepted==='function'){
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
 }else if(saved&&!resumeFirstCall&&!['reply-intent','reply-confirmed','result-ready'].includes(saved.phase))throw Error('Hosted request unresolved; reconcile original journal without another paid call');
 if(!saved||resumeFirstCall){
  assert(!current.replied&&current.usable,'Invocation no longer usable');
  const row=await escrow.request(request.requestId);assert(row.canonical&&row.request.state===2&&(resumeReceived?true:resumeSubmitted?row.request.sequence===0&&row.request.reserved===BigInt(store.read().privateBok.calls[0].quote.maximum):row.request.reserved===0n),'Active canonical request required');
  if(!resumeFirstCall&&admitThread!==undefined){
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
  saved=resumeReceived?saved:resumeSubmitted?{...saved,submittedReservationContinuationAttempted:true}:resumeUnsubmitted?{...saved,preProviderRecoveryAttempted:true}:{binding,phase:'running'};await save(saved);
  let call=0;
  try{result=await runAgent({conversation:requestConversation,text:current.text,id:request.requestId,postId:request.postId,model:{complete:async input=>{
   const fresh=await board.readRequest(request.postId);assert(fresh?.usable&&!fresh.replied&&fresh.target===request.target,'Invocation changed before paid call');
   const response=await metering.complete(call++,input);assert(response.replyAvailable,'Recovered billing has no recoverable reply');return response;
  }}});}catch(error){
   // Generated source failing validation is a completed attempt, not unknown
   // provider billing. Settle actual usage and return unused credit normally.
   if(error?.code!=='STATIC_FAILED')throw error;
   result={replyText:'I could not finish this update because its checks failed. Nothing new was published. You can ask me to try again.'};
  }
 }
 if(result&&invocation){
  if(saved?.phase!=='result-ready'){packText(result.replyText);assert(Buffer.byteLength(JSON.stringify(result))<=65536,'Hosted result bound');saved={binding,phase:'result-ready',result,resultDigest:digest(result)};await save(saved);}
  await metering.settle();
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
  let observed=await escrow.inspectOperation(saved.operation.operationId);
  if(resumeReply&&observed.status==='pending'){
   assert.equal(typeof escrow.waitForOperation,'function','Native original-operation observer required');
   await escrow.waitForOperation(saved.operation.operationId);
   observed=await escrow.inspectOperation(saved.operation.operationId);
  }
  assert(observed.status==='succeeded'&&observed.canonical&&observed.method==='publish_reply'&&observed.argsDigest===saved.operation.argsDigest,'Reply transaction unresolved');
  const published=await board.readRequest(request.postId);assert(published?.replied&&published.target===request.target,'Authenticated Rolling reply unavailable');
  saved={...saved,phase:'reply-confirmed'};await save(saved);
 }
 await metering.finish();await save({...saved,phase:'finished'});
 return {status:'finished',replayed:false};
}
