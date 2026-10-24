let profilingEnabled=false;
// Measurements observe progress; they never control it. No account IDs or content.
export function beginRollingMeasure(stage, timing=globalThis.performance){
 let start;try{start=timing?.now?.();}catch{}let finished=false;
 return ()=>{
  if(finished||!Number.isFinite(start))return;finished=true;
  try{const name='rolling.'+stage;timing.clearMeasures(name);timing.measure(name,{start,end:timing.now()});}catch{/* Diagnostics cannot interrupt an action. */}
 };
}
export async function measureRollingStage(stage,operation,{nativeUtility=false}={}){
 const finish=beginRollingMeasure(stage);try{
  const result=await operation();
  if(nativeUtility&&profilingEnabled)try{
   const timings=result?.stats?.timings,functions=timings?.perFunction;
   const values={total:timings?.total,sync:timings?.sync,unaccounted:timings?.unaccounted};
   if(Array.isArray(functions)&&functions.length<=256){
    const durations=functions.map(entry=>entry.time);
    if(durations.every(value=>Number.isFinite(value)&&value>=0))values.function=durations.reduce((a,b)=>a+b,0);
   }
   const end=performance.now();
   for(const [part,duration]of Object.entries(values))if(Number.isFinite(duration)&&duration>=0&&duration<=3600000){
    const name='rolling.'+stage+'.native-'+part;performance.clearMeasures(name);
    performance.measure(name,{start:Math.max(0,end-duration),end});
   }
  }catch{/* Native statistics are optional observations, never action results. */}
  return result;
 }finally{finish();}
}
export function rollingStageObserver(){
 let stage,finish=()=>{};
 return Object.freeze({
  progress(next){if(!['estimating','preparing','proving','submitting','confirming'].includes(next)||next===stage)return;finish();stage=next;finish=beginRollingMeasure('transaction.'+next);},
  complete(){finish();stage=undefined;finish=()=>{};}
 });
}

// No URLs, query strings, job IDs, RPC methods or attribution enter the trace.
export function rollingResourceTiming(entry,origin){
 try{
  if(!['fetch','xmlhttprequest'].includes(entry.initiatorType))return null;
  const url=new URL(entry.name);if(url.origin!==origin||url.username||url.password)return null;
  const endpoint=url.pathname==='/prover/v1/node'?'node':url.pathname==='/prover/v1/jobs'?'prover-submit':
   /^\/prover\/v1\/jobs\/[a-f0-9]{64}$/.test(url.pathname)?'prover-job':
   /^\/api\/(?:status|home|feed|board|directory|thread|profile|post|bok-accounting)$/.test(url.pathname)?'public-read':null;
  if(!endpoint)return null;
  const result={kind:'resource',endpoint};
  for(const [key,source]of Object.entries({start:'startTime',duration:'duration',fetchStart:'fetchStart',domainLookupStart:'domainLookupStart',domainLookupEnd:'domainLookupEnd',connectStart:'connectStart',secureConnectionStart:'secureConnectionStart',connectEnd:'connectEnd',requestStart:'requestStart',responseStart:'responseStart',responseEnd:'responseEnd',transferSize:'transferSize',encodedBodySize:'encodedBodySize',decodedBodySize:'decodedBodySize'})){
   const value=entry[source];if(Number.isFinite(value)&&value>=0)result[key]=value;
  }
  if(!Number.isFinite(result.start)||!Number.isFinite(result.duration))return null;
  result.protocol=['h2','h3','http/1.1','http/1.0'].includes(entry.nextHopProtocol)?entry.nextHopProtocol:'unknown';
  return result;
 }catch{return null;}
}
// Each observer is optional and independently bounded. Failure or unsupported
// browser diagnostics cannot interrupt normal application work.
export function observeRollingPerformance({PerformanceObserver:Observer=globalThis.PerformanceObserver,origin=globalThis.location?.origin,onEntries=()=>{}}={}){
 const records={measure:[],resource:[],longtask:[]},limits={measure:256,resource:128,longtask:64},observers=[];
 for(const type of Object.keys(records))try{
  const observer=new Observer(list=>{try{
   let changed=false;
   for(const entry of list.getEntries()){
    let value=null;
    if(type==='resource')value=rollingResourceTiming(entry,origin);
    else if(Number.isFinite(entry.startTime)&&entry.startTime>=0&&Number.isFinite(entry.duration)&&entry.duration>=0){
     if(type==='measure'&&/^rolling\.[a-z.-]{1,64}$/.test(entry.name))value={name:entry.name,start:entry.startTime,duration:entry.duration};
     if(type==='longtask')value={kind:'longtask',start:entry.startTime,duration:entry.duration};
    }
    if(value){records[type].push(value);changed=true;}
   }
   if(records[type].length>limits[type])records[type].splice(0,records[type].length-limits[type]);
   if(changed)onEntries([...records.measure,...records.resource,...records.longtask].sort((a,b)=>a.start-b.start));
  }catch{/* Diagnostics never control progress. */}});
  observer.observe({type,buffered:true});observers.push(observer);
 }catch{/* Unsupported entry types are simply absent. */}
 return ()=>{for(const observer of observers)try{observer.disconnect();}catch{}};
}

// Opt-in developer trace for an actual browser run. Recording has no authority
// over application state or transaction progression. Normal visits create none.
try{if(typeof document!=='undefined'&&globalThis.location.hash.endsWith('?profile=1')){
 profilingEnabled=true;
 // Consume the diagnostic flag before the reader initializes its route.
 const route=new URL(globalThis.location.href);route.hash=route.hash.slice(0,-10);history.replaceState(history.state,'',route);
 let trace=[];const panel=document.createElement('details'),title=document.createElement('summary'),output=document.createElement('div');
 title.textContent='Performance timings';panel.append(title,output);panel.dataset.rollingPerformance='';
 const render=()=>{
  const origin=document.createElement('pre');origin.textContent=JSON.stringify({timeOrigin:performance.timeOrigin});
  output.replaceChildren(origin,...trace.map(entry=>{const line=document.createElement('pre');line.textContent=JSON.stringify(entry);return line;}));
 };
 observeRollingPerformance({onEntries:entries=>{trace=entries;if(panel.open)render();}});
 panel.addEventListener('toggle',()=>{try{if(panel.open)render();}catch{}});
 if(document.body)document.body.append(panel);else document.addEventListener('DOMContentLoaded',()=>{try{document.body.append(panel);}catch{}},{once:true});
 render();
}}catch{/* Optional profiling cannot interrupt the application. */}
