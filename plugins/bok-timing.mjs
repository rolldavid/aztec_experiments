import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

// Timing is observation only. No prompt, tool arguments, result data, credentials,
// wall-clock expiry or exception text enter these records or control execution.
const contexts=new AsyncLocalStorage();
const methods={
 escrow:['request','assertUsable','inspectOperation','waitForOperation','reserve','settle','close_uncertain','reconcile','finish','publish_reply','finalize_reply','open','prove','send','wait'],
 board:['readRequest'],conversation:['load','assertCurrent'],
};
const stages=new Set([
 'request.total','repository.admit','publication.static','publication.mirror',
 ...Object.entries(methods).flatMap(([prefix,names])=>names.map(name=>prefix+'.'+name)),
 'agent.history','agent.open','agent.context','agent.summary','agent.model','agent.accept','agent.close',
 'tool.list_files','tool.read_file','tool.write_file','tool.edit_file','tool.edit_browser_plan','tool.finish_workspace','tool.read_pr','tool.create_pr','tool.check_workspace','tool.read_thread_messages','tool.other',
 'provider.catalogue','provider.credits','provider.balance','provider.topup','provider.completion',
]);
export function withBokTiming(requestId,operation,{emit=record=>console.info(JSON.stringify(record))}={}){
 if(!/^0x[0-9a-f]{64}$/.test(requestId??'')||contexts.getStore()?.requestId===requestId)return operation();
 return contexts.run({requestId,emit,spans:0},operation);
}
export async function measureBokStage(stage,operation){
 const context=contexts.getStore();if(!context||!stages.has(stage)||context.spans>=1024)return operation();
 const span=++context.spans,start=performance.now();
 const emit=result=>{
  const record={requestId:context.requestId,span,stage,durationMs:Math.round(Math.max(0,performance.now()-start)*1000)/1000,result};
  try{const pending=context.emit(record);pending?.catch?.(()=>{});}catch{/* Logging cannot authorize, interrupt or retry work. */}
 };
 emit('started');
 try{const result=await operation();emit('success');return result;}catch(error){emit('error');throw error;}
}
export function measureBokObjectStages(object,prefix){
 const allowed=methods[prefix];if(!allowed)return object;
 return Object.freeze(Object.fromEntries(Object.entries(object).map(([key,value])=>[
  key,typeof value==='function'&&allowed.includes(key)?(...args)=>measureBokStage(prefix+'.'+key,()=>Reflect.apply(value,object,args)):value,
 ])));
}

// Aggregate native SDK timings only; never serialize SDK objects, function names,
// RPC arguments, proof inputs, or per-oracle values. Observation cannot fail a tx.
export function recordBokProofProfile(stats){
 try{
  const context=contexts.getStore();if(!context||(context.proofProfiles??0)>=16)return;
  const timings=stats?.timings;if(!timings||typeof timings!=='object')return;
  const values={};
  for(const key of ['total','sync','proving','validation','unaccounted']){
   const value=timings[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER/1000)values[key+'Ms']=Math.round(value*1000)/1000;
  }
  if(Array.isArray(timings.perFunction)&&timings.perFunction.length<=256){
   const times=timings.perFunction.map(entry=>entry?.time);
   if(times.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0)){
    const sum=times.reduce((total,value)=>total+value,0);
    if(Number.isFinite(sum)&&sum<=Number.MAX_SAFE_INTEGER/1000){values.witnessMs=Math.round(sum*1000)/1000;values.functionCount=times.length;}
   }
  }
  if(!Object.keys(values).length)return;
  context.proofProfiles=(context.proofProfiles??0)+1;
  const pending=context.emit({requestId:context.requestId,event:'escrow.proof_profile',...values});pending?.catch?.(()=>{});
 }catch{/* Profiling never changes proof, submission, or accounting behavior. */}
}

// Fixed classifications only: never forward exception messages, dynamic names,
// stack locations, arguments or witness data. This does not decide retry policy.
export function recordBokOperationFailure(error,{phase,method}={}){
 try{
  const context=contexts.getStore();if(!context||(context.operationFailures??0)>=16)return;
  if(!['request','fee','prove','validate','before-submit','submitted'].includes(phase)||!['reserve','settle','close_uncertain','reconcile','finish','publish_reply','finalize_reply'].includes(method))return;
  const own=key=>Object.getOwnPropertyDescriptor(error,key)?.value;
  const code=own('code'),name=own('name'),stack=error instanceof Error?error.stack:own('stack');
  const errorCode=['ERR_ASSERTION','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ABORT_ERR','BB_OPERATOR_FEE_BALANCE_INSUFFICIENT'].includes(code)?code:'unclassified';
  const errorName=['AssertionError','SimulationError','AbortError','TypeError','Error'].includes(name)?name:'unclassified';
  const frames=[];
  if(typeof stack==='string')for(const line of stack.slice(0,16384).split('\n').slice(1,17)){
   for(const label of ['proveTxWithPublicValidation','runSynced','sync','checkedSelectedAnchor','checkedHeader','executePrivate','generateCircuitOutput','validateKernelPublicInputs','createChonkProof']){
    if(new RegExp('^\\s*at (?:async )?(?:[A-Za-z_$][A-Za-z0-9_$]*\\.)?#?'+label+' \\(').test(line)&&!frames.includes(label))frames.push(label);
   }
  }
  context.operationFailures=(context.operationFailures??0)+1;
  const pending=context.emit({requestId:context.requestId,event:'escrow.operation_failure',phase,method,errorCode,errorName,frames});pending?.catch?.(()=>{});
 }catch{/* Diagnostics cannot alter an escrow outcome. */}
}
