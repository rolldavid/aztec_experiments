import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startProverService} from '../prover/service.mjs';
test('service health and failed bind use production lifecycle without leaking queue directories',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prover-service-test-'));
 const config={host:'127.0.0.1',port:0,board:'0x'+'01'.repeat(32),chainId:'31337',rollupVersion:'1',proofs:'disabled',origins:[],queueDirectory:directory};
 const service=await startProverService(config);
 try{
  const response=await fetch('http://127.0.0.1:'+service.address.port+'/healthz');assert.equal(response.status,200);const health=await response.json();assert.equal(health.proofs,'disabled');assert.deepEqual(health.query,{enabled:false,ready:false});assert.equal((await fetch('http://127.0.0.1:'+service.address.port+'/v1/node',{method:'POST'})).status,404);assert.equal(health.queue.submitted,0);
  await assert.rejects(startProverService({...config,port:service.address.port}),e=>e.code==='EADDRINUSE');assert.equal((await fs.readdir(directory)).length,1);
 }finally{await service.close();await service.close();assert.deepEqual(await fs.readdir(directory),[]);await fs.rm(directory,{recursive:true});}
});
test('rolling configuration rejects missing fee/Bok, aliases and unknown profiles before listening',async()=>{
 const address=n=>'0x'+String(n).padStart(64,'0');
 const config={host:'127.0.0.1',port:0,board:address(1),chainId:'31337',rollupVersion:'1',proofs:'disabled',origins:[],applicationProfile:'rolling',privateFeeAddress:address(2),privateBokAddress:address(3)};
 for(const patch of [{privateFeeAddress:undefined},{privateBokAddress:undefined},{privateBokAddress:address(0)},{privateBokAddress:address(1)},{privateFeeAddress:address(3)}])await assert.rejects(startProverService({...config,...patch}),/Distinct rolling/);
 await assert.rejects(startProverService({...config,applicationProfile:'arbitrary'}),/Invalid application profile/);
});

test('query configuration rejects nonlocal upstream before creating service resources',async()=>{
 const config={host:'127.0.0.1',port:0,board:'0x'+'01'.repeat(32),chainId:'31337',rollupVersion:'1',proofs:'disabled',origins:[]};
 await assert.rejects(startProverService({...config,queryNode:{url:'https://ordinary-node.example',rollupAddress:'0x'+'01'.repeat(20)}}),/Invalid query node configuration/);
});
