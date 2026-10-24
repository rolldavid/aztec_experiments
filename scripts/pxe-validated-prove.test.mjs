import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {Gas,GasSettings} from '@aztec-labs/stdlib/gas';
import {PrivateKernelTailCircuitPublicInputs,PartialPrivateTailPublicInputsForPublic} from '@aztec-labs/stdlib/kernel';
import {PrivateSimulationResult,TxProvingResult} from '@aztec-labs/stdlib/tx';
import {validatedPxeProve,validatedKernelProve} from './pxe-validated-prove.mjs';
const pxeSource=await fs.readFile(new URL('../node_modules/@aztec-labs/pxe/dest/pxe.js',import.meta.url),'utf8');
const kernelSource=await fs.readFile(new URL('../node_modules/@aztec-labs/pxe/dest/private_kernel/private_kernel_execution_prover.js',import.meta.url),'utf8');
const pxe=validatedPxeProve(pxeSource),kernel=validatedKernelProve(kernelSource);
// Resolve the enum through the transformed module's real import declaration.
// Supplying it independently to the extracted-method harness would hide a
// missing production binding after an otherwise successful expensive proof.
const kindImport=pxe.match(/^import \{CircuitKind\} from '([^']+)';$/m);
assert.ok(kindImport,'Transformed PXE must import the enum used by its timing aggregation');
const {CircuitKind}=await import('data:text/javascript,'+encodeURIComponent(`import {CircuitKind} from ${JSON.stringify(import.meta.resolve(kindImport[1]))};export {CircuitKind};`));
function method(source,start,end){const a=source.indexOf(start);assert.ok(a>=0);const b=source.indexOf(end,a);assert.ok(b>a);return source.slice(a,b);}
const Timer=class{ms(){return 0;}};
function inputs(){const value=PrivateKernelTailCircuitPublicInputs.empty();value.forRollup=undefined;value.forPublic=PartialPrivateTailPublicInputsForPublic.empty();value.forPublic.nonRevertibleAccumulatedData.nullifiers[0]=new Fr(1);value.feePayer=AztecAddress.fromFieldUnsafe(new Fr(2));return value;}
function kernelHarness(){
 const calls=[],tail=inputs(),output={publicInputs:{feePayer:tail.feePayer,minRevertibleSideEffectCounter:0},verificationKey:{keyAsBytes:Buffer.alloc(0)},outputWitness:new Map(),bytecode:Buffer.alloc(0)};
 const text=method(kernel,'async proveWithKernels(', '\n    /**');
 const Class=vm.runInNewContext(`(class {
  fakeProofs=false;maxBatchSize=1;log={info(){},debug(){}};oracle={};
  proofCreator={generateResetTailOutput:async()=>{calls.push('tail');return {...output,publicInputs:tail};},generateHidingToPublicOutput:async()=>{calls.push('hiding');return output;},createChonkProof:async()=>{calls.push('proof');return {removePublicInputs:()=> 'proof'};}};
  prefetchUpdatedClassIdHints=async()=>new Map();consumeNextApp=async stack=>stack.pop();
  runBatchedKernel=async()=>{calls.push('kernel');return output;};getVkData=async()=>({});ensurePublicInputsMatch=()=>calls.push('verify-proof');
  ${text}
 })`,{calls,tail,output,Timer,NULL_SIMULATE_OUTPUT:output,CircuitKind:{Kernel:1,HidingKernel:2},PrivateKernelTailCircuitPublicInputs,
 collectNoteHashNullifierCounterMap:()=>new Map(),getFinalMinRevertibleSideEffectCounter:()=>0,
 BatchPlanner:class{decideBatchSize(){return 1;}},PrivateKernelResetPrivateInputsBuilder:class{needsReset(){return true;}async build(){return {}; }},
 PaddedSideEffectAmounts:{empty:()=>({})},computeTxExpirationTimestamp:()=>0n,PrivateKernelResetTailCircuitPrivateInputs:class{isForPublic(){return true;}},HidingKernelToPublicPrivateInputs:class{}});
 return {instance:new Class(),tail,calls,execution:{entrypoint:{},publicFunctionCalldata:[1]}};
}
test('real native kernel orchestration validates detached output once before proof generation',async()=>{
 const h=kernelHarness(),original=h.tail.toBuffer();
 await h.instance.proveWithKernels({},h.execution,{simulate:false,skipFeeEnforcement:false,profileMode:'none',beforeProof:async value=>{h.calls.push('validate');assert.notEqual(value,h.tail);value.feePayer=AztecAddress.ZERO;}});
 assert.deepEqual(h.calls,['kernel','tail','hiding','validate','proof','verify-proof']);assert.ok(h.tail.toBuffer().equals(original));
});
test('failed validation stops native kernel orchestration before expensive proof',async()=>{
 const h=kernelHarness();await assert.rejects(h.instance.proveWithKernels({},h.execution,{simulate:false,skipFeeEnforcement:false,profileMode:'none',beforeProof:async()=>{h.calls.push('validate');throw Error('revert');}}),/revert/);
 assert.deepEqual(h.calls,['kernel','tail','hiding','validate']);
});
function pxeHarness(failure,executionSteps=[],gates={}){
 const calls=[],publicInputs=inputs(),execution={entrypoint:{taggingIndexRanges:[],contractClassLogs:[],nestedExecutionResults:[]},publicFunctionCalldata:[]};
 const request={txContext:{gasSettings:GasSettings.empty()}};
 const ctx={changeSetId:3,syncTime:0,anchorBlockHeader:{},recording:{stats:()=>({})},totalMs:()=>0};
 const prove=method(pxe,'proveTx(txRequest, { scopes','\n    /**');
 const privateProve=method(pxe,'async #proveTx(', '\n    // Validate actual');
 const validate=method(pxe,'async #validateKernelPublicInputs(', '\n    // Public API');
 const Class=vm.runInNewContext(`(class {
  operationQueue={runSynced:async work=>{calls.push('queue');try{const result=await work(ctx);calls.push('commit');return result;}catch(e){calls.push('discard');throw e;}}};
  log={debug(){}};senderTaggingStore={};node={isValidTx:async(tx,opts)=>{calls.push('validate');await gates.validate?.();assert.equal(opts.isSimulation,true);assert.equal(opts.skipFeeEnforcement,false);return {result:failure==='invalid'?'invalid':'valid'};}};
  #getSimulatorForTx=()=>({});#executePrivate=async()=>{calls.push('private');return execution;};
  #simulatePublicCalls=async(tx,skipFee)=>{calls.push('public');await gates.public?.();assert.equal(skipFee,false);return {txEffect:{revertCode:{isOK:()=>failure!=='revert'}},gasUsed:{totalGas:failure==='gas'?new Gas(2**32-1,2**32-1):Gas.empty(),teardownGas:Gas.empty()}};};
  #prove=async(_request,_creator,_execution,_anchor,config)=>{calls.push('kernel');await config.beforeProof?.(publicInputs);calls.push('proof');return {publicInputs,chonkProof:{},executionSteps};};
  ${prove}
  ${privateProve}
  ${validate}
 })`,{calls,ctx,assert,request,publicInputs,execution,executionSteps,CircuitKind,failure,gates,Gas,Timer,PrivateSimulationResult,TxProvingResult,inspect:()=>'',persistSenderTaggingIndexRangesForTx:async()=>calls.push('tags')});
 return {instance:new Class(),request,calls};
}
test('native PXE validates actual kernel output inside one queue operation, then proves and persists tags',async()=>{
 const h=pxeHarness();await h.instance.proveTxWithPublicValidation(h.request,{scopes:[]});assert.deepEqual(h.calls,['queue','private','kernel','public','validate','proof','tags','commit']);
});
test('native proof aggregates use circuit kinds, preserve existing totals and execute no extra stages',async()=>{
 const steps=[{kind:CircuitKind.App,functionName:'private_kernel_reset',timings:{witgen:11}},
 {kind:CircuitKind.Kernel,functionName:'private-secret',timings:{witgen:7}},
 {kind:CircuitKind.HidingKernel,functionName:'private-secret-2',timings:{witgen:3}}];
 const h=pxeHarness(undefined,steps),proven=await h.instance.proveTxWithPublicValidation(h.request,{scopes:[]});
 assert.equal(proven.stats.timings.privateWitness,11);assert.equal(proven.stats.timings.kernelWitness,10);
 assert.equal(proven.stats.timings.unaccounted,-21,'new numeric aggregates are not subtracted again');
 assert.deepEqual(h.calls,['queue','private','kernel','public','validate','proof','tags','commit']);
});
for(const failure of ['revert','gas','invalid'])test('native PXE '+failure+' discards before proof or tag persistence',async()=>{
 const h=pxeHarness(failure);await assert.rejects(h.instance.proveTxWithPublicValidation(h.request,{scopes:[]}));
 assert.deepEqual(h.calls,['queue','private','kernel','public','validate','discard']);
});
test('native opt-in preserves the existing proof-only API',async()=>{
 const h=pxeHarness();await h.instance.proveTx(h.request,{scopes:[]});assert.deepEqual(h.calls,['queue','private','kernel','proof','tags','commit']);
});
test('exact native source pins reject changed dependencies',()=>{assert.throws(()=>validatedPxeProve(pxeSource+'\n'),/source mismatch/);assert.throws(()=>validatedKernelProve(kernelSource+'\n'),/source mismatch/);});
test('complete transformed PXE loads with its real module bindings',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pxe-timing-import-'));
 const original=await fs.realpath(new URL('../node_modules/@aztec-labs/pxe',import.meta.url));
 try{
  await fs.mkdir(path.join(directory,'dest'));
  for(const name of await fs.readdir(original))if(!['dest','node_modules'].includes(name))await fs.symlink(path.join(original,name),path.join(directory,name));
  await fs.symlink(await fs.realpath(new URL('../node_modules',import.meta.url)),path.join(directory,'node_modules'));
  for(const name of await fs.readdir(path.join(original,'dest')))if(name!=='pxe.js')await fs.symlink(path.join(original,'dest',name),path.join(directory,'dest',name));
  const target=path.join(directory,'dest','pxe.js');await fs.writeFile(target,pxe);
  const loaded=await import(pathToFileURL(target));assert.equal(typeof loaded.PXE,'function');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

for(const failure of [null,'public','validate'])test(`public execution and admission ${failure??'succeed'} concurrently and drain before proof`,async()=>{
 const gates=[Promise.withResolvers(),Promise.withResolvers()],entered=Promise.withResolvers(),error=Error('Exact validation failure');let count=0,settled=false;
 const wait=index=>async()=>{if(++count===2)entered.resolve();await gates[index].promise;if((failure==='public'?0:failure==='validate'?1:-1)===index)throw error;};
 const h=pxeHarness(undefined,[],{public:wait(0),validate:wait(1)});
 const proving=h.instance.proveTxWithPublicValidation(h.request,{scopes:[]}).finally(()=>{settled=true;});const observed=failure?assert.rejects(proving,e=>e===error):proving;
 await entered.promise;assert.equal(count,2);assert(!h.calls.includes('proof'));assert(!h.calls.includes('tags'));
 gates[failure==='validate'?1:0].resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert(!h.calls.includes('discard'));
 gates[0].resolve();gates[1].resolve();await observed;
 assert.equal(h.calls.includes('proof'),!failure);assert.equal(h.calls.includes('tags'),!failure);assert.equal(h.calls.at(-1),failure?'discard':'commit');
});
