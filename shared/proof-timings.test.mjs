import test from 'node:test';
import assert from 'node:assert/strict';
import {recordProofTimings,measureProofStage} from './proof-timings.mjs';
import {createRemoteProverClient} from './remote-prover-client.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function observed(work){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance'),entries=[];let now=1000;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now,clearMeasures(){},measure:(name,value)=>entries.push({name,...value})}});
 try{return await work(entries,n=>{now+=n;});}finally{Object.defineProperty(globalThis,'performance',descriptor);}
}
test('native stats emit only fixed numeric totals, without inspecting names or RPC payloads',()=>observed(entries=>{
 const timings={total:500,sync:0,privateWitness:100,kernelWitness:150,validation:50,proving:180,unaccounted:20,
  get perFunction(){assert.fail('private function names must not be read');}};
 recordProofTimings({timings,get nodeRPCCalls(){assert.fail('RPC metadata must not be read');}});
 assert.deepEqual(entries.map(e=>[e.name,e.end-e.start]),[
  ['rolling.proof.native.total',500],['rolling.proof.native.sync',0],['rolling.proof.native.private-witness',100],
  ['rolling.proof.native.kernel-witness',150],['rolling.proof.native.public-validation',50],
  ['rolling.proof.native.proof-transport',180],['rolling.proof.native.unaccounted',20]]);
 assert(entries.every(e=>Object.keys(e).sort().join()==='end,name,start'));
}));
test('missing, invalid or hostile diagnostic data never interrupts execution',()=>observed(entries=>{
 recordProofTimings();recordProofTimings({timings:{total:NaN,sync:-1,proving:Infinity,validation:'1'}});
 recordProofTimings({get timings(){throw Error('private');}});assert.deepEqual(entries,[]);
}));
test('stage timing preserves return/error identity and executes once, including when timing fails',()=>observed(async(entries,advance)=>{
 const result={},failure=Error('same failure');let calls=0;
 assert.equal(await measureProofStage('local.verify',async()=>{calls++;advance(9);return result;}),result);
 await assert.rejects(measureProofStage('transport.wait',async()=>{calls++;advance(4);throw failure;}),e=>e===failure);
 assert.deepEqual(entries.map(e=>[e.name,e.end-e.start]),[['rolling.proof.local.verify',9],['rolling.proof.transport.wait',4]]);
 globalThis.performance.now=()=>{throw Error('timing unavailable');};
 assert.equal(await measureProofStage('local.verify',async()=>{calls++;return result;}),result);
 assert.equal(calls,3);
}));
test('unknown diagnostic labels never leak dynamic content',()=>observed(async entries=>{
 await measureProofStage('private-secret-function',async()=>1);assert.deepEqual(entries,[]);
}));
test('transport instruments existing serialization, submit and result wait without additional requests',()=>observed(async(entries,advance)=>{
 const calls=[],id='a'.repeat(64),result={mode:'real',compressedProof:'AA=='};
 const client=createRemoteProverClient({url:'https://prover.example',board:'private-board',chainId:1,rollupVersion:1,
  fetchImpl:async(url,options)=>{calls.push([url,options.method??'GET']);advance(7);return {ok:true,text:async()=>JSON.stringify(options.method==='POST'?{id}:options.method==='DELETE'?{}:{state:'complete',result})};}});
 assert.deepEqual(await client.prove([]),result);
 assert.deepEqual(calls.map(c=>c[1]),['POST','GET','DELETE']);
 assert.deepEqual(entries.map(e=>e.name),['rolling.proof.transport.serialize','rolling.proof.transport.submit','rolling.proof.transport.wait']);
 assert(!JSON.stringify(entries).includes('private-board'));
}));
test('remote proof decompression and verification keep the exact checks and expose only numeric spans',()=>observed(async(entries,advance)=>{
 const source=(await readFile(new URL('./routed-kernel-prover.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function','function').replace(/export const RoutedKernelProver=.*;/,'');
 const calls=[],proof={},vk=new Uint8Array([1]);let valid=true;
 const bb={async chonkDecompressProof(){calls.push('decompress');advance(3);return {proof};},async chonkVerify(input){assert.equal(input.proof,proof);assert.equal(input.vk,vk);calls.push('verify');advance(5);return {valid};}};
 const factory=vm.runInNewContext(source+'\nroutedKernelProverClass',{Buffer,Uint8Array,measureProofStage,Barretenberg:{initSingleton:async()=>bb},CircuitKind:{HidingKernel:3},flattenChonkProofFields:()=>[],ChonkProofWithPublicInputs:{fromBufferArray:()=>({})}});
 const Prover=factory(class{}),p=new Prover({}, {},{transport:{prove:async()=>{calls.push('transport');return {mode:'real',compressedProof:'AA=='};}}});
 await p.createChonkProof([{kind:3,vk}]);assert.deepEqual(calls,['transport','decompress','verify']);
 assert.deepEqual(entries.map(e=>[e.name,e.end-e.start]),[['rolling.proof.local.decompress',3],['rolling.proof.local.verify',5]]);
 valid=false;await assert.rejects(p.createChonkProof([{kind:3,vk}]),/Remote proof verification failed/);
 assert.equal(calls.filter(x=>x==='verify').length,2);
}));
