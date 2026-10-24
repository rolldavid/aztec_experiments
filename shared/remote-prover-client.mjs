import {encodeJob,circuitId} from './remote-prover-wire.mjs';
import {measureProofStage} from './proof-timings.mjs';
const failure=code=>Object.assign(Error('Remote proof did not complete.'),{code});
/** Proving transport: prove(executionSteps, publicInputs) -> encoded proof result. */
export function createRemoteProverClient({url,board,chainId,rollupVersion,proofsEnabled=true,fetchImpl=globalThis.fetch,pollMs=1000,onStatus=()=>{}}){
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
  return measureProofStage('transport.wait',async()=>{for(;;){
   const job=await request('/v1/jobs/'+accepted.id);
   if(['queued','running'].includes(job.state)){try{onStatus(job.state);}catch{}}
   if(['complete','failed'].includes(job.state)){
    if(job.state==='complete'&&job.result?.mode!==metadata.mode)throw failure('BB_REMOTE_PROVER_RESPONSE');
    // Optional bounded transport cleanup cannot hold up a received result.
    // Capacity pressure can reclaim terminal entries if this acknowledgement fails.
    void request('/v1/jobs/'+accepted.id,{method:'DELETE',signal:AbortSignal.timeout(10000)}).catch(()=>{});
    if(job.state==='failed')throw failure('BB_REMOTE_PROVER_FAILED');return job.result;
   }
   if(!['queued','running'].includes(job.state))throw failure('BB_REMOTE_PROVER_RESPONSE');
   await new Promise(resolve=>setTimeout(resolve,pollMs));
  }});
 }});
}
