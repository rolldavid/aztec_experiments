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
  if(nativeUtility&&globalThis[Symbol.for('rolling.proof.profile')]===true)try{
   const timings=result?.stats?.timings,functions=timings?.perFunction;
   const values={total:timings?.total,sync:timings?.sync,unaccounted:timings?.unaccounted};
   if(Array.isArray(functions)&&functions.length<=256){
    const durations=functions.map(entry=>entry.time);
    if(durations.every(value=>Number.isFinite(value)&&value>=0))values.function=durations.reduce((a,b)=>a+b,0);
   }
   const end=performance.now();
   for(const [part,duration]of Object.entries(values))if(Number.isFinite(duration)&&duration>=0&&duration<=3600000){
    const name='rolling.'+stage+'.native-'+part;performance.clearMeasures(name);
    performance.measure(name,{start:end,end,detail:{kind:'aggregate',durationMs:duration}});
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
  const url=new URL(entry.name);if(url.origin!==origin||url.username||url.password)return null;
  const asset=/^\/wallet\/[a-zA-Z0-9_.-]+$/.test(url.pathname)?'wallet-asset':/^\/crs\/[a-zA-Z0-9_.-]+$/.test(url.pathname)?'proof-asset':null;
  if(!(asset?['fetch','xmlhttprequest','script']:['fetch','xmlhttprequest']).includes(entry.initiatorType))return null;
  const endpoint=asset??(url.pathname==='/prover/v1/node'?'node':url.pathname==='/prover/v1/jobs'?'prover-submit':
   /^\/prover\/v1\/jobs\/[a-f0-9]{64}$/.test(url.pathname)?'prover-job':
   /^\/prover\/v1\/jobs\/[a-f0-9]{64}\/result$/.test(url.pathname)?'prover-result':
   /^\/api\/(?:status|home|feed|board|directory|thread|profile|post|bok-accounting)$/.test(url.pathname)?'public-read':null);
  if(!endpoint)return null;
  const result={kind:'resource',endpoint};
  for(const [key,source]of Object.entries({start:'startTime',duration:'duration',fetchStart:'fetchStart',domainLookupStart:'domainLookupStart',domainLookupEnd:'domainLookupEnd',connectStart:'connectStart',secureConnectionStart:'secureConnectionStart',connectEnd:'connectEnd',requestStart:'requestStart',responseStart:'responseStart',responseEnd:'responseEnd',transferSize:'transferSize',encodedBodySize:'encodedBodySize',decodedBodySize:'decodedBodySize'})){
   const value=entry[source];if(Number.isFinite(value)&&value>=0)result[key]=value;
  }
  if(!Number.isFinite(result.start)||!Number.isFinite(result.duration))return null;
  if(endpoint==='prover-submit'&&Array.isArray(entry.serverTiming))for(const phase of entry.serverTiming.slice(0,16)){
   const durationKeys={body:'serverBody',validate:'serverValidate',queue:'serverQueue','body-first':'serverBodyFirst','body-gap':'serverBodyGap'},durationKey=Object.hasOwn(durationKeys,phase.name)?durationKeys[phase.name]:undefined;
   if(durationKey&&Number.isFinite(phase.duration)&&phase.duration>=0)result[durationKey]=phase.duration;
   // Counts are numeric descriptions, not durations or raw header text.
   const countKeys={'body-chunks':'serverBodyChunks','body-bytes':'serverBodyBytes'},countKey=Object.hasOwn(countKeys,phase.name)?countKeys[phase.name]:undefined;
   if(countKey&&typeof phase.description==='string'&&/^[0-9]{1,8}$/.test(phase.description)){
    const count=Number(phase.description);if(count<=8*1024*1024)result[countKey]=count;
   }
  }
  result.protocol=['h2','h3','http/1.1','http/1.0'].includes(entry.nextHopProtocol)?entry.nextHopProtocol:'unknown';
  return result;
 }catch{return null;}
}
// Only fixed labels and numeric observations cross the private-worker boundary.
// Re-emit on the page timeline so existing collectors and manual observers see
// the same measurements. No SDK execution or transaction data reaches the page.
const workerMeasureName=/^rolling\.[a-z.-]{1,96}$/;
const resourceEndpoints=new Set(['wallet-asset','proof-asset','node','prover-submit','prover-job','prover-result','public-read']);
const resourcePoints=['fetchStart','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd'];
const resourceNumbers=['start','duration',...resourcePoints,'transferSize','encodedBodySize','decodedBodySize','serverBody','serverValidate','serverQueue','serverBodyFirst','serverBodyGap','serverBodyChunks','serverBodyBytes'];
const diagnosticNumber=value=>Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
function workerPerformanceRecord(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)return null;
 if(value.kind==='measure'){
  if(Object.keys(value).some(key=>!['kind','name','start','duration','aggregateMs'].includes(key))||typeof value.name!=='string'||!workerMeasureName.test(value.name)||!diagnosticNumber(value.start)||!diagnosticNumber(value.duration)||value.duration>3600000)return null;
  if(value.aggregateMs!==undefined&&(!diagnosticNumber(value.aggregateMs)||value.aggregateMs>3600000))return null;
  return {...value};
 }
 if(value.kind!=='resource'||!resourceEndpoints.has(value.endpoint)||!['h2','h3','http/1.1','http/1.0','unknown'].includes(value.protocol)||Object.keys(value).some(key=>!['kind','endpoint','protocol',...resourceNumbers].includes(key)))return null;
 if(!diagnosticNumber(value.start)||!diagnosticNumber(value.duration)||value.duration>3600000)return null;
 for(const key of resourceNumbers)if(value[key]!==undefined&&!diagnosticNumber(value[key]))return null;
 return {...value};
}
export function observeRollingWorkerPerformance({send,PerformanceObserver:Observer=globalThis.PerformanceObserver,timing=globalThis.performance,origin}={}){
 if(globalThis[Symbol.for('rolling.proof.profile')]!==true)return ()=>{};
 const observers=[];let stopped=false;
 for(const type of ['measure','resource'])try{
  const observer=new Observer(list=>{try{
   if(stopped)return;
   const groups={measure:[],oracle:[],resource:[]},limits={measure:512,oracle:4096,resource:128},dropped={};
   for(const entry of list.getEntries()){
    const projected=type==='resource'?rollingResourceTiming(entry,origin):{kind:'measure',name:entry.name,start:entry.startTime,duration:entry.duration,...(entry.detail?.kind==='aggregate'?{aggregateMs:entry.detail.durationMs}:{})};
    const value=workerPerformanceRecord(projected);if(!value)continue;
    const category=value.kind==='resource'?'resource':value.name.startsWith('rolling.proof.native.phase.oracle-')?'oracle':'measure';
    const group=groups[category];group.push(value);if(group.length>limits[category]){group.shift();dropped[category]=(dropped[category]??0)+1;}
   }
   const entries=Object.values(groups).flat().sort((a,b)=>a.start-b.start);
   if(!diagnosticNumber(timing.timeOrigin))return;
   // One bounded message per batch, no per-entry promise or awaited IPC.
   for(let i=0;i<entries.length;i+=64)send({type:'performance',timeOrigin:timing.timeOrigin,entries:entries.slice(i,i+64),...(i===0&&Object.keys(dropped).length?{dropped}:{})});
  }catch{/* Diagnostics cannot change worker execution. */}});
  observer.observe({type,buffered:true});observers.push(observer);
 }catch{/* Unsupported worker diagnostics remain absent. */}
 return ()=>{stopped=true;for(const observer of observers)try{observer.disconnect();}catch{}};
}
export function receiveRollingWorkerPerformance(message,{enabled=false,timing=globalThis.performance}={}){
 try{
  if(!enabled||message?.type!=='performance'||Object.keys(message).some(key=>!['type','timeOrigin','entries','dropped'].includes(key))||!diagnosticNumber(message.timeOrigin)||!diagnosticNumber(timing.timeOrigin)||!Array.isArray(message.entries)||message.entries.length>64)return;
  const offset=message.timeOrigin-timing.timeOrigin,now=timing.now();if(!diagnosticNumber(now))return;
  for(const raw of message.entries)try{
   const value=workerPerformanceRecord(raw);if(!value)continue;
   value.start+=offset;if(!diagnosticNumber(value.start)||value.start+value.duration>now+1)continue;
   let name,detail;
   if(value.kind==='measure'){
    name=value.name;detail={realm:'worker',...(value.aggregateMs===undefined?{}:{kind:'aggregate',durationMs:value.aggregateMs})};
   }else{
    for(const key of resourcePoints)if(value[key]>0){value[key]+=offset;if(!diagnosticNumber(value[key]))throw Error('Invalid timing');}
    name='rolling.worker.resource.'+value.endpoint;detail={...value,realm:'worker'};
   }
   timing.clearMeasures(name);timing.measure(name,{start:value.start,end:value.start+value.duration,detail});
  }catch{/* One malformed record never prevents later numeric observations. */}
  if(message.dropped&&Object.getPrototypeOf(message.dropped)===Object.prototype&&Object.keys(message.dropped).length<=3)for(const [category,count]of Object.entries(message.dropped)){
   if(!['measure','oracle','resource'].includes(category)||!Number.isSafeInteger(count)||count<=0)continue;
   const name='rolling.worker.trace-overflow';timing.clearMeasures(name);timing.measure(name,{start:now,end:now,detail:{kind:'trace-overflow',realm:'worker',category,count}});
  }
 }catch{/* The optional bridge never rejects a worker operation. */}
}

