import test from 'node:test';
import assert from 'node:assert/strict';
import {recordProofTimings,measureProofStage,beginProofSpan,measureProofPhase,timedCircuitCallbacks} from './proof-timings.mjs';
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
 assert.deepEqual(entries.map(e=>[e.name,e.detail.durationMs]),[
  ['rolling.proof.aggregate.native.total',500],['rolling.proof.aggregate.native.sync',0],['rolling.proof.aggregate.native.private-witness',100],
  ['rolling.proof.aggregate.native.kernel-witness',150],['rolling.proof.aggregate.native.public-validation',50],
  ['rolling.proof.aggregate.native.proof-transport',180],['rolling.proof.aggregate.native.unaccounted',20]]);
 assert(entries.every(e=>e.start===e.end&&e.detail.kind==='aggregate'),'aggregates must not invent chronological positions');
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
  fetchImpl:async(url,options)=>{calls.push([url,options.method??'GET']);advance(7);return options.method==='POST'?Response.json({id}):options.method==='DELETE'?Response.json({}):new Response('data: '+JSON.stringify({state:'complete',result})+'\n\n',{headers:{'content-type':'text/event-stream'}});}});
 assert.deepEqual(await client.prove([{bytecode:Uint8Array.of(1),vk:Uint8Array.of(2),witness:new Map([[0,'01'.repeat(32)]])}]),result);
 assert.deepEqual(calls.map(c=>c[1]),['POST','GET','DELETE']);
 assert.deepEqual(entries.map(e=>e.name),['rolling.proof.transport.circuit-ids','rolling.proof.transport.dictionary','rolling.proof.transport.compress','rolling.proof.transport.serialize','rolling.proof.transport.submit','rolling.proof.transport.wait']);
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

test('actual spans preserve start and end, nested order and failure identity',()=>observed(async(entries,advance)=>{
 const finish=beginProofSpan('native.phase.private-execution');advance(2);
 await measureProofPhase('native.phase.contract-sync',async()=>advance(7));advance(3);finish();finish();
 assert.deepEqual(entries.map(e=>[e.name,e.start,e.end]),[
  ['rolling.proof.native.phase.contract-sync',1002,1009],['rolling.proof.native.phase.private-execution',1000,1012]]);
 const error=Error('same');await assert.rejects(measureProofPhase('native.phase.public-execution',async()=>{advance(5);throw error;}),e=>e===error);
 assert.equal(entries.at(-1).end-entries.at(-1).start,5);
}));
test('oracle spans preserve inputs, return values, receiver and errors without disclosing them',()=>observed(async(entries,advance)=>{
 const input={secret:'never record'},output={},error=Error('private error'),calls=[];
 const native={aztec_utl_getNotes:async function(value){assert.equal(this,native);calls.push(value);advance(4);return output;},
  arbitraryPrivateName:async function(){advance(3);throw error;}};
 const callback=timedCircuitCallbacks(native);
 assert.equal(await callback.aztec_utl_getNotes(input),output);assert.equal(calls[0],input);
 await assert.rejects(callback.arbitraryPrivateName(),e=>e===error);
 assert.deepEqual(entries.map(e=>[e.name,e.end-e.start]),[['rolling.proof.native.phase.oracle-get-notes',4],['rolling.proof.native.phase.oracle-other',3]]);
 assert(!JSON.stringify(entries).includes('private'));assert(!JSON.stringify(entries).includes('secret'));
}));
