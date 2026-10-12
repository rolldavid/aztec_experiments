import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {startProverService,validateQueryService} from '../prover/service.mjs';
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

// DEVELOPMENT ONLY: configuration and controlled local service tests, not node
// readiness/proof/privacy qualification.
const queryConfig=()=>({serviceMode:'query-only',host:'127.0.0.1',port:0,chainId:'11155111',rollupVersion:'3409706519',proofs:'real',origins:[],queryNode:{url:'http://127.0.0.1:1/',rollupAddress:'0x'+'12'.repeat(20)}});
test('query-only: explicit mode rejects all proof settings and malformed identity before allocation',async()=>{
 const forbidden=['board','applicationProfile','privateFeeAddress','privateBokAddress','pluginAddresses','threads','bbPath','crsPath','queueDirectory','maxQueueBytes','queue','worker'];
 for(const key of forbidden)await assert.rejects(startProverService({...queryConfig(),[key]:undefined}));
 for(const patch of [{serviceMode:'arbitrary'},{serviceMode:undefined},{proofs:'disabled'},{chainId:'01'},{chainId:'0'},{rollupVersion:'4294967296'},{queryNode:undefined},{queryNode:{url:'https://ordinary.example',rollupAddress:'0x'+'12'.repeat(20)}},{port:-1},{port:65536},{host:''},{origins:['file://']},{compactBlocks:{tier:'arbitrary'}},{trustedProxy:'arbitrary'}])await assert.rejects(startProverService({...queryConfig(),...patch}));
 let reads=0;
 for(const key of ['serviceMode','chainId']){const c=queryConfig();Object.defineProperty(c,key,{get(){reads++;throw Error('PRIVATE_SENTINEL');}});await assert.rejects(startProverService(c));}
 const c=queryConfig();Object.defineProperty(c.queryNode,'url',{get(){reads++;throw Error('PRIVATE_SENTINEL');}});await assert.rejects(startProverService(c));
 const a=queryConfig();a.origins=['https://example.com'];Object.defineProperty(a.origins,'0',{get(){reads++;throw Error('PRIVATE_SENTINEL');}});await assert.rejects(startProverService(a));assert.equal(reads,0);
 const snapshot=queryConfig();snapshot.compactBlocks={tier:'checkpointed'};const accepted=validateQueryService(snapshot);snapshot.queryNode.url='http://bad.example';snapshot.compactBlocks.tier='proposed';assert.equal(accepted.queryNode.url,'http://127.0.0.1:1/');assert.equal(accepted.compactBlocks.tier,'checkpointed');
});
test('query-only: actual service starts without importing or allocating any proof lifecycle',()=>{
 const module=new URL('../prover/service.mjs',import.meta.url).href;
 const script=`import {registerHooks} from 'node:module';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
 const forbidden=['runtime.mjs','catalog.mjs','queue.mjs','process-worker.mjs'];let blocked=0;
 const hook=registerHooks({resolve(specifier,context,next){if(forbidden.some(file=>specifier==='./'+file&&context.parentURL.endsWith('/prover/service.mjs'))){blocked++;throw Error('Proof import forbidden');}return next(specifier,context);}});
 const originals=new Map();for(const name of ['mkdir','mkdtemp','writeFile','rm']){originals.set(name,fs[name]);fs[name]=()=>{throw Error('Proof filesystem allocation forbidden');};}
 let service;try{const {startProverService}=await import(${JSON.stringify(module)});service=await startProverService(${JSON.stringify(queryConfig())});assert.deepEqual(service.stats(),{serviceMode:'query-only',proofJobsEnabled:false,queueAllocated:false,workerAllocated:false});assert.equal(blocked,0);await service.close();await service.close();}finally{if(service)await service.close();for(const [name,value] of originals)fs[name]=value;hook.deregister();}`;
 const child=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);assert.equal(child.signal,null);
});
test('query-only: bind failure and repeated close preserve caller directory and release listener',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'query-only-owned-'));
 await fs.writeFile(path.join(directory,'keep'),'caller-owned');
 const service=await startProverService(queryConfig());
 try{await assert.rejects(startProverService({...queryConfig(),port:service.address.port}),e=>e.code==='EADDRINUSE');}
 finally{await service.close();await service.close();}
 assert.deepEqual(await fs.readdir(directory),['keep']);assert.equal(await fs.readFile(path.join(directory,'keep'),'utf8'),'caller-owned');
 const next=await startProverService({...queryConfig(),port:service.address.port});await next.close();await fs.rm(directory,{recursive:true});
});
