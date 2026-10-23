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
 'request.total','repository.admit',
 ...Object.entries(methods).flatMap(([prefix,names])=>names.map(name=>prefix+'.'+name)),
 'agent.history','agent.open','agent.context','agent.summary','agent.model','agent.accept','agent.close',
 'tool.list_files','tool.read_file','tool.write_file','tool.edit_file','tool.read_pr','tool.create_pr','tool.check_workspace','tool.read_thread_messages','tool.other',
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