// Each observer is optional and independently bounded. Failure or unsupported
// browser diagnostics cannot interrupt normal application work.
export function observeRollingPerformance({PerformanceObserver:Observer=globalThis.PerformanceObserver,origin=globalThis.location?.origin,document:doc=globalThis.document,timing=globalThis.performance,onEntries=()=>{},onChange}={}){
 const records={measure:[],oracle:[],resource:[],longtask:[],visibility:[]},limits={measure:512,oracle:4096,resource:128,longtask:64,visibility:64},observers=[],dropped={};
 const oracleTotals=new Map();
 const snapshot=()=>{
  const values=Object.values(records).flat(),now=timing?.now?.()??0;
  for(const [category,count]of Object.entries(dropped))if(count)values.push({kind:'trace-overflow',category,count,start:now,duration:0});
  for(const [name,total]of oracleTotals)values.push({kind:'oracle-total',name,start:now,duration:0,count:total.count,inclusiveMs:total.duration});
  return values.sort((a,b)=>a.start-b.start);
 };
 const notify=()=>{if(onChange)onChange(snapshot);else onEntries(snapshot());};
 let lastVisibility;try{lastVisibility=doc?.visibilityState;}catch{}
 const visibilityChanged=()=>{try{
  const state=doc.visibilityState,start=timing.now();
  if(!['visible','hidden'].includes(state)||state===lastVisibility||!Number.isFinite(start)||start<0)return;
  lastVisibility=state;records.visibility.push({kind:'visibility',state,start,duration:0});
  if(records.visibility.length>limits.visibility)records.visibility.shift();notify();
 }catch{/* Visibility diagnostics never change application state. */}};
 try{doc?.addEventListener?.('visibilitychange',visibilityChanged);}catch{}
 for(const type of ['measure','resource','longtask'])try{
  const observer=new Observer(list=>{try{
   let changed=false;
   for(const entry of list.getEntries()){
    let value=null,recordType=type;
    if(type==='measure'&&entry.detail?.realm==='worker'&&entry.detail.kind==='trace-overflow'){
     const {category,count}=entry.detail;if(['measure','oracle','resource'].includes(category)&&Number.isSafeInteger(count)&&count>0){dropped[category]=Math.min(Number.MAX_SAFE_INTEGER,(dropped[category]??0)+count);changed=true;}continue;
    }
    if(type==='measure'&&entry.detail?.realm==='worker'&&entry.detail.kind==='resource'){
     const {realm,...resource}=entry.detail;value=workerPerformanceRecord(resource);if(value){value.realm=realm;recordType='resource';}
    }
    else if(type==='resource')value=rollingResourceTiming(entry,origin);
    else if(Number.isFinite(entry.startTime)&&entry.startTime>=0&&Number.isFinite(entry.duration)&&entry.duration>=0){
     if(type==='measure'&&/^rolling\.[a-z.-]{1,96}$/.test(entry.name)){
      value={name:entry.name,start:entry.startTime,duration:entry.duration};
      if(entry.detail?.realm==='worker')value.realm='worker';
      if(entry.detail?.kind==='aggregate'&&Number.isFinite(entry.detail.durationMs)&&entry.detail.durationMs>=0)value.aggregateMs=entry.detail.durationMs;
     }
     if(type==='longtask')value={kind:'longtask',start:entry.startTime,duration:entry.duration};
    }
    if(value){
     const category=recordType==='measure'&&entry.name.startsWith('rolling.proof.native.phase.oracle-')?'oracle':recordType;
     records[category].push(value);
     if(category==='oracle'){
      const key=oracleTotals.has(value.name)||oracleTotals.size<127?value.name:'rolling.proof.native.phase.oracle-other-categories';
      const total=oracleTotals.get(key)??{count:0,duration:0};total.count++;total.duration+=value.duration;oracleTotals.set(key,total);
     }
     if(records[category].length>limits[category]){const count=records[category].length-limits[category];records[category].splice(0,count);dropped[category]=(dropped[category]??0)+count;}
     changed=true;
    }
   }
   if(changed)notify();
  }catch{/* Diagnostics never control progress. */}});
  observer.observe({type,buffered:true});observers.push(observer);
 }catch{/* Unsupported entry types are simply absent. */}
 return ()=>{for(const observer of observers)try{observer.disconnect();}catch{}try{doc?.removeEventListener?.('visibilitychange',visibilityChanged);}catch{}};
}

