import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {efficientKernelWitnessWork,KERNEL_WORK_PINS} from './kernel-witness-work.mjs';
import * as K from '@aztec-labs/stdlib/kernel';
import * as C from '@aztec-labs/constants';
import {serializeWitness} from '@aztec-foundation/noir-noirc_abi';
import {VerificationKeyData,VerificationKeyAsFields} from '@aztec-labs/stdlib/vks';
import {getTestData} from '@aztec-labs/foundation/testing';
const root=process.env.KERNEL_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kernel-native-work-'));
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const paths=Object.keys(KERNEL_WORK_PINS);
async function transformed(name){
 const source=fs.readFileSync(path.join(root,name),'utf8');
 let output=efficientKernelWitnessWork(source,name);
 output=output.replace(/from '([.][.][/][^']+)'/g,(_,relative)=>`from '${pathToFileURL(path.resolve(path.dirname(path.join(root,name)),relative)).href}'`);
 const dest=path.join(temp,path.basename(name)+'.mjs');fs.writeFileSync(dest,output);return import(pathToFileURL(dest).href);
}
const converters=await import(pathToFileURL(path.join(root,paths[1])).href);
const changed=await transformed(paths[1]);
const {BBPrivateKernelProver}=await transformed(paths[0]);
function inputs(){
 const previous=K.PrivateKernelData.empty();
 previous.vkData.vk=new VerificationKeyData(VerificationKeyAsFields.makeEmpty(C.MEGA_KERNEL_VK_LENGTH_IN_FIELDS),Buffer.alloc(0));
 const hints=new K.PrivateKernelResetHints(K.NoteHashReadRequestHintsBuilder.empty(64,64),K.NullifierReadRequestHintsBuilder.empty(64,64),Array.from({length:C.MAX_KEY_VALIDATION_REQUESTS_PER_TX},()=>K.KeyValidationHint.empty()),Array.from({length:C.MAX_NULLIFIERS_PER_TX},()=>new K.TransientDataSquashingHint(C.MAX_NULLIFIERS_PER_TX,C.MAX_NOTE_HASHES_PER_TX)));
 return new K.PrivateKernelResetTailCircuitPrivateInputs(previous,K.PaddedSideEffects.empty(),hints,K.PrivateKernelResetDimensions.fromValues(Array(9).fill(4)),K.PaddedSideEffectAmounts.empty(),0n);
}
for(const [family,fn,label] of [['private_kernel_reset_tail','convertPrivateKernelResetTailInputsToWitnessMapWithAbi','private-kernel-reset-tail'],['private_kernel_reset_tail_to_public','convertPrivateKernelResetTailToPublicInputsToWitnessMapWithAbi','private-kernel-reset-tail-to-public']]){
 test(family+' native ABI witness bytes identical; disabled untrimmed mapping is absent',()=>{
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@aztec-labs/noir-protocol-circuits-types/artifacts/'+family+'_4_4_4_4_4_4_4_4_4.json'),'utf8'));
  const value=inputs(),before=value.toBuffer();
  const original=converters[fn](value,artifact.abi),next=changed[fn](value,artifact.abi);
  assert.deepEqual([...next],[...original]);assert.deepEqual(serializeWitness(next),serializeWitness(original));assert.deepEqual(value.toBuffer(),before);
  const noDiagnostic={trimResetToSizes:()=>value.trimResetToSizes(),paddedSideEffectAmounts:value.paddedSideEffectAmounts,expirationTimestampUpperBound:0n,get previousKernel(){throw Error('diagnostic-only mapping');}};
  assert.throws(()=>converters[fn](noDiagnostic,artifact.abi),/diagnostic-only mapping/);
  assert.deepEqual([...changed[fn](noDiagnostic,artifact.abi)],[...original]);
  const old=process.env.AZTEC_GENERATE_TEST_DATA,oldExpect=globalThis.expect;
  try{process.env.AZTEC_GENERATE_TEST_DATA='true';globalThis.expect={getState:()=>({currentTestName:family})};converters[fn](value,artifact.abi);changed[fn](value,artifact.abi);const captured=getTestData(label);assert.equal(captured.length,2);assert.deepEqual(captured[0],captured[1]);assert.throws(()=>changed[fn](noDiagnostic,artifact.abi),/diagnostic-only mapping/);}
  finally{if(old===undefined)delete process.env.AZTEC_GENERATE_TEST_DATA;else process.env.AZTEC_GENERATE_TEST_DATA=old;globalThis.expect=oldExpect;}
 });
}
test('exact native source pins reject drift and unknown files',()=>{for(const name of paths){const source=fs.readFileSync(path.join(root,name),'utf8');assert.throws(()=>efficientKernelWitnessWork(source+' ',name),/source mismatch/);}assert.throws(()=>efficientKernelWitnessWork('','unknown'),/source mismatch/);});
for(const enabled of [false,true,undefined])test('actual native kernel method keeps results/one execution; debug='+enabled,async()=>{
 let inputWrites=0,outputWrites=0,executions=0;const witness=new Map([[1,'0x1234']]),input={toBuffer(){inputWrites++;return Buffer.from('in');}},output={toBuffer(){outputWrites++;return Buffer.from('out');}},vk={marker:true};
 const artifact={abi:{marker:true},bytecode:Buffer.from('exact native bytecode').toString('base64')};
 const logger={debug(){},...(enabled===undefined?{}:{isLevelEnabled:()=>enabled})};
 const prover=new BBPrivateKernelProver({getClientCircuitArtifactByName:async()=>artifact,getCircuitVkByName:async()=>vk},{executeProtocolCircuitToWitness:async(w,a)=>{executions++;assert.equal(w,witness);assert.equal(a,artifact);return {witness,duration:1};}},{logger});
 const result=await prover.generateCircuitOutput(input,'PrivateKernelInitArtifact',(i,a)=>{assert.equal(i,input);assert.equal(a,artifact.abi);return witness;},(w,a)=>{assert.equal(w,witness);assert.equal(a,artifact.abi);return output;});
 assert.equal(executions,1);assert.equal(result.publicInputs,output);assert.equal(result.outputWitness,witness);assert.equal(result.verificationKey,vk);assert.deepEqual(result.bytecode,Buffer.from('exact native bytecode'));assert.equal(inputWrites,enabled===false?0:1);assert.equal(outputWrites,inputWrites);
});
test('native subspans opt-in, fixed numeric labels, original failure preserved',async()=>{
 const originalPerformance=globalThis.performance,flag=Symbol.for('rolling.proof.profile'),old=globalThis[flag],records=[];let time=0;
 globalThis.performance={now:()=>++time,clearMeasures(){},measure(name,detail){records.push({name,detail});}};
 const failure=Error('original native failure');const prover=new BBPrivateKernelProver({getClientCircuitArtifactByName:async()=>({abi:{}})},{},{logger:{debug(){},isLevelEnabled:()=>false}});
 try{globalThis[flag]=false;await assert.rejects(prover.generateCircuitOutput({},'secret-circuit',()=>{throw failure;},()=>{}),e=>e===failure);assert.equal(records.length,0);globalThis[flag]=true;await assert.rejects(prover.generateCircuitOutput({},'secret-circuit',()=>{throw failure;},()=>{}),e=>e===failure);assert.deepEqual(records.map(r=>r.name),['rolling.proof.native.phase.kernel-artifact','rolling.proof.native.phase.kernel-input-abi']);for(const {detail}of records){assert.deepEqual(Object.keys(detail),['start','end']);assert.equal(typeof detail.start,'number');assert.ok(detail.end>=detail.start);}}
 finally{globalThis.performance=originalPerformance;if(old===undefined)delete globalThis[flag];else globalThis[flag]=old;}
});

