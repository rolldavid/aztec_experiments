import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {PrivateCircuitPublicInputs,PrivateLogData} from '@aztec-labs/stdlib/kernel';
import {PrivateLog} from '@aztec-labs/stdlib/logs';
import {computeSiloedPrivateLogFirstField} from '@aztec-labs/stdlib/hash';
import {generateSimulatedProvingResult as upstream} from '@aztec-labs/pxe/simulator';
import {preservePxeSimulationLogs} from './pxe-simulation-logs.mjs';
const moduleUrl=new URL('../node_modules/@aztec-labs/pxe/dest/contract_function_simulator/contract_function_simulator.js',import.meta.url);
const source=await fs.readFile(moduleUrl,'utf8');
const scratchRoot=new URL('../.build/',import.meta.url);await fs.mkdir(scratchRoot,{recursive:true});
const scratch=await fs.mkdtemp(fileURLToPath(new URL('log-copy-',scratchRoot)));
let corrected;
try{
 // Execute the complete real SDK simulation function, retaining its SDK classes
 // and helpers. Drop only the unrelated exported simulator class for test size.
 const result=await build({stdin:{contents:preservePxeSimulationLogs(source).replace('export class ContractFunctionSimulator','class ContractFunctionSimulator'),resolveDir:path.dirname(fileURLToPath(moduleUrl)),sourcefile:'simulation-log-regression.js'},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
 const target=path.join(scratch,'simulator.mjs');await fs.writeFile(target,result.outputFiles[0].contents);
 ({generateSimulatedProvingResult:corrected}=await import(pathToFileURL(target).href));
}finally{await fs.rm(scratch,{recursive:true,force:true});}
function execution(){
 const call=()=>{
  const publicInputs=PrivateCircuitPublicInputs.empty();
  publicInputs.callContext.contractAddress=AztecAddress.fromFieldUnsafe(new Fr(123));
  const log=PrivateLog.empty();log.fields[0]=new Fr(456);log.fields[1]=new Fr(789);log.emittedLength=2;
  publicInputs.privateLogs.array[0]=new PrivateLogData(log,0,3);publicInputs.privateLogs.claimedLength=1;
  return {publicInputs,nestedExecutionResults:[],noteHashNullifierCounterMap:new Map(),partialWitness:new Map([[1,'original-witness']]),acir:Buffer.alloc(0),vk:Buffer.alloc(0)};
 };
 const entrypoint=call(),nested=call();nested.publicInputs.callContext.contractAddress=AztecAddress.fromFieldUnsafe(new Fr(321));nested.publicInputs.privateLogs.array[0].counter=4;entrypoint.nestedExecutionResults=[nested];
 return {entrypoint,firstNullifier:new Fr(1),publicFunctionCalldata:[]};
}
const snapshot=value=>[value.entrypoint,...value.entrypoint.nestedExecutionResults].map(call=>({inputs:call.publicInputs.toBuffer().toString('hex'),witness:[...call.partialWitness]}));
const node={findLeavesIndexes:()=>assert.fail('Empty read requests require no RPC')};
test('upstream simulation reproduces mutation of original private witness public inputs',async()=>{
 const value=execution(),before=snapshot(value);await upstream(value,async()=> 'fixture',node);assert.notDeepEqual(snapshot(value),before);
});
test('simulation keeps real original public inputs and witnesses intact and siloes copied logs exactly once',async()=>{
 const value=execution(),before=snapshot(value);
 const result=await corrected(value,async()=> 'fixture',node);
 assert.deepEqual(snapshot(value),before);
 for(const [index,call] of [value.entrypoint,...value.entrypoint.nestedExecutionResults].entries()){
  const original=call.publicInputs.privateLogs.array[0].log,actual=result.publicInputs.forRollup.end.privateLogs[index];
  assert.notEqual(actual,original);assert.notEqual(actual.fields,original.fields);assert.equal(actual.emittedLength,original.emittedLength);
  assert.ok(actual.fields[0].equals(await computeSiloedPrivateLogFirstField(call.publicInputs.callContext.contractAddress,original.fields[0])));
  assert.ok(actual.fields[1].equals(original.fields[1]));
 }
 const again=await corrected(value,async()=> 'fixture',node);assert.deepEqual(snapshot(value),before);assert.ok(again.publicInputs.toBuffer().equals(result.publicInputs.toBuffer()));
});
test('log-copy transform rejects any different SDK source',()=>assert.throws(()=>preservePxeSimulationLogs(source+'\n'),/source mismatch/));
