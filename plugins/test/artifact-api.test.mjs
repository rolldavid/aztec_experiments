import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createArtifactApi,ARTIFACT_API_GUIDANCE} from '../artifact-api.mjs';

const scope={repositoryId:'a'.repeat(64),threadId:'0x'+'b'.repeat(64)},secret='SYNTHETIC_API_SECRET_ONLY';
const endpoint={...scope,alias:'forecast',url:'https://configured.invalid/forecast',credentialEnv:'ARTIFACT_FORECAST_TOKEN',totalRequests:2};
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
async function fixture(t,overrides={}){
 const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'artifact-api-')));let calls=0,api;
 const state={response:async()=>json({forecast:'sunny'}),held:true};
 const input={directory,config:{enabled:true,endpoints:[{...endpoint,...overrides}]},env:{ARTIFACT_FORECAST_TOKEN:secret},lease:{assertHeld:async()=>assert(state.held)},fetch:async(url,options)=>{
  calls++;assert.equal(url,endpoint.url);assert.deepEqual(options.headers,{Accept:'application/json',Authorization:'Bearer '+secret});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.body,undefined);return state.response(options.signal);
 }};
 const open=async config=>(api=await createArtifactApi({...input,...(config?{config}:{})}));
 t.after(async()=>{await api?.close();await fs.rm(directory,{recursive:true,force:true});});
 return {input,state,directory,open,get calls(){return calls;},get api(){return api;},used:async()=>Object.values(JSON.parse(await fs.readFile(path.join(directory,'artifact-api.json'))).entries).reduce((n,e)=>n+e.used,0)};
}
test('optional API is disabled by default; configured aliases expose no upstream or credential and cannot cross thread scope',async t=>{
 assert.equal(await createArtifactApi({}),null);assert.equal(await createArtifactApi({config:{enabled:false,endpoints:[]}}),null);
 const f=await fixture(t),api=await f.open();assert.deepEqual(api.describe(scope),[{alias:'forecast',method:'GET'}]);assert.deepEqual(api.describe({...scope,threadId:'0x'+'c'.repeat(64)}),[]);
 await assert.rejects(api.invoke({...scope,threadId:'0x'+'c'.repeat(64)},'forecast',()=>{}),{status:404});assert.equal(await f.used(),0);
 assert.deepEqual(await api.invoke(scope,'forecast',()=>{}),{forecast:'sunny'});assert.equal(f.calls,1);assert.equal(await f.used(),1);
 assert(!JSON.stringify(api.describe(scope)).includes(secret));assert(!ARTIFACT_API_GUIDANCE.includes('credentialEnv'));
 for(const change of [{url:'http://configured.invalid/forecast'},{url:'https://configured.invalid/forecast?token=secret'},{totalRequests:0},{credentialEnv:'MISSING_TOKEN'}])await assert.rejects(createArtifactApi({...f.input,config:{enabled:true,endpoints:[{...endpoint,...change}]}}),/Invalid private artifact API/);
});
test('success and uncertain result consume durable allowance; restart, removal, changed config and missing ledger cannot replenish it',async t=>{
 const f=await fixture(t);let api=await f.open();await api.invoke(scope,'forecast',()=>{});
 f.state.response=async()=>{throw Error(secret+' upstream result lost');};await assert.rejects(api.invoke(scope,'forecast',()=>{}),error=>error.message==='Artifact API unavailable');assert.equal(await f.used(),2);await api.close();
 api=await f.open({enabled:true,endpoints:[]});await api.close();api=await f.open();await assert.rejects(api.invoke(scope,'forecast',()=>{}),{status:429});assert.equal(f.calls,2);
 for(const change of [{totalRequests:3},{url:'https://configured.invalid/changed'}])await assert.rejects(f.open({enabled:true,endpoints:[{...endpoint,...change}]}),/Invalid private artifact API/);
 await api.close();await fs.unlink(path.join(f.directory,'artifact-api.json'));await assert.rejects(f.open(),/Invalid private artifact API/);
});
test('redirects, active content, credential echoes and oversized streams are withheld and count without retries',async t=>{
 const f=await fixture(t,{totalRequests:5}),api=await f.open();let cancelled=false;
 for(const response of [()=>new Response(null,{status:302,headers:{location:'https://other.invalid'}}),()=>new Response('<script>private</script>',{headers:{'content-type':'text/html'}}),()=>json({echo:secret}),()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}})]){
  f.state.response=response;await assert.rejects(api.invoke(scope,'forecast',()=>{}),{code:'ARTIFACT_API_UNAVAILABLE',status:503});
 }
 assert(cancelled);assert.equal(f.calls,4);assert.equal(await f.used(),4);
 f.state.response=async()=>json({okay:true});assert.deepEqual(await api.invoke(scope,'forecast',()=>{}),{okay:true});
});
test('deadline and shutdown abort but retain ownership until upstream settles; concurrent requests never allocate a second call',async t=>{
 const f=await fixture(t);const api=await f.open();let entered,release,signal;
 const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 f.state.response=async observed=>{signal=observed;entered();await hold;return json({late:true});};
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=api.invoke(scope,'forecast',()=>{});const rejected=assert.rejects(pending,{status:503});await ready;
 t.mock.timers.tick(20000);assert(signal.aborted);await assert.rejects(api.invoke(scope,'forecast',()=>{}),{status:503});
 let closed=false;const closing=api.close().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);assert.equal(f.calls,1);assert.equal(await f.used(),1);
 release();await rejected;await closing;assert.equal(closed,true);t.mock.timers.reset();
});
test('lost lease or publication change fences dispatch and results while preserving any reserved allowance',async t=>{
 const f=await fixture(t),api=await f.open();let checks=0;
 await assert.rejects(api.invoke(scope,'forecast',()=>{if(++checks===2)throw Error('disabled');}),{status:503});assert.equal(f.calls,0);assert.equal(await f.used(),1);
 f.state.response=async()=>{f.state.held=false;return json({private:'discarded'});};await assert.rejects(api.invoke(scope,'forecast',()=>{}),{status:503});assert.equal(f.calls,1);assert.equal(await f.used(),2);
});
