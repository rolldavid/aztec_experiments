// Labelled development doubles and disposable child processes. No provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';
import {HttpRequestError,RpcRequestError} from 'viem';
import {L1RpcError,getRpcUrlsFromClient,getPublicClient} from '@aztec-labs/ethereum/client';
import {runDiagnostic,numericError,actualOperations,supervise,initialReport,SCOPE,ENDPOINT,PHASES} from './l1-config-diagnostic.mjs';
const H='0x'+'a'.repeat(64),SECRET='PRIVATE_PROVIDER_TEXT';
function fixture(overrides={}){
 const calls=[],addresses={registryAddress:{toString:()=>SCOPE.registry},rollupAddress:{toString:()=>SCOPE.rollup}};
 const ops={source:async()=>true,chain:async()=>11155111,finalized:async()=>({number:100n,timestamp:1000n,hash:H}),collectAddresses:async()=>addresses,contractsConfig:async value=>{assert.equal(value,addresses);return {rollupVersion:SCOPE.rollupVersion,genesisArchiveTreeRoot:H,l1StartBlock:50n,l1GenesisTime:500n,aztecEpochDuration:32,aztecSlotDuration:72,secret:SECRET};},block:async n=>({number:n,timestamp:1000n,hash:H}),...overrides};
 for(const name of Object.keys(ops)){const fn=ops[name];ops[name]=(...args)=>{calls.push(name);return fn(...args);};}return {ops,calls};
}
async function run(overrides={}){const f=fixture(overrides),snapshots=[];const report=await runDiagnostic(f.ops,r=>snapshots.push(JSON.parse(JSON.stringify(r))));assert(!JSON.stringify(report).includes(SECRET));return {...f,report,snapshots};}
const http=status=>new HttpRequestError({status,url:'https://private.invalid/?key='+SECRET,body:{secret:SECRET},details:SECRET});
const rpc=code=>new RpcRequestError({url:'https://private.invalid/?key='+SECRET,body:{secret:SECRET},error:{code,message:SECRET,data:SECRET}});
test('actual installed source pins and fixed official client configuration without network',async()=>{
 const ops=actualOperations();assert.equal(await ops.source(),true);assert.equal(ENDPOINT,'https://sepolia.gateway.tenderly.co');
 assert.deepEqual(getRpcUrlsFromClient(getPublicClient({l1RpcUrls:[ENDPOINT],l1ChainId:SCOPE.chainId})),[ENDPOINT]);
});
test('labelled fake phases persist before/after in exact order and pass exact addresses to official-config seam',async()=>{
 const {report,calls,snapshots}=await run();assert.equal(report.passed,true);assert.equal(report.nodeStartupQualified,false);assert.equal(report.imageExecution,false);assert.deepEqual(report.stages.map(r=>r.name),PHASES);assert.deepEqual(calls,['source','chain','finalized','collectAddresses','contractsConfig','block']);
 for(const phase of PHASES)assert(snapshots.some(s=>s.stages.some(r=>r.name===phase&&r.status==='running')));
 assert.equal(report.readsPinned,false);assert.match(report.sdkReadRetries,/installed defaults/);assert.equal(report.stages[4].observation.l1StartBlock,'50');
});
test('each failing phase stops without replay or downstream calls',async()=>{
 for(const name of ['source','chain','finalized','collectAddresses','contractsConfig','block']){
  const {report,calls}=await run({[name]:async()=>{throw Error(SECRET);}});assert.equal(report.passed,false);assert.equal(calls.filter(x=>x===name).length,1);assert.equal(calls.at(-1),name);assert.equal(report.stages.at(-1).category,'UNAVAILABLE');assert.deepEqual(report.stages.at(-1).error,{httpStatus:null,rpcCode:null});
 }
});
test('separate address and26-read config failures retain exact phase and numeric official HTTP/RPC status',async()=>{
 const a=await run({collectAddresses:async()=>{throw new L1RpcError('hidden',{cause:http(429)});}});assert.equal(a.report.stages.at(-1).name,'collect-addresses');assert.equal(a.report.stages.at(-1).error.httpStatus,429);assert.equal(a.report.stages.at(-1).category,'HTTP_ERROR');assert(!a.calls.includes('contractsConfig'));
 const b=await run({contractsConfig:async()=>{throw new L1RpcError('hidden',{cause:rpc(4444)});}});assert.equal(b.report.stages.at(-1).name,'contracts-config');assert.equal(b.report.stages.at(-1).error.rpcCode,4444);assert.equal(b.report.stages.at(-1).category,'RPC_ERROR');assert(!b.calls.includes('block'));
});
test('official typed numeric causes accepted, arbitrary names/code/messages not accepted',()=>{
 assert.deepEqual(numericError(new L1RpcError(SECRET,{cause:http(503)})),{httpStatus:503,rpcCode:null});assert.deepEqual(numericError(rpc(-32005)),{httpStatus:null,rpcCode:-32005});
 const forged=Object.assign(new Error(SECRET),{name:'HttpRequestError',status:429,code:4444});assert.deepEqual(numericError(forged),{httpStatus:null,rpcCode:null});
 for(const value of [SECRET,NaN,Infinity,-1,600])assert.equal(numericError(http(value)).httpStatus,null);
 for(const value of [SECRET,NaN,Infinity,2**31,-(2**31)-1])assert.equal(numericError(rpc(value)).rpcCode,null);
});
test('changing/throwing numeric, message and cause getters never execute',()=>{
 let calls=0;const error=http(429);for(const key of ['status','message','stack','cause','name'])Object.defineProperty(error,key,{configurable:true,get(){calls++;throw Error(SECRET);}});
 assert.deepEqual(numericError(error),{httpStatus:null,rpcCode:null});assert.equal(calls,0);
 const changed=rpc(4444);Object.defineProperty(changed,'code',{get(){calls++;return calls===1?4444:SECRET;}});assert.deepEqual(numericError(changed),{httpStatus:null,rpcCode:null});assert.equal(calls,0);
});
test('cyclic/deep/error-proxy cause chains terminate with no raw values',()=>{
 const cycle=Error(SECRET);cycle.cause=cycle;assert.deepEqual(numericError(cycle),{httpStatus:null,rpcCode:null});
 let deep=http(429);for(let i=0;i<9;i++)deep=Error(SECRET,{cause:deep});assert.deepEqual(numericError(deep),{httpStatus:null,rpcCode:null});
 const proxy=new Proxy({}, {getOwnPropertyDescriptor(){throw Error(SECRET);},getPrototypeOf(){throw Error(SECRET);}});assert.deepEqual(numericError(proxy),{httpStatus:null,rpcCode:null});
});
test('wrong chain, registry, rollup and configuration version are distinct rejection gates',async()=>{
 for(const [overrides,category]of [[{chain:async()=>1},'CHAIN_MISMATCH'],[{collectAddresses:async()=>({registryAddress:{toString:()=>SCOPE.registry},rollupAddress:{toString:()=>H}})},'IDENTITY_MISMATCH'],[{collectAddresses:async()=>({registryAddress:{toString:()=>H},rollupAddress:{toString:()=>SCOPE.rollup}})},'IDENTITY_MISMATCH'],[{contractsConfig:async()=>({rollupVersion:1})},'IDENTITY_MISMATCH']]){const {report}=await run(overrides);assert.equal(report.passed,false);assert.equal(report.stages.at(-1).category,category);}
});
test('source failure and malformed public projection fail closed without leaking extra fields',async()=>{
 assert.equal((await run({source:async()=>false})).report.stages.at(-1).category,'SOURCE_MISMATCH');
 for(const block of [{number:-1n,timestamp:1n,hash:H},{number:1n,timestamp:1n,hash:SECRET},{number:'1',timestamp:1n,hash:H}])assert.equal((await run({finalized:async()=>block})).report.passed,false);
 for(const config of [{genesisArchiveTreeRoot:SECRET},{l1StartBlock:101n},{aztecEpochDuration:0},{aztecSlotDuration:NaN}]){const original=fixture().ops;const {report}=await run({contractsConfig:async()=>({...await original.contractsConfig(await original.collectAddresses()),...config})});assert.equal(report.passed,false);}
});
test('anchor continuity preserves exact number/hash/timestamp and retains preceding successes',async()=>{
 for(const b of [{number:101n,timestamp:1000n,hash:H},{number:100n,timestamp:1001n,hash:H},{number:100n,timestamp:1000n,hash:'0x'+'b'.repeat(64)}]){const {report}=await run({block:async()=>b});assert.equal(report.stages.at(-1).category,'ANCHOR_CHANGED');assert.equal(report.stages[4].status,'passed');}
});
test('receipt creation is exclusive, symlinks/relative paths reject before child',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'l1-config-diagnostic-'));try{const file=path.join(dir,'existing');fs.writeFileSync(file,'preserve');const link=path.join(dir,'link');fs.symlinkSync(file,link);let calls=0;for(const p of [file,link,'relative.json'])await assert.rejects(supervise(p,{spawnWorker(){calls++;throw Error(SECRET);}}));assert.equal(calls,0);assert.equal(fs.readFileSync(file,'utf8'),'preserve');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual disposable child timeout preserves partial phase and kills/reaps TERM-ignoring process',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'l1-config-diagnostic-'));let child;try{const output=path.join(dir,'report.json');const report=await supervise(output,{deadlineMs:300,spawnWorker(fd){const r=initialReport();r.stages.push({name:'collect-addresses',status:'running'});child=spawn(process.execPath,['-e',`const fs=require('fs');process.on('SIGTERM',()=>{});const b=Buffer.from(${JSON.stringify(JSON.stringify(r))});fs.writeSync(3,b,0,b.length,0);fs.ftruncateSync(3,b.length);fs.fsyncSync(3);process.stdout.write('${SECRET}');process.stderr.write('${SECRET}');setInterval(()=>{},1000);`],{stdio:['ignore','ignore','ignore',fd]});return child;}});assert.equal(report.processCategory,'DEADLINE');assert.equal(report.passed,false);assert.equal(report.stages.at(-1).status,'running');assert.equal(child.signalCode,'SIGKILL');assert.throws(()=>process.kill(child.pid,0));assert.equal(fs.statSync(output).mode&0o777,0o600);assert(!fs.readFileSync(output,'utf8').includes(SECRET));}finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});}
});
test('spawn failure rejects promptly and retains initial safe receipt',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'l1-config-diagnostic-'));try{const output=path.join(dir,'report.json');await assert.rejects(supervise(output,{spawnWorker(fd){return spawn('/nonexistent/l1-config-diagnostic-child',[],{stdio:['ignore','ignore','ignore',fd]});}}));const report=JSON.parse(fs.readFileSync(output));assert.equal(report.passed,false);assert.deepEqual(report.stages,[]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
