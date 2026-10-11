// Test-only parent instrumentation. No transport, listener, retry or wallet is
// created here. Production factories retain every request and response body.
import assert from 'node:assert/strict';
import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {createRollingWireTrace} from './rolling-wire-trace.mjs';
const labels=['trusted-query','trusted-proof','trusted-upstream','ordinary-node','public-reader'];
const channel='http.server.request.start';
export function installRollingWireCampaign({roles}){
 // The measured four-name campaign issued 14,341 requests. Keep a bounded
 // 30,000-request inventory; overflow remains an acceptance failure.
 const trace=createRollingWireTrace({roles,limits:{maxRequests:30000}}),original=globalThis.fetch,wrapped=trace.wrapFetch(original);
 const ports=new Map(),ingress=Object.fromEntries(labels.map(k=>[k,0]));let errors=0,closed=false;
 function receive({request,socket}){
  // The pinned Node24 diagnostic channel reports real server ingress before
  // application handling. Never read headers, bodies or error objects here.
  try{
   const candidates=ports.get(socket.localPort);if(!candidates)return;
   const url=request.url,method=request.method;let label;
   if(candidates.includes('trusted-query')&&((method==='POST'&&url==='/v1/node')||(method==='GET'&&url==='/healthz')))label='trusted-query';
   else if(candidates.includes('trusted-proof')&&((method==='POST'&&url==='/v1/jobs')||(method==='GET'&&/^\/v1\/jobs\/[a-f0-9]{64}$/.test(url))))label='trusted-proof';
   else if(candidates.length===1&&['trusted-upstream','ordinary-node'].includes(candidates[0])&&method==='POST'&&url==='/')label=candidates[0];
   else if(candidates.includes('public-reader')&&method==='GET'&&/^\/api\/(status|feed|directory|thread|profile|post)(?:\?|$)/.test(url))label='public-reader';
   else{errors++;return;}
   ingress[label]++;
  }catch{errors++;}
 }
 subscribe(channel,receive);globalThis.fetch=wrapped;
 const registerEndpoint=(label,url)=>{
  assert(!closed);trace.registerEndpoint(label,url);
  if(label!=='public-l1'){
   const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.protocol,'http:');
   const port=Number(parsed.port);assert(port>0);ports.set(port,[...(ports.get(port)??[]),label]);
  }
 };
 return Object.freeze({registerEndpoint,setPhase:trace.setPhase,
  close(){if(closed)return;closed=true;const unchanged=globalThis.fetch===wrapped;
   if(unchanged)globalThis.fetch=original;unsubscribe(channel,receive);assert(unchanged,'Fetch owner changed during wire campaign');},
  snapshot(){return {...trace.snapshot(),receiver:{channel,errors,requests:{...ingress},scope:'Same-process loopback HTTP adapters only; Anvil and native transports excluded'}};},
 });
}
export function assertRollingWireCampaign(observation){
 assert.equal(observation.pending,0);for(const key of ['unknown','unsupported','truncated','observerErrors'])assert.equal(observation[key],0,key);
 assert.equal(observation.receiver.errors,0);assert(observation.requests>0);
 for(const label of labels){
  const rows=observation.rows.filter(row=>row.label===label),sent=rows.reduce((n,row)=>n+row.count,0);
  assert(sent>0,'No positive observation for '+label);assert.equal(observation.receiver.requests[label],sent,'Receiver mismatch for '+label);
  for(const row of rows){assert.equal(row.outcome,'resolved');assert(row.status>=200&&row.status<300);
   if(['ordinary-node','public-reader'].includes(label))assert.deepEqual(row.roles,[],label+' exposed known human account');}
 }
 // Actual trusted-query ownership reads must exercise the detector. Absence
 // everywhere cannot qualify known-address suppression on the public legs.
 for(const role of ['a','b'])assert(observation.rows.some(row=>row.label==='trusted-query'&&row.roles.includes(role)),'Missing private account positive control');
 assert.equal(observation.privacyAcceptance,'not-evaluated');
 return {passed:true,scope:'Real serialized request capture and receiver reconciliation; opaque transactions and wider privacy still require separate evidence'};
}
