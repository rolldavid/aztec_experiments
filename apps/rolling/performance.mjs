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

// Opt-in developer trace for an actual browser run. Exposes durations only;
// recording has no authority over application state or transaction progression.
try{if(typeof document!=='undefined'&&globalThis.location.hash.endsWith('?profile=1')){
 // Consume the diagnostic flag before the reader initializes its route.
 const route=new URL(globalThis.location.href);route.hash=route.hash.slice(0,-10);history.replaceState(history.state,'',route);
 const trace=[],panel=document.createElement('details'),title=document.createElement('summary'),output=document.createElement('div');
 title.textContent='Performance timings';panel.append(title,output);panel.dataset.rollingPerformance='';
 const render=()=>{
  const origin=document.createElement('pre');origin.textContent=JSON.stringify({timeOrigin:performance.timeOrigin});
  output.replaceChildren(origin,...trace.map(entry=>{const line=document.createElement('pre');line.textContent=JSON.stringify(entry);return line;}));
 };
 const observer=new PerformanceObserver(list=>{try{
  for(const entry of list.getEntries())if(/^rolling\.[a-z.-]{1,64}$/.test(entry.name))trace.push({name:entry.name,start:entry.startTime,duration:entry.duration});
  if(trace.length>256)trace.splice(0,trace.length-256);render();
 }catch{/* A diagnostic callback must not affect the application. */}});
 observer.observe({type:'measure',buffered:true});
 if(document.body)document.body.append(panel);else document.addEventListener('DOMContentLoaded',()=>{try{document.body.append(panel);}catch{}},{once:true});
 render();
}}catch{/* Optional profiling cannot interrupt the application. */}
