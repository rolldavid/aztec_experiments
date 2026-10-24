import {fork} from 'node:child_process';
/** One preinitialized, unused child consumes one job, then exits. No witness reuse. */
export function createProcessWorker({applicationProfile='legacy',privateBokAddress,proofsEnabled,threads=1,bbPath,crsPath,privateFeeAddress,pluginAddresses=[]}){
 let active,closed=false,closing;
 const kill=child=>{if(!Number.isSafeInteger(child.pid))return;try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,CRS_PATH:crsPath,PROVER_APPLICATION_PROFILE:applicationProfile,PROVER_PRIVATE_BOK:privateBokAddress,PROVER_PROOFS:proofsEnabled?'real':'disabled',PROVER_THREADS:String(threads),HARDWARE_CONCURRENCY:String(threads),PROVER_BB:bbPath,PROVER_PRIVATE_FEE:privateFeeAddress,PROVER_PLUGINS:JSON.stringify(pluginAddresses),LOG_LEVEL:'silent'};
 function warm(){
  const child=fork(new URL('./worker.mjs',import.meta.url),['--standby'],{detached:true,stdio:['ignore','ignore','ignore','ipc'],env});
  const state={child,ready:false,sent:false,ended:false};
  state.dispatch=()=>{if(state.ready&&state.file!==undefined&&!state.sent&&!state.ended){state.sent=true;state.dispatchedAt=performance.now();child.send({file:state.file},error=>{if(error)kill(child);});}};
  // The completion promise resolves even for failed idle initialization, so an
  // unclaimed child cannot create an unhandled rejection or a restart loop.
  state.finished=new Promise(resolve=>{
   let result,stage;
   child.on('message',value=>{
    if(value?.ready===true){if(state.ready){kill(child);return;}state.ready=true;state.dispatch();}
    else if(value?.progress)stage=value.progress;
    else {
     if(state.delivered)return;
     result=value;state.resultAt=performance.now();
     // The native worker has completed and encoded its proof. Deliver it while
     // process teardown runs; prove() remains occupied until the child exits.
     const successful=value?.mode===(proofsEnabled?'real':'disabled')&&
      Object.keys(value).every(key=>['mode','compressedProof','timings'].includes(key))&&
      (proofsEnabled?typeof value.compressedProof==='string'&&value.compressedProof.length>0:true);
     if(successful&&state.sent&&!state.error&&!state.delivered){
      state.delivered=true;state.publish?.(value);
     }
    }
   });
   child.on('error',()=>{state.error=true;kill(child);});
   child.on('close',code=>{kill(child);state.ended=true;state.endedAt=performance.now();resolve({code,result,stage});});
  });
  return state;
 }
 let standby=warm();
 return {async prove(file,{onTimings=()=>{},onResult}={}){
  if(closed||active)throw Error(closed?'Worker closed':'Worker busy');
  if(typeof file!=='string'||!file.length)throw Error('Job file required');
  const state=standby;standby=undefined;active=state;state.claimedAt=performance.now();state.file=file;
  const timings={};
  const reportTimings=()=>{try{void Promise.resolve(onTimings({...timings})).catch(()=>{});}catch{/* Diagnostics cannot change proof completion. */}};
  const collectTimings=result=>{
   // Each duration is calculated within one process clock. These aggregates
   // overlap the queue's workerMs and must not be added to that enclosing total.
   try{
    for(const [key,label] of [['read','readMs'],['decompress','decompressMs'],['board-binding','bindingMs'],['prove','backendMs'],['native-prove','nativeProveMs'],['bb-start','bbStartMs'],['bb-load','bbLoadMs'],['bb-accumulate','bbAccumulateMs'],['bb-prove','bbProveMs'],['bb-verify','bbVerifyMs'],['bb-compress','bbCompressMs'],['result-encode','resultEncodeMs'],['totalMs','childTotalMs']]){
     const value=result?.timings?.[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0)timings[label]=value;
    }
    for(const [key,start,end] of [['readyWaitMs',state.claimedAt,state.dispatchedAt],['dispatchToResultMs',state.dispatchedAt,state.resultAt],['resultToExitMs',state.resultAt,state.endedAt]])if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)timings[key]=end-start;
   }catch{/* Numeric diagnostics cannot change proof success or failure. */}
  };
  state.publish=result=>{
   collectTimings(result);reportTimings();
   const {timings:ignored,...payload}=result;
   try{void Promise.resolve(onResult?.(payload)).catch(()=>{});}catch{/* The normal completion path still returns the result. */}
  };
  state.dispatch();
  try{
   const {code,result,stage}=await state.finished;
   collectTimings(result);
   if(code===0&&result&&state.sent&&!state.error){const {timings,...payload}=result;return payload;}
   throw Object.assign(Error('Proof worker failed'),{code:result?.errorStage??stage??'worker'});
  }finally{
   active=undefined;
   // A fresh child is warmed only after the old process group has exited.
   // Never retry a failed job or carry its witness graph into the replacement.
   const warmAt=performance.now();
   if(!closed){try{standby=warm();}catch{standby={ended:true,sent:false,finished:Promise.resolve({code:1,stage:'worker'}),dispatch(){}};}}
   timings.warmReplacementMs=performance.now()-warmAt;
   reportTimings();
  }
 },close(){return closing??=(async()=>{
  closed=true;const state=active??standby;standby=undefined;
  if(state){if(!state.ended)kill(state.child);await state.finished;}
 })();}};
}