test('successful actual native method records disjoint stages and preserves ACVM failure',async()=>{
 const originalPerformance=globalThis.performance,flag=Symbol.for('rolling.proof.profile'),old=globalThis[flag],records=[];let time=0;
 globalThis.performance={now:()=>++time,clearMeasures(){},measure(name,detail){records.push({name,detail});}};globalThis[flag]=true;
 const witness=new Map(),output={toBuffer:()=>Buffer.alloc(1)},artifact={abi:{},bytecode:'AQ=='},failure=Error('ACVM failure');let fail=false;
 const prover=new BBPrivateKernelProver({getClientCircuitArtifactByName:async()=>artifact,getCircuitVkByName:async()=>({})},{executeProtocolCircuitToWitness:async()=>{if(fail)throw failure;return {witness,duration:1};}},{logger:{debug(){},isLevelEnabled:()=>false}});
 try{
  await prover.generateCircuitOutput({},'PrivateKernelInitArtifact',()=>witness,()=>output);
  assert.deepEqual(records.map(r=>r.name.replace('rolling.proof.native.phase.kernel-','')),['artifact','input-abi','acvm','output-abi','verification-key','bytecode']);
  for(let i=1;i<records.length;i++)assert.ok(records[i].detail.start>=records[i-1].detail.end);
  records.length=0;fail=true;await assert.rejects(prover.generateCircuitOutput({},'PrivateKernelInitArtifact',()=>witness,()=>output),e=>e===failure);
  assert.deepEqual(records.map(r=>r.name.replace('rolling.proof.native.phase.kernel-','')),['artifact','input-abi','acvm']);
 }finally{globalThis.performance=originalPerformance;if(old===undefined)delete globalThis[flag];else globalThis[flag]=old;}
});
