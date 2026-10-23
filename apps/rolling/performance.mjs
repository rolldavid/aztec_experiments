// Measurements observe progress; they never control it. No account IDs or content.
export function beginRollingMeasure(stage, timing=globalThis.performance){
 let start;try{start=timing?.now?.();}catch{}let finished=false;
 return ()=>{
  if(finished||!Number.isFinite(start))return;finished=true;
  try{const name='rolling.'+stage;timing.clearMeasures(name);timing.measure(name,{start,end:timing.now()});}catch{/* Diagnostics cannot interrupt an action. */}
 };
}
export async function measureRollingStage(stage,operation){
 const finish=beginRollingMeasure(stage);try{return await operation();}finally{finish();}
}
export function rollingStageObserver(){
 let stage,finish=()=>{};
 return Object.freeze({
  progress(next){if(!['estimating','preparing','proving','submitting','confirming'].includes(next)||next===stage)return;finish();stage=next;finish=beginRollingMeasure('transaction.'+next);},
  complete(){finish();stage=undefined;finish=()=>{};}
 });
}
