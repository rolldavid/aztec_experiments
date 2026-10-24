import {fork} from 'node:child_process';
/** One preinitialized, unused child consumes one job, then exits. No witness reuse. */
export function createProcessWorker({applicationProfile='legacy',privateBokAddress,proofsEnabled,threads=1,bbPath,crsPath,privateFeeAddress,pluginAddresses=[]}){
 let active,closed=false,closing;
 const kill=child=>{if(!Number.isSafeInteger(child.pid))return;try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,CRS_PATH:crsPath,PROVER_APPLICATION_PROFILE:applicationProfile,PROVER_PRIVATE_BOK:privateBokAddress,PROVER_PROOFS:proofsEnabled?'real':'disabled',PROVER_THREADS:String(threads),HARDWARE_CONCURRENCY:String(threads),PROVER_BB:bbPath,PROVER_PRIVATE_FEE:privateFeeAddress,PROVER_PLUGINS:JSON.stringify(pluginAddresses),LOG_LEVEL:'silent'};
 function warm(){
  const child=fork(new URL('./worker.mjs',import.meta.url),['--standby'],{detached:true,stdio:['ignore','ignore','ignore','ipc'],env});
  const state={child,ready:false,sent:false,ended:false};
  state.dispatch=()=>{if(state.ready&&state.file!==undefined&&!state.sent&&!state.ended){state.sent=true;child.send({file:state.file},error=>{if(error)kill(child);});}};
  // The completion promise resolves even for failed idle initialization, so an
  // unclaimed child cannot create an unhandled rejection or a restart loop.
  state.finished=new Promise(resolve=>{
   let result,stage;
   child.on('message',value=>{
    if(value?.ready===true){if(state.ready){kill(child);return;}state.ready=true;state.dispatch();}
    else if(value?.progress)stage=value.progress;
    else result=value;
   });
   child.on('error',()=>{state.error=true;kill(child);});
   child.on('close',code=>{kill(child);state.ended=true;resolve({code,result,stage});});
  });
  return state;
 }
 let standby=warm();
 return {async prove(file){
  if(closed||active)throw Error(closed?'Worker closed':'Worker busy');
  if(typeof file!=='string'||!file.length)throw Error('Job file required');
  const state=standby;standby=undefined;active=state;state.file=file;state.dispatch();
  try{
   const {code,result,stage}=await state.finished;
   if(code===0&&result&&state.sent&&!state.error)return result;
   throw Object.assign(Error('Proof worker failed'),{code:result?.errorStage??stage??'worker'});
  }finally{
   active=undefined;
   // A fresh child is warmed only after the old process group has exited.
   // Never retry a failed job or carry its witness graph into the replacement.
   if(!closed){try{standby=warm();}catch{standby={ended:true,sent:false,finished:Promise.resolve({code:1,stage:'worker'}),dispatch(){}};}}
  }
 },close(){return closing??=(async()=>{
  closed=true;const state=active??standby;standby=undefined;
  if(state){if(!state.ended)kill(state.child);await state.finished;}
 })();}};
}
