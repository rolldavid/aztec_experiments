import {encodeJob,circuitId} from './remote-prover-wire.mjs';
import {measureProofStage,recordProofAggregate} from './proof-timings.mjs';
const failure=code=>Object.assign(Error('Remote proof did not complete.'),{code});
/** Proving transport: prove(executionSteps, publicInputs) -> encoded proof result. */
export function createRemoteProverClient({url,board,chainId,rollupVersion,proofsEnabled=true,fetchImpl=globalThis.fetch,onStatus=()=>{}}){
 const endpoint=new URL(url);
 if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!(endpoint.protocol==='https:'||(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))))throw Error('Remote prover requires HTTPS or loopback');
 const base=endpoint.href.replace(/\/$/,'');
 return Object.freeze({async prove(steps,publicInputs=[]){
  const {metadata,body}=await measureProofStage('transport.serialize',async()=>{
   const metadata={board,chainId:String(chainId),rollupVersion:String(rollupVersion),mode:proofsEnabled?'real':'disabled',circuits:await measureProofStage('transport.circuit-ids',()=>Promise.all(steps.map(s=>circuitId(s.bytecode,s.vk))))};
   return {metadata,body:await encodeJob(metadata,steps.map(s=>s.witness),measureProofStage)};
  });
  async function request(path,options={}){
   let response,text;
   try{response=await fetchImpl(base+path,{...options,credentials:'include',redirect:'error',cache:'no-store'});text=await response.text();}
   catch{throw failure('BB_REMOTE_PROVER_OFFLINE');}
   if(!response.ok)throw failure(response.status===429?'BB_REMOTE_PROVER_BUSY':[401,403,400,413,422].includes(response.status)?'BB_REMOTE_PROVER_REJECTED':'BB_REMOTE_PROVER_OFFLINE');
   try{if(text.length>512000)throw Error();return JSON.parse(text);}catch{throw failure('BB_REMOTE_PROVER_RESPONSE');}
  }
  const accepted=await measureProofStage('transport.submit',()=>request('/v1/jobs',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body}));
  if(!/^[a-f0-9]{64}$/.test(accepted.id))throw failure('BB_REMOTE_PROVER_RESPONSE');
  return measureProofStage('transport.wait',async()=>{
   let response;
   try{response=await fetchImpl(base+'/v1/jobs/'+accepted.id+'/result',{credentials:'include',redirect:'error',cache:'no-store'});}
   catch{throw failure('BB_REMOTE_PROVER_OFFLINE');}
   if(!response.ok){void response.body?.cancel().catch(()=>{});throw failure(response.status===429?'BB_REMOTE_PROVER_BUSY':[401,403,400,413,422].includes(response.status)?'BB_REMOTE_PROVER_REJECTED':'BB_REMOTE_PROVER_OFFLINE');}
   if(response.headers.get('content-type')?.split(';')[0]!=='text/event-stream'||!response.body){void response.body?.cancel().catch(()=>{});throw failure('BB_REMOTE_PROVER_RESPONSE');}
   const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',events=0;
   try{for(;;){
    let chunk;try{chunk=await reader.read();}catch{throw failure('BB_REMOTE_PROVER_OFFLINE');}
    if(chunk.done)throw failure('BB_REMOTE_PROVER_OFFLINE');
    try{buffer+=decoder.decode(chunk.value,{stream:true});}catch{throw failure('BB_REMOTE_PROVER_RESPONSE');}
    if(buffer.length>512000)throw failure('BB_REMOTE_PROVER_RESPONSE');
    let split;
    while((split=buffer.indexOf('\n\n'))!==-1){
     const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
     if(frame===': keepalive')continue;
     if(!frame.startsWith('data: ')||++events>32)throw failure('BB_REMOTE_PROVER_RESPONSE');
     let job;try{job=JSON.parse(frame.slice(6));}catch{throw failure('BB_REMOTE_PROVER_RESPONSE');}
     if(['queued','running'].includes(job?.state)){try{onStatus(job.state);}catch{}continue;}
     if(!['complete','failed'].includes(job?.state))throw failure('BB_REMOTE_PROVER_RESPONSE');
     if(job.state==='complete'&&job.result?.mode!==metadata.mode)throw failure('BB_REMOTE_PROVER_RESPONSE');
     // Server phases are remote aggregates, never chronological browser spans.
     for(const key of ['persistMs','queueWaitMs','resultReadyMs','workerMs','cleanupMs','readMs','decompressMs','bindingMs','backendMs','nativeProveMs','resultEncodeMs','childTotalMs','readyWaitMs','dispatchToResultMs','resultToExitMs','warmReplacementMs','resultReadyToSnapshotMs']){
      const value=job.timings?.[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0)recordProofAggregate('server.'+key.replace(/Ms$/,'').replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
     }
     // Terminal acknowledgement cannot delay or cancel a completed proof.
     void request('/v1/jobs/'+accepted.id,{method:'DELETE',signal:AbortSignal.timeout(10000)}).catch(()=>{});
     if(job.state==='failed')throw failure('BB_REMOTE_PROVER_FAILED');return job.result;
    }
   }}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  });
 }});
}
