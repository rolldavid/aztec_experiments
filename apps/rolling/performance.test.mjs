import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingResourceTiming,observeRollingPerformance} from './performance.mjs';
const origin='https://board.example';
const resource=(path,extras={})=>({name:origin+path,initiatorType:'fetch',startTime:10,duration:20,fetchStart:11,domainLookupStart:12,domainLookupEnd:13,connectStart:14,secureConnectionStart:15,connectEnd:16,requestStart:17,responseStart:28,responseEnd:30,transferSize:321,encodedBodySize:123,decodedBodySize:456,nextHopProtocol:'h2',...extras});
function observers({unsupported=[],onEntries=()=>{}}={}){
 const instances=new Map();class Observer{
  constructor(callback){this.callback=callback;}
  observe({type,buffered}){assert.equal(buffered,true);if(unsupported.includes(type))throw Error('unsupported');instances.set(type,this);}
  disconnect(){this.disconnected=true;}
 }
 const stop=observeRollingPerformance({PerformanceObserver:Observer,origin,onEntries});
 return {instances,stop,emit(type,entries){instances.get(type).callback({getEntries:()=>entries});}};
}
test('resource trace preserves phase times and native response sizes without URL or account data',()=>{
 for(const [path,endpoint]of [['/prover/v1/node?account=private','node'],['/prover/v1/jobs?token=secret','prover-submit'],['/prover/v1/jobs/'+'a'.repeat(64),'prover-job'],['/api/post?id=123&cursor=private','public-read']]){
  const result=rollingResourceTiming(resource(path),origin);assert.equal(result.endpoint,endpoint);
  assert.deepEqual(Object.keys(result),['kind','endpoint','start','duration','fetchStart','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd','transferSize','encodedBodySize','decodedBodySize','protocol']);
  assert.equal(result.requestStart,17);assert.equal(result.responseStart,28);assert.equal(result.protocol,'h2');assert.equal(result.transferSize,321);
  assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('a'.repeat(64)));
 }
});
test('only exact same-origin fetch/XHR endpoint classes are recorded',()=>{
 for(const entry of [resource('/wallet/nested/sdk.js'),resource('/api/unknown'),resource('/api/profile/123'),resource('/prover/v1/jobs/not-a-job'),resource('/prover/v1/node/extra'),resource('/prover/v1/node',{name:'https://other.example/prover/v1/node'}),resource('/prover/v1/node',{name:'https://secret@board.example/prover/v1/node'}),resource('/prover/v1/node',{initiatorType:'script'}),resource('/api/events',{initiatorType:'other'})])assert.equal(rollingResourceTiming(entry,origin),null);
 assert.equal(rollingResourceTiming(resource('/prover/v1/node',{initiatorType:'xmlhttprequest'}),origin).endpoint,'node');
});
test('non-finite metrics and unrecognized protocol strings cannot enter diagnostic output',()=>{
 const result=rollingResourceTiming(resource('/api/home',{requestStart:Infinity,responseStart:-1,transferSize:NaN,nextHopProtocol:'private-data'}),origin);
 assert(!Object.hasOwn(result,'requestStart'));assert(!Object.hasOwn(result,'responseStart'));assert(!Object.hasOwn(result,'transferSize'));assert.equal(result.protocol,'unknown');
 assert.equal(rollingResourceTiming(resource('/api/home',{startTime:NaN}),origin),null);
 assert.equal(rollingResourceTiming({get name(){throw Error('disabled');},initiatorType:'fetch'},origin),null);
});
test('trace bounds each entry type, keeps phase records ordered and excludes long-task attribution',()=>{
 let latest;const h=observers({onEntries:entries=>latest=entries});
 h.emit('resource',Array.from({length:200},(_,i)=>resource('/api/home',{startTime:i})));
 h.emit('measure',Array.from({length:2300},(_,i)=>({name:'rolling.action.prepare',startTime:i,duration:1})));
 h.emit('longtask',Array.from({length:100},(_,i)=>({name:'secret',startTime:i,duration:50,attribution:[{containerSrc:'https://private.example/account'}]})));
 assert.equal(latest.filter(v=>v.kind==='resource').length,128);assert.equal(latest.filter(v=>v.kind==='longtask').length,64);assert.equal(latest.filter(v=>v.name).length,512);
 assert.equal(latest.filter(v=>v.kind==='resource')[0].start,72);
 assert(latest.every((v,i)=>!i||latest[i-1].start<=v.start));assert(!JSON.stringify(latest).includes('secret'));assert(!JSON.stringify(latest).includes('private'));
 h.stop();assert([...h.instances.values()].every(v=>v.disconnected));
});
test('unsupported long-task observation and diagnostic callbacks cannot affect other observations',()=>{
 let calls=0;const h=observers({unsupported:['longtask'],onEntries:()=>{calls++;throw Error('panel unavailable');}});
 assert.equal(h.instances.size,2);assert.doesNotThrow(()=>h.emit('resource',[resource('/api/home')]));
 assert.doesNotThrow(()=>h.emit('measure',[{name:'rolling.reader.update',startTime:1,duration:2}]));assert.equal(calls,2);
 assert.doesNotThrow(()=>observeRollingPerformance({PerformanceObserver:undefined,origin}));
});
test('normal visits create no observers or diagnostic UI',async()=>{
 const originals=new Map(['document','location','PerformanceObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  let ui=0,observers=0;globalThis.document={createElement(){ui++;return {};}};
  globalThis.location={hash:'#/home',href:origin+'/#/home',origin};
  globalThis.PerformanceObserver=class{constructor(){observers++;}};
  await import('./performance.mjs?normal-visit');assert.equal(ui,0);assert.equal(observers,0);
 }finally{for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('opt-in panel shows sanitized resource and long-task records alongside measures',async()=>{
 const keys=['document','location','history','PerformanceObserver'],originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),observers=new Map();
 const element=()=>({dataset:{},children:[],listeners:{},addEventListener(type,callback){this.listeners[type]=callback;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
 const body=element();let route;
 try{
  globalThis.document={body,visibilityState:'visible',createElement:element};globalThis.location={hash:'#/home?profile=1',href:origin+'/#/home?profile=1',origin};
  globalThis.history={state:null,replaceState(_state,_title,url){route=url.hash;}};
  globalThis.PerformanceObserver=class{constructor(callback){this.callback=callback;}observe({type}){observers.set(type,this);}};
  await import('./performance.mjs?opt-in-panel');assert.equal(route,'#/home');assert.equal(body.children.length,1);
  const send=(type,entries)=>observers.get(type).callback({getEntries:()=>entries});
  send('measure',[{name:'rolling.reader.update',startTime:9,duration:1}]);send('resource',[resource('/prover/v1/jobs/'+'b'.repeat(64)+'?private=secret')]);send('longtask',[{startTime:11,duration:50,attribution:[{name:'private'}]}]);
  const panel=body.children[0],output=panel.children[1];assert.equal(output.children.length,1,'Closed panel does not rebuild DOM per request');panel.open=true;panel.listeners.toggle();
  const records=output.children.map(node=>JSON.parse(node.textContent));
  assert.equal(records.length,4);assert.equal(records[0].visibilityState,'visible');assert.equal(records[1].name,'rolling.reader.update');assert.equal(records[2].endpoint,'prover-job');assert.equal(records[3].kind,'longtask');
  assert(!JSON.stringify(records).includes('secret'));assert(!JSON.stringify(records).includes('b'.repeat(64)));
 }finally{for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('native utility timing is opt-in, duration-only and never changes action outcomes',async()=>{
 const keys=['document','location','history','performance'],originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),measures=[];
 try{
  globalThis.document={createElement(){throw Error('No panel in fixture');}};globalThis.location={hash:'#/home?profile=1',href:origin+'/#/home?profile=1',origin};globalThis.history={state:null,replaceState(){}};
  globalThis.performance={now:()=>100,clearMeasures(){},measure(name,value){measures.push({name,...value});}};
  const active=await import('./performance.mjs?utility-active');
  const result={stats:{timings:{total:30,sync:10,unaccounted:5,perFunction:[{get functionName(){throw Error('Identity must not be read');},time:15}]}}};
  assert.equal(await active.measureRollingStage('action.screening',async()=>result,{nativeUtility:true}),result);
  assert.deepEqual(measures.filter(x=>x.name.includes('.native-')).map(x=>[x.name,x.detail.durationMs]),[['rolling.action.screening.native-total',30],['rolling.action.screening.native-sync',10],['rolling.action.screening.native-unaccounted',5],['rolling.action.screening.native-function',15]]);
  const bad={get stats(){throw Error('Optional stats unavailable');}};assert.equal(await active.measureRollingStage('action.screening',async()=>bad,{nativeUtility:true}),bad);
  const failure=Error('Actual action failed');await assert.rejects(active.measureRollingStage('action.screening',async()=>{throw failure;},{nativeUtility:true}),error=>error===failure);
  globalThis.location.hash='#/home';const inactive=await import('./performance.mjs?utility-inactive');
  const count=measures.filter(x=>x.name.includes('.native-')).length;
  await inactive.measureRollingStage('action.screening',async()=>result,{nativeUtility:true});assert.equal(measures.filter(x=>x.name.includes('.native-')).length,count);
 }finally{for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});

test('wallet and proof asset contention is observable without filenames or hash queries',()=>{
 for(const [path,endpoint]of [['/wallet/private_sdk-123.js?sha256=secret','wallet-asset'],['/crs/crs.bin?sha256=secret','proof-asset']])for(const initiatorType of ['fetch','xmlhttprequest','script']){
  const result=rollingResourceTiming(resource(path,{initiatorType}),origin);assert.equal(result.endpoint,endpoint);
  assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('sdk'));assert(!JSON.stringify(result).includes('crs.bin'));
 }
 assert.equal(rollingResourceTiming(resource('/wallet/sdk.js',{initiatorType:'img'}),origin),null);
 assert.equal(rollingResourceTiming(resource('/crs/crs.bin',{name:'https://external.example/crs/crs.bin'}),origin),null);
});

test('visibility diagnostics use fixed states and monotonic timestamps with a bounded buffer',()=>{
 const listeners=new Map();let latest=[],now=10;
 const doc={visibilityState:'visible',addEventListener(type,listener){listeners.set(type,listener);},removeEventListener(type,listener){assert.equal(listeners.get(type),listener);listeners.delete(type);}};
 const stop=observeRollingPerformance({PerformanceObserver:undefined,origin,document:doc,timing:{now:()=>now},onEntries:entries=>latest=entries});
 const change=state=>{doc.visibilityState=state;now++;listeners.get('visibilitychange')();};
 change('hidden');change('hidden');change('private-data');change('visible');
 assert.deepEqual(latest,[{kind:'visibility',state:'hidden',start:11,duration:0},{kind:'visibility',state:'visible',start:14,duration:0}]);
 for(let i=0;i<100;i++)change(i%2?'visible':'hidden');
 assert.equal(latest.length,64);assert(latest.every(entry=>['visible','hidden'].includes(entry.state)));assert(!JSON.stringify(latest).includes('private-data'));
 stop();assert.equal(listeners.size,0);
});

test('proof admission records only fixed numeric server phase durations',()=>{
 const timings=[{name:'body',duration:12,description:'private'},{name:'validate',duration:.2},{name:'queue',duration:3},{name:'private-id',duration:4},{name:'body',duration:-1}];
 const result=rollingResourceTiming(resource('/prover/v1/jobs',{serverTiming:timings}),origin);
 assert.equal(result.serverBody,12);assert.equal(result.serverValidate,.2);assert.equal(result.serverQueue,3);assert(!JSON.stringify(result).includes('private'));
 const node=rollingResourceTiming(resource('/prover/v1/node',{serverTiming:timings}),origin);assert.equal(node.serverBody,undefined);
});

test('aggregate timings retain duration without inventing a browser interval or exposing other detail',()=>{
 let latest;const h=observers({onEntries:v=>{latest=v;}});
 h.emit('measure',[{name:'rolling.proof.aggregate.native.total',startTime:20,duration:0,detail:{kind:'aggregate',durationMs:99,secret:'never include'}}]);
 assert.deepEqual(latest,[{name:'rolling.proof.aggregate.native.total',start:20,duration:0,aggregateMs:99}]);h.stop();
});

test('oracle detail cannot evict coarse phases and overflow retains numeric totals',()=>{
 let latest;const h=observers({onEntries:value=>{latest=value;}});
 h.emit('measure',[{name:'rolling.action.prepare',startTime:1,duration:3},...Array.from({length:4100},(_,i)=>({name:'rolling.proof.native.phase.oracle-get-notes',startTime:10+i,duration:2}))]);
 assert(latest.some(e=>e.name==='rolling.action.prepare'));
 assert.equal(latest.filter(e=>e.name==='rolling.proof.native.phase.oracle-get-notes'&&!e.kind).length,4096);
 const total=latest.find(e=>e.kind==='oracle-total');assert.equal(total.count,4100);assert.equal(total.inclusiveMs,8200);
 const overflow=latest.find(e=>e.kind==='trace-overflow');assert.equal(overflow.category,'oracle');assert.equal(overflow.count,4);h.stop();
});

test('lazy diagnostics append without sorting or reading the clock until a snapshot is requested',()=>{
 let callback,read,samples=0,clockReads=0;
 class Observer{constructor(fn){callback=fn;}observe({type}){if(type!=='measure')throw Error('unused');}disconnect(){}}
 const stop=observeRollingPerformance({PerformanceObserver:Observer,timing:{now(){clockReads++;return 20;}},onChange:fn=>{read=fn;samples++;}});
 callback({getEntries:()=>[{name:'rolling.action.prepare',startTime:1,duration:2}]});
 assert.equal(samples,1);assert.equal(clockReads,0);assert.equal(read().length,1);assert.equal(clockReads,1);stop();
});
