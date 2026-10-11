import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {installRollingWireCampaign,assertRollingWireCampaign} from './rolling-wire-campaign.mjs';
const roles={a:'0x'+'11'.repeat(32),b:'0x'+'22'.repeat(32)};
test('labelled loopback fixture: actual Node diagnostic ingress matches unchanged global fetch and restoration',async()=>{
 const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}');});});
 server.listen(0,'127.0.0.1');await once(server,'listening');const original=fetch,trace=installRollingWireCampaign({roles});
 try{
  const base='http://127.0.0.1:'+server.address().port;trace.registerEndpoint('trusted-query',base);trace.setPhase('a-name-1');
  await (await fetch(base+'/v1/node',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'node_getContract',params:[roles.a]})})).json();
  const s=trace.snapshot();assert.equal(s.receiver.requests['trusted-query'],1);assert.equal(s.receiver.errors,0);assert.equal(s.requests,1);assert.deepEqual(s.rows[0].roles,['a']);
  assert.throws(()=>assertRollingWireCampaign(s),/No positive observation/);
 }finally{trace.close();assert.equal(fetch,original);trace.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
function observation(){const labels=['trusted-query','trusted-proof','trusted-upstream','ordinary-node','public-reader'];return {pending:0,unknown:0,unsupported:0,truncated:0,observerErrors:0,requests:5,privacyAcceptance:'not-evaluated',receiver:{errors:0,requests:Object.fromEntries(labels.map(x=>[x,1]))},rows:labels.map(label=>({label,count:1,outcome:'resolved',status:200,roles:label==='trusted-query'?['a','b']:[]}))};}
test('labelled acceptance mutations reject detector failure, missing ingress, unknown scope and public human identities',()=>{
 assert.equal(assertRollingWireCampaign(observation()).passed,true);
 for(const mutate of [s=>s.receiver.requests['ordinary-node']=0,s=>s.rows[0].roles=[],s=>s.rows[3].roles=['a'],s=>s.rows[4].roles=['b'],s=>s.rows[1].outcome='rejected',s=>s.rows[1].status=500,s=>s.pending=1,s=>s.unknown=1,s=>s.unsupported=1,s=>s.truncated=1,s=>s.observerErrors=1,s=>s.receiver.errors=1]){const s=observation();mutate(s);assert.throws(()=>assertRollingWireCampaign(s));}
});

test('labelled transport double: measured request volume fits and the explicit campaign bound still rejects overflow',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>Promise.resolve({status:200});
 const trace=installRollingWireCampaign({roles});
 try{
  trace.registerEndpoint('public-reader','http://127.0.0.1:12345');
  for(let i=0;i<14341;i++)await fetch('http://127.0.0.1:12345/api/status');
  assert.equal(trace.snapshot().requests,14341);assert.equal(trace.snapshot().truncated,0);
  for(let i=14341;i<30001;i++)await fetch('http://127.0.0.1:12345/api/status');
  const observed=trace.snapshot();assert.equal(observed.requests,30001);assert.equal(observed.truncated,1);
  assert.throws(()=>assertRollingWireCampaign(observed),/truncated/);
 }finally{trace.close();globalThis.fetch=original;}
});
