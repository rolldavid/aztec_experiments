import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileState,readHostedPrivateFile} from './operations.mjs';

// Public authoring guidance only. No operator configuration enters the agent.
export const ARTIFACT_API_GUIDANCE='Published pages may call public HTTPS APIs and load external assets. For an operator-configured API requiring a secret, discover the current thread aliases with fetch("/t/" + location.pathname.split("/")[2] + "/api", {credentials:"omit"}). The JSON aliases list contains public alias, method and endpoint fields. Fetch a listed endpoint with GET and credentials:"omit"; do not add query parameters, headers or a body. These optional aliases share a finite public request allowance across all visitors. Handle unavailable or exhausted aliases in the UI. Never place credentials in source; discovery is available only after publication and may list no aliases.';

const unavailable=status=>Object.assign(Error('Artifact API unavailable'),{code:'ARTIFACT_API_UNAVAILABLE',status});
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyOf=({repositoryId,threadId,alias})=>sha([repositoryId,threadId,alias]);
const exact=(value,keys)=>{assert(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join()===keys.sort().join());};
const count=value=>Number.isSafeInteger(value)&&value>=0;
const matches=(endpoint,scope)=>endpoint.repositoryId===scope.repositoryId&&endpoint.threadId===scope.threadId;
const credentialEcho=(value,secret)=>typeof value==='string'?value.includes(secret):value!==null&&typeof value==='object'?Object.entries(value).some(([key,item])=>key.includes(secret)||credentialEcho(item,secret)):false;

/** Optional trusted-host facility. Its caller owns the hosted lease and checks
 * the current publication before/after every async boundary. All callers share
 * each alias allowance; a publication route is scope, never caller identity. */
export async function createArtifactApi({config,directory,lease,env=process.env,fetch:fetchUpstream=globalThis.fetch}){
 if(config===undefined)return null;
 try{
  exact(config,['enabled','endpoints']);assert(typeof config.enabled==='boolean'&&Array.isArray(config.endpoints)&&config.endpoints.length<=32);
  if(!config.enabled){assert(config.endpoints.length===0);return null;}
  assert(typeof lease?.assertHeld==='function'&&typeof fetchUpstream==='function');await lease.assertHeld();
  assert(path.isAbsolute(directory)&&await fs.realpath(directory)===directory);
  const stat=await fs.lstat(directory);assert(stat.isDirectory()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700);
  const seen=new Set(),endpoints=config.endpoints.map(input=>{
   exact(input,['repositoryId','threadId','alias','url','credentialEnv','totalRequests']);
   const e={...input};assert(/^[0-9a-f]{64}$/.test(e.repositoryId)&&/^0x[0-9a-f]{64}$/.test(e.threadId)&&/^[a-z][a-z0-9-]{0,47}$/.test(e.alias));
   const url=new URL(e.url);assert(url.protocol==='https:'&&url.href===e.url&&!url.username&&!url.password&&!url.search&&!url.hash);
   assert(/^[A-Z][A-Z0-9_]{0,95}$/.test(e.credentialEnv)&&count(e.totalRequests)&&e.totalRequests>0&&e.totalRequests<=100000);
   const secret=env[e.credentialEnv];assert(typeof secret==='string'&&secret.length>=8&&secret.length<=4096&&/^[\x21-\x7e]+$/.test(secret));
   const key=keyOf(e);assert(!seen.has(key));seen.add(key);return {...e,key,identity:sha([e.repositoryId,e.threadId,e.alias,e.url,e.credentialEnv,e.totalRequests]),secret};
  });
  const ledgerPath=path.join(directory,'artifact-api.json'),markerPath=path.join(directory,'artifact-api.initialized.json');
  async function existing(file){try{return JSON.parse((await readHostedPrivateFile(file,131072)).toString('utf8'));}catch(error){try{await fs.lstat(file);}catch(missing){if(missing.code==='ENOENT')return null;}throw error;}}
  const marker=await existing(markerPath),previous=await existing(ledgerPath);
  if(marker){assert.deepEqual(marker,{schema:1});assert(previous,'Original artifact API allowance ledger required');}
  const store=await fileState(ledgerPath);let state=previous??{schema:1,entries:{}};
  assert(state.schema===1&&state.entries&&Object.getPrototypeOf(state.entries)===Object.prototype&&Object.keys(state.entries).length<=256);
  for(const [key,entry]of Object.entries(state.entries))assert(/^[0-9a-f]{64}$/.test(key)&&/^[0-9a-f]{64}$/.test(entry.identity)&&count(entry.used)&&count(entry.limit)&&entry.limit>0&&entry.limit<=100000&&entry.used<=entry.limit);
  const entries={...state.entries};
  for(const e of endpoints){const old=entries[e.key];if(old)assert(old.identity===e.identity&&old.limit===e.totalRequests,'Original alias configuration required');else entries[e.key]={identity:e.identity,limit:e.totalRequests,used:0};}
  assert(Object.keys(entries).length<=256);state={schema:1,entries};await lease.assertHeld();await store.write(state);
  // A missing ledger after initialization must not recreate spending authority.
  if(!marker)await (await fileState(markerPath)).write({schema:1});
  let active=null,controller=null,closed=false,poisoned=false;
  function describe(scope){if(closed||poisoned)throw unavailable(503);return endpoints.filter(e=>matches(e,scope)).map(({alias})=>({alias,method:'GET'}));}
  async function invoke(scope,alias,guard){
   if(closed||poisoned||active)throw unavailable(503);
   const endpoint=endpoints.find(e=>e.alias===alias&&matches(e,scope));if(!endpoint)throw unavailable(404);
   controller=new AbortController();const ownedController=controller;
   active=(async()=>{
    await lease.assertHeld();guard();if(closed)throw unavailable(503);
    const entry=state.entries[endpoint.key];if(entry.used>=entry.limit)throw unavailable(429);
    const next={...state,entries:{...state.entries,[endpoint.key]:{...entry,used:entry.used+1}}};
    try{await store.write(next);state=next;}catch{poisoned=true;throw unavailable(503);}
    await lease.assertHeld();guard();if(closed)throw unavailable(503);
    let timer,reader;
    try{
     timer=setTimeout(()=>ownedController.abort(),20000);
     const response=await fetchUpstream(endpoint.url,{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+endpoint.secret},redirect:'error',credentials:'omit',signal:ownedController.signal});
     assert(!ownedController.signal.aborted&&response.ok&&!response.redirected&&/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''));
     const length=response.headers.get('content-length');if(length!==null)assert(/^[0-9]+$/.test(length)&&Number(length)<=65536);
     reader=response.body.getReader();const chunks=[];let size=0;
     for(;;){const {done,value}=await reader.read();assert(!ownedController.signal.aborted);if(done)break;size+=value.byteLength;assert(size<=65536);chunks.push(value);}
     const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),value=JSON.parse(text);
     assert(!endpoints.some(e=>text.includes(e.secret)||credentialEcho(value,e.secret)));
     await lease.assertHeld();guard();if(closed)throw unavailable(503);
     return value;
    }finally{clearTimeout(timer);ownedController.abort();if(reader)await reader.cancel().catch(()=>{});}
   })();
   try{return await active;}catch(error){throw unavailable(error?.code==='ARTIFACT_API_UNAVAILABLE'?error.status:503);}finally{active=null;controller=null;}
  }
  return Object.freeze({describe,invoke,async close(){closed=true;controller?.abort();try{await active;}catch{/* reserved allowance remains consumed */}}});
 }catch{throw Error('Invalid private artifact API configuration or allowance state');}
}
