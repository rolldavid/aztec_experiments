import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const names=['ContractClassRegistry','ContractInstanceRegistry','FeeJuice','MultiCallEntrypoint','AuthRegistry','HandshakeRegistry'];
async function fixture(t,{bad=false,fail=false,control='verified'}={}){
 const bytes=Buffer.from('{}'),hash=createHash('sha256').update(bytes).digest('hex'),asset=url=>({url,bytes:2,sha256:hash});
 const metadata={schemaVersion:1,deploymentRegistration:asset('/wallet/deployment-registration.json'),config:{network:{chainId:'31337'}},trustedQuery:{},remoteProver:null,proofsEnabled:false,
  scripts:['ethers.js','aztec_bundle.js','crs-client.js','wallet-providers.js','claim-secret-store.js','ethereum-account-session.js','account.js','engine.js'].map(name=>asset('/wallet/'+name)),
  worker:asset('/wallet/native-worker.js'),artifacts:{board:asset('/wallet/board.json'),privateFee:asset('/wallet/private-fee.json')},crs:asset('/crs/manifest.json'),nativeArtifacts:names.map(name=>asset('/wallet/native-contract-'+name+'.json'))};
 if(bad===true)metadata.nativeArtifacts[0].url='/wallet/unknown.json';
 if(bad==='board')metadata.artifacts.board.url='/wallet/unknown.json';
 if(bad==='fee-size')metadata.artifacts.privateFee.bytes=32*1024*1024+1;
 if(bad==='registration')metadata.deploymentRegistration.sha256='invalid';
 const lifecycle=new EventTarget(),started=Promise.withResolvers(),native=[];let workers=0,terminated=0,cancelled=0,queries=0,lateReply,portsClosed=0;
 const set=(name,value)=>{const before=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,value,writable:true});t.after(()=>before?Object.defineProperty(globalThis,name,before):delete globalThis[name]);};
 const serviceWorker={controller:control==='uncontrolled'?null:{state:'activated',scriptURL:'https://board.test/'+(control==='other'?'other-worker.mjs':'wallet-cache-worker.mjs'),postMessage(type,ports){queries++;assert.equal(type,'rolling-native-artifacts-v1');assert.equal(ports.length,1);lateReply=()=>ports[0].postMessage('rolling-native-artifacts-v1');if(control==='changed')serviceWorker.controller={};if(control==='verified'||control==='changed')lateReply();}}};
 set('MessageChannel',class{constructor(){const first={onmessage:null,closed:false,close(){if(!this.closed)portsClosed++;this.closed=true;}},second={closed:false,postMessage(data){queueMicrotask(()=>{if(!first.closed)first.onmessage?.({data});});},close(){if(!this.closed)portsClosed++;this.closed=true;}};this.port1=first;this.port2=second;}});
 set('isSecureContext',true);set('crossOriginIsolated',true);set('navigator',{locks:{request(){}},serviceWorker});set('location',new URL('https://board.test/home'));
 set('addEventListener',lifecycle.addEventListener.bind(lifecycle));set('removeEventListener',lifecycle.removeEventListener.bind(lifecycle));
 set('document',{querySelector:()=>null,createElement:tag=>({tag,remove(){}}),head:{append(){}}});
 set('Worker',class{constructor(){workers++;started.resolve();}addEventListener(){}postMessage(){}terminate(){terminated++;}});
 set('fetch',async(url,options)=>{
  if(url==='/wallet/runtime.json')return new Response(JSON.stringify(metadata));
  if(url.includes('native-contract-')||/^\/wallet\/(?:board|private-fee|deployment-registration)\.json\?/.test(url)){
   assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert(url.endsWith('?sha256='+hash));const index=native.length;native.push(url);
   return {ok:true,body:{getReader:()=>({read:()=>new Promise((resolve,reject)=>{const abort=()=>reject(Error('page closed'));if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});if(fail===true||fail==='one'&&index===0||fail==='board'&&url.startsWith('/wallet/board.json?'))reject(Error('asset failed'));}),cancel:async()=>{cancelled++;},releaseLock(){}})}};
  }
  return new Response(bytes);
 });
 const {loadRollingWalletRuntime}=await import('./wallet-runtime.mjs?native-preload='+encodeURIComponent(t.name));
 const result=loadRollingWalletRuntime().then(()=>{throw Error('unexpected complete custody setup');},error=>error.code);
 return {result,started,native,lateReply:()=>lateReply?.(),get queries(){return queries;},get portsClosed(){return portsClosed;},cancel:()=>lifecycle.dispatchEvent(new Event('pagehide')),get workers(){return workers;},get terminated(){return terminated;},get cancelled(){return cancelled;}};
}
test('required application and native artifact deliveries start with code and do not block actual worker creation',async t=>{
 const f=await fixture(t);await f.started.promise;assert.equal(f.native.length,9);for(const name of ['board','private-fee','deployment-registration'])assert.equal(f.native.filter(url=>url.startsWith('/wallet/'+name+'.json?')).length,1);assert.equal(f.workers,1);assert.equal(f.cancelled,0);
 f.cancel();assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.cancelled,9);assert(f.terminated>=1);
});
test('unknown native artifact path is rejected before any code or artifact fetch',async t=>{
 const f=await fixture(t,{bad:true});assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');assert.equal(f.workers,0);assert.equal(f.native.length,0);
});
test('failed native artifact preload aborts code delivery and cannot start a late worker',async t=>{
 const f=await fixture(t,{fail:true});await new Promise(resolve=>setImmediate(resolve));f.cancel();assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');assert.equal(f.workers,0);assert.equal(f.cancelled,9);
});

 test('one failed native artifact immediately aborts held siblings and prevents worker startup',async t=>{
 const f=await fixture(t,{fail:'one'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.cancelled,9);assert.equal(f.workers,0);
 f.cancel();assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');
});

for(const control of ['uncontrolled','old','other','changed'])test('native loader alone owns artifact delivery without a capable controller: '+control,async t=>{
 const f=await fixture(t,{control});await f.started.promise;assert.equal(f.workers,1);assert.equal(f.native.length,0);
 assert.equal(f.queries,['old','changed'].includes(control)?1:0);if(f.queries)assert.equal(f.portsClosed,2);
 f.lateReply();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.native.length,0,'late support cannot duplicate native startup reads');
 f.cancel();assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');assert.equal(f.cancelled,0);
});

for(const bad of ['board','fee-size','registration'])test('invalid opening artifact is rejected before SDK fetch: '+bad,async t=>{
 const f=await fixture(t,{bad});assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');assert.equal(f.workers,0);assert.equal(f.native.length,0);
});

test('failed opening artifact aborts sibling downloads before worker startup',async t=>{
 const f=await fixture(t,{fail:'board'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.cancelled,9);assert.equal(f.workers,0);
 f.cancel();assert.equal(await f.result,'ROLLING_RUNTIME_UNAVAILABLE');
});