// Opt-in developer trace for an actual browser run. Recording has no authority
// over application state or transaction progression. Normal visits create none.
try{if(typeof document!=='undefined'&&globalThis.location.hash.endsWith('?profile=1')){
 globalThis[Symbol.for('rolling.proof.profile')]=true;
 // Consume the diagnostic flag before the reader initializes its route.
 const route=new URL(globalThis.location.href);route.hash=route.hash.slice(0,-10);history.replaceState(history.state,'',route);
 const initialVisibility=['visible','hidden'].includes(document.visibilityState)?document.visibilityState:'unknown';
 let snapshot=()=>[];const panel=document.createElement('details'),title=document.createElement('summary'),output=document.createElement('div');
 title.textContent='Performance timings';panel.append(title,output);panel.dataset.rollingPerformance='';
 const render=()=>{
  const origin=document.createElement('pre');origin.textContent=JSON.stringify({timeOrigin:performance.timeOrigin,visibilityState:initialVisibility});
  output.replaceChildren(origin,...snapshot().map(entry=>{const line=document.createElement('pre');line.textContent=JSON.stringify(entry);return line;}));
 };
 observeRollingPerformance({onChange:read=>{snapshot=read;if(panel.open)render();}});
 panel.addEventListener('toggle',()=>{try{if(panel.open)render();}catch{}});
 if(document.body)document.body.append(panel);else document.addEventListener('DOMContentLoaded',()=>{try{document.body.append(panel);}catch{}},{once:true});
 render();
}}catch{/* Optional profiling cannot interrupt the application. */}
