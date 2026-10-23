// Numeric diagnostics only. The opt-in Rolling performance panel consumes these
// fixed labels; no execution objects, function names or RPC arguments are emitted.
const stages=new Set(['transport.serialize','transport.submit','transport.wait','local.decompress','local.verify']);
function emit(stage,duration,timing=globalThis.performance,end){
 try{
  if(!Number.isFinite(duration)||duration<0)return;
  end??=timing.now();if(!Number.isFinite(end)||duration>end)return;
  const name='rolling.proof.'+stage;
  timing.clearMeasures(name);timing.measure(name,{start:end-duration,end});
 }catch{/* Diagnostics cannot change transaction execution. */}
}
export async function measureProofStage(stage,operation){
 let timing,start;try{if(stages.has(stage)){timing=globalThis.performance;start=timing.now();}}catch{}
 try{return await operation();}finally{try{if(Number.isFinite(start)){const end=timing.now();emit(stage,end-start,timing,end);}}catch{}}
}
export function recordProofTimings(stats){
 try{
  const timings=stats?.timings;
  // These are nested native measurements, not additional disjoint stages:
  // proof-transport includes local verification; native.total includes all of
  // them. Witness totals retain the SDK's own timing semantics. Never subtract
  // these new aggregates from the SDK's existing unaccounted calculation.
  for(const [field,label] of [['total','native.total'],['sync','native.sync'],['privateWitness','native.private-witness'],['kernelWitness','native.kernel-witness'],['validation','native.public-validation'],['proving','native.proof-transport'],['unaccounted','native.unaccounted']]){
   emit(label,timings?.[field]);
  }
 }catch{/* Older SDKs may not provide these optional measurements. */}
}
